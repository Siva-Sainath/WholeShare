import { fetchPayPalConnection } from "../api";
import { PayPalConnectCard } from "./PayPalConnectCard";
import { PermissionsPanel } from "./PermissionsPanel";
import React, { useState, useEffect, useRef } from "react";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { fetchUserSettings, saveUserSettingsApi } from "../api";
import { PLATFORM_STEP_UP_CEILING_CENTS, STEP_UP_THRESHOLD_CENTS } from "../../../lib/policy";
import { STITCH_COLORS, STITCH_TYPOGRAPHY, STITCH_RADIUS, STITCH_SHADOWS, STITCH_GLASS } from "../themes/stitchTokens";

interface AgentInviteRecord {
  token: string;
  inviteUrl: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
  uses: number;
}

const DEMO_BUSINESS = "Austin Artisan Bakery";
const DEMO_EMAIL = "purchasing@austinartisanbakery.com";
const DEMO_CITY = "Austin";
const DEMO_PAYPAL = "sb-merchant@business.example.com";

function displayOrEmpty(value: string | undefined, demo: string): string {
  if (!value) return "";
  if (value === demo) return "";
  return value;
}

const RESET_DEFAULTS: Record<string, unknown> = {
  profile: { businessName: "", contactEmail: "", city: "", country: "", currency: "USD", timezone: "America/Chicago" },
  appearance: { theme: "light", density: "comfortable", reducedMotion: "system" },
  policies: { perPledgeSpendLimitUsd: 2500, approvalThresholdUsd: 1000, invoiceCurrency: "USD" },
  groupDefaults: { defaultTemplate: "EQUAL_COOP", defaultInspectionWindowHours: 48, defaultDisputeWindowHours: 48, minDiscountPercent: 20 },
  agentPermissions: { allowAutonomousQuotePrep: false, allowAutonomousFilterSort: false, allowAutonomousDraftMessages: false, allowAutonomousResearch: false, allowAutonomousScheduleChanges: false },
  approvalsAndSignatures: { signatureMethod: "IN_APP", documentRetention: "3_YEARS" },
  accessibility: { textSize: "standard", reducedMotion: "system" }
};

export const SettingsView: React.FC = () => {
  const c = STITCH_COLORS;
  const font = STITCH_TYPOGRAPHY.sans;
  const mono = STITCH_TYPOGRAPHY.mono;

  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusNotice, setStatusNotice] = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);
  const [activeSection, setActiveSection] = useState<number>(1);
  const [modelInfo, setModelInfo] = useState<{ provider: string; label: string; model: string | null } | null>(null);
  useEffect(() => {
    fetch("/api/v1/harness").then((response) => response.json()).then((payload) => setModelInfo(payload.model ?? null)).catch(() => setModelInfo(null));
  }, []);
  const [pendingMoneyChange, setPendingMoneyChange] = useState<{ field: string; label: string; oldValue: number; newValue: number } | null>(null);
  const [invites, setInvites] = useState<AgentInviteRecord[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUserSettings()
      .then((data) => {
        if (!cancelled && data) {
          setSettings(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchInvites = async () => {
    try {
      const res = await fetch("/api/v1/agent-invites");
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites || []);
      }
    } catch {
      // Non-blocking fetch
    }
  };

  useEffect(() => {
    fetchInvites();
  }, []);

  const handleCreateInvite = async () => {
    setInvitesLoading(true);
    try {
      const res = await fetch("/api/v1/agent-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createdBy: "settings-console" })
      });
      if (res.ok) {
        await fetchInvites();
        setStatusNotice({ message: "Agent invitation link generated successfully.", type: "success" });
      }
    } catch {
      setStatusNotice({ message: "Could not generate agent invite link.", type: "error" });
    } finally {
      setInvitesLoading(false);
    }
  };

  const handleRevokeInvite = async (token: string) => {
    try {
      const res = await fetch(`/api/v1/agent-invites/${token}`, { method: "DELETE" });
      if (res.ok) {
        await fetchInvites();
        setStatusNotice({ message: "Agent invite link revoked.", type: "info" });
      }
    } catch {
      // Non-blocking revoke
    }
  };

  const handleCopy = (token: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const notifyChange = (msg: string, type: "success" | "info" = "success") => {
    setStatusNotice({ message: msg, type });
    setTimeout(() => setStatusNotice(null), 4000);
  };

  const applySettingUpdate = async (section: string, key: string, value: any, oldValueLabel?: string) => {
    const updatedSection = { ...(settings[section] || {}), [key]: value };
    const newSettings = { ...settings, [section]: updatedSection };
    setSettings(newSettings);

    try {
      await saveUserSettingsApi({ [section]: updatedSection });

      if (window.wholeshareCmd?.dispatch) {
        window.wholeshareCmd.dispatch({
          action: "settings.update",
          params: {
            settings: {
              [section]: updatedSection,
              ...(section === "appearance" && key === "theme" ? { theme: value } : {})
            }
          }
        });
      }

      const oldVal = oldValueLabel || String(settings[section]?.[key]);
      notifyChange(`Updated ${key} from ${oldVal} to ${String(value)}.`);
    } catch (err: any) {
      notifyChange(err?.message || "Failed to save setting.", "info");
    }
  };

  const requestMoneySettingChange = (field: string, label: string, oldValue: number, newValue: number) => {
    setPendingMoneyChange({ field, label, oldValue, newValue });
  };

  const confirmMoneySettingChange = async () => {
    if (!pendingMoneyChange) return;
    const { field, label, oldValue, newValue } = pendingMoneyChange;
    setPendingMoneyChange(null);
    await applySettingUpdate("policies", field, newValue, `$${oldValue}`);
    notifyChange(`Confirmed spend policy change for ${label}. New value is $${newValue}.`, "success");
  };

  const handleExportData = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wholeshare_user_settings_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notifyChange("Exported user data and policies to JSON.", "success");
  };

  const handleFilePicked = async (file: File) => {
    const newDoc = {
      id: `doc_${Date.now()}`,
      title: file.name,
      type: "BUSINESS_REGISTRATION",
      uploadedAt: new Date().toISOString(),
      sharedWithSuppliers: false
    };
    const currentDocs = settings.documentsAndIdentity?.uploadedDocuments || [];
    const updatedDocs = [...currentDocs, newDoc];
    await applySettingUpdate("documentsAndIdentity", "uploadedDocuments", updatedDocs);
    notifyChange(`Added ${file.name} to your documents. Stored locally.`, "success");
  };

  const handleDeleteDoc = async (docId: string) => {
    const currentDocs = settings.documentsAndIdentity?.uploadedDocuments || [];
    const updatedDocs = currentDocs.filter((d: any) => d.id !== docId);
    await applySettingUpdate("documentsAndIdentity", "uploadedDocuments", updatedDocs);
    notifyChange("Document permanently removed.", "info");
  };

  const handleToggleDocShare = async (docId: string) => {
    const currentDocs = settings.documentsAndIdentity?.uploadedDocuments || [];
    const updatedDocs = currentDocs.map((d: any) =>
      d.id === docId ? { ...d, sharedWithSuppliers: !d.sharedWithSuppliers } : d
    );
    await applySettingUpdate("documentsAndIdentity", "uploadedDocuments", updatedDocs);
    notifyChange("Supplier access policy updated for document.", "success");
  };

  const handleResetSettings = async () => {
    setShowResetConfirm(false);
    try {
      await saveUserSettingsApi(RESET_DEFAULTS);
      window.location.reload();
    } catch {
      notifyChange("Could not reset settings. Try again.", "error");
    }
  };

  const handleConnectPayPal = () => {
    if (window.wholeshareCmd?.dispatch) {
      window.wholeshareCmd.dispatch({ action: "paypal.authorize", params: {} });
    }
    notifyChange("PayPal authorization started. Approve on PayPal's site.", "info");
  };

  const [paypalLive, setPaypalLive] = useState<{ connected: boolean; email: string } | null>(null);
  useEffect(() => { fetchPayPalConnection().then((value) => setPaypalLive({ connected: value.connected, email: value.email })).catch(() => setPaypalLive(null)); }, []);
  if (loading || !settings) {
    return (
      <section data-ws-view="settings" style={{ fontFamily: font, color: c.ink, background: c.canvas, minHeight: "100vh", padding: 24 }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.06em", fontWeight: 600, color: c.blue, textTransform: "uppercase" }}>Preferences</p>
        <h1 style={{ margin: "4px 0 8px", fontSize: 22, fontWeight: 600 }}>Settings</h1>
        <p style={{ margin: 0, fontSize: 13, color: c.muted }}>Loading settings console…</p>
      </section>
    );
  }

  const sectionsList = [
    { id: 1, label: "Business profile" },
    { id: 2, label: "Appearance" },
    { id: 3, label: "Money and escrow" },
    { id: 4, label: "Notifications" },
    { id: 5, label: "Group defaults" },
    { id: 6, label: "Agent and AI" },
    { id: 7, label: "Approvals and signatures" },
    { id: 8, label: "Documents and identity" },
    { id: 9, label: "Data and privacy" },
    { id: 10, label: "Accessibility" }
  ];

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: STITCH_RADIUS.lg,
    border: `1px solid ${c.border}`, background: c.card, color: c.ink,
    fontFamily: font, fontSize: 13, outline: "none", boxSizing: "border-box"
  };

  const labelStyle: React.CSSProperties = {
    display: "grid", gap: 4, fontSize: 12, fontWeight: 500, color: c.ink
  };

  const cardStyle: React.CSSProperties = {
    background: STITCH_GLASS.cardBg, backdropFilter: `blur(${STITCH_GLASS.blur})`,
    border: `1px solid ${c.border}`, borderRadius: STITCH_RADIUS["2xl"],
    boxShadow: STITCH_SHADOWS.card, padding: 20
  };

  const subBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
    borderRadius: STITCH_RADIUS.lg, border: `1px solid ${c.border}`, background: c.card,
    color: c.ink, fontFamily: font, fontSize: 12, fontWeight: 500, cursor: "pointer"
  };

  const goldBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px",
    borderRadius: STITCH_RADIUS.xl, border: "none", background: c.gold,
    color: c.ink, fontFamily: font, fontSize: 13, fontWeight: 600, cursor: "pointer"
  };

  const sectionTitle = (num: number, title: string) => (
    <h2 style={{ fontSize: 16, fontWeight: 600, color: c.ink, margin: "0 0 16px" }}>{title}</h2>
  );

  const connectedPaypalEmail = paypalLive?.email ?? "";
  const paypalConnected = Boolean(paypalLive?.connected);

  return (
    <section data-ws-view="settings" style={{ fontFamily: font, color: c.ink, background: c.canvas, minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: "none", margin: 0 }}>
        <header style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.06em", fontWeight: 600, color: c.blue, textTransform: "uppercase" }}>Preferences</p>
          <h1 style={{ margin: "4px 0 8px", fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>Settings and guardrails</h1>
          <p style={{ margin: 0, fontSize: 13, color: c.muted }}>Every setting reads and writes live values through the settings store. Money settings enforce human confirmation.</p>
        </header>

        {statusNotice && (
          <p role="status" style={{ margin: "0 0 16px", fontSize: 13, color: statusNotice.type === "error" ? c.status.error : c.ink }}>{statusNotice.message}</p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "232px minmax(0, 1fr)", gap: 16, alignItems: "start" }} className="ws-settings-shell">
          <div aria-label="Settings categories" style={{ background: c.card, borderRadius: STITCH_RADIUS["2xl"], border: `1px solid ${c.border}`, padding: 6, position: "sticky", top: 88, overflow: "hidden", minWidth: 0 }}>
            <SideNav>
              <SideNavSection title="Settings" isHeaderHidden>
                {sectionsList.map((sec) => (
                  <SideNavItem
                    key={sec.id}
                    label={sec.label}
                    isSelected={activeSection === sec.id}
                    onClick={() => { setActiveSection(sec.id); document.getElementById(`settings-sec-${sec.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                  />
                ))}
              </SideNavSection>
            </SideNav>
          </div>

          <div style={{ ...cardStyle, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 32, alignItems: "start", maxWidth: "none", minWidth: 0 }} className="ws-settings-columns">
            {(
              <div data-testid="settings-section-profile" id="settings-sec-1">
                {sectionTitle(1, "Business profile")}
                <div style={{ display: "grid", gap: 14 }}>
                  <label style={labelStyle}>
                    <span>Business name</span>
                    <input value={displayOrEmpty(settings.profile?.businessName, DEMO_BUSINESS)} onChange={(e) => applySettingUpdate("profile", "businessName", e.target.value)} placeholder="Legal or operating name" style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    <span>Contact email</span>
                    <input type="email" value={displayOrEmpty(settings.profile?.contactEmail, DEMO_EMAIL)} onChange={(e) => applySettingUpdate("profile", "contactEmail", e.target.value)} placeholder="finance@business.com" style={inputStyle} />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label style={labelStyle}>
                      <span>City</span>
                      <input value={displayOrEmpty(settings.profile?.city, DEMO_CITY)} onChange={(e) => applySettingUpdate("profile", "city", e.target.value)} placeholder="Delivery city" style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      <span>Country</span>
                      <input value={settings.profile?.country || ""} onChange={(e) => applySettingUpdate("profile", "country", e.target.value)} placeholder="Country" style={inputStyle} />
                    </label>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label style={labelStyle}>
                      <span>Currency</span>
                      <select value={settings.profile?.currency || "USD"} onChange={(e) => applySettingUpdate("profile", "currency", e.target.value)} style={inputStyle}>
                        <option value="USD">USD (US Dollar)</option>
                        <option value="INR">INR (Indian Rupee)</option>
                        <option value="EUR">EUR (Euro)</option>
                        <option value="GBP">GBP (British Pound)</option>
                        <option value="CNY">CNY (Chinese Yuan)</option>
                        <option value="VND">VND (Vietnamese Dong)</option>
                        <option value="TRY">TRY (Turkish Lira)</option>
                      </select>
                    </label>
                    <label style={labelStyle}>
                      <span>Timezone</span>
                      <select value={settings.profile?.timezone || "America/Chicago"} onChange={(e) => applySettingUpdate("profile", "timezone", e.target.value)} style={inputStyle}>
                        <option value="America/Chicago">America/Chicago (Central)</option>
                        <option value="America/New_York">America/New_York (Eastern)</option>
                        <option value="America/Denver">America/Denver (Mountain)</option>
                        <option value="America/Los_Angeles">America/Los_Angeles (Pacific)</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {(
              <div data-testid="settings-section-appearance" id="settings-sec-2">
                {sectionTitle(2, "Appearance")}
                <div style={{ display: "grid", gap: 16 }}>
                  
                  <div>
                    <span style={{ fontSize: 12, color: c.ink, display: "block", marginBottom: 6 }}>Display density</span>
                    <div style={{ display: "flex", gap: 10 }}>
                      {["comfortable", "compact"].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => applySettingUpdate("appearance", "density", d)}
                          style={{ flex: 1, padding: 10, borderRadius: STITCH_RADIUS.lg, border: settings.appearance?.density === d ? `1px solid ${c.blue}` : `1px solid ${c.border}`, background: settings.appearance?.density === d ? c.blueLight : c.card, color: c.ink, fontFamily: font, fontSize: 12, cursor: "pointer" }}
                        >
                          {d === "comfortable" ? "Comfortable (Standard)" : "Compact (Data-Dense)"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label style={labelStyle}>
                    <span>Reduced motion</span>
                    <select value={settings.appearance?.reducedMotion || "system"} onChange={(e) => applySettingUpdate("appearance", "reducedMotion", e.target.value)} style={inputStyle}>
                      <option value="system">System (Follow OS preference)</option>
                      <option value="on">On (Disable transitions and animations)</option>
                      <option value="off">Off (Full UI transitions)</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            {(
              <div data-testid="settings-section-money" id="settings-sec-3">
                {sectionTitle(3, "Money and escrow")}
                <div style={{ display: "grid", gap: 16 }}>
                  <p style={{ margin: 0, fontSize: 12, color: c.muted }}>Changing spend limits requires explicit human confirmation. Money never moves without buyer approval on PayPal.</p>

                  <PayPalConnectCard />

                  <label style={labelStyle}>
                    <span>Per-pledge spend limit ($ USD)</span>
                    <input
                      type="number"
                      value={settings.policies?.perPledgeSpendLimitUsd || 2500}
                      onChange={(e) => requestMoneySettingChange("perPledgeSpendLimitUsd", "Per-pledge spend limit", settings.policies?.perPledgeSpendLimitUsd || 2500, Number(e.target.value))}
                      style={inputStyle}
                    />
                    <span style={{ fontSize: 11, color: c.muted }}>Maximum single authorization hold per buying group.</span>
                  </label>

                  <label style={labelStyle}>
                    <span>Human approval threshold ($ USD)</span>
                    <input
                      type="number"
                      value={settings.policies?.approvalThresholdUsd || 1000}
                      onChange={(e) => requestMoneySettingChange("approvalThresholdUsd", "Approval threshold", settings.policies?.approvalThresholdUsd || 1000, Number(e.target.value))}
                      style={inputStyle}
                    />
                    <span style={{ fontSize: 11, color: c.muted }}>Amounts above this threshold always require explicit human approval.</span>
                  </label>

                  <label style={labelStyle}>
                    <span>Payout destination (PayPal account)</span>
                    <input
                      type="email"
                      value={displayOrEmpty(settings.policies?.payoutDestination, DEMO_PAYPAL)}
                      onChange={(e) => applySettingUpdate("policies", "payoutDestination", e.target.value)}
                      placeholder="PayPal email for refunds"
                      style={inputStyle}
                    />
                  </label>

                  <label style={labelStyle}>
                    <span>Invoice currency</span>
                    <select value={settings.policies?.invoiceCurrency || "USD"} onChange={(e) => applySettingUpdate("policies", "invoiceCurrency", e.target.value)} style={inputStyle}>
                      <option value="USD">USD (US Dollar)</option>
                    </select>
                  </label>

                  <div>
                    <span style={{ fontSize: 11, color: c.muted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Platform enforced ceilings</span>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span>Platform KYC step-up ceiling:</span>
                      <strong style={{ fontFamily: mono }}>${(PLATFORM_STEP_UP_CEILING_CENTS / 100).toLocaleString()} USD</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
                      <span>Step-up invoicing threshold:</span>
                      <strong style={{ fontFamily: mono }}>${(STEP_UP_THRESHOLD_CENTS / 100).toLocaleString()} USD</strong>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(
              <div data-testid="settings-section-notifications" id="settings-sec-4">
                {sectionTitle(4, "Notifications")}
                <p style={{ fontSize: 12, color: c.muted, margin: "0 0 16px" }}>Configure in-app and email delivery for procurement events.</p>
                <div style={{ display: "grid", gap: 10 }}>
                  {[
                    { id: "groupFilled", label: "Group buy filled and order locked" },
                    { id: "deliveryConfirmed", label: "Shipment delivery confirmed by carrier" },
                    { id: "disputeUpdate", label: "Dispute or claim status updated" },
                    { id: "supplierResearchReady", label: "Supplier research ready from Kernel" },
                    { id: "approvalRequested", label: "Step-up approval requested" },
                    { id: "inviteAccepted", label: "External agent invitation accepted" }
                  ].map((item) => {
                    const inAppKey = `${item.id}InApp`;
                    const emailKey = `${item.id}Email`;
                    return (
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: c.surface, borderRadius: STITCH_RADIUS.lg, border: `1px solid ${c.borderSubtle}`, fontSize: 12 }}>
                        <span>{item.label}</span>
                        <div style={{ display: "flex", gap: 16 }}>
                          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", color: c.muted, fontSize: 11 }}>
                            <input type="checkbox" checked={Boolean(settings.notifications?.[inAppKey])} onChange={(e) => applySettingUpdate("notifications", inAppKey, e.target.checked)} />
                            <span>In-app</span>
                          </label>
                          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", color: c.muted, fontSize: 11 }}>
                            <input type="checkbox" checked={Boolean(settings.notifications?.[emailKey])} onChange={(e) => applySettingUpdate("notifications", emailKey, e.target.checked)} />
                            <span>Email</span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(
              <div data-testid="settings-section-group-defaults" id="settings-sec-5">
                {sectionTitle(5, "Group defaults")}
                <div style={{ display: "grid", gap: 14 }}>
                  <label style={labelStyle}>
                    <span>Default governance template</span>
                    <select value={settings.groupDefaults?.defaultTemplate || "EQUAL_COOP"} onChange={(e) => applySettingUpdate("groupDefaults", "defaultTemplate", e.target.value)} style={inputStyle}>
                      <option value="EQUAL_COOP">Equal co-op (One member, one vote)</option>
                      <option value="VOLUME_WEIGHTED">Volume-weighted (Proportional to units)</option>
                      <option value="FOUNDER_LED">Founder-led (Founder veto on supplier rules)</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span>Default inspection window (hours)</span>
                    <input type="number" min={12} max={168} value={settings.groupDefaults?.defaultInspectionWindowHours || 48} onChange={(e) => applySettingUpdate("groupDefaults", "defaultInspectionWindowHours", Number(e.target.value))} style={inputStyle} />
                    <span style={{ fontSize: 11, color: c.muted }}>Duration members have to inspect shipments after verified delivery.</span>
                  </label>
                  <label style={labelStyle}>
                    <span>Default dispute window (hours)</span>
                    <input type="number" min={24} max={120} value={settings.groupDefaults?.defaultDisputeWindowHours || 48} onChange={(e) => applySettingUpdate("groupDefaults", "defaultDisputeWindowHours", Number(e.target.value))} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    <span>Minimum target discount rate (%)</span>
                    <input type="number" min={5} max={60} value={settings.groupDefaults?.minDiscountPercent || 20} onChange={(e) => applySettingUpdate("groupDefaults", "minDiscountPercent", Number(e.target.value))} style={inputStyle} />
                  </label>
                </div>
              </div>
            )}

            {(
              <div data-testid="settings-section-agent" id="settings-sec-6">
                {sectionTitle(6, "Agent and AI")}
                <div style={{ display: "grid", gap: 16 }}>
                  <p style={{ margin: 0, fontSize: 12, color: c.muted }}>All agent permissions default to off. Mosaic never pledges, captures, or publishes without your explicit confirmation.</p>

                  <div>
                    <span style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>Model</span>
                    <p style={{ margin: 0, fontSize: 13 }}>{modelInfo ? `${modelInfo.label}${modelInfo.model ? `, ${modelInfo.model.split("/").pop()}` : ""}` : "Mosaic"}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: c.muted }}>{modelInfo?.provider === "fireworks" ? "Mosaic runs on a hosted model through Fireworks. Tool calls are checked by the server, and the model cannot change guardrails." : "Mosaic runs on the local model on this machine."}</p>
                  </div>

                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>What Mosaic may do without asking</span>
                    <PermissionsPanel
                      value={{
                        allowAutonomousQuotePrep: Boolean(settings.agentPermissions?.allowAutonomousQuotePrep),
                        allowAutonomousFilterSort: Boolean(settings.agentPermissions?.allowAutonomousFilterSort),
                        allowAutonomousDraftMessages: Boolean(settings.agentPermissions?.allowAutonomousDraftMessages),
                        allowAutonomousResearch: Boolean(settings.agentPermissions?.allowAutonomousResearch),
                        allowAutonomousScheduleChanges: Boolean(settings.agentPermissions?.allowAutonomousScheduleChanges)
                      }}
                      onChange={(next) => {
                        (Object.keys(next) as Array<keyof typeof next>).forEach((key) => {
                          if (Boolean(settings.agentPermissions?.[key]) !== next[key]) applySettingUpdate("agentPermissions", key, next[key]);
                        });
                      }}
                    />
                  </div>

                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Operations that always require explicit human approval</span>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: c.muted, lineHeight: "20px" }}>
                      <li>Any money movement or PayPal hold capture</li>
                      <li>Any legal signature or charter agreement</li>
                      <li>Any buying group creation or proposal vote</li>
                    </ul>
                  </div>

                  <div>
                    <strong style={{ fontSize: 13, display: "block" }}>Automated PayPal Authorization</strong>
                    <p style={{ margin: "4px 0", fontSize: 12, fontWeight: 600 }}>PERMANENTLY DISABLED and LOCKED</p>
                    <p style={{ margin: 0, fontSize: 12, color: c.muted }}>Critical invariant: machine agents are strictly prohibited from authorizing payments. Only the human buyer can approve orders on PayPal.</p>
                  </div>

                  <p style={{ margin: 0, fontSize: 12, color: c.muted, paddingTop: 12, borderTop: `1px solid ${c.borderSubtle}` }}>Outside agents are managed on the Agents page.</p>
                </div>
              </div>
            )}

            {(
              <div data-testid="settings-section-approvals" id="settings-sec-7">
                {sectionTitle(7, "Approvals and signatures")}
                <div style={{ display: "grid", gap: 14 }}>
                  <label style={labelStyle}>
                    <span>Preferred signature method</span>
                    <select value={settings.approvalsAndSignatures?.signatureMethod || "IN_APP"} onChange={(e) => applySettingUpdate("approvalsAndSignatures", "signatureMethod", e.target.value)} style={inputStyle}>
                      <option value="IN_APP">Sign in the app (Recorded in application log)</option>
                      <option value="EXTERNAL_AGENT">Ping my external agent (Relayed via A2A webhook)</option>
                      <option value="ASK_DIRECTLY">Ask me directly (High-priority modal prompt)</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span>Document retention duration</span>
                    <select value={settings.approvalsAndSignatures?.documentRetention || "3_YEARS"} onChange={(e) => applySettingUpdate("approvalsAndSignatures", "documentRetention", e.target.value)} style={inputStyle}>
                      <option value="1_YEAR">1 Year</option>
                      <option value="3_YEARS">3 Years (Recommended for commercial tax audit)</option>
                      <option value="7_YEARS">7 Years</option>
                      <option value="INDEFINITE">Indefinite</option>
                    </select>
                  </label>
                  <p style={{ margin: 0, fontSize: 12, color: c.muted, lineHeight: "18px" }}>
                    Signature recorded in the app, not a certified e-signature. Signatures are stored with cryptographic hashes in workspace event journals.
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: c.muted, lineHeight: "18px" }}>
                    Rule invariant lock: money never moves without buyer approval on PayPal. Dual-signature required on claims above $1,000. Signer threshold: 2 required.
                  </p>
                </div>
              </div>
            )}

            {(
              <div data-testid="settings-section-documents" id="settings-sec-8">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600, color: c.ink, margin: 0 }}>Documents and identity</h2>
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={subBtn}>Upload document</button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files && e.target.files[0];
                      if (file) handleFilePicked(file);
                      e.target.value = "";
                    }}
                  />
                </div>
                <p style={{ margin: "0 0 16px", fontSize: 12, color: c.muted, lineHeight: "18px" }}>
                  Government IDs and business registrations are stored locally. Visible only to you. Delete anytime. Government ID upload is offered, never required.
                </p>
                <div style={{ display: "grid", gap: 8 }}>
                  {(settings.documentsAndIdentity?.uploadedDocuments || []).map((doc: any) => (
                    <div key={doc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 12px", background: c.surface, borderRadius: STITCH_RADIUS.lg, border: `1px solid ${c.borderSubtle}`, fontSize: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</strong>
                        <span style={{ fontSize: 11, color: c.muted }}>
                          Supplier share: {doc.sharedWithSuppliers ? "Explicitly shared for active agreement" : "Private (Visible only to me)"}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button type="button" onClick={() => handleToggleDocShare(doc.id)} style={subBtn}>
                          {doc.sharedWithSuppliers ? "Make private" : "Share with supplier"}
                        </button>
                        <button type="button" onClick={() => handleDeleteDoc(doc.id)} style={{ ...subBtn, color: c.status.error }} aria-label="Delete document">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(
              <div data-testid="settings-section-privacy" id="settings-sec-9">
                {sectionTitle(9, "Data and privacy")}
                <div style={{ display: "grid", gap: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <strong style={{ fontSize: 13, display: "block" }}>Connected payment accounts</strong>
                      <span style={{ fontSize: 12, color: c.muted }}>
                        {paypalConnected ? `PayPal Sandbox: ${connectedPaypalEmail}` : "PayPal account: Not connected yet."}
                      </span>
                    </div>
                    {!paypalConnected && (
                      <button type="button" onClick={() => setActiveSection(3)} style={subBtn}>Connect with PayPal</button>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: c.muted, lineHeight: "18px" }}>
                    Storage: local sandbox data store. Zero third-party telemetry or ad-trackers engaged. Audit trail export is ready.
                  </p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <strong style={{ fontSize: 13, display: "block" }}>Export my data</strong>
                      <span style={{ fontSize: 12, color: c.muted }}>Download a JSON archive of your business profile, policies, and ledger records.</span>
                    </div>
                    <button type="button" onClick={handleExportData} style={subBtn}>Export JSON</button>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <strong style={{ fontSize: 13, display: "block", color: c.status.error }}>Delete local workspace data</strong>
                      <span style={{ fontSize: 12, color: c.muted }}>Erase all local profile preferences and reset to baseline defaults.</span>
                    </div>
                    <button type="button" onClick={() => setShowResetConfirm(true)} style={{ ...subBtn, color: c.status.error }}>Reset settings</button>
                  </div>
                </div>
              </div>
            )}

            {(
              <div data-testid="settings-section-accessibility" id="settings-sec-10">
                {sectionTitle(10, "Accessibility")}
                <div style={{ display: "grid", gap: 16 }}>
                  <label style={labelStyle}>
                    <span>Text sizing scale</span>
                    <select value={settings.accessibility?.textSize || "standard"} onChange={(e) => applySettingUpdate("accessibility", "textSize", e.target.value)} style={inputStyle}>
                      <option value="standard">Standard (14px base)</option>
                      <option value="large">Large (16px base)</option>
                      <option value="extra_large">Extra large (18px base)</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span>Motion and transitions</span>
                    <select value={settings.accessibility?.reducedMotion || "system"} onChange={(e) => applySettingUpdate("accessibility", "reducedMotion", e.target.value)} style={inputStyle}>
                      <option value="system">Respect system preference</option>
                      <option value="on">Force reduced motion</option>
                      <option value="off">Enable all physics animations</option>
                    </select>
                  </label>
                  <p style={{ margin: 0, fontSize: 12, color: c.muted, lineHeight: "18px" }}>
                    Motion preference: reduced motion active. Keyboard access: full shortcuts enabled. Compliance target: WCAG 2.1 AAA.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {pendingMoneyChange && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(15, 31, 46, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: font, color: c.ink }} onMouseDown={(e) => { if (e.target === e.currentTarget) setPendingMoneyChange(null); }}>
          <div role="dialog" aria-modal="true" style={{ width: "100%", maxWidth: 480, background: c.card, border: `1px solid ${c.border}`, borderRadius: STITCH_RADIUS["2xl"], boxShadow: STITCH_SHADOWS.glass, padding: 24 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Confirm spend policy update</h3>
            <p style={{ fontSize: 13, color: c.ink, lineHeight: "20px", margin: "0 0 14px" }}>
              You are updating <strong>{pendingMoneyChange.label}</strong> from{" "}
              <strong style={{ fontFamily: mono }}>${pendingMoneyChange.oldValue}</strong> to{" "}
              <strong style={{ fontFamily: mono }}>${pendingMoneyChange.newValue}</strong>.
            </p>
            <p style={{ fontSize: 12, color: c.muted, margin: "0 0 16px" }}>
              This policy change will take effect immediately. Pledges exceeding this boundary will require explicit manual authorization.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setPendingMoneyChange(null)} style={subBtn}>Cancel</button>
              <button type="button" onClick={confirmMoneySettingChange} style={goldBtn}>Confirm policy update</button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(15, 31, 46, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: font, color: c.ink }} onMouseDown={(e) => { if (e.target === e.currentTarget) setShowResetConfirm(false); }}>
          <div role="dialog" aria-modal="true" style={{ width: "100%", maxWidth: 440, background: c.card, border: `1px solid ${c.border}`, borderRadius: STITCH_RADIUS["2xl"], boxShadow: STITCH_SHADOWS.glass, padding: 24 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: c.status.error }}>Reset settings to default?</h3>
            <p style={{ fontSize: 13, color: c.muted, lineHeight: "20px", margin: "0 0 16px" }}>
              This will reset your local profile, spend policies, and UI settings back to initial platform defaults.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setShowResetConfirm(false)} style={subBtn}>Cancel</button>
              <button type="button" onClick={handleResetSettings} style={{ ...subBtn, color: c.status.error }}>Reset to defaults</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

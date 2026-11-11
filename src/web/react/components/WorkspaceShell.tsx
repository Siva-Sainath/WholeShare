import { MosaicLogo } from "./MosaicLogo";
import React, { useState, useEffect, FormEvent } from "react";
import { ActiveView, SlideOverState } from "../types";
import { ClanDetail, fetchClanById, fetchMcpTools, fetchUserSettings, McpToolDeclaration } from "../api";
import { PayPalAttribution } from "./PayPalAttribution";
import { Button } from "@astryxdesign/core/Button";
import { ImageCredits } from "./ImageCredits";
import { CommandBar } from "./CommandBar";
import { allowMosaicPermission, askMosaic, describeTool } from "../mosaicAgent";
import { BarChart3, Bot, LayoutGrid, Scale, Settings as SettingsIcon, Sparkles, Users, Wallet } from "lucide-react";
import type { MosaicReply } from "../mosaicAgent";
import {
  X,
  LoaderCircle,
  Send,
  AlertTriangle,
  CheckCircle2,
  Info,
  Search
} from "lucide-react";

export interface ExtendedSlideOverState extends SlideOverState {
  mode?: "details" | "pledge" | "join_confirmed" | "pledge_required";
  pledgeUnits?: number;
  quote?: any;
  error?: string;
}

export interface ActionNotice {
  type: string;
  title: string;
  status: "success" | "error" | "info";
  message?: string;
  data?: any;
  error?: string;
  timestamp: number;
}

export interface ModelActivity {
  ok: boolean;
  action: string;
  whatChanged: string;
  view?: string | null;
  error?: string | null;
  timestamp: number;
}

interface WorkspaceShellProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  slideOver?: ExtendedSlideOverState | null;
  onCloseSlideOver?: () => void;
  actionNotice?: ActionNotice | null;
  onCloseNotice?: () => void;
  modelActivity?: ModelActivity | null;
  children: React.ReactNode;
}

// Success is never announced: the screen already shows the change. Only a failure or an approval note appears, as a small glass toast.
export const ActionNoticeBanner: React.FC<{ notice: ActionNotice | null | undefined; onClose?: () => void }> = ({ notice, onClose }) => {
  const visible = Boolean(notice && notice.status !== "success");
  useEffect(() => {
    if (!visible || !onClose) return;
    const timer = window.setTimeout(onClose, 7000);
    return () => window.clearTimeout(timer);
  }, [visible, notice?.timestamp, onClose]);
  if (!notice || !visible) return null;
  const failed = notice.status === "error";
  return (
    <aside className={`ws-toast ${failed ? "ws-toast--error" : ""}`} role={failed ? "alert" : "status"} aria-live="polite">
      {failed ? <AlertTriangle size={16} aria-hidden="true" /> : <Info size={16} aria-hidden="true" />}
      <div className="ws-toast-text">
        <strong>{notice.title}</strong>
        {(notice.error || notice.message) && <span>{notice.error || notice.message}</span>}
      </div>
      {onClose && <button type="button" className="ws-toast-close" onClick={onClose} aria-label="Dismiss"><X size={14} /></button>}
    </aside>
  );
};

const NOTICE_WORDS: Record<string, string> = { allowAutonomous: "May ", agentPermissions: "" };

function humanizeKey(key: string): string {
  const stripped = key.replace(/^allowAutonomous/, "");
  const spaced = stripped.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function flattenNotice(data: Record<string, unknown>, prefix = ""): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const [key, val] of Object.entries(data)) {
    if (val === null || val === undefined || key === "model" || NOTICE_WORDS[key] === "") {
      if (val && typeof val === "object") rows.push(...flattenNotice(val as Record<string, unknown>, prefix));
      continue;
    }
    if (typeof val === "object") rows.push(...flattenNotice(val as Record<string, unknown>, `${prefix}${humanizeKey(key)} `));
    else rows.push([`${prefix}${humanizeKey(key)}`.trim(), typeof val === "boolean" ? (val ? "On" : "Off") : String(val)]);
  }
  return rows;
}

/* Stitch Navigation: exactly 4 text-only items per operator override */
const NAV_ICONS: Partial<Record<ActiveView, React.ReactNode>> = {
  discover: <LayoutGrid size={15} strokeWidth={1.8} />,
  "my-groups": <Users size={15} strokeWidth={1.8} />,
  disputes: <Scale size={15} strokeWidth={1.8} />,
  agents: <Bot size={15} strokeWidth={1.8} />,
  paypal: <Wallet size={15} strokeWidth={1.8} />,
  insights: <BarChart3 size={15} strokeWidth={1.8} />,
  settings: <SettingsIcon size={15} strokeWidth={1.8} />,
  "mosaic-chat": <Sparkles size={15} strokeWidth={1.8} />
};

const NAV_ITEMS: { id: ActiveView; label: string }[] = [
  { id: "discover", label: "Discover" },
  { id: "my-groups", label: "My groups" },
  { id: "disputes", label: "Disputes" },
  { id: "insights", label: "Insights" },
  { id: "agents", label: "Agents" },
  { id: "settings", label: "Settings" },
  { id: "mosaic-chat", label: "Mosaic" }
];

function initialsFor(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
}

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  activeView,
  onNavigate,
  slideOver,
  onCloseSlideOver,
  actionNotice,
  onCloseNotice,
  modelActivity,
  children
}) => {
  const currentNav = NAV_ITEMS.find((n) => {
    return n.id === activeView;
  });

  const [clanData, setClanData] = useState<ClanDetail | null>(null);
  const [clanLoading, setClanLoading] = useState(false);
  const [clanError, setClanError] = useState<string | null>(null);
  const [drawerRulesAgreed, setDrawerRulesAgreed] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [businessName, setBusinessName] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchUserSettings()
      .then((settings) => {
        if (!cancelled && typeof settings?.profile?.businessName === "string") setBusinessName(settings.profile.businessName.trim());
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeView]);

  useEffect(() => {
    if (slideOver?.isOpen && slideOver.clanId) {
      let cancelled = false;
      setClanLoading(true);
      setClanError(null);
      setClanData(null);
      fetchClanById(slideOver.clanId)
        .then((data) => {
          if (!cancelled) { setClanData(data); setClanLoading(false); }
        })
        .catch((err) => {
          if (!cancelled) {
            setClanError(err instanceof Error ? err.message : `Clan not found: ${slideOver.clanId}`);
            setClanLoading(false);
          }
        });
      return () => { cancelled = true; };
    } else if (!slideOver?.clanId) {
      setClanData(null);
      setClanError(slideOver?.isOpen ? "No buying group ID specified." : null);
      setClanLoading(false);
    }
  }, [slideOver?.isOpen, slideOver?.clanId]);

  return (
    <div id="workspaceShell" className="ws-workspace-shell bg-brand-bg min-h-screen flex antialiased">
      <CommandBar hideTrigger={activeView === "mosaic-chat"} />
      <div className="flex flex-col flex-1 min-h-screen bg-brand-bg">
        <header className="ws-appbar sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-brand-border" aria-label="Workspace navigation">
          <div className="ws-appbar-inner">
            <button type="button" className="ws-appbar-brand" onClick={() => onNavigate("landing")} aria-label="WholeShare home">
              <MosaicLogo size={32} intro={false} loop={false} textSize={18} />
            </button>

            <nav className="ws-appbar-tabs" aria-label="Primary">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`ws-appbar-tab ${activeView === item.id || (activeView === "group" && item.id === "discover") || (activeView === "mygroup" && item.id === "my-groups") ? "is-active" : ""}`}
                  aria-current={activeView === item.id ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  {NAV_ICONS[item.id]}
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="ws-appbar-right">
              {activeView !== "discover" && (
              <form
                className="ws-appbar-search"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = searchText.trim();
                  if (!value) return;
                  void window.wholeshareCmd?.dispatch({ action: "radar.search", params: { query: value } });
                }}
              >
                <Search size={14} aria-hidden="true" />
                <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search buying groups" aria-label="Search buying groups" />
              </form>
              )}
              <button type="button" className="ws-appbar-identity" onClick={() => onNavigate("settings")} aria-label="Business profile and settings">
                <span className="ws-appbar-identity-text">
                  <b>{businessName || "Set up your profile"}</b>
                  <small>{businessName ? "Local record" : "Not set up yet"}</small>
                </span>
                <span className="ws-appbar-avatar">{initialsFor(businessName)}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Stage */}
        <main id="mainStage" className="flex-1 px-8 py-6 max-w-7xl w-full mx-auto flex flex-col gap-6">
          {/* Action notice banner */}
          <ActionNoticeBanner notice={actionNotice} onClose={onCloseNotice} />

          {children}

          {/* PayPal attribution footer on every surface */}
          <div className="mt-8 pt-4 border-t border-brand-border"><PayPalAttribution /><div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}><ImageCredits /></div></div>
        </main>
      </div>

      {/* SlideOver drawer */}
      {slideOver?.isOpen && (
        <div
          className="ws-slide-over-backdrop active"
          onClick={(e) => { if (e.target === e.currentTarget && onCloseSlideOver) onCloseSlideOver(); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 300,
            background: "rgba(15, 31, 46, 0.4)",
            display: "flex",
            justifyContent: "flex-end"
          }}
        >
          <div
            className="ws-slide-over-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="slide-over-heading"
            style={{
              width: "420px",
              background: "#FFFFFF",
              borderLeft: "1px solid #E7E2D8",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              overflow: "hidden"
            }}
          >
            <header style={{ padding: "18px 20px", borderBottom: "1px solid #E7E2D8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div
                id="slide-over-heading"
                style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", color: "#5C6A79", fontFamily: "var(--ws-font-sans)" }}
              >
                {slideOver.title || "BUYING GROUP DETAILS"}
              </div>
              <button
                className="ws-slide-over-close"
                onClick={onCloseSlideOver}
                aria-label="Close drawer"
                style={{ background: "none", border: "none", color: "#5C6A79", cursor: "pointer", padding: "4px", borderRadius: "6px", lineHeight: 1 }}
              >
                <X size={18} />
              </button>
            </header>

            <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
              {clanLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#5C6A79", fontSize: "14px" }}>
                  <LoaderCircle size={20} className="ws-spin" />
                  <span>Loading group details...</span>
                </div>
              )}

              {clanError && (
                <div role="alert" style={{ display: "flex", gap: "12px", padding: "14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "8px", color: "#B45309" }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <div>
                    <strong style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>Unable to load group</strong>
                    <p style={{ margin: 0, fontSize: "13px" }}>{clanError}</p>
                  </div>
                </div>
              )}

              {/* Pledge mode */}
              {slideOver.mode === "pledge" && (
                <div className="ws-pledge-flow-card" style={{ padding: "16px", background: "#FFFFFF", border: "1px solid #E7E2D8", borderRadius: "8px" }}>
                  <span style={{ display: "inline-block", fontSize: "10px", fontWeight: 700, color: "#0070BA", background: "#EBF4FA", padding: "2px 8px", borderRadius: "4px", marginBottom: "10px", fontFamily: "var(--ws-font-mono)" }}>
                    STEP 1 OF 2 · COMMITMENT QUOTE
                  </span>
                  <h3 style={{ margin: "0 0 6px", fontSize: "16px", color: "#0F1F2E", fontFamily: "var(--ws-font-sans)" }}>
                    Authorize group buy commitment
                  </h3>
                  <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#0070BA", fontFamily: "var(--ws-font-mono)" }}>{slideOver.clanId}</p>

                  {(() => {
                    const quote = slideOver.quote;
                    if (!quote) return <p style={{ color: "#5C6A79", fontSize: "13px" }}>Quote unavailable. Please close and try again.</p>;
                    return (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px", padding: "12px", background: "#F4EFEB", borderRadius: "8px", fontSize: "12px" }}>
                        <div>
                          <span style={{ color: "#5C6A79", fontSize: "11px", display: "block" }}>Pledged units</span>
                          <strong style={{ color: "#0F1F2E", fontSize: "13px" }}>{slideOver.pledgeUnits || quote.units} units</strong>
                        </div>
                        <div>
                          <span style={{ color: "#5C6A79", fontSize: "11px", display: "block" }}>Per-unit price</span>
                          <strong style={{ color: "#0F1F2E", fontSize: "13px" }}>${(quote.unitPriceUsd || 0).toFixed(2)}</strong>
                        </div>
                        <div>
                          <span style={{ color: "#5C6A79", fontSize: "11px", display: "block" }}>Tier savings</span>
                          <strong style={{ color: "#FFC439", fontSize: "13px" }}>{typeof quote.discountPercent === "number" ? quote.discountPercent : ""}%</strong>
                        </div>
                        <div>
                          <span style={{ color: "#5C6A79", fontSize: "11px", display: "block" }}>Total authorization</span>
                          <strong style={{ color: "#0F1F2E", fontSize: "13px" }}>${(quote.totalAmountUsd || 0).toFixed(2)}</strong>
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ padding: "12px", background: "#F4EFEB", borderRadius: "8px", fontSize: "12px", lineHeight: 1.5, marginBottom: "16px", border: "1px solid #E7E2D8" }}>
                    <strong style={{ color: "#0F1F2E", display: "block", marginBottom: "6px" }}>Group governance</strong>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", color: "#5C6A79", marginBottom: "10px" }}>
                      <span>Inspection 48 hours</span>
                      <span>Dispute 48 hours</span>
                      <span>Voting one member one vote</span>
                      <span>Refunds pro-rata mediated</span>
                    </div>
                    <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", cursor: "pointer", color: "#0F1F2E" }}>
                      <input
                        type="checkbox"
                        checked={drawerRulesAgreed}
                        onChange={(e) => setDrawerRulesAgreed(e.target.checked)}
                        style={{ marginTop: "2px" }}
                      />
                      <span>I agree to the group terms. The governance procedure calculates pro-rata refunds upon verified inspection claims.</span>
                    </label>
                  </div>

                  <div style={{ padding: "12px", border: "1px dashed rgba(0, 112, 186, 0.4)", borderRadius: "8px", background: "#EBF4FA" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span className="ws-approval-status-badge" style={{ fontSize: "10px", fontWeight: 700, color: "#0070BA", fontFamily: "var(--ws-font-mono)", background: "#D1E4FF", padding: "2px 8px", borderRadius: "4px" }}>AWAITING_APPROVAL</span>
                      <span style={{ fontSize: "11px", color: "#5C6A79" }}>Intent AUTHORIZE</span>
                    </div>
                    <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#5C6A79", lineHeight: 1.5 }}>
                      The model prepares the quote and order. PayPal creates the authorization order. Funds are placed on soft hold only after you approve on PayPal. This runs in the PayPal sandbox, so no real money moves.
                    </p>
                    <button
                      type="button"
                      disabled={!drawerRulesAgreed}
                      style={{
                        width: "100%",
                        padding: "12px",
                        background: drawerRulesAgreed ? "#FFC439" : "#E7E2D8",
                        border: "none",
                        borderRadius: "8px",
                        color: drawerRulesAgreed ? "#0F1F2E" : "#5C6A79",
                        fontWeight: 700,
                        fontSize: "14px",
                        cursor: drawerRulesAgreed ? "pointer" : "not-allowed",
                        fontFamily: "var(--ws-font-sans)"
                      }}
                    >
                      Approve authorization hold with PayPal
                    </button>
                  </div>
                </div>
              )}

              {/* Pledge required warning */}
              {slideOver.mode === "pledge_required" && (
                <div role="alert" className="ws-slide-over-warning" style={{ display: "flex", gap: "12px", padding: "16px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "8px" }}>
                  <AlertTriangle size={18} style={{ color: "#B45309", flexShrink: 0 }} />
                  <div>
                    <strong style={{ display: "block", marginBottom: "4px", fontSize: "14px", color: "#92400E" }}>Authorization required</strong>
                    <p style={{ margin: 0, fontSize: "13px", color: "#78350F" }}>An authorized pledge is required before joining. Complete the PayPal authorization step first.</p>
                  </div>
                </div>
              )}

              {/* Join confirmed */}
              {slideOver.mode === "join_confirmed" && (
                <div role="status" className="ws-slide-over-success" style={{ display: "flex", gap: "12px", padding: "16px", background: "#EBF4FA", border: "1px solid rgba(0,112,186,0.3)", borderRadius: "8px" }}>
                  <CheckCircle2 size={18} style={{ color: "#0070BA", flexShrink: 0 }} />
                  <div>
                    <strong style={{ display: "block", marginBottom: "4px", fontSize: "14px", color: "#0070BA" }}>Membership confirmed</strong>
                    <p style={{ margin: 0, fontSize: "13px", color: "#5C6A79" }}>You have joined buying group {slideOver.clanId}. Your authorized units are active in the escrow ledger.</p>
                  </div>
                </div>
              )}

              {/* Standard details */}
              {(!slideOver.mode || slideOver.mode === "details") && !clanLoading && !clanError && clanData && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ fontSize: "12px", color: "#0070BA", fontWeight: 600, fontFamily: "var(--ws-font-sans)" }}>{clanData.category}</span>
                    <span style={{ fontSize: "11px", color: "#5C6A79", background: "#F4EFEB", padding: "2px 8px", borderRadius: "4px", fontFamily: "var(--ws-font-mono)" }}>{clanData.status.replaceAll("_", " ")}</span>
                  </div>
                  <h4 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: 700, color: "#0F1F2E", fontFamily: "var(--ws-font-sans)" }}>{clanData.name}</h4>
                  <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#5C6A79", fontFamily: "var(--ws-font-mono)" }}>{clanData.sku}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", padding: "14px", background: "#F4EFEB", borderRadius: "8px", fontSize: "13px" }}>
                    <div>
                      <span style={{ fontSize: "11px", color: "#5C6A79", display: "block" }}>Units pledged</span>
                      <strong style={{ color: "#0F1F2E" }}>{clanData.currentUnits.toLocaleString()}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: "11px", color: "#5C6A79", display: "block" }}>Target units</span>
                      <strong style={{ color: "#0F1F2E" }}>{clanData.targetUnits.toLocaleString()}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: "11px", color: "#5C6A79", display: "block" }}>Members</span>
                      <strong style={{ color: "#0F1F2E" }}>{clanData.membersCount}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: "11px", color: "#5C6A79", display: "block" }}>Discount tier</span>
                      <strong style={{ color: "#FFC439" }}>{clanData.discountTierPct}%</strong>
                    </div>
                    {clanData.supplierName && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <span style={{ fontSize: "11px", color: "#5C6A79", display: "block" }}>Supplier</span>
                        <strong style={{ color: "#0F1F2E" }}>{clanData.supplierName}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

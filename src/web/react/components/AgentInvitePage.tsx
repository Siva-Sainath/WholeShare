import React, { useState, useEffect } from "react";
import { ShieldCheck, ArrowRight, CheckCircle2, AlertCircle, RefreshCw, Layers } from "lucide-react";
import { PayPalPledgeButton } from "./PayPalPledgeButton";

interface ManifestData {
  platform: string;
  what: string;
  invitedBy: string;
  expiresAt: string;
  rules: string[];
}

interface ScoredClanMatch {
  clanId: string;
  clanName: string;
  canonicalSku: string;
  city: string;
  countryCode: string;
  currency: string;
  score: number;
  reason: string;
  unitPriceCents: number;
  totalCents: number;
  status: string;
  isDomestic: boolean;
}

interface OnboardResult {
  sessionId: string;
  product: string;
  productName: string;
  matches: ScoredClanMatch[];
  strongMatch: boolean;
  summary: string;
}

interface AgentInvitePageProps {
  token: string;
  onNavigate?: (view: string) => void;
}

export const AgentInvitePage: React.FC<AgentInvitePageProps> = ({ token, onNavigate }) => {
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(true);
  const [manifestError, setManifestError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    businessName: "",
    contactEmail: "",
    product: "",
    unitsWanted: 10,
    city: "",
    countryCode: "US"
  });

  const [ambiguousSkus, setAmbiguousSkus] = useState<Array<{ sku: string; name: string }> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [onboardResult, setOnboardResult] = useState<OnboardResult | null>(null);
  const [selectedClan, setSelectedClan] = useState<ScoredClanMatch | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadManifest() {
      try {
        setLoadingManifest(true);
        setManifestError(null);
        const res = await fetch(`/api/v1/agent/${token}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}: Invitation link invalid or expired.`);
        }
        const data = await res.json();
        if (!cancelled) {
          setManifest(data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setManifestError(err.message || "Could not load agent invitation.");
        }
      } finally {
        if (!cancelled) {
          setLoadingManifest(false);
        }
      }
    }
    loadManifest();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setAmbiguousSkus(null);

    try {
      const res = await fetch("/api/v1/agent/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          businessName: formData.businessName,
          contactEmail: formData.contactEmail,
          product: formData.product,
          unitsWanted: Number(formData.unitsWanted),
          city: formData.city,
          countryCode: formData.countryCode
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.matchingSkus && Array.isArray(data.matchingSkus)) {
          setAmbiguousSkus(data.matchingSkus);
          throw new Error("Multiple catalogue products matched. Select your exact SKU below.");
        }
        if (data.missingFields) {
          throw new Error(`Missing required fields: ${data.missingFields.join(", ")}.`);
        }
        throw new Error(data.error || "Onboarding failed.");
      }

      setOnboardResult(data);
      if (data.matches && data.matches.length > 0) {
        setSelectedClan(data.matches[0]);
      }
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit onboarding profile.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingManifest) {
    return (
      <div className="ws-view-pane ws-capability-view" style={{ maxWidth: "720px", margin: "40px auto", padding: "24px" }}>
        <p className="ws-eyebrow">WHOLESHARE AGENT INVITATION</p>
        <h1 className="ws-view-title">Loading invitation details...</h1>
      </div>
    );
  }

  if (manifestError) {
    return (
      <div className="ws-view-pane ws-capability-view" style={{ maxWidth: "720px", margin: "40px auto", padding: "24px" }}>
        <p className="ws-eyebrow">WHOLESHARE AGENT INVITATION</p>
        <h1 className="ws-view-title">Invitation Unavailable</h1>
        <div className="ws-capability-card" style={{ borderColor: "rgba(239, 68, 68, 0.4)" }}>
          <AlertCircle size={20} style={{ color: "var(--ws-red, #ef4444)" }} aria-hidden="true" />
          <div>
            <h2>Link expired or revoked</h2>
            <p>{manifestError}</p>
            {onNavigate && (
              <button
                type="button"
                className="ws-btn ws-btn-titanium ws-btn-sm"
                style={{ marginTop: "16px" }}
                onClick={() => onNavigate("landing")}
              >
                Return to WholeShare
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ws-view-pane ws-capability-view" style={{ maxWidth: "800px", margin: "32px auto", padding: "24px" }}>
      <p className="ws-eyebrow">WHOLESHARE AGENT INVITATION</p>
      <h1 className="ws-view-title">Join a wholesale buying group</h1>
      <p style={{ fontSize: "15px", color: "var(--muted-foreground, #a1a1aa)", marginTop: "4px", marginBottom: "16px" }}>
        WholeShare forms B2B wholesale buying groups. Businesses pool demand, authorise escrow through PayPal, and settle on delivery.
      </p>

      {manifest && (
        <div style={{ marginBottom: "20px", padding: "10px 14px", background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "6px" }}>
          <span style={{ fontSize: "13px", color: "var(--foreground, #ededed)" }}>
            Invited by <strong>{manifest.invitedBy}</strong>. Valid until{" "}
            <span className="ws-tabular-nums">{new Date(manifest.expiresAt).toLocaleDateString()}</span>.
          </span>
        </div>
      )}

      {!onboardResult ? (
        <form onSubmit={handleSubmit} className="ws-capability-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <ShieldCheck size={20} aria-hidden="true" />
            <h2 style={{ margin: 0 }}>Business profile intake</h2>
          </div>

          <p style={{ margin: 0, fontSize: "13px", color: "var(--muted-foreground, #888)" }}>
            Provide six standard facts to match with active volume buying syndicates.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <label htmlFor="agent-businessName" style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                Business Name
              </label>
              <input
                id="agent-businessName"
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                placeholder="e.g. Acme Roasting Co"
                style={{ width: "100%", padding: "8px 12px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", color: "#fff" }}
              />
            </div>

            <div>
              <label htmlFor="agent-contactEmail" style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                Contact Email
              </label>
              <input
                id="agent-contactEmail"
                type="email"
                required
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                placeholder="procurement@acme.com"
                style={{ width: "100%", padding: "8px 12px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", color: "#fff" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "14px" }}>
            <div>
              <label htmlFor="agent-product" style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                Product SKU or Name
              </label>
              <input
                id="agent-product"
                type="text"
                required
                value={formData.product}
                onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                placeholder="organic-flour-50lb"
                style={{ width: "100%", padding: "8px 12px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", color: "#fff" }}
              />
            </div>

            <div>
              <label htmlFor="agent-unitsWanted" style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                Units Wanted
              </label>
              <input
                id="agent-unitsWanted"
                type="number"
                min={1}
                required
                value={formData.unitsWanted}
                onChange={(e) => setFormData({ ...formData, unitsWanted: parseInt(e.target.value, 10) || 1 })}
                style={{ width: "100%", padding: "8px 12px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", color: "#fff" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "14px" }}>
            <div>
              <label htmlFor="agent-city" style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                City
              </label>
              <input
                id="agent-city"
                type="text"
                required
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Austin"
                style={{ width: "100%", padding: "8px 12px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", color: "#fff" }}
              />
            </div>

            <div>
              <label htmlFor="agent-countryCode" style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                Country Code
              </label>
              <input
                id="agent-countryCode"
                type="text"
                maxLength={2}
                required
                value={formData.countryCode}
                onChange={(e) => setFormData({ ...formData, countryCode: e.target.value.toUpperCase() })}
                placeholder="US"
                style={{ width: "100%", padding: "8px 12px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", color: "#fff" }}
              />
            </div>
          </div>

          {ambiguousSkus && (
            <div style={{ padding: "12px", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "6px" }}>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--ws-amber, #f59e0b)", margin: "0 0 8px 0" }}>
                Choose one of the matching SKUs:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {ambiguousSkus.map((item) => (
                  <button
                    key={item.sku}
                    type="button"
                    className="ws-btn ws-btn-titanium ws-btn-sm"
                    onClick={() => {
                      setFormData({ ...formData, product: item.sku });
                      setAmbiguousSkus(null);
                    }}
                  >
                    {item.name} ({item.sku})
                  </button>
                ))}
              </div>
            </div>
          )}

          {submitError && (
            <p style={{ color: "var(--ws-red, #ef4444)", fontSize: "13px", margin: 0 }}>{submitError}</p>
          )}

          <div style={{ marginTop: "8px" }}>
            <button
              type="submit"
              className="ws-btn ws-btn-primary"
              disabled={submitting}
              data-testid="agent-onboard-submit-button"
            >
              {submitting ? "Matching buying groups..." : "Find wholesale buying groups"}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ padding: "14px 18px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <CheckCircle2 size={18} style={{ color: "var(--ws-green, #10b981)" }} aria-hidden="true" />
              <strong style={{ fontSize: "14px", color: "var(--foreground, #fff)" }}>Profile onboarded</strong>
            </div>
            <p style={{ margin: 0, fontSize: "14px", color: "var(--muted-foreground, #d1d5db)" }}>
              {onboardResult.summary}
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: "16px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Layers size={18} aria-hidden="true" />
              Top Matched Buying Groups
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {onboardResult.matches.map((clan) => (
                <div
                  key={clan.clanId}
                  onClick={() => setSelectedClan(clan)}
                  style={{
                    padding: "14px",
                    background: selectedClan?.clanId === clan.clanId ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.02)",
                    border: `1px solid ${selectedClan?.clanId === clan.clanId ? "var(--ws-primary, #10b981)" : "rgba(255, 255, 255, 0.08)"}`,
                    borderRadius: "6px",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontWeight: 600, fontSize: "14px" }}>{clan.clanName}</span>
                      <span
                        className="ws-tabular-nums"
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: clan.score >= 72 ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                          color: clan.score >= 72 ? "var(--ws-green, #10b981)" : "var(--ws-amber, #f59e0b)"
                        }}
                      >
                        {clan.score}/100 Match
                      </span>
                    </div>
                    <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--muted-foreground, #888)" }}>
                      {clan.reason}
                    </p>
                  </div>

                  <div style={{ textAlign: "right" }} className="ws-tabular-nums">
                    <span style={{ fontSize: "15px", fontWeight: 600, display: "block" }}>
                      ${(clan.unitPriceCents / 100).toFixed(2)} / unit
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--muted-foreground, #888)" }}>
                      Total: ${(clan.totalCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selectedClan && (
            <div className="ws-capability-card" style={{ marginTop: "8px" }}>
              <h2 style={{ fontSize: "15px", marginBottom: "8px" }}>Authorise escrow hold on PayPal</h2>
              <p style={{ fontSize: "13px", color: "var(--muted-foreground, #888)", marginBottom: "16px" }}>
                Authorize soft hold of ${(selectedClan.totalCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} for {formData.unitsWanted} units. No funds are captured until delivery confirmation.
              </p>
              <PayPalPledgeButton
                clanId={selectedClan.clanId}
                clanName={selectedClan.clanName}
                currency={selectedClan.currency || "USD"}
              />
            </div>
          )}

          <div>
            <button
              type="button"
              className="ws-btn ws-btn-titanium ws-btn-sm"
              onClick={() => {
                setOnboardResult(null);
                setSelectedClan(null);
              }}
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

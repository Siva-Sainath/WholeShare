import React, { useCallback, useEffect, useState } from "react";
import { Bot, Check, Copy, KeyRound, Plug, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Switch } from "@astryxdesign/core/Switch";
import { HarnessPanel } from "./HarnessPanel";
import { AgentSurfaces } from "./AgentSurfaces";

interface Invite {
  token: string;
  inviteUrl?: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
  uses: number;
  lastAgent?: { id: string; label: string; at: string };
}

const BRAND_STYLE: Record<string, { bg: string; fg: string; glyph: string }> = {
  claude: { bg: "#F6E6DD", fg: "#B5502A", glyph: "C" },
  chatgpt: { bg: "#E3F4EA", fg: "#1F7A4A", glyph: "G" },
  grok: { bg: "#E9EDF2", fg: "#0F1F2E", glyph: "X" },
  instinct: { bg: "#F1EEFB", fg: "#6B4FD0", glyph: "I" },
  gemini: { bg: "#EBF4FA", fg: "#0070BA", glyph: "G" },
  cursor: { bg: "#EFEFEF", fg: "#0F1F2E", glyph: "Cu" },
  perplexity: { bg: "#E8F7FA", fg: "#0E7F8E", glyph: "P" },
  copilot: { bg: "#EBF4FA", fg: "#0F5FA8", glyph: "Co" },
  other: { bg: "#F4EFEB", fg: "#5C6A79", glyph: "A" }
};

const AgentGlyph: React.FC<{ id?: string; label?: string }> = ({ id, label }) => {
  const style = BRAND_STYLE[id ?? ""] ?? null;
  return (
    <span title={label ?? "No agent has connected yet"} style={{ width: 24, height: 24, borderRadius: 8, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, background: style?.bg ?? "#F4EFEB", color: style?.fg ?? "#9AA5B1" }}>
      {style ? style.glyph : <KeyRound size={13} />}
    </span>
  );
};

function buildInstructions(origin: string, token: string, mcpCount: number): string {
  return `You are joining WholeShare as a buyer's agent. WholeShare is a B2B group buying platform: small businesses pool orders to unlock supplier tier pricing, and PayPal holds the money in escrow.

Step 1. Read the manifest. It lists the fields you must collect, the endpoints you may call and the rules you must follow:
GET ${origin}/api/v1/agent/${token}

Step 2. Collect the required fields from your human. If one is missing, ask. Do not guess.

Step 3. Register your buyer and get matched to buying groups:
POST ${origin}/api/v1/agent/onboard
Content-Type: application/json
Body: { "token": "${token}", "agentName": "<your name>", ...fields from the manifest }

Step 4. To price a pledge, call POST ${origin}/api/v1/agent/pledge-quote. A quote is not an authorization.

Optional. If you speak MCP (Model Context Protocol), connect to ${origin}/mcp with the header Authorization: Bearer ${token}. It offers ${mcpCount} tools plus ask_mosaic, which hands a whole request to the buyer's own assistant. The buyer must have switched on outside agent access in Settings. Tools the buyer has not allowed return a blocked message that names the switch.

Rules: money never moves without the human approving on PayPal's own site. Never invent a PayPal order id, a tracking number or a shipment date. All amounts are USD cents as integers.`;
}

function maskToken(token: string): string {
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const isLive = (invite: Invite): boolean => !invite.revoked && new Date(invite.expiresAt).getTime() > Date.now();

const card: React.CSSProperties = { background: "#FFFFFF", border: "1px solid #E7E2D8", borderRadius: 16, padding: 24, display: "grid", gap: 16, alignContent: "start" };
const label: React.CSSProperties = { margin: 0, fontSize: 12, lineHeight: "16px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5C6A79" };
const mono: React.CSSProperties = { fontFamily: "'Geist Mono', monospace", fontSize: 13, lineHeight: "20px", background: "#F4EFEB", borderRadius: 8, padding: "10px 12px", margin: 0, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" };

export const AgentsView: React.FC = () => {
  const origin = window.location.origin;
  const [invites, setInvites] = useState<Invite[]>([]);
  const [fresh, setFresh] = useState<Invite | null>(null);
  const [toolCount, setToolCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [access, setAccess] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/agent-invites");
      const payload = (await response.json()) as { invites?: Invite[] };
      setInvites(payload.invites ?? []);
    } catch {
      setError("Could not load connected agents.");
    }
  }, []);

  useEffect(() => {
    void load();
    fetch("/api/v1/user/settings").then((response) => response.json()).then((settings: { agentPermissions?: { externalAgentAccessEnabled?: boolean } }) => setAccess(settings.agentPermissions?.externalAgentAccessEnabled === true)).catch(() => setAccess(null));
    fetch("/api/v1/mcp/info").then((response) => response.json()).then((info: { tools?: unknown[] }) => setToolCount(info.tools?.length ?? null)).catch(() => setToolCount(null));
  }, [load]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/agent-invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ createdBy: "workspace" }) });
      const payload = (await response.json()) as { invite?: Invite; inviteUrl?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Could not create the link (${response.status}).`);
      const invite = payload.invite ?? (payload as unknown as Invite);
      setFresh({ ...invite, inviteUrl: payload.inviteUrl ?? invite.inviteUrl });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the link.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: string) => {
    setError(null);
    const response = await fetch(`/api/v1/agent-invites/${token}`, { method: "DELETE" });
    if (!response.ok) setError("Could not revoke that link.");
    if (fresh?.token === token) setFresh(null);
    await load();
  };

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Copy is blocked in this browser. Select the text and copy it by hand.");
    }
  };

  const link = fresh ? fresh.inviteUrl ?? `${origin}/agent/${fresh.token}` : "";
  const instructions = fresh ? buildInstructions(origin, fresh.token, toolCount ?? 0) : "";
  const active = invites.filter((invite) => !invite.revoked && new Date(invite.expiresAt).getTime() > Date.now());
  const visible = invites.filter((invite) => isLive(invite) || Boolean(invite.lastAgent));

  return (
    <section data-ws-view="agents" style={{ display: "grid", gap: 16, fontFamily: "'Geist', sans-serif", color: "#0F1F2E" }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.02em" }}>Agents</h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#5C6A79", maxWidth: 760 }}>
            Outside agents join through a private link or MCP. They can register a buyer and ask for quotes. Only you can approve a payment, on PayPal.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge variant="blue" label={`${active.length} active ${active.length === 1 ? "link" : "links"}`} />
          <Button variant="primary" label={busy ? "Creating" : "Create agent link"} onClick={() => void create()} isDisabled={busy} />
        </div>
      </header>

      {error && <Banner status="error" title="Something went wrong" description={error} isDismissable onDismiss={() => setError(null)} />}

      {fresh && (
        <div style={{ ...card, padding: 16, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)", alignItems: "start" }} className="ws-agents-grid">
          <div style={{ display: "grid", gap: 8 }}>
            <p style={label}>Invite link</p>
            <p style={mono}>{link}</p>
            <div><Button size="sm" label={copied === "link" ? "Copied" : "Copy link"} icon={copied === "link" ? <Check size={14} /> : <Copy size={14} />} onClick={() => void copy("link", link)} /></div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <p style={label}>Paste into your agent</p>
            <p style={{ ...mono, maxHeight: 180, overflowY: "auto" }}>{instructions}</p>
            <div><Button size="sm" variant="primary" label={copied === "instructions" ? "Copied" : "Copy instructions"} icon={copied === "instructions" ? <Check size={14} /> : <Copy size={14} />} onClick={() => void copy("instructions", instructions)} /></div>
          </div>
        </div>
      )}

      <AgentSurfaces />
      <HarnessPanel />

      <div style={{ ...card, padding: 0, gap: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderBottom: "1px solid #E7E2D8" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Bot size={16} color="#0070BA" /><b style={{ fontSize: 14 }}>Connected agents</b></div>
          <span style={{ fontSize: 13, color: "#5C6A79" }}>{active.length} active, {invites.length - visible.length} unused and closed links hidden</span>
        </div>
        {visible.length === 0 ? (
          <p style={{ margin: 0, padding: 16, fontSize: 14, color: "#5C6A79" }}>No agents connected. Create a link and give it to your agent. Nothing appears here until an agent really uses one.</p>
        ) : (
          <div>
            {[...visible].sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || b.createdAt.localeCompare(a.createdAt)).slice(0, showAll ? visible.length : 8).map((invite) => {
              const expired = new Date(invite.expiresAt).getTime() <= Date.now();
              const state = invite.revoked ? "Revoked" : expired ? "Expired" : "Active";
              return (
                <div key={invite.token} style={{ display: "grid", gridTemplateColumns: "24px 140px minmax(0, 1fr) 70px 80px 100px", gap: 12, alignItems: "center", padding: "8px 16px", borderTop: "1px solid #F0ECE3" }}>
                  <AgentGlyph id={invite.lastAgent?.id} label={invite.lastAgent?.label} />
                  <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{maskToken(invite.token)}</span>
                  <span style={{ fontSize: 12, color: "#5C6A79" }}>{invite.lastAgent ? <b style={{ color: "#0F1F2E" }}>{invite.lastAgent.label}</b> : "Waiting for an agent"} · created {formatDate(invite.createdAt)}, expires {formatDate(invite.expiresAt)}</span>
                  <span style={{ fontSize: 12 }}>{invite.uses} {invite.uses === 1 ? "use" : "uses"}</span>
                  <Badge variant={state === "Active" ? "success" : "neutral"} label={state} />
                  {state === "Active" ? <Button size="sm" label="Revoke" icon={<Trash2 size={12} />} onClick={() => void revoke(invite.token)} /> : <span />}
                </div>
              );
            })}
            {visible.length > 8 && <div style={{ padding: "8px 16px", borderTop: "1px solid #F0ECE3" }}><Button size="sm" label={showAll ? "Show fewer" : `Show all ${visible.length}`} onClick={() => setShowAll((value) => !value)} /></div>}
          </div>
        )}
      </div>

      <div style={{ ...card, padding: 16, gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center" }}>
          <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Plug size={16} color="#0070BA" /><b style={{ fontSize: 14 }}>MCP server</b><span style={{ fontSize: 12, color: "#5C6A79" }}>{toolCount === null ? "tool list unavailable" : `${toolCount} tools`}</span></div>
            <p style={{ ...mono, padding: "6px 10px" }}>{origin}/mcp</p>
            <span style={{ fontSize: 12, color: "#5C6A79" }}>Send the agent invite token as a Bearer token. Tools follow your Settings permissions, and money never moves without you on PayPal.</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Button size="sm" label={copied === "mcp" ? "Copied" : "Copy URL"} icon={<Copy size={14} />} onClick={() => void copy("mcp", `${origin}/mcp`)} />
            {fresh && <Button size="sm" label={copied === "mcpcfg" ? "Copied" : "Copy client config"} icon={<Copy size={14} />} onClick={() => void copy("mcpcfg", JSON.stringify({ mcpServers: { wholeshare: { url: `${origin}/mcp`, headers: { Authorization: `Bearer ${fresh.token}` } } } }, null, 2))} />}
          </div>
        </div>
        <Switch
          label="Let connected agents use WholeShare for me"
          description="Off by default. When on, an agent with a live invite can search, compare and prepare pledges, within the permissions above."
          value={access === true}
          isDisabled={access === null}
          onChange={(checked) => {
            setAccess(checked);
            void fetch("/api/v1/user/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentPermissions: { externalAgentAccessEnabled: checked } }) }).catch(() => setAccess(!checked));
          }}
        />
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "#5C6A79", display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={14} /> Agents cannot approve or capture payments, invent PayPal ids or tracking numbers, or use revoked links. Onboarding is limited to 20 requests per hour per link.</p>
    </section>
  );
};

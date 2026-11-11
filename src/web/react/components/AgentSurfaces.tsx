import React, { useEffect, useState } from "react";
import { Globe, Plug, Sparkles } from "lucide-react";
import { listWebMcpTools } from "../webmcp";
import { describeAgentCall, type AgentCall } from "../agentCalls";

// The three ways an agent can work in WholeShare, in one slim row, and what outside agents have just done.
export const AgentSurfaces: React.FC = () => {
  const [harness, setHarness] = useState<number | null>(null);
  const [mcp, setMcp] = useState<number | null>(null);
  const [calls, setCalls] = useState<Array<AgentCall & { id: number }>>([]);
  const page = listWebMcpTools().length;
  useEffect(() => {
    fetch("/api/v1/harness").then((r) => r.json()).then((p: { tools?: unknown[] }) => setHarness(p.tools?.length ?? null)).catch(() => setHarness(null));
    fetch("/api/v1/mcp/info").then((r) => r.json()).then((p: { tools?: unknown[] }) => setMcp(p.tools?.length ?? null)).catch(() => setMcp(null));
    let id = 0;
    const onCall = (event: Event) => setCalls((prev) => [{ ...(event as CustomEvent<AgentCall>).detail, id: (id += 1) }, ...prev].slice(0, 5));
    window.addEventListener("ws:agent-call", onCall);
    return () => window.removeEventListener("ws:agent-call", onCall);
  }, []);
  const surfaces = [
    { icon: <Sparkles size={16} />, title: "Mosaic", note: "Built in. Every action follows your permissions.", count: harness },
    { icon: <Globe size={16} />, title: "The page you are on", note: "An agent in your browser can filter, chart and schedule on screen.", count: page },
    { icon: <Plug size={16} />, title: "Your own agent", note: "Any chat assistant that speaks MCP, with a token you control.", count: mcp }
  ];
  return (
    <div className="ws-surfaces-wrap">
      <div className="ws-surfaces">
        {surfaces.map((surface) => (
          <div key={surface.title} className="ws-surface">
            <span className="ws-surface-icon">{surface.icon}</span>
            <div className="ws-surface-body"><b>{surface.title}</b><span className="ws-surface-note">{surface.note}</span></div>
            <span className="ws-surface-count">{surface.count ?? "·"}<small>tools</small></span>
          </div>
        ))}
      </div>
      <div className="ws-agent-feed" aria-live="polite">
        <b>Live from connected agents</b>
        {calls.length === 0 ? <span>Nothing yet. When an outside agent uses WholeShare for you, it shows up here as it happens.</span> : (
          <ul>{calls.map((call) => <li key={call.id}>{describeAgentCall(call)}<small>{new Date(call.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</small></li>)}</ul>
        )}
      </div>
    </div>
  );
};

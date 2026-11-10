import React, { useEffect, useState } from "react";
import { Cpu, ShieldCheck } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { toolMeta } from "../toolMeta";

interface HarnessTool { name: string; description: string; effect: "read" | "ui" | "write" | "external"; permissionLabel: string | null }
interface Harness {
  model: { provider: string; label: string; model: string | null; endpoint: string; cloudFallback: boolean };
  tools: HarnessTool[];
  guardrails: string[];
  dataSources: Array<{ id: string; label: string }>;
}

const EFFECT: Record<HarnessTool["effect"], { label: string; variant: "blue" | "green" | "gold" | "neutral" }> = {
  read: { label: "Reads data", variant: "neutral" },
  ui: { label: "Drives the screen", variant: "blue" },
  write: { label: "Changes records", variant: "gold" },
  external: { label: "Reaches outside", variant: "green" }
};

const mono: React.CSSProperties = { fontFamily: "'Geist Mono', monospace", fontSize: 12, background: "#F4EFEB", borderRadius: 8, padding: "8px 10px", margin: 0, overflowX: "auto", whiteSpace: "pre-wrap" };

export const HarnessPanel: React.FC = () => {
  const [harness, setHarness] = useState<Harness | null>(null);
  useEffect(() => {
    fetch("/api/v1/harness").then((response) => response.json()).then((payload: Harness) => setHarness(payload)).catch(() => setHarness(null));
  }, []);
  if (!harness) return null;
  const groups = (Object.keys(EFFECT) as Array<HarnessTool["effect"]>).map((effect) => ({ effect, tools: harness.tools.filter((tool) => tool.effect === effect) })).filter((group) => group.tools.length > 0);

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E7E2D8", borderRadius: 16, padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Cpu size={16} color="#0070BA" /><b style={{ fontSize: 14 }}>Mosaic harness</b><span style={{ fontSize: 12, color: "#5C6A79" }}>{harness.tools.length} tools, {harness.dataSources.length} data sources</span></div>
        <div style={{ display: "flex", gap: 6 }}>
          <Badge variant="blue" label={harness.model.label} />
          {harness.model.model && <Badge variant="neutral" label={harness.model.model.split("/").pop() ?? harness.model.model} />}
          <Badge variant={harness.model.cloudFallback ? "gold" : "green"} label={harness.model.cloudFallback ? "Cloud fallback on" : "No cloud fallback"} />
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#5C6A79" }}>
        The model proposes tool calls. The server checks permissions and guardrails, runs them, and every screen updates from the same events. Any model with tool calling can be connected by changing its settings and restarting.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {groups.map((group) => (
          <div key={group.effect} style={{ border: "1px solid #F0ECE3", borderRadius: 12, padding: 12, display: "grid", gap: 6, alignContent: "start" }}>
            <Badge variant={EFFECT[group.effect].variant} label={`${EFFECT[group.effect].label} (${group.tools.length})`} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {group.tools.map((tool) => (<span key={tool.name} title={`${tool.name}: ${tool.description}`} style={{ fontSize: 12, background: "#F4EFEB", borderRadius: 6, padding: "2px 8px" }}>{toolMeta(tool.name).running}</span>))}
            </div>
          </div>
        ))}
      </div>
      <Collapsible defaultIsOpen={false} trigger={<span style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}><ShieldCheck size={14} /> Guardrails the model cannot change</span>}>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 4, fontSize: 13, color: "#5C6A79" }}>{harness.guardrails.map((rule) => <li key={rule}>{rule}</li>)}</ul>
      </Collapsible>
      <Collapsible defaultIsOpen={false} trigger={<span style={{ fontSize: 13 }}>Connect a different model</span>}>
        <p style={{ margin: "6px 0", fontSize: 13, color: "#5C6A79" }}>Set these on the server and restart. Any OpenAI compatible endpoint with tool calling works.</p>
        <pre style={mono}>{`MOSAIC_PROVIDER=fireworks\nMOSAIC_MODEL_NAME=accounts/fireworks/models/<model>\nFIREWORKS_API_KEY=<your key>\n\n# check it, no model needed:\nnode --test test/harness-contract.test.js\n# check it with the model:\nnode scripts/verify-harness.js`}</pre>
      </Collapsible>
    </div>
  );
};

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

const EFFECT_NOTE: Record<HarnessTool["effect"], string> = {
  read: "Looks things up",
  ui: "Moves around the app",
  write: "Changes your records",
  external: "Reaches the web"
};

export const HarnessPanel: React.FC = () => {
  const [harness, setHarness] = useState<Harness | null>(null);
  const [open, setOpen] = useState<HarnessTool["effect"] | null>(null);
  useEffect(() => {
    fetch("/api/v1/harness").then((response) => response.json()).then((payload: Harness) => setHarness(payload)).catch(() => setHarness(null));
  }, []);
  if (!harness) return null;
  const groups = (Object.keys(EFFECT) as Array<HarnessTool["effect"]>).map((effect) => ({ effect, tools: harness.tools.filter((tool) => tool.effect === effect) })).filter((group) => group.tools.length > 0);
  const opened = groups.find((group) => group.effect === open);

  return (
    <div className="ws-harness">
      <div className="ws-harness-head">
        <span className="ws-harness-icon"><Cpu size={16} /></span>
        <div className="ws-harness-title">
          <b>How Mosaic works</b>
          <span>Mosaic proposes an action, WholeShare checks your permissions and runs it, and every screen updates. Money only moves when you approve on PayPal.</span>
        </div>
        <div className="ws-harness-badges">
          <Badge variant="blue" label={harness.model.label} />
          {harness.model.model && <Badge variant="neutral" label={harness.model.model.split("/").pop() ?? harness.model.model} />}
        </div>
      </div>
      <div className="ws-harness-tiles">
        {groups.map((group) => (
          <button key={group.effect} type="button" className="ws-harness-tile" data-open={open === group.effect || undefined} aria-expanded={open === group.effect} onClick={() => setOpen(open === group.effect ? null : group.effect)}>
            <span className="ws-harness-count">{group.tools.length}</span>
            <span className="ws-harness-label">{EFFECT[group.effect].label}</span>
            <span className="ws-harness-note">{EFFECT_NOTE[group.effect]}</span>
          </button>
        ))}
      </div>
      {opened && (
        <div className="ws-harness-chips">
          {opened.tools.map((tool) => (<span key={tool.name} title={`${tool.name}: ${tool.description}`}>{toolMeta(tool.name).running}</span>))}
        </div>
      )}
      <Collapsible defaultIsOpen={false} trigger={<span className="ws-harness-more"><ShieldCheck size={14} /> Rules Mosaic always follows</span>}>
        <ul className="ws-harness-rules">{harness.guardrails.map((rule) => <li key={rule}>{rule}</li>)}</ul>
      </Collapsible>
    </div>
  );
};

import React, { useEffect, useState } from "react";
import { Globe, Plug, Sparkles } from "lucide-react";
import { listWebMcpTools } from "../webmcp";

// The three ways an agent can work in WholeShare, with live counts, so it is clear what is built and where it runs.
export const AgentSurfaces: React.FC = () => {
  const [harness, setHarness] = useState<number | null>(null);
  const [mcp, setMcp] = useState<number | null>(null);
  const page = listWebMcpTools().length;
  useEffect(() => {
    fetch("/api/v1/harness").then((r) => r.json()).then((p: { tools?: unknown[] }) => setHarness(p.tools?.length ?? null)).catch(() => setHarness(null));
    fetch("/api/v1/mcp/info").then((r) => r.json()).then((p: { tools?: unknown[] }) => setMcp(p.tools?.length ?? null)).catch(() => setMcp(null));
  }, []);
  const surfaces = [
    { icon: <Sparkles size={16} />, title: "Mosaic, the built-in assistant", count: harness, note: "Server tools, each with a permission you control", names: ["compare_groups", "join_group", "schedule_move_delivery", "file_damage_claim", "kernel_read_supplier_site"] },
    { icon: <Globe size={16} />, title: "The page itself (WebMCP)", count: page, note: "Registered in the browser, so an agent can drive the screen you are on", names: ["grid_filter", "grid_chart", "grid_export_csv", "bryntum_scheduler_zoom", "bryntum_show_view"] },
    { icon: <Plug size={16} />, title: "Your own agent (MCP)", count: mcp, note: "Over /mcp with a bearer token, inside the same permissions", names: ["query", "compare_groups", "join_group", "track_shipment", "ask_mosaic"] }
  ];
  return (
    <div className="ws-surfaces">
      {surfaces.map((surface) => (
        <div key={surface.title} className="ws-surface">
          <span className="ws-surface-icon">{surface.icon}</span>
          <div className="ws-surface-body">
            <b>{surface.title}</b>
            <span className="ws-surface-note">{surface.note}</span>
            <div className="ws-surface-names">{surface.names.map((name) => <code key={name}>{name}</code>)}</div>
          </div>
          <span className="ws-surface-count">{surface.count ?? "·"}<small>tools</small></span>
        </div>
      ))}
    </div>
  );
};

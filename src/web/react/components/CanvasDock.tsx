import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ExternalLink, X } from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ValueFormatterParams } from "ag-grid-community";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Artifact, closeCanvas, getCanvas, subscribeCanvas } from "../canvasStore";
import { wsGridTheme } from "../theme/gridTheme";
import { destroyBryntumScheduler, destroyBryntumTaskBoard, initBryntumScheduler, initBryntumTaskBoard } from "../../bryntum-timeline";
import { ExportButtons } from "./ExportButtons";
import { registerGrid } from "../gridWebMcp";
import { ProductVisual } from "./ProductVisual";

type Row = Record<string, unknown>;

interface SourceResult {
  rows: Row[];
  total: number;
  description: string;
}

async function loadSource(artifact: Artifact): Promise<SourceResult> {
  const source = artifact.kind === "groups" ? "groups" : artifact.kind === "invoices" ? "paypal_invoices" : artifact.source;
  if (!source) throw new Error("This panel has no data source.");
  const query = new URLSearchParams({ limit: String(artifact.limit ?? 50) });
  if (artifact.filter && artifact.filter.length > 0) query.set("filter", JSON.stringify(artifact.filter));
  const sort = artifact.sort ?? (artifact.kind === "groups" ? { field: "fillPct", direction: "desc" } : null);
  if (sort) {
    query.set("sort", sort.field);
    query.set("direction", sort.direction ?? "asc");
  }
  const response = await fetch(`/api/v1/data/${encodeURIComponent(source)}?${query.toString()}`, { headers: { accept: "application/json" } });
  const payload = (await response.json()) as { rows?: Row[]; total?: number; description?: string; error?: string };
  if (!response.ok || !Array.isArray(payload.rows)) throw new Error(payload.error ?? "Could not load this data.");
  return { rows: payload.rows, total: payload.total ?? payload.rows.length, description: payload.description ?? "" };
}

const HIDDEN_FIELDS = new Set(["id", "demo", "groupId"]);

function humanize(field: string): string {
  const spaced = field.replace(/Usd$/, " (USD)").replace(/Pct$/, " %").replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const PRESETS: Record<string, string[]> = {
  groups: ["name", "unitPriceUsd", "tierDiscountPct", "fillPct", "deliveryDays", "supplier", "supplierTrust", "status"],
  members: ["member", "units", "authorizedUsd", "status"],
  ledger: ["group", "member", "units", "authorizedUsd", "status"],
  claims: ["id", "groupId", "damagedUnits", "claimedUsd", "status", "createdAt"],
  shipments: ["product", "carrier", "receivingPoint", "expectedAt", "deliveredAt", "status"],
  suppliers: ["name", "city", "country", "categories", "leadTimeDays", "minOrderUnits", "trustScore", "onTimeRatePct", "acceptsPayPal"],
  paypal_invoices: ["number", "billedTo", "amountUsd", "dueUsd", "status", "issuedAt"]
};

function columnsFor(rows: Row[], source?: string): ColDef[] {
  const first = rows[0] ?? {};
  const preset = (source && PRESETS[source]) || [];
  const fields = preset.length > 0 ? preset.filter((field) => field in first) : Object.keys(first).filter((field) => !HIDDEN_FIELDS.has(field)).slice(0, 6);
  return fields
    .map((field, index) => {
      const sample = first[field];
      const isMoney = field.endsWith("Usd");
      const isDate = /At$/.test(field);
      return {
        field,
        headerName: humanize(field),
        minWidth: index === 0 ? 260 : isMoney ? 110 : 110,
        flex: index === 0 ? 2.4 : typeof sample === "string" && field !== "status" ? 1.4 : 1,
        pinned: index === 0 ? ("left" as const) : undefined,
        cellClass: typeof sample === "number" ? "ws-tabular-nums" : undefined,
        enableRowGroup: typeof sample !== "number",
        enableValue: typeof sample === "number",
        allowedAggFuncs: typeof sample === "number" ? ["sum", "avg", "min", "max", "count"] : undefined,
        aggFunc: undefined,
        chartDataType: typeof sample === "number" ? "series" : "category",
        valueFormatter: isMoney
          ? (params: ValueFormatterParams) => (params.value == null ? "" : `$${Number(params.value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
          : isDate
            ? (params: ValueFormatterParams) => (params.value ? new Date(String(params.value)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "")
            : undefined
      } as ColDef;
    });
}

function snapshotComponent(artifact: Artifact): string | null {
  if (artifact.kind === "board") return "claims-board";
  if (artifact.kind === "timeline") return "schedule";
  if (artifact.kind === "groups") return "groups";
  if (artifact.kind === "invoices") return "invoices";
  const known = ["groups", "suppliers", "claims", "shipments", "ledger", "members"];
  return artifact.source && known.includes(artifact.source) ? artifact.source : null;
}

const GridArtifact: React.FC<{ rows: Row[]; source?: string }> = ({ rows, source }) => {
  const columnDefs = useMemo(() => columnsFor(rows, source), [rows, source]);
  const release = React.useRef<(() => void) | null>(null);
  return (
    <div className="ws-canvas-grid">
      <AgGridReact
        theme={wsGridTheme}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{ suppressHeaderMenuButton: true, suppressHeaderFilterButton: true, sortable: true, filter: true, resizable: true, enableCellChangeFlash: true, enableRowGroup: true, enableValue: true }}
        getRowId={(params) => String((params.data as Row).id ?? JSON.stringify(params.data))}
        onGridReady={(event) => { release.current?.(); release.current = registerGrid("canvas", `Side panel: ${source ?? "data"}`, event.api); }}
        onGridPreDestroyed={() => { release.current?.(); release.current = null; }}
        animateRows
        rowHeight={44}
        headerHeight={40}
        suppressCellFocus
        cellSelection
        enableCharts
        rowGroupPanelShow="onlyWhenGrouping"
        statusBar={{ statusPanels: [{ statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" }, { statusPanel: "agAggregationComponent", align: "right" }] }}
        sideBar={{ toolPanels: ["columns", "filters"], defaultToolPanel: "" }}
        getContextMenuItems={() => ["copy", "copyWithHeaders", "separator", "chartRange", "separator", "csvExport", "excelExport"]}
      />
    </div>
  );
};

const GroupsArtifact: React.FC<{ rows: Row[] }> = ({ rows }) => (
  <div className="ws-canvas-cards">
    {rows.map((row) => {
      const id = String(row.id);
      return (
        <button key={id} type="button" className="ws-canvas-card" onClick={() => { window.location.hash = `group/${encodeURIComponent(id)}`; }}>
          <ProductVisual product={`${row.name} ${row.product}`} category={String(row.category ?? "")} height={110} rounded={10} />
          <b>{String(row.name)}</b>
          <span>{String(row.city ?? "")} · ${Number(row.unitPriceUsd).toFixed(2)} per unit{Number(row.tierDiscountPct) > 0 ? `, ${row.tierDiscountPct}% off list` : ""}</span>
          <ProgressBar label={`${row.name} progress`} isLabelHidden value={Number(row.currentUnits)} max={Number(row.targetUnits) || 1} />
          <small>{Number(row.currentUnits).toLocaleString("en-US")} of {Number(row.targetUnits).toLocaleString("en-US")} units · {String(row.fillPct)}%</small>
        </button>
      );
    })}
  </div>
);

const ResearchArtifact: React.FC<{ artifact: Artifact }> = ({ artifact }) => (
  <div className="ws-canvas-research">
    {artifact.url && <a href={artifact.url} target="_blank" rel="noreferrer" className="ws-canvas-link"><ExternalLink size={14} /> {artifact.url}</a>}
    {artifact.query && <p className="ws-canvas-meta">Looked for: {artifact.query}</p>}
    <ul>
      {(artifact.snippets ?? []).map((snippet, index) => <li key={index}>{snippet}</li>)}
    </ul>
    <p className="ws-canvas-meta">Read by a Kernel cloud browser{artifact.fetchedAt ? ` at ${new Date(artifact.fetchedAt).toLocaleTimeString()}` : ""}. These are excerpts from the page, not a verdict.</p>
  </div>
);

const TimelineArtifact: React.FC<{ revision: number }> = ({ revision }) => {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch("/api/v1/logistics/shipments", { headers: { accept: "application/json" } })
      .then((response) => response.json() as Promise<{ shipments?: unknown[] }>)
      .then((payload) => { if (!cancelled) initBryntumScheduler(payload.shipments ?? [], "canvasSchedulerMount", 520, true); })
      .catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load the timeline."); });
    const refresh = () => {
      fetch("/api/v1/logistics/shipments").then((response) => response.json() as Promise<{ shipments?: unknown[] }>).then((payload) => initBryntumScheduler(payload.shipments ?? [], "canvasSchedulerMount", 520, true)).catch(() => undefined);
    };
    const onChange = (event: Event) => { if ((event as CustomEvent<{ actor?: string }>).detail?.actor !== "person") refresh(); };
    window.addEventListener("ws:schedule-changed", onChange);
    return () => { cancelled = true; window.removeEventListener("ws:schedule-changed", onChange); destroyBryntumScheduler("canvasSchedulerMount"); };
  }, [revision]);
  if (error) return <EmptyState title="Could not show the timeline" description={error} />;
  return (
    <div>
      <p className="ws-canvas-meta">Drag a bar to move a delivery. Drag the end of an inspection window to change it. Mosaic can do the same, and every change can be undone.</p>
      <div id="canvasSchedulerMount" className="ws-canvas-scheduler" />
    </div>
  );
};

const BoardArtifact: React.FC<{ revision: number }> = ({ revision }) => {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = () => fetch("/api/v1/support/claims", { headers: { accept: "application/json" } })
      .then((response) => response.json() as Promise<{ claims?: unknown[] }>)
      .then((payload) => { if (!cancelled) initBryntumTaskBoard(payload.claims ?? [], "canvasBoardMount"); })
      .catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load the claims board."); });
    setError(null);
    void load();
    const onClaims = () => { window.clearTimeout(timer); timer = window.setTimeout(() => { void load(); }, 1200); };
    window.addEventListener("ws:claims-changed", onClaims);
    return () => { cancelled = true; window.clearTimeout(timer); window.removeEventListener("ws:claims-changed", onClaims); destroyBryntumTaskBoard(); };
  }, [revision]);
  if (error) return <EmptyState title="Could not show the board" description={error} />;
  return (
    <div>
      <p className="ws-canvas-meta">Drag a claim forward: Draft to With supplier approves it, then Settled or Rejected records the supplier's decision. The server checks every move.</p>
      <div id="canvasBoardMount" className="ws-canvas-board" />
    </div>
  );
};

export const CanvasDock: React.FC = () => {
  const canvas = useSyncExternalStore(subscribeCanvas, getCanvas, getCanvas);
  const artifact = canvas.artifact;
  const [result, setResult] = useState<SourceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
    if (!artifact || artifact.kind === "research" || artifact.kind === "timeline" || artifact.kind === "board") return;
    let cancelled = false;
    loadSource(artifact).then((value) => { if (!cancelled) setResult(value); }).catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load this data."); });
    return () => { cancelled = true; };
  }, [artifact, canvas.openedAt]);

  const open = Boolean(artifact);
  useEffect(() => {
    document.body.classList.toggle("ws-canvas-open", open);
    return () => document.body.classList.remove("ws-canvas-open");
  }, [open]);

  if (!artifact) return null;

  return (
    <aside className="ws-canvas" role="complementary" aria-label={artifact.title}>
      <header className="ws-canvas-head">
        <div>
          <h2>{artifact.title}</h2>
          <p>{artifact.kind === "research" ? "Supplier and web research" : artifact.kind === "timeline" ? "Deliveries and inspection windows, live" : artifact.kind === "board" ? "Damage claims by stage" : artifact.note || (result ? result.description : "Loading")}</p>
        </div>
        <div className="ws-canvas-head-actions">
          {result && <Badge variant="blue" label={`${result.rows.length} of ${result.total}`} />}
          {snapshotComponent(artifact) && <ExportButtons component={snapshotComponent(artifact) as string} filter={artifact.filter} />}
          <Button size="sm" variant="ghost" label="Close" icon={<X size={16} />} onClick={closeCanvas} />
        </div>
      </header>
      <div className="ws-canvas-body">
        {error && <EmptyState title="Could not show this" description={error} />}
        {!error && artifact.kind !== "research" && artifact.kind !== "timeline" && artifact.kind !== "board" && !result && <Skeleton height={260} />}
        {!error && result && result.rows.length === 0 && <EmptyState title="Nothing matches" description="No rows match that request." />}
        {!error && result && result.rows.length > 0 && (artifact.kind === "groups" ? <GroupsArtifact rows={result.rows} /> : <GridArtifact rows={result.rows} source={artifact.kind === "invoices" ? "paypal_invoices" : artifact.source} />)}
        {artifact.kind === "research" && <ResearchArtifact artifact={artifact} />}
        {artifact.kind === "timeline" && <TimelineArtifact revision={canvas.openedAt} />}
        {artifact.kind === "board" && <BoardArtifact revision={canvas.openedAt} />}
      </div>
    </aside>
  );
};

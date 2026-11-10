import React, { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { wsGridTheme } from "../theme/gridTheme";
import { registerGrid } from "../gridWebMcp";

export interface MemberRow {
  smeId: string;
  name?: string;
  pledgedUnits: number;
  authorizedUsd?: number | string | null;
  status: string;
}

const TINTS = ["#0070BA", "#19B5C9", "#8B6CF0", "#2FA66A", "#F2545B", "#E0A100"];
const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  AUTHORIZED: { bg: "#E3F4EA", fg: "#1F7A4A" },
  CAPTURED: { bg: "#E3F4EA", fg: "#1F7A4A" },
  PLEDGED: { bg: "#EBF4FA", fg: "#0070BA" },
  PENDING: { bg: "#FFF4D6", fg: "#7A5600" },
  RELEASED: { bg: "#F1EEFB", fg: "#6B4FD0" },
  DISPUTED: { bg: "#FDE8E9", fg: "#BA1A1A" }
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

const MemberCell = (params: ICellRendererParams<MemberRow>) => {
  const label = params.data?.name || params.data?.smeId || "";
  const tint = TINTS[Math.abs([...label].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % TINTS.length];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 28, height: 28, borderRadius: "50%", background: tint, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1, fontSize: 11, fontWeight: 600 }}>{initials(label)}</span>
      <span style={{ fontWeight: 500 }}>{label}</span>
    </span>
  );
};

const StatusCell = (params: ICellRendererParams<MemberRow>) => {
  const status = String(params.value ?? "").toUpperCase();
  const tone = STATUS_TONE[status] ?? { bg: "#F4EFEB", fg: "#5C6A79" };
  return <span style={{ background: tone.bg, color: tone.fg, padding: "2px 10px", borderRadius: 999, fontSize: 12, lineHeight: "20px", display: "inline-block", fontWeight: 600 }}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
};

export const MembersGrid: React.FC<{ members: MemberRow[] }> = ({ members }) => {
  const release = React.useRef<(() => void) | null>(null);
  const columns = useMemo<ColDef<MemberRow>[]>(() => [
    { headerName: "Member", valueGetter: (p) => p.data?.name || p.data?.smeId, cellRenderer: MemberCell, flex: 2, minWidth: 180 },
    { field: "pledgedUnits", headerName: "Units", flex: 1, minWidth: 90, cellClass: "ws-tabular-nums", headerClass: "",  },
    { field: "authorizedUsd", headerName: "Authorized", flex: 1, minWidth: 120, cellClass: "ws-tabular-nums", valueFormatter: (p) => (p.value ? `$${Number(p.value).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "") },
    { field: "status", headerName: "Status", flex: 1, minWidth: 120, cellRenderer: StatusCell, enableRowGroup: true }
  ], []);
  return (
    <div style={{ height: Math.min(56 + 44 * Math.min(members.length, 10), 520), width: "100%" }}>
      <AgGridReact
        theme={wsGridTheme}
        rowData={members}
        columnDefs={columns}
        defaultColDef={{ sortable: true, filter: true, resizable: true, enableCellChangeFlash: true }}
        getRowId={(p) => p.data.smeId}
        onGridReady={(event) => { release.current?.(); release.current = registerGrid("members", "Group members", event.api); }}
        onGridPreDestroyed={() => { release.current?.(); release.current = null; }}
        rowHeight={44}
        headerHeight={40}
        suppressCellFocus
        statusBar={{ statusPanels: [{ statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" }, { statusPanel: "agAggregationComponent", align: "right" }] }}
      />
    </div>
  );
};

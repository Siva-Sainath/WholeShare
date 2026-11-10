import React from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import type { ICellRendererParams } from "ag-grid-community";
import type { LedgerClan, ClaimRecord } from "../api";

type BadgeVariant = "neutral" | "info" | "success" | "warning" | "error";

const CLAIM_BADGES: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: "Draft", variant: "neutral" },
  SUBMITTED: { label: "Submitted", variant: "info" },
  UNDER_REVIEW: { label: "Under review", variant: "warning" },
  RESOLVED: { label: "Resolved", variant: "success" },
  SETTLED: { label: "Settled", variant: "success" },
  REJECTED: { label: "Rejected", variant: "error" }
};

export const ClaimStatusCell = (params: ICellRendererParams<ClaimRecord>) => {
  const key = String(params.value || "").toUpperCase();
  const badge = CLAIM_BADGES[key] ?? { label: key.replaceAll("_", " ").toLowerCase() || "Unknown", variant: "neutral" as BadgeVariant };
  return (
    <span className="ws-cell-center">
      <Badge variant={badge.variant} label={badge.label} />
    </span>
  );
};

export const GroupStatusCell = (params: ICellRendererParams<LedgerClan>) => {
  if (params.data?.coalitionId === "totals") return null;
  const status = String(params.value || "").toUpperCase();
  if (status === "LOCKED") {
    return (
      <span className="ws-cell-center">
        <Badge variant="info" label="Locked" />
      </span>
    );
  }
  if (status === "SETTLED" || status === "CAPTURED") {
    return (
      <span className="ws-cell-center">
        <Badge variant="success" label={status === "SETTLED" ? "Settled" : "Captured"} />
      </span>
    );
  }
  return <span className="ws-cell-center ws-cell-muted">{status ? status.charAt(0) + status.slice(1).toLowerCase() : "No data"}</span>;
};

export const GroupNameCell = (params: ICellRendererParams<LedgerClan>) => {
  const row = params.data;
  if (!row) return null;
  if (row.coalitionId === "totals") return <span className="ws-cell-title">Totals</span>;
  return (
    <span className="ws-cell-stack">
      <span className="ws-cell-title">{row.skuName}</span>
      <span className="ws-cell-sub">{row.sku}</span>
    </span>
  );
};

export const PledgeProgressCell = (params: ICellRendererParams<LedgerClan>) => {
  const row = params.data;
  if (row?.coalitionId === "totals") return <span className="ws-cell-center ws-cell-num">{(row.currentUnits || 0).toLocaleString("en-US")} units</span>;
  if (!row || !row.targetUnits) return <span className="ws-cell-muted">No data</span>;
  const pct = Math.round((row.currentUnits / row.targetUnits) * 100);
  return (
    <span className="ws-cell-stack ws-cell-progress">
      <ProgressBar
        label={`${row.skuName} pledged units`}
        isLabelHidden
        value={Math.min(row.currentUnits, row.targetUnits)}
        max={row.targetUnits}
        variant={pct >= 100 ? "success" : "accent"}
      />
      <span className="ws-cell-sub ws-cell-num">
        {row.currentUnits > row.targetUnits ? `${row.currentUnits.toLocaleString("en-US")} units, target ${row.targetUnits.toLocaleString("en-US")} met` : `${row.currentUnits.toLocaleString("en-US")} of ${row.targetUnits.toLocaleString("en-US")} units`}
      </span>
    </span>
  );
};

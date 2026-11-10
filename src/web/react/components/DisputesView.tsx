import { wsGridTheme } from "../theme/gridTheme";
import { Button } from "@astryxdesign/core/Button";
import { StatStrip } from "./StatStrip";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { ExportButtons } from "./ExportButtons";
import { registerGrid } from "../gridWebMcp";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Banner } from "@astryxdesign/core/Banner";
import { Badge } from "@astryxdesign/core/Badge";
import { approveClaim, respondToClaim } from "../api";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { ClaimStatusCell } from "./gridCells";
import { uploadEvidence } from "../api";
import React, { FormEvent, useEffect, useRef, useState } from "react";
import type { ColDef, ValueFormatterParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { installBryntumTools } from "../bryntumWebMcp";
import { fetchShipments, submitDamageClaim, fetchClaims, ShipmentRecord, ClaimRecord } from "../api";
import {
  initBryntumScheduler,
  destroyBryntumScheduler,
  initBryntumGrid,
  destroyBryntumGrid,
  initBryntumCalendar,
  destroyBryntumCalendar,
  initBryntumTaskBoard,
  destroyBryntumTaskBoard,
  zoomBryntumScheduler
} from "../../bryntum-timeline";
import { STITCH_COLORS, STITCH_TYPOGRAPHY, STITCH_RADIUS, STITCH_SHADOWS } from "../themes/stitchTokens";

type TimelineState = "loading" | "ready" | "unavailable" | "error";


function formatUsdNumber(val: unknown): string {
  if (typeof val !== "number" || !Number.isFinite(val)) return "$0.00";
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(val: unknown): string {
  if (typeof val !== "string" || !val) return "Not recorded";
  try {
    const d = new Date(val);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return val;
  }
}


const cardStyle: React.CSSProperties = {
  background: STITCH_COLORS.card,
  border: `1px solid ${STITCH_COLORS.border}`,
  borderRadius: STITCH_RADIUS.xl,
  boxShadow: STITCH_SHADOWS.card,
  padding: "20px"
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "15px",
  fontWeight: 600,
  color: STITCH_COLORS.ink
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: STITCH_RADIUS.lg,
  background: STITCH_COLORS.card,
  border: `1px solid ${STITCH_COLORS.border}`,
  color: STITCH_COLORS.ink,
  fontSize: "13px",
  fontFamily: STITCH_TYPOGRAPHY.sans
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 600,
  color: STITCH_COLORS.muted,
  marginBottom: "4px"
};

const subtleButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 12px",
  borderRadius: STITCH_RADIUS.lg,
  background: STITCH_COLORS.card,
  border: `1px solid ${STITCH_COLORS.border}`,
  color: STITCH_COLORS.ink,
  fontSize: "12px",
  fontWeight: 500,
  cursor: "pointer"
};

const claimColumns: ColDef<ClaimRecord>[] = [
  { field: "claimId", headerName: "Claim ID", flex: 1.2, minWidth: 120, cellStyle: { fontWeight: 500 } },
  { field: "product", headerName: "Product", flex: 2, minWidth: 180, filter: true, enableRowGroup: true },
  { field: "city", headerName: "City", flex: 0.8, minWidth: 90, enableRowGroup: true },
  { field: "memberId", headerName: "Member ID", flex: 1, minWidth: 95 },
  { field: "damagedUnits", headerName: "Damaged units", flex: 0.8, minWidth: 80, cellClass: "ws-tabular-nums" },
  {
    field: "unitPrice",
    headerName: "Unit price (USD)",
    flex: 0.9,
    minWidth: 90,
    cellClass: "ws-tabular-nums",
    valueFormatter: (params: ValueFormatterParams) => formatUsdNumber(params.value)
  },
  {
    field: "orderValue",
    headerName: "Claim amount (USD)",
    flex: 1,
    minWidth: 105,
    cellClass: "ws-tabular-nums",
    valueFormatter: (params: ValueFormatterParams) => formatUsdNumber(params.value)
  },
  {
    field: "status",
    headerName: "Status",
    flex: 0.9,
    minWidth: 90,
    cellRenderer: ClaimStatusCell
  },
  {
    field: "createdAt",
    headerName: "Filed",
    flex: 1.1,
    minWidth: 110,
    sort: "desc",
    sortable: true,
    valueFormatter: (params: ValueFormatterParams) => formatDate(params.value)
  }
];

export const DisputesView: React.FC = () => {
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("timeline");
  useEffect(() => installBryntumTools(setView), []);
  const fillHeight = () => Math.max(520, (typeof window === "undefined" ? 900 : window.innerHeight) - 330);
  const [proofUploading, setProofUploading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [openClaim, setOpenClaim] = useState<ClaimRecord | null>(null);
  const [claimBusy, setClaimBusy] = useState<string | null>(null);
  const [claimNote, setClaimNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const handlePhoto = async (file: File) => {
    setProofUploading(true);
    setProofNote(null);
    try {
      const record = await uploadEvidence(file, clanId || undefined);
      setPhotoProofUri(window.location.origin + record.uri);
      const detected = record.detectedTrackingNumbers[0];
      if (detected && !trackingNumber) setTrackingNumber(detected);
      setProofNote(`Stored ${record.fileName} (${Math.round(record.bytes / 1024)} KB)${detected ? `. Read tracking number ${detected} from the photo.` : "."}`);
    } catch (cause) {
      setProofNote(cause instanceof Error ? cause.message : "Upload failed.");
      setPhotoFile(null);
    } finally {
      setProofUploading(false);
    }
  };
  const [proofNote, setProofNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ claimId: string; status: string } | null>(null);
  const [timelineState, setTimelineState] = useState<TimelineState>("loading");

  const [clanId, setClanId] = useState("");
  const [damagedUnits, setDamagedUnits] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [unitPrice, setUnitPrice] = useState<number | "">("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [photoProofUri, setPhotoProofUri] = useState("");
  const [inspectionNotes, setInspectionNotes] = useState("");
  const gridRelease = useRef<(() => void) | null>(null);
  const [claimText, setClaimText] = useState("");
  const [claimFilling, setClaimFilling] = useState(false);
  const [claimFillNote, setClaimFillNote] = useState<string | null>(null);

  const fillClaimWithMosaic = async () => {
    setClaimFilling(true);
    setClaimFillNote(null);
    try {
      const response = await fetch("/api/v1/mosaic/fill-form", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ form: "damage-claim", text: claimText, current: { damagedUnits: damagedUnits === "" ? undefined : damagedUnits } }) });
      const payload = (await response.json()) as { fields?: { damagedUnits?: number; reason?: string }; message?: string; error?: string };
      if (!response.ok || !payload.fields) throw new Error(payload.error ?? "Mosaic could not read that.");
      const f = payload.fields;
      if (f.damagedUnits) setDamagedUnits(f.damagedUnits);
      if (f.reason) {
        const text = f.reason.toLowerCase();
        setReason(/water|wet|temperature|spoil|melt/.test(text) ? "WATER_CONTAMINATION" : /short|missing|count/.test(text) ? "SHORT_DELIVERY" : /wrong|spec|grade|incorrect/.test(text) ? "INCORRECT_SPEC" : "DAMAGED_TRANSIT");
        setInspectionNotes(f.reason);
      }
      setClaimFillNote(`${payload.message ?? "Filled the form."} Pick the shipment and add a photo.`);
    } catch (cause) {
      setClaimFillNote(cause instanceof Error ? cause.message : "Mosaic could not read that.");
    } finally {
      setClaimFilling(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [claimsData, shipmentsResp] = await Promise.all([
        fetchClaims().catch(() => [] as ClaimRecord[]),
        fetchShipments().catch(() => ({ shipments: [] as ShipmentRecord[] }))
      ]);
      setClaims(claimsData);
      setShipments(shipmentsResp.shipments || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load dispute records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    // A person's own drag already shows the change. Rebuilding mid-drag breaks Bryntum, so only others refresh.
    const refresh = (event: Event) => {
      const actor = (event as CustomEvent<{ actor?: string }>).detail?.actor;
      if (actor === "person") return;
      void loadData();
    };
    window.addEventListener("ws:schedule-changed", refresh);
    return () => window.removeEventListener("ws:schedule-changed", refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    const height = fillHeight();
    try {
      if (view === "timeline") initBryntumScheduler(shipments, "bryntumSchedulerMount", height);
      if (view === "shipments") initBryntumGrid(shipments, "bryntumGridMount", height);
      if (view === "calendar") initBryntumCalendar(shipments, "bryntumCalendarMount", height);
      setTimelineState("ready");
    } catch (cause) {
      console.error("Bryntum shipment views failed to mount:", cause);
      setTimelineState("error");
    }

    return () => {
      destroyBryntumScheduler("bryntumSchedulerMount");
      destroyBryntumGrid();
      destroyBryntumCalendar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, shipments, view]);

  useEffect(() => {
    if (loading || view !== "board") return;
    try {
      initBryntumTaskBoard(claims, "bryntumTaskBoardMount", fillHeight());
    } catch (cause) {
      console.error("Bryntum claims board failed to mount:", cause);
    }
    return () => {
      destroyBryntumTaskBoard();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, claims, view]);

  const handleSubmitClaim = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setReceipt(null);

    try {
      const res = await submitDamageClaim({
        clanId,
        damagedUnits: Number(damagedUnits),
        reason: `${reason} - ${inspectionNotes} (Tracking: ${trackingNumber})`,
        unitPrice: Number(unitPrice),
        contactEmail,
        photoProofUri
      });
      setReceipt({ claimId: res.claimId, status: res.status });
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit damage claim.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    window.__wholeshareScreen = {
      screen: "disputes",
      openClaims: claims.length,
      deliveredShipments: shipments
        .filter((shipment) => shipment.status === "DELIVERED")
        .slice(0, 8)
        .map((shipment) => ({ clanId: shipment.clanId, product: shipment.product ?? null, tracking: shipment.trackingNumber, deliveredAt: shipment.buyerDeliveredAt ?? null }))
    };
    return () => {
      window.__wholeshareScreen = undefined;
    };
  }, [claims, shipments]);

  const disputeStats = [
    {
      label: "Open claims",
      value: claims.length === 0 ? "No data" : String(claims.filter((claim) => !["RESOLVED", "REJECTED", "SETTLED"].includes(claim.status)).length),
      note: claims.length === 0 ? undefined : `${claims.length} claims on record`
    },
    {
      label: "Claimed value",
      value: claims.length === 0 ? "No data" : claims.reduce((sum, claim) => sum + (claim.claimedAmount || 0), 0).toLocaleString("en-US", { style: "currency", currency: "USD" }),
      note: "Sum of claimed amounts"
    },
    {
      label: "In transit",
      value: shipments.length === 0 ? "No data" : String(shipments.filter((shipment) => shipment.status === "IN_TRANSIT").length),
      note: shipments.length === 0 ? undefined : `${shipments.filter((shipment) => shipment.status === "DELAYED").length} delayed`
    },
    {
      label: "Delivered",
      value: shipments.length === 0 ? "No data" : String(shipments.filter((shipment) => shipment.status === "DELIVERED").length),
      note: shipments.length === 0 ? undefined : `of ${shipments.length} shipments`
    }
  ];

  const totalClaimValue = Number(damagedUnits || 0) * Number(unitPrice || 0);

  return (
    <div className="ws-disputes-view" data-ws-view="disputes" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "24px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 600, margin: "0 0 6px", color: STITCH_COLORS.ink, letterSpacing: "-0.02em" }}>
            Disputes
          </h1>
          <p style={{ fontSize: "14px", color: STITCH_COLORS.muted, margin: 0 }}>
            Damage claims and freight delivery evidence for your buying groups.
          </p>
          <p style={{ fontSize: "13px", color: STITCH_COLORS.muted, margin: "8px 0 0" }}>
            Disputes must be raised within 48 hours of delivery.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Button size="sm" variant="secondary" label="Refresh" onClick={loadData} isDisabled={loading} />
          <Button size="sm" variant="primary" label="PayPal operations" onClick={() => { window.location.hash = "paypal"; }} />
        </div>
      </header>

      <StatStrip label="Dispute summary" items={disputeStats} />

      <div className="ws-jumpbar">
        <SegmentedControl label="Dispute tools" value={view} onChange={setView}>
          <SegmentedControlItem value="timeline" label="Timeline" />
          <SegmentedControlItem value="calendar" label="Calendar" />
          <SegmentedControlItem value="board" label="Claims board" />
          <SegmentedControlItem value="shipments" label="Shipments" />
          <SegmentedControlItem value="claims" label="Claims" />
          <SegmentedControlItem value="file" label="File a claim" />
        </SegmentedControl>
      </div>

      {view === "claims" && (
      <section style={{ ...cardStyle, display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 id="dispute-claims" style={{ ...sectionTitleStyle, scrollMarginTop: "96px" }}>Damage claims ({claims.length})</h2><div><ExportButtons component="claims" /></div></div>
        <div style={{ height: "440px", width: "100%" }}>
          <AgGridReact<ClaimRecord>
            theme={wsGridTheme}
            rowData={claims}
            columnDefs={claimColumns}
            rowClass="ws-clickable-row"
            onRowClicked={(event) => { if (event.data) { setOpenClaim(event.data); setClaimNote(null); } }}
            defaultColDef={{
              flex: 1,
              wrapHeaderText: true,
              autoHeaderHeight: true,
              sortable: true,
              filter: true,
              resizable: true,
              enableCellChangeFlash: true,
              enableRowGroup: true
            }}
            getRowId={(params) => params.data.claimId}
            onGridReady={(event) => { gridRelease.current?.(); gridRelease.current = registerGrid("claims", "Damage claims", event.api); }}
            onGridPreDestroyed={() => { gridRelease.current?.(); gridRelease.current = null; }}
            autoSizeStrategy={{ type: "fitGridWidth" }}
            animateRows={true}
            cellSelection
            rowGroupPanelShow="onlyWhenGrouping"
            statusBar={{ statusPanels: [{ statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" }, { statusPanel: "agAggregationComponent", align: "right" }] }}
            sideBar={{ toolPanels: ["columns", "filters"], defaultToolPanel: "" }}
            getContextMenuItems={() => ["copy", "copyWithHeaders", "separator", "csvExport", "excelExport"]}
          />
        </div>
      </section>
      )}

      {view === "file" && (
      <section style={{ ...cardStyle, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "24px" }}>
        <div>
          <h2 id="dispute-file" style={{ ...sectionTitleStyle, marginBottom: "8px", scrollMarginTop: "96px" }}>File a damage claim</h2>
          <p style={{ fontSize: "12px", color: STITCH_COLORS.muted, margin: "0 0 16px", lineHeight: 1.5 }}>
            The fastest way to file is to tell Mosaic what arrived damaged and attach a photo. This form is here if you prefer to file by hand. Claims require a photo and carrier tracking.
          </p>

          <form onSubmit={handleSubmitClaim} style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 12, background: "#EBF4FA", border: "1px solid #CFE3F1" }}>
              <TextArea label="Tell Mosaic what happened" placeholder="Eleven of the 40 boxes arrived crushed at the corners" value={claimText} onChange={(value) => setClaimText(value)} rows={2} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Button variant="secondary" size="sm" label={claimFilling ? "Reading" : "Fill the form with Mosaic"} onClick={() => void fillClaimWithMosaic()} isDisabled={claimFilling || claimText.trim().length < 6} />
                {claimFillNote && <span style={{ fontSize: 12, color: STITCH_COLORS.muted }}>{claimFillNote}</span>}
              </div>
            </div>

            <Selector
              label="Delivered shipment"
              isRequired
              placeholder="Choose the shipment that arrived damaged"
              value={clanId}
              onChange={(value) => {
                setClanId(value);
                const picked = shipments.find((shipment) => shipment.clanId === value);
                if (picked) setTrackingNumber(picked.trackingNumber);
              }}
              options={shipments.filter((shipment) => shipment.status === "DELIVERED").map((shipment) => ({ value: shipment.clanId, label: shipment.product ?? shipment.clanId, description: `Tracking ${shipment.trackingNumber}` }))}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <NumberInput label="Damaged units" isRequired min={1} step={1} value={damagedUnits === "" ? null : damagedUnits} onChange={(value) => setDamagedUnits(value ?? "")} />
              <NumberInput label="Unit price (USD)" isRequired min={0.01} step={0.01} value={unitPrice === "" ? null : unitPrice} onChange={(value) => setUnitPrice(value ?? "")} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <Selector
                label="Damage reason"
                isRequired
                placeholder="Select a reason"
                value={reason}
                onChange={(value) => setReason(value)}
                options={[
                  { value: "DAMAGED_TRANSIT", label: "In-transit crushed or broken" },
                  { value: "WATER_CONTAMINATION", label: "Water or temperature spoiled" },
                  { value: "SHORT_DELIVERY", label: "Short delivery count" },
                  { value: "INCORRECT_SPEC", label: "Wrong specification or grade" }
                ]}
              />
              <TextInput label="Contact email" isRequired type="email" value={contactEmail} onChange={(value) => setContactEmail(value)} />
            </div>

            <div>
              <label style={labelStyle}>Photo of the damage *</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 260, flex: "1 1 260px" }}>
                  <FileInput
                    label="Photo of the damage"
                    isLabelHidden
                    value={photoFile}
                    isLoading={proofUploading}
                    accept="image/png,image/jpeg,image/webp"
                    maxSize={6 * 1024 * 1024}
                    description="Drop a photo here or choose one. PNG, JPEG or WebP up to 6 MB. Tracking numbers on labels are read automatically."
                    onChange={(files) => { const file = Array.isArray(files) ? files[0] ?? null : files; setPhotoFile(file); if (file) void handlePhoto(file); else { setPhotoProofUri(""); setProofNote(null); } }}
                  />
                </div>
                {photoProofUri && <img src={photoProofUri} alt="Damage evidence" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: `1px solid ${STITCH_COLORS.border}` }} />}
                {proofNote && <span style={{ fontSize: 12, color: STITCH_COLORS.muted }}>{proofNote}</span>}
              </div>
            </div>

            <TextArea label="Inspection notes" value={inspectionNotes} onChange={(value) => setInspectionNotes(value)} rows={2} />

            <div>
              <span className="lp-gold"><Button variant="primary" label={busy ? "Submitting claim" : "Submit damage claim"} onClick={() => { void handleSubmitClaim({ preventDefault: () => undefined } as FormEvent); }} isDisabled={busy || !clanId || !photoProofUri || !damagedUnits || !unitPrice || !reason || !contactEmail} /></span>
            </div>
          </form>

          {error && (
            <div style={{ marginTop: "12px", padding: "10px 14px", background: STITCH_COLORS.status.errorContainer, border: `1px solid ${STITCH_COLORS.status.error}`, borderRadius: STITCH_RADIUS.lg, color: STITCH_COLORS.status.error, fontSize: "12px" }}>
              {error}
            </div>
          )}

          {receipt && (
            <div style={{ marginTop: "12px", padding: "10px 14px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: STITCH_RADIUS.lg, color: "#047857", fontSize: "12px" }}>
              Claim registered: <strong>{receipt.claimId}</strong>. Status: {receipt.status}.
            </div>
          )}
        </div>

        <div style={{ background: STITCH_COLORS.surface, padding: "18px", borderRadius: STITCH_RADIUS.xl, border: `1px solid ${STITCH_COLORS.border}`, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600, color: STITCH_COLORS.ink }}>
              Pro-rata refund preview
            </h3>
            <div style={{ display: "grid", gap: "10px", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${STITCH_COLORS.border}`, paddingBottom: "6px" }}>
                <span style={{ color: STITCH_COLORS.muted }}>Damaged units:</span>
                <span className="ws-tabular-nums" style={{ fontWeight: 600, color: STITCH_COLORS.ink }}>{Number(damagedUnits || 0)} units</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${STITCH_COLORS.border}`, paddingBottom: "6px" }}>
                <span style={{ color: STITCH_COLORS.muted }}>Agreed unit price:</span>
                <span className="ws-tabular-nums" style={{ fontWeight: 600, color: STITCH_COLORS.ink }}>{formatUsdNumber(unitPrice)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${STITCH_COLORS.border}`, paddingBottom: "6px" }}>
                <span style={{ color: STITCH_COLORS.muted }}>Claim refund value:</span>
                <span className="ws-tabular-nums" style={{ fontWeight: 600, color: STITCH_COLORS.goldDeep }}>{formatUsdNumber(totalClaimValue)}</span>
              </div>
            </div>
            <p style={{ marginTop: "16px", padding: "12px", borderRadius: STITCH_RADIUS.lg, background: STITCH_COLORS.blueLight, fontSize: "12px", color: STITCH_COLORS.muted, lineHeight: 1.5 }}>
              The governance procedure calculates pro-rata refunds automatically upon inspector verification. Funds for intact units proceed to supplier settlement. Disputed amounts release back to buyer credit.
            </p>
          </div>
        </div>
      </section>
      )}

      {view === "timeline" && (
      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h2 id="dispute-timeline" style={{ ...sectionTitleStyle, scrollMarginTop: "96px" }}>Freight timeline</h2>
          <div style={{ display: "flex", gap: "8px" }}>
            <button style={subtleButtonStyle} onClick={() => zoomBryntumScheduler("in")}>Zoom in</button>
            <button style={subtleButtonStyle} onClick={() => zoomBryntumScheduler("out")}>Zoom out</button>
            <button style={subtleButtonStyle} onClick={() => zoomBryntumScheduler("fit")}>Zoom to fit</button>
          </div>
        </div>

        {timelineState === "ready" && shipments.length === 0 && (
          <div style={{ padding: "48px 24px", textAlign: "center", border: `1px dashed ${STITCH_COLORS.border}`, borderRadius: STITCH_RADIUS.lg, marginBottom: "14px" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: "14px", color: STITCH_COLORS.ink }}>No shipments recorded</h4>
            <p style={{ margin: 0, fontSize: "12px", color: STITCH_COLORS.muted, maxWidth: "420px", marginLeft: "auto", marginRight: "auto" }}>
              Freight delivery timelines appear here once suppliers dispatch goods against authorized buying group orders.
            </p>
          </div>
        )}

        {timelineState === "unavailable" && (
          <div style={{ padding: "32px", textAlign: "center", border: `1px dashed ${STITCH_COLORS.border}`, borderRadius: STITCH_RADIUS.lg, color: STITCH_COLORS.muted, fontSize: "13px" }}>
            Scheduler loading...
          </div>
        )}

        <div className="ws-legend" aria-label="Timeline legend">
          <span><i style={{ background: "#0070BA" }} />In transit</span>
          <span><i style={{ background: "#BA1A1A" }} />Delayed</span>
          <span><i style={{ background: "#D9E0E7" }} />Delivered</span>
          <span><i style={{ background: "#FFC439" }} />48 hour inspection window</span>
        </div>
        <div id="bryntumSchedulerMount" style={{ height: `${fillHeight()}px`, width: "100%", display: timelineState === "unavailable" ? "none" : "block" }} />
      </section>
      )}

      {view === "shipments" && (
      <section style={cardStyle}>
        <h2 id="dispute-shipments" style={{ ...sectionTitleStyle, marginBottom: "12px", scrollMarginTop: "96px" }}>Shipments</h2>
        <div id="bryntumGridMount" style={{ height: `${fillHeight()}px`, width: "100%" }} />
      </section>
      )}

      {view === "calendar" && (
      <section style={cardStyle}>
        <h2 id="dispute-deadlines" style={{ ...sectionTitleStyle, marginBottom: "12px", scrollMarginTop: "96px" }}>Deadlines</h2>
        <p style={{ fontSize: "12px", color: STITCH_COLORS.muted, margin: "0 0 12px" }}>
          Delivery dates and inspection window deadlines from real shipments.
        </p>
        <div id="bryntumCalendarMount" style={{ height: `${fillHeight()}px`, width: "100%" }} />
      </section>
      )}

      {view === "board" && (
      <section style={cardStyle}>
        <h2 id="dispute-board" style={{ ...sectionTitleStyle, marginBottom: "12px", scrollMarginTop: "96px" }}>Dispute workflow</h2>
        <p style={{ fontSize: "12px", color: STITCH_COLORS.muted, margin: "0 0 12px" }}>
          Drag a card forward to act on it: Draft to With supplier approves the claim, and With supplier to Settled or Rejected records the supplier's decision. The server checks every move.
        </p>
        <div id="bryntumTaskBoardMount" style={{ height: `${fillHeight()}px`, width: "100%" }} />
      </section>
      )}

      <Dialog isOpen={openClaim !== null} onOpenChange={(open) => { if (!open) setOpenClaim(null); }} width={560} padding={4}>
        {openClaim && (
          <>
            <DialogHeader title={`Claim ${openClaim.claimId}`} subtitle={`${openClaim.damagedUnits} damaged units, ${formatUsdNumber(openClaim.claimedAmount)} claimed`} />
            <div className="ws-claim-detail">
              <div className="ws-claim-row"><span>Status</span><Badge variant={openClaim.status === "SETTLED" ? "green" : openClaim.status === "REJECTED" ? "red" : "blue"} label={openClaim.status.replace(/_/g, " ").toLowerCase()} /></div>
              <div className="ws-claim-row"><span>Group</span><b>{openClaim.clanId}</b></div>
              <div className="ws-claim-row"><span>Filed</span><b>{openClaim.createdAt ? new Date(openClaim.createdAt).toLocaleString() : "Not recorded"}</b></div>
              {openClaim.evidence?.description && <p className="ws-claim-desc">{openClaim.evidence.description}</p>}
              {(openClaim.evidence?.photoUrls ?? []).filter((url) => /^(\/|https?:)/.test(url)).length > 0 && (
                <div className="ws-claim-photos">
                  {(openClaim.evidence?.photoUrls ?? []).filter((url) => /^(\/|https?:)/.test(url)).map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Damage evidence" /></a>
                  ))}
                </div>
              )}
              {claimNote && <Banner status={claimNote.kind} title={claimNote.text} collapsible={false} />}
              <div className="ws-claim-actions">
                {openClaim.status === "DRAFT" && (
                  <span className="lp-gold"><Button variant="primary" label={claimBusy ? "Approving" : "Approve and send to supplier"} isDisabled={Boolean(claimBusy)} onClick={() => {
                    setClaimBusy("approve");
                    approveClaim(openClaim.claimId, openClaim.memberId)
                      .then(() => { setClaimNote({ kind: "success", text: "Approved and sent to the supplier." }); setOpenClaim({ ...openClaim, status: "BUYER_APPROVED" }); void loadData(); })
                      .catch((cause: unknown) => setClaimNote({ kind: "error", text: cause instanceof Error ? cause.message : "Could not approve this claim." }))
                      .finally(() => setClaimBusy(null));
                  }} /></span>
                )}
                {openClaim.status === "BUYER_APPROVED" && (
                  <>
                    <p className="ws-claim-desc">Supplier response. These buttons act as the supplier's console until suppliers connect.</p>
                    {(["ACCEPT", "REJECT"] as const).map((action) => (
                      <Button key={action} variant="secondary" label={action === "ACCEPT" ? "Supplier accepts" : "Supplier rejects"} isDisabled={Boolean(claimBusy)} onClick={() => {
                        setClaimBusy(action);
                        respondToClaim({ claimId: openClaim.claimId, action, notes: `${action === "ACCEPT" ? "Accepted" : "Rejected"} in the supplier demo view.` })
                          .then(() => { setClaimNote({ kind: "success", text: action === "ACCEPT" ? "The supplier accepted the claim." : "The supplier rejected the claim." }); void loadData(); setOpenClaim({ ...openClaim, status: action === "ACCEPT" ? "SUPPLIER_ACCEPTED" : "REJECTED" }); })
                          .catch((cause: unknown) => setClaimNote({ kind: "error", text: cause instanceof Error ? cause.message : "The supplier response failed." }))
                          .finally(() => setClaimBusy(null));
                      }} />
                    ))}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
};

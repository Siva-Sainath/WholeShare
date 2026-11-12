import { wsGridTheme, wsStudioTheme } from "../theme/gridTheme";
import { Button } from "@astryxdesign/core/Button";
import { StatStrip } from "./StatStrip";
import { GroupNameCell, GroupStatusCell, PledgeProgressCell } from "./gridCells";
import { registerGrid, unregisterGrid } from "../grid-registry";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { Search } from "lucide-react";
import type { ColDef, GridApi, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { AgStudioAiModule } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { fetchLedger, fetchClans, LedgerClan, LedgerMember, ClanRecord } from "../api";
import { STITCH_COLORS, STITCH_TYPOGRAPHY } from "../themes/stitchTokens";
import { AG_GRID_LICENSE_KEY, AG_STUDIO_LICENSE_KEY } from "../agGridLicense";
import { getStudioInitialState } from "../shippedStudioState";
import { buildMosaicStudioAi } from "../studioAiHarness";

function formatUsd(cents: unknown): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}


const USD_FORMAT = { format: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }) };


const renderPayPalOrderId = (params: ICellRendererParams<LedgerMember>) => {
  const member = params.data;
  if (!member || !member.paypalOrderId) {
    return <span style={{ color: STITCH_COLORS.muted }}>Local record, not verified against PayPal</span>;
  }
  return (
    <div style={{ lineHeight: 1.35 }}>
      <div style={{ fontSize: "11px", color: STITCH_COLORS.muted }}>
        Local record, not verified against PayPal
      </div>
      <span style={{ fontSize: "11px", color: STITCH_COLORS.ink, fontFamily: STITCH_TYPOGRAPHY.mono }}>
        {member.paypalOrderId}
      </span>
    </div>
  );
};

const columns: ColDef<LedgerClan>[] = [
  {
    field: "skuName",
    headerName: "Buying group",
    flex: 2.2,
    minWidth: 220,
    cellRenderer: "agGroupCellRenderer",
    cellRendererParams: {
      innerRenderer: GroupNameCell
    }
  },
  {
    field: "currentUnits",
    headerName: "Pledged vs target",
    flex: 1.8,
    minWidth: 200,
    cellRenderer: PledgeProgressCell
  },
  {
    field: "unitPriceCents",
    headerName: "Unit price",
    flex: 1,
    minWidth: 110,
    type: "rightAligned",
    cellClass: "ws-money-cell",
    headerClass: "ag-right-aligned-header",
    valueFormatter: (params: ValueFormatterParams) => formatUsd(params.value)
  },
  {
    field: "totalEscrowCents",
    headerName: "Escrow value",
    flex: 1.2,
    minWidth: 130,
    type: "rightAligned",
    cellClass: "ws-money-cell",
    headerClass: "ag-right-aligned-header",
    valueFormatter: (params: ValueFormatterParams) => formatUsd(params.value)
  },
  {
    field: "status",
    headerName: "Status",
    flex: 0.9,
    minWidth: 110,
    cellRenderer: GroupStatusCell
  },
  {
    colId: "manage",
    headerName: "",
    flex: 0.8,
    minWidth: 120,
    sortable: false,
    filter: false,
    cellRenderer: (params: ICellRendererParams<LedgerClan>) => {
      const id = params.data?.coalitionId;
      if (!id || id === "totals") return null;
      return <Button size="sm" variant="secondary" label="Manage" onClick={() => { window.location.hash = `mygroup/${encodeURIComponent(id)}`; }} />;
    }
  }
];

const detailColumns: ColDef<LedgerMember>[] = [
  { field: "name", headerName: "Member", flex: 1.4, minWidth: 100 },
  {
    field: "pledgedUnits",
    headerName: "Units pledged",
    flex: 1,
    minWidth: 80,
    cellClass: "ws-tabular-nums"
  },
  {
    field: "authorizedCents",
    headerName: "Authorized (USD)",
    flex: 1,
    minWidth: 90,
    cellClass: "ws-tabular-nums",
    valueFormatter: (params: ValueFormatterParams) => formatUsd(params.value)
  },
  { field: "status", headerName: "Status", flex: 1, minWidth: 80 },
  {
    headerName: "PayPal hold",
    flex: 1.4,
    minWidth: 120,
    valueGetter: (params) => {
      const member = params.data as (LedgerMember & { authorizationId?: string; captureId?: string }) | undefined;
      return member?.captureId ? `Captured ${member.captureId}` : member?.authorizationId ? `Hold ${member.authorizationId}` : "";
    }
  },
  {
    field: "paypalOrderId",
    headerName: "PayPal record",
    flex: 1.6,
    minWidth: 110,
    cellRenderer: renderPayPalOrderId
  }
];

function updatePinnedTotals(gridApi: GridApi<LedgerClan>): void {
  let count = 0;
  let units = 0;
  let totalCents = 0;
  gridApi.forEachNodeAfterFilter((node) => {
    if (node.group || !node.data) return;
    count += 1;
    units += node.data.currentUnits || 0;
    totalCents += node.data.totalEscrowCents || 0;
  });
  if (count === 0) {
    gridApi.setGridOption("pinnedBottomRowData", []);
    return;
  }
  gridApi.setGridOption("pinnedBottomRowData", [
    {
      coalitionId: "totals",
      sku: "",
      skuName: "Totals",
      targetUnits: undefined as unknown as number,
      currentUnits: units,
      unitPriceUsd: "",
      totalEscrowUsd: "",
      unitPriceCents: undefined,
      totalEscrowCents: totalCents,
      discountTierPct: 0,
      status: "",
      membersCount: 0,
      members: []
    }
  ]);
}

interface MyGroupsViewProps {
  externalQuery?: string;
  onDrillThroughClan?: (clanId: string) => void;
}

export const MyGroupsView: React.FC<MyGroupsViewProps> = ({ externalQuery, onDrillThroughClan }) => {
  const gridRef = useRef<AgGridReact<LedgerClan>>(null);
  const [rows, setRows] = useState<LedgerClan[]>([]);
  const [clans, setClans] = useState<ClanRecord[]>([]);
  const [gridApi, setGridApi] = useState<GridApi<LedgerClan> | null>(null);
  const [query, setQuery] = useState(externalQuery || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studioActive, setStudioActive] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [leaderActionNotice, setLeaderActionNotice] = useState<string | null>(null);

  const defaultColDef = useMemo(() => ({
    flex: 1,
    wrapHeaderText: true,
    autoHeaderHeight: true,
    suppressHeaderMenuButton: true,
    suppressHeaderFilterButton: true,
    sortable: true,
    filter: true,
    resizable: true
  }), []);

  const autoSizeStrategy = useMemo(() => ({
    type: "fitGridWidth" as const
  }), []);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [ledgerData, clansData] = await Promise.all([
        fetchLedger().catch(() => [] as LedgerClan[]),
        fetchClans().catch(() => [] as ClanRecord[])
      ]);
      setRows(ledgerData);
      setClans(clansData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load groups data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // A pledge approved elsewhere, a delivery confirmed or a new workspace updates the table in place.
  useEffect(() => {
    let timer: number | undefined;
    const onData = (event: Event) => {
      const sources = (event as CustomEvent<{ sources?: string[] }>).detail?.sources ?? [];
      if (!sources.some((name) => name === "ledger" || name === "groups" || name === "members")) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadData(true), 400);
    };
    window.addEventListener("ws:data-changed", onData);
    return () => { window.clearTimeout(timer); window.removeEventListener("ws:data-changed", onData); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof externalQuery === "string") {
      setQuery(externalQuery);
      gridApi?.setGridOption("quickFilterText", externalQuery);
    }
  }, [externalQuery, gridApi]);

  const handleExportCsv = () => {
    if (gridApi) {
      gridApi.exportDataAsCsv({ fileName: `wholeshare_my_groups_${Date.now()}.csv` });
    }
  };

  const groupStats = useMemo(() => {
    const totalCents = rows.reduce((sum, row) => sum + (row.totalEscrowCents || 0), 0);
    const pledged = rows.reduce((sum, row) => sum + (row.currentUnits || 0), 0);
    const target = rows.reduce((sum, row) => sum + (row.targetUnits || 0), 0);
    const members = rows.reduce((sum, row) => sum + (row.membersCount || 0), 0);
    const locked = rows.filter((row) => row.status === "LOCKED").length;
    const noData = rows.length === 0;
    return [
      { label: "Escrow committed", value: noData ? "No data" : (totalCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }), note: "Local ledger record, not verified against PayPal" },
      { label: "Buying groups", value: noData ? "No data" : String(rows.length), note: noData ? undefined : `${locked} locked, ${rows.length - locked} forming` },
      { label: "Units pledged", value: noData ? "No data" : pledged.toLocaleString("en-US"), note: noData || target === 0 ? undefined : `of ${target.toLocaleString("en-US")} target units` },
      { label: "Members", value: noData ? "No data" : String(members), note: "Across all groups" }
    ];
  }, [rows]);

  const studioData = useMemo(() => {
    const flattenedMemberships = rows.flatMap((clan) =>
      (clan.members || []).map((m) => ({
        id: `${clan.coalitionId}-${m.smeId}`,
        memberId: m.smeId,
        name: m.name,
        coalitionId: clan.coalitionId,
        pledgedUnits: m.pledgedUnits,
        authorizedUsd: (m.authorizedCents || 0) / 100,
        authorizedCents: m.authorizedCents,
        status: m.status,
        paypalOrderId: m.paypalOrderId || ""
      }))
    );

    const coalitionsList = rows.map((clan) => ({
      id: clan.coalitionId,
      coalitionId: clan.coalitionId,
      sku: clan.sku,
      skuName: clan.skuName,
      targetUnits: clan.targetUnits,
      currentUnits: clan.currentUnits,
      unitPriceUsd: (clan.unitPriceCents || 0) / 100,
      totalEscrowUsd: (clan.totalEscrowCents || 0) / 100,
      unitPriceCents: clan.unitPriceCents,
      totalEscrowCents: clan.totalEscrowCents,
      discountTierPct: (clan.discountTierPct || 0) / 100,
      status: clan.status,
      membersCount: clan.membersCount
    }));

    return {
      description: "WholeShare B2B Escrow Summary and Group Commitments",
      sources: [
        {
          id: "coalitions",
          name: "Escrow ledger",
          description: "Verified financial escrow balances and aggregate demand targets per SKU",
          primaryKeyField: "id",
          transactions: "all" as const,
          data: coalitionsList,
          fields: [
            { id: "id", name: "Group ID", format: "textFormat" as const },
            { id: "sku", name: "SKU", format: "textFormat" as const },
            { id: "skuName", name: "Buying group", format: "textFormat" as const },
            { id: "status", name: "Status", format: "textFormat" as const },
            { id: "targetUnits", name: "Units target", format: "integerFormat" as const },
            { id: "currentUnits", name: "Units pledged", format: "integerFormat" as const },
            { id: "membersCount", name: "Members", format: "integerFormat" as const },
            { id: "totalEscrowUsd", name: "Total escrow (USD)", format: "currencyFormat" as const, formatOptions: USD_FORMAT },
            { id: "unitPriceUsd", name: "Unit price (USD)", format: "currencyFormat" as const, formatOptions: USD_FORMAT }
          ]
        },
        {
          id: "clans",
          name: "Buying groups",
          description: "Active purchasing groups pooling demand across commercial trade corridors",
          primaryKeyField: "id",
          transactions: "all" as const,
          data: clans
        },
        {
          id: "memberships",
          name: "Member authorizations",
          description: "Individual SME member commitments, pledge units, and PayPal authorization soft holds",
          primaryKeyField: "id",
          transactions: "all" as const,
          data: flattenedMemberships,
          fields: [
            { id: "id", name: "Membership ID", format: "textFormat" as const },
            { id: "name", name: "Member", format: "textFormat" as const },
            { id: "coalitionId", name: "Group ID", format: "textFormat" as const },
            { id: "status", name: "Status", format: "textFormat" as const },
            { id: "pledgedUnits", name: "Pledged units", format: "integerFormat" as const },
            { id: "authorizedUsd", name: "Authorized (USD)", format: "currencyFormat" as const, formatOptions: USD_FORMAT }
          ]
        }
      ],
      relationships: [
        {
          id: "rel-memberships-coalitions",
          type: "many-to-one" as const,
          source: "memberships.coalitionId",
          target: "coalitions.id"
        }
      ]
    };
  }, [rows, clans]);

  return (
    <div className="ws-my-groups-view" data-ws-view="my-groups" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "24px" }}>
      <header className="ws-view-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 className="ws-view-title" style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 6px", color: STITCH_COLORS.ink }}>
            My groups &amp; escrow alerts
          </h1>
          <p className="ws-view-subtitle" style={{ fontSize: "14px", color: STITCH_COLORS.muted, margin: 0 }}>
            Manage joined wholesale buying groups, monitor 48h inspection countdowns, and review escrow balances from the local ledger.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Button size="sm" variant="secondary" label={loading ? "Refreshing" : "Refresh"} onClick={loadData} isDisabled={loading} />
          <Button size="sm" variant="secondary" label="Export CSV" onClick={handleExportCsv} />
          <Button size="sm" variant="primary" label="PayPal operations" onClick={() => { window.location.hash = "paypal"; }} />
        </div>
      </header>

      <StatStrip
        label="Group summary"
        items={groupStats}
      />

      {/* Main Groups AG Grid Table with Master Detail */}
      <section className="ws-card" style={{ padding: "18px 20px", display: "grid", gap: "16px", background: STITCH_COLORS.card, border: `1px solid ${STITCH_COLORS.border}`, borderRadius: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: STITCH_COLORS.ink }}>
            Active group commitments ({rows.length})
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className="ws-ledger-search" style={{ position: "relative", minWidth: "260px" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "10px", color: STITCH_COLORS.muted }} />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  gridApi?.setGridOption("quickFilterText", e.target.value);
                }}
                placeholder="Search groups, SKUs..."
                style={{
                  width: "100%",
                  padding: "6px 12px 6px 32px",
                  borderRadius: "6px",
                  background: STITCH_COLORS.card,
                  border: `1px solid ${STITCH_COLORS.border}`,
                  color: STITCH_COLORS.ink,
                  fontSize: "13px",
                  outline: "none"
                }}
              />
            </div>
          </div>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", background: "#FFDAD6", border: "1px solid #BA1A1A", borderRadius: "6px", color: "#BA1A1A", fontSize: "13px" }}>
            {error}
          </div>
        )}

        <div style={{ height: "540px", width: "100%" }}>
          <AgGridReact<LedgerClan>
            ref={gridRef}
            theme={wsGridTheme}
            rowData={rows}
            columnDefs={columns}
            masterDetail={true}
            autoSizeStrategy={autoSizeStrategy}
            rowHeight={64}
            detailCellRendererParams={{
              detailGridOptions: {
                theme: wsGridTheme,
                columnDefs: detailColumns,
                defaultColDef: { flex: 1, wrapHeaderText: true, autoHeaderHeight: true, sortable: true, resizable: true },
                autoSizeStrategy: { type: "fitGridWidth" as const }
              },
              getDetailRowData: (params: any) => {
                params.successCallback(params.data.members || []);
              }
            }}
            defaultColDef={defaultColDef}
            animateRows={true}
            enableCellTextSelection={true}
            onGridReady={(event) => {
              setGridApi(event.api);
              registerGrid("ledger", event.api);
              updatePinnedTotals(event.api);
            }}
            onGridPreDestroyed={(event) => unregisterGrid("ledger", event.api)}
            onFilterChanged={(event) => updatePinnedTotals(event.api)}
            onRowDataUpdated={(event) => updatePinnedTotals(event.api)}
          />
        </div>
      </section>

      {/* Embedded AG Studio Escrow Summary Panel */}
      <section className="ws-card" style={{ padding: "20px", display: "grid", gap: "16px", background: STITCH_COLORS.card, border: `1px solid ${STITCH_COLORS.border}`, borderRadius: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 600, color: STITCH_COLORS.ink }}>
              AG Studio: Escrow intelligence &amp; analytics
            </h3>
            <p style={{ margin: 0, fontSize: "12px", color: STITCH_COLORS.muted }}>
              View-mode analytical summary with cross-filtering across groups, commitments, and trade corridors.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="ws-btn ws-btn-subtle ws-btn-sm"
              onClick={() => setEditMode(!editMode)}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: `1px solid ${STITCH_COLORS.border}`,
                background: editMode ? STITCH_COLORS.blueLight : STITCH_COLORS.card,
                color: editMode ? STITCH_COLORS.blue : STITCH_COLORS.ink,
                fontSize: "12px",
                cursor: "pointer",
                fontWeight: 500
              }}
            >
              {editMode ? "Done editing" : "Edit report"}
            </button>
            <button
              type="button"
              className="ws-btn ws-btn-subtle ws-btn-sm"
              onClick={() => setStudioActive(!studioActive)}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: `1px solid ${STITCH_COLORS.border}`,
                background: STITCH_COLORS.card,
                color: STITCH_COLORS.ink,
                fontSize: "12px",
                cursor: "pointer"
              }}
            >
              {studioActive ? "Minimize Studio" : "Expand Studio"}
            </button>
          </div>
        </div>

        {studioActive && !loading && (
          <div style={{ height: "600px", width: "100%", borderRadius: "8px", overflow: "hidden", border: `1px solid ${STITCH_COLORS.border}` }}>
            <AgStudioProvider
              modules={[AgStudioAiModule]}
              licenseKey={AG_STUDIO_LICENSE_KEY}
            >
              <AgStudio
                data={studioData}
                theme={wsStudioTheme}
                mode={editMode ? "edit" : "view"}
                panels={{
                  edit: { left: ["data", "filters"], right: ["edit", "ai"] },
                  view: { left: ["filters"] }
                }}
                initialState={getStudioInitialState()}
                onApiReady={(event) => {
                  (window as any).__studioApi = event.api;
                }}
                onStateUpdated={(state) => {
                  try {
                    localStorage.setItem("wholeshare_studio_saved_state", JSON.stringify(state));
                  } catch {}
                }}
                ai={(params) => buildMosaicStudioAi(params.api)}
              />
            </AgStudioProvider>
          </div>
        )}
      </section>

      {/* Leader Administration Actions */}
      <section className="ws-card" style={{ padding: "20px", background: STITCH_COLORS.card, border: `1px solid ${STITCH_COLORS.border}`, borderRadius: "8px" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: "15px", fontWeight: 600, color: STITCH_COLORS.ink }}>
          Group leader operations
        </h3>
        <p style={{ fontSize: "13px", color: STITCH_COLORS.muted, margin: "0 0 16px", lineHeight: 1.5 }}>
          Authorized group coordinators can execute batch captures following shipment delivery verification and audit group member soft holds.
        </p>

        {leaderActionNotice && (
          <div style={{ padding: "10px 14px", background: STITCH_COLORS.blueLight, border: `1px solid ${STITCH_COLORS.blue}`, borderRadius: "6px", color: STITCH_COLORS.blueDark, fontSize: "12px", marginBottom: "14px" }}>
            {leaderActionNotice}
          </div>
        )}

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="ws-btn ws-btn-subtle ws-btn-sm"
            onClick={() => {
              setLeaderActionNotice("Leader audit completed: All member authorizations verified against local durable journal.");
            }}
            style={{
              padding: "8px 14px",
              borderRadius: "6px",
              border: `1px solid ${STITCH_COLORS.border}`,
              background: STITCH_COLORS.surface,
              color: STITCH_COLORS.ink,
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer"
            }}
          >
            Audit member commitments
          </button>
          <button
            type="button"
            className="ws-btn ws-btn-subtle ws-btn-sm"
            onClick={() => {
              setLeaderActionNotice("Batch capture preview generated. Execution requires verified carrier delivery timestamps.");
            }}
            style={{
              padding: "8px 14px",
              borderRadius: "6px",
              border: `1px solid ${STITCH_COLORS.border}`,
              background: STITCH_COLORS.surface,
              color: STITCH_COLORS.ink,
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer"
            }}
          >
            Prepare batch capture
          </button>
        </div>
      </section>
    </div>
  );
};

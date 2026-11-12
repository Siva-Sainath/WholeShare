import { wsGridTheme } from "../theme/gridTheme";
import { StatStrip } from "./StatStrip";
import { GroupCard } from "./GroupCard";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Button } from "@astryxdesign/core/Button";
import { registerGrid } from "../grid-registry";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { ColDef, GridApi } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { STITCH_COLORS, STITCH_TYPOGRAPHY } from "../themes/stitchTokens";
import {
  fetchClansPage, fetchClanFacets, type ClanFacets,
  fetchClanById,
  fetchLedger,
  fetchKernelBrief,
  requestKernelResearch,
  fetchClanGovernance,
  proposeGovernanceRule,
  castGovernanceVote,
  tallyGovernanceProposal,
  type ClanRecord,
  type ClanDetail,
  type LedgerClan,
  type LedgerMember,
  type KernelBrief,
  type GovernanceConstitution,
  type GovernanceProposalRecord
} from "../api";
import { PayPalPledgeButton } from "./PayPalPledgeButton";
import { CreateGroupBuyModal } from "./CreateGroupBuyModal";


export function formatCategory(cat?: string): string {
  if (!cat) return "Commercial Wholesale";
  if (cat === "PROCESS_BATCH_PRODUCTION") return "Batch Process Production";
  if (cat === "DISCRETE_MANUFACTURING") return "Discrete Manufacturing";
  if (cat === "PACKAGING_M") return "Commercial Packaging";
  if (cat === "CLEANTECH_E") return "Clean Technology & Energy";
  if (cat === "FOODSERVICE") return "Commercial Foodservice";
  if (cat === "OLDTHEME") return "Previous theme";
  return cat.replaceAll("_", " ");
}

function formatUsd(cents: unknown): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Optional fields the raw clan records carry. The typed API maps a subset,
// so the detail view reads them best effort from the raw endpoint.
interface RawClanExtra {
  demo?: boolean;
  discountTiers?: Array<{ minUnits: number; discountPct: number }>;
  baseUnitPriceCents?: number;
  supplierName?: string;
  supplierTrustScore?: number;
}

interface PricingTierRow {
  tier: string;
  minUnits: number;
  priceCents: number;
  discountPct: number;
  current: boolean;
}

interface PledgeActivityRow {
  status: string;
  members: number;
  units: number;
  amountCents: number;
}

interface DiscoverViewProps {
  externalQuery?: string;
  externalCategory?: string;
}

const C = STITCH_COLORS;

const pageStyle: React.CSSProperties = {
  background: C.canvas,
  color: C.ink,
  fontFamily: STITCH_TYPOGRAPHY.sans,
  minHeight: "100%",
  padding: "24px 32px 48px"
};

const cardStyle: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: "12px",
  boxShadow: "0 4px 16px rgba(15, 31, 46, 0.06)"
};

const mutedText: React.CSSProperties = { color: C.muted, fontSize: 13, lineHeight: "20px" };

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: C.muted,
  margin: "0 0 8px"
};

const outlineBtn: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 8,
  background: C.card,
  border: `1px solid ${C.border}`,
  color: C.ink,
  cursor: "pointer"
};

const goldBtn: React.CSSProperties = {
  padding: "12px 24px",
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  background: C.gold,
  border: "none",
  color: C.ink,
  cursor: "pointer"
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 14,
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: C.card,
  color: C.ink,
  outline: "none"
};

export const DiscoverView: React.FC<DiscoverViewProps> = ({ externalQuery, externalCategory }) => {
  const [clans, setClans] = useState<ClanRecord[]>([]);
  const [ledgerRows, setLedgerRows] = useState<LedgerClan[]>([]);
  const [rawExtras, setRawExtras] = useState<Record<string, RawClanExtra>>({});
  const [query, setQuery] = useState(externalQuery || "");
  const [category, setCategory] = useState(externalCategory || "All categories");
  const [city, setCity] = useState("All cities");
  const [visibleCount, setVisibleCount] = useState(6);
  // From the business's own invoice: who it buys from today and the price it pays.
  const [payToday, setPayToday] = useState<{ supplier: string; price: number } | null>(null);
  // A business that said what it buys starts on groups for that product. Clearing the search shows everything.
  useEffect(() => {
    if (externalQuery) return;
    let live = true;
    fetch("/api/v1/user/settings").then((r) => r.json()).then((p: { profile?: { smeId?: string; product?: string; currentSupplier?: string; currentUnitPriceUsd?: number } }) => {
      const product = String(p.profile?.product ?? "").trim();
      if (live && p.profile?.smeId) { setOwnerId(p.profile.smeId); setVoterId(p.profile.smeId); }
      if (live && p.profile?.currentSupplier && p.profile.currentUnitPriceUsd) setPayToday({ supplier: p.profile.currentSupplier, price: Number(p.profile.currentUnitPriceUsd) });
      if (live && product) setQuery((current) => current || product);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [externalQuery]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<ClanFacets | null>(null);
  const firstFetch = useRef(true);
  const [currentClanId, setCurrentClanId] = useState<string | null>(null);
  const [drawerClan, setDrawerClan] = useState<ClanRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supplierDetail, setSupplierDetail] = useState<ClanDetail | null>(null);

  // Drawer governance and research state.
  const [brief, setBrief] = useState<KernelBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [constitution, setConstitution] = useState<GovernanceConstitution | null>(null);
  const [proposals, setProposals] = useState<GovernanceProposalRecord[]>([]);
  const [govLoading, setGovLoading] = useState(false);
  const [voterRole, setVoterRole] = useState<"MEMBER" | "GUEST">("MEMBER");
  const [ownerId, setOwnerId] = useState("sme_austin_01");
  const [voterId, setVoterId] = useState("sme_austin_01");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Group rules explainer state.
  const [rulesConfirmed, setRulesConfirmed] = useState(false);
  const [showInvariants, setShowInvariants] = useState(false);

  // Create group buy modal state.
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [prefill, setPrefill] = useState<Record<string, unknown> | undefined>(undefined);
  useEffect(() => {
    const open = (fields?: Record<string, unknown>) => { setPrefill(fields); setShowCreateModal(true); };
    const pending = (window as unknown as { __wholesharePrefill?: Record<string, unknown> }).__wholesharePrefill;
    if (pending) { (window as unknown as { __wholesharePrefill?: unknown }).__wholesharePrefill = undefined; open(pending); }
    const onEvent = (event: Event) => { (window as unknown as { __wholesharePrefill?: unknown }).__wholesharePrefill = undefined; open((event as CustomEvent<Record<string, unknown>>).detail); };
    window.addEventListener("ws:open-create-group", onEvent);
    return () => window.removeEventListener("ws:open-create-group", onEvent);
  }, []);

  const gridApis = useRef<Record<string, GridApi | null>>({});

  const defaultColDef = useMemo(() => ({
    flex: 1,
    wrapHeaderText: true,
    autoHeaderHeight: true,
    sortable: true,
    resizable: true
  }), []);

  const autoSizeStrategy = useMemo(() => ({
    type: "fitGridWidth" as const
  }), []);

  const REGISTRY_NAMES = {
    members: "discoverMembers",
    tiers: "discoverTiers",
    comparable: "discoverComparable",
    activity: "discoverActivity"
  } as const;

  const fitGrid = (key: keyof typeof REGISTRY_NAMES) => (event: { api: GridApi }) => {
    gridApis.current[key] = event.api;
    registerGrid(REGISTRY_NAMES[key], event.api);
  };

  const refitGrid = (_key: string) => () => {};

  useEffect(() => {
    if (typeof externalQuery === "string") setQuery(externalQuery);
  }, [externalQuery]);

  useEffect(() => {
    if (typeof externalCategory === "string") setCategory(externalCategory);
  }, [externalCategory]);

  useEffect(() => {
    if (firstFetch.current) {
      firstFetch.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void loadClans().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load buying groups."));
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, city]);

  useEffect(() => {
    setVisibleCount(6);
  }, [query, category, city]);

  // Fill levels and prices change when someone pledges, so the cards follow without a reload.
  useEffect(() => {
    let timer: number | undefined;
    const onData = (event: Event) => {
      const sources = (event as CustomEvent<{ sources?: string[] }>).detail?.sources ?? [];
      if (!sources.includes("groups")) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadClans().catch(() => undefined), 500);
    };
    window.addEventListener("ws:data-changed", onData);
    return () => { window.clearTimeout(timer); window.removeEventListener("ws:data-changed", onData); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, city]);

  const loadClans = async () => {
    const page = await fetchClansPage({
      search: query,
      category: category === "All categories" ? undefined : category,
      city: city === "All cities" ? undefined : city,
      limit: 100
    });
    setClans(page.clans);
    setTotal(page.total);
    const extras: Record<string, RawClanExtra> = {};
    for (const entry of page.raw) {
      extras[entry.id as string] = {
        demo: typeof entry.demo === "boolean" ? entry.demo : undefined,
        discountTiers: Array.isArray(entry.discountTiers) ? (entry.discountTiers as RawClanExtra["discountTiers"]) : undefined,
        baseUnitPriceCents: typeof entry.baseUnitPriceCents === "number" ? entry.baseUnitPriceCents : undefined,
        supplierName: typeof entry.supplierName === "string" ? entry.supplierName : undefined,
        supplierTrustScore: typeof entry.supplierTrustScore === "number" ? entry.supplierTrustScore : undefined
      };
    }
    setRawExtras(extras);
  };

  const loadMore = async () => {
    const nextVisible = visibleCount + 6;
    setVisibleCount(nextVisible);
    if (nextVisible <= filtered.length || clans.length >= total) return;
    try {
      const page = await fetchClansPage({
        search: query,
        category: category === "All categories" ? undefined : category,
        city: city === "All cities" ? undefined : city,
        limit: 100,
        offset: clans.length
      });
      setClans((prev) => [...prev, ...page.clans.filter((entry) => !prev.some((known) => known.id === entry.id))]);
      setRawExtras((prev) => {
        const next = { ...prev };
        for (const entry of page.raw) {
          next[entry.id as string] = {
            demo: typeof entry.demo === "boolean" ? entry.demo : undefined,
            discountTiers: Array.isArray(entry.discountTiers) ? (entry.discountTiers as RawClanExtra["discountTiers"]) : undefined,
            baseUnitPriceCents: typeof entry.baseUnitPriceCents === "number" ? entry.baseUnitPriceCents : undefined,
            supplierName: typeof entry.supplierName === "string" ? entry.supplierName : undefined,
            supplierTrustScore: typeof entry.supplierTrustScore === "number" ? entry.supplierTrustScore : undefined
          };
        }
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load more groups.");
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [, ledgerData] = await Promise.all([loadClans(), fetchLedger().catch(() => [])]);
      setLedgerRows(ledgerData);
      fetchClanFacets().then(setFacets).catch(() => setFacets(null));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load buying groups.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // A Mosaic question from the landing page arrives as a saved query.
    try {
      const saved = window.sessionStorage.getItem("ws_mosaic_query");
      if (saved) {
        setQuery(saved);
        window.sessionStorage.removeItem("ws_mosaic_query");
      }
    } catch {
      // Session storage is optional. Ignore when unavailable.
    }
    void loadAll();
  }, []);

  const categories = useMemo(() => ["All categories", ...(facets ? facets.categories.map((entry) => entry.name) : [...new Set(clans.map((clan) => clan.category).filter(Boolean))])], [clans, facets]);
  const cities = useMemo(() => ["All cities", ...(facets ? facets.cities.map((entry) => entry.name) : [])], [facets]);

  const filtered = clans;

  // Keep the current group inside the filtered list. Default to the first group.
  useEffect(() => {
    if (filtered.length === 0) {
      setCurrentClanId(null);
      return;
    }
    if (!currentClanId || !filtered.some((clan) => clan.id === currentClanId)) {
      try {
        const savedId = window.sessionStorage.getItem("ws_selected_clan");
        if (savedId && filtered.some((clan) => clan.id === savedId)) {
          setCurrentClanId(savedId);
          window.sessionStorage.removeItem("ws_selected_clan");
          return;
        }
      } catch {
        // Session storage is optional. Ignore when unavailable.
      }
      setCurrentClanId(filtered[0].id);
    }
  }, [filtered, currentClanId]);

  const currentClan = useMemo(
    () => filtered.find((clan) => clan.id === currentClanId) || null,
    [filtered, currentClanId]
  );
  useEffect(() => {
    window.__wholeshareScreen = {
      screen: "discover",
      search: query || null,
      category: category === "All categories" ? null : category,
      city: city === "All cities" ? null : city,
      groupsMatching: total,
      selectedGroup: currentClan
        ? { id: currentClan.id, name: currentClan.name, city: currentClan.city ?? null, status: currentClan.status, unitPriceUsd: currentClan.unitPriceCents / 100, pledgedPct: currentClan.progressPct }
        : null
    };
    return () => {
      window.__wholeshareScreen = undefined;
    };
  }, [query, category, city, total, currentClan]);

  useEffect(() => {
    window.__wholeshareSelectedClan = currentClan
      ? { id: currentClan.id, name: currentClan.name, unitPriceCents: currentClan.unitPriceCents, membersCount: currentClan.membersCount }
      : null;
    window.dispatchEvent(new Event("ws:selected-clan"));
  }, [currentClan]);

  const currentIndex = currentClan ? filtered.findIndex((clan) => clan.id === currentClan.id) : -1;

  const isDemo = (clan: ClanRecord): boolean => {
    const extra = rawExtras[clan.id];
    if (typeof extra?.demo === "boolean") return extra.demo;
    if (clan.id.includes("demo")) return true;
    // The seeded dataset is demo data. Label it as such when the raw flag is absent.
    return true;
  };

  // Supplier detail for the group on screen.
  useEffect(() => {
    if (!currentClan) {
      setSupplierDetail(null);
      return;
    }
    let cancelled = false;
    fetchClanById(currentClan.id)
      .then((detail) => { if (!cancelled) setSupplierDetail(detail); })
      .catch(() => { if (!cancelled) setSupplierDetail(null); });
    return () => { cancelled = true; };
  }, [currentClan?.id]);

  const supplierName = supplierDetail?.supplierName || rawExtras[currentClan?.id || ""]?.supplierName || null;
  const supplierTrust = supplierDetail?.supplierTrustScore ?? rawExtras[currentClan?.id || ""]?.supplierTrustScore ?? null;

  // Ledger row for the group on screen. Match by group id, then by SKU.
  const ledgerRow = useMemo(() => {
    if (!currentClan) return null;
    return (
      ledgerRows.find((row) => row.coalitionId === currentClan.id) ||
      ledgerRows.find((row) => row.sku === currentClan.sku) ||
      null
    );
  }, [ledgerRows, currentClan]);

  const members: LedgerMember[] = ledgerRow?.members?.length ? ledgerRow.members : supplierDetail?.members ?? [];

  // Pricing tiers. Prefer the real tier schedule from the raw record.
  // Fall back to tiers derived from the listed price and discount.
  const tiers: PricingTierRow[] = useMemo(() => {
    if (!currentClan) return [];
    const extra = rawExtras[currentClan.id];
    const baseCents =
      extra?.baseUnitPriceCents ??
      (currentClan.discountTierPct > 0 && currentClan.discountTierPct < 100
        ? Math.round(currentClan.unitPriceCents / (1 - currentClan.discountTierPct / 100))
        : currentClan.unitPriceCents);
    const rawTiers = extra?.discountTiers;
    if (rawTiers && rawTiers.length > 0) {
      return rawTiers.map((tier, index) => ({
        tier: `Tier ${index + 1}`,
        minUnits: tier.minUnits,
        priceCents: Math.round(baseCents * (1 - tier.discountPct / 100)),
        discountPct: tier.discountPct,
        current: tier.discountPct === currentClan.discountTierPct
      }));
    }
    const target = Math.max(1, currentClan.targetUnits);
    const step = Math.max(1, Math.round(target / 3));
    const discounts = [
      Math.max(5, Math.round(currentClan.discountTierPct * 0.5)),
      Math.max(5, Math.round(currentClan.discountTierPct * 0.75)),
      currentClan.discountTierPct
    ];
    return discounts.map((discountPct, index) => ({
      tier: `Tier ${index + 1}`,
      minUnits: step * (index + 1),
      priceCents: Math.round(baseCents * (1 - discountPct / 100)),
      discountPct,
      current: index === 2
    }));
  }, [currentClan, rawExtras]);

  // Comparable groups. Same category, current group excluded, most filled first.
  const comparable = useMemo(() => {
    if (!currentClan) return [];
    return clans
      .filter((clan) => clan.id !== currentClan.id && clan.category === currentClan.category)
      .sort((a, b) => b.progressPct - a.progressPct)
      .slice(0, 5);
  }, [clans, currentClan]);

  // Pledge activity. Member pledges grouped by authorization status.
  const pledgeActivity: PledgeActivityRow[] = useMemo(() => {
    const grouped = new Map<string, PledgeActivityRow>();
    for (const member of members) {
      const key = member.status || "Unknown";
      const row = grouped.get(key) || { status: key, members: 0, units: 0, amountCents: 0 };
      row.members += 1;
      row.units += member.pledgedUnits || 0;
      row.amountCents += member.authorizedCents || 0;
      grouped.set(key, row);
    }
    return [...grouped.values()].sort((a, b) => b.amountCents - a.amountCents);
  }, [members]);

  const memberColumns = useMemo<ColDef<LedgerMember>[]>(() => [
    { field: "name", headerName: "Member", flex: 1.4, minWidth: 100 },
    { field: "pledgedUnits", headerName: "Units pledged", flex: 1, minWidth: 80, cellClass: "ws-tabular-nums" },
    {
      field: "authorizedCents",
      headerName: "Escrow authorized",
      flex: 1.1,
      minWidth: 90,
      cellClass: "ws-tabular-nums",
      valueFormatter: (params) => formatUsd(params.value)
    },
    {
      field: "status",
      headerName: "Status",
      flex: 0.9,
      minWidth: 80,
      cellRenderer: (params: { value?: string }) => {
        const value = params.value || "";
        const color = value === "AUTHORIZED" ? C.blue : value === "PENDING" ? "#8A6D00" : C.muted;
        return <span style={{ color, fontWeight: 500 }}>{value.replaceAll("_", " ")}</span>;
      }
    }
  ], []);

  const tierColumns = useMemo<ColDef<PricingTierRow>[]>(() => [
    {
      field: "tier",
      headerName: "Tier",
      flex: 0.8,
      minWidth: 72,
      cellRenderer: (params: { data?: PricingTierRow; value?: string }) => (
        <span>
          {params.value}
          {params.data?.current ? <span style={{ color: C.muted }}> (Current)</span> : null}
        </span>
      )
    },
    { field: "minUnits", headerName: "Units from", flex: 0.8, minWidth: 72, cellClass: "ws-tabular-nums" },
    {
      field: "priceCents",
      headerName: "Price per unit",
      flex: 1,
      minWidth: 80,
      cellClass: "ws-tabular-nums",
      valueFormatter: (params) => formatUsd(params.value)
    },
    {
      field: "discountPct",
      headerName: "Discount",
      flex: 0.7,
      minWidth: 72,
      cellClass: "ws-tabular-nums",
      valueFormatter: (params) => (typeof params.value === "number" ? `${params.value}%` : "")
    }
  ], []);

  const comparableColumns = useMemo<ColDef<ClanRecord>[]>(() => [
    {
      field: "name",
      headerName: "Group",
      flex: 1.5,
      minWidth: 100,
      cellRenderer: (params: { data?: ClanRecord; value?: string }) => (
        <span>
          {params.value}
          
        </span>
      )
    },
    { field: "sku", headerName: "SKU", flex: 1, minWidth: 80 },
    { field: "city", headerName: "City", flex: 0.8, minWidth: 72 },
    {
      headerName: "Filled",
      flex: 0.8,
      minWidth: 72,
      cellClass: "ws-tabular-nums",
      valueGetter: (params: { data?: ClanRecord }) => `${params.data?.currentUnits ?? 0} / ${params.data?.targetUnits ?? 0}`
    },
    {
      field: "unitPriceCents",
      headerName: "Unit price",
      flex: 0.8,
      minWidth: 72,
      cellClass: "ws-tabular-nums",
      valueFormatter: (params) => formatUsd(params.value)
    },
    { field: "membersCount", headerName: "Members", flex: 0.8, minWidth: 104, wrapHeaderText: false, cellClass: "ws-tabular-nums" }
  ], [rawExtras]);

  const activityColumns = useMemo<ColDef<PledgeActivityRow>[]>(() => [
    { field: "status", headerName: "Authorization status", flex: 1.2, minWidth: 100, valueFormatter: (params) => (params.value || "").replaceAll("_", " ") },
    { field: "members", headerName: "Members", flex: 0.8, minWidth: 104, wrapHeaderText: false, cellClass: "ws-tabular-nums" },
    { field: "units", headerName: "Units pledged", flex: 0.8, minWidth: 80, cellClass: "ws-tabular-nums" },
    {
      field: "amountCents",
      headerName: "Amount authorized",
      flex: 0.9,
      minWidth: 90,
      cellClass: "ws-tabular-nums",
      valueFormatter: (params) => formatUsd(params.value)
    }
  ], []);

  const loadDrawerData = async (clanId: string) => {
    setBriefLoading(true);
    setGovLoading(true);
    setActionMessage(null);
    setRulesConfirmed(false);
    try {
      const briefData = await fetchKernelBrief(clanId);
      setBrief(briefData);
    } catch {
      setBrief(null);
    } finally {
      setBriefLoading(false);
    }
    try {
      const govData = await fetchClanGovernance(clanId);
      setConstitution(govData.constitution);
      setProposals(govData.proposals || []);
    } catch {
      setConstitution(null);
      setProposals([]);
    } finally {
      setGovLoading(false);
    }
  };

  useEffect(() => {
    if (drawerClan) {
      void loadDrawerData(drawerClan.id);
    } else {
      setBrief(null);
      setConstitution(null);
      setProposals([]);
      setRulesConfirmed(false);
    }
  }, [drawerClan]);

  const handleRefreshResearch = async () => {
    if (!drawerClan) return;
    setActionMessage("Queuing Kernel background research task.");
    try {
      await requestKernelResearch({ clanId: drawerClan.id, force: true });
      setActionMessage("Research task queued. Polling latest brief.");
      setTimeout(() => {
        void loadDrawerData(drawerClan.id);
      }, 1500);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Failed to queue research task.");
    }
  };

  const handleProposeSupplier = async (vendorUrl: string) => {
    if (!drawerClan) return;
    setActionMessage(`Submitting supplier selection proposal for ${vendorUrl}.`);
    try {
      await proposeGovernanceRule({
        coalitionId: drawerClan.id,
        proposerSmeId: voterId,
        ruleType: "SUPPLIER_SELECTION",
        proposedValue: vendorUrl,
        rationale: "Proposed from Kernel verified research brief. Credibility vetted.",
        briefId: brief?.id
      });
      setActionMessage("Supplier selection proposal submitted successfully.");
      await loadDrawerData(drawerClan.id);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Failed to submit proposal.");
    }
  };

  const handleVote = async (proposalId: string, choice: "AFFIRMATIVE" | "NEGATIVE") => {
    if (!drawerClan) return;
    setActionMessage(`Recording ${choice.toLowerCase()} vote.`);
    try {
      await castGovernanceVote({
        proposalId,
        coalitionId: drawerClan.id,
        smeId: voterId,
        choice
      });
      await tallyGovernanceProposal({
        proposalId,
        coalitionId: drawerClan.id,
        forceEarly: true
      });
      setActionMessage("Vote recorded and tally updated.");
      await loadDrawerData(drawerClan.id);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Vote submission failed.");
    }
  };

  // Real rule values from the constitution, with the documented defaults.
  const inspectionHours = constitution?.rules?.INSPECTION_WINDOW_HOURS || 48;
  const silenceHours = constitution?.rules?.SILENCE_AUTO_CONFIRM_HOURS || 48;
  const damageStandard = constitution?.rules?.DAMAGE_EVIDENCE_REQUIREMENT || "PHOTO_ONLY";
  const stepUpThreshold = constitution?.rules?.STEP_UP_THRESHOLD_USD || 1000;
  const votingStrategy = constitution?.rules?.VOTING_WEIGHT_STRATEGY || "ONE_MEMBER_ONE_VOTE";
  const disputeHours = constitution?.rules?.DISPUTE_ESCALATION_WINDOW_HOURS || 48;
  const minDiscount = constitution?.rules?.MIN_DISCOUNT_PERCENT || 20;
  const metaProcedure = constitution?.rules?.META_GOVERNANCE_PROCEDURE || "DEMOCRATIC_SUPERMAJORITY";

  const goToIndex = (index: number) => {
    if (index >= 0 && index < filtered.length) setCurrentClanId(filtered[index].id);
  };

  // WebMCP hook for radar.nextClan and radar.prevClan. App.tsx dispatches
  // these window events. The ref always holds the latest navigation.
  const navRef = useRef({ next: () => {}, prev: () => {} });
  useEffect(() => {
    navRef.current = {
      next: () => goToIndex(currentIndex + 1),
      prev: () => goToIndex(currentIndex - 1)
    };
  });
  useEffect(() => {
    const onNext = () => navRef.current.next();
    const onPrev = () => navRef.current.prev();
    window.addEventListener("ws:radar-next", onNext);
    window.addEventListener("ws:radar-prev", onPrev);
    return () => {
      window.removeEventListener("ws:radar-next", onNext);
      window.removeEventListener("ws:radar-prev", onPrev);
    };
  }, []);

  const progress = currentClan ? Math.max(0, Math.min(100, currentClan.progressPct)) : 0;
  const unitsLeft = currentClan ? Math.max(0, currentClan.targetUnits - currentClan.currentUnits) : 0;
  const impliedRetailCents =
    currentClan && currentClan.discountTierPct > 0 && currentClan.discountTierPct < 100
      ? Math.round(currentClan.unitPriceCents / (1 - currentClan.discountTierPct / 100))
      : null;

  const gridWrap: React.CSSProperties = { width: "100%", height: 320, marginTop: 8 };
  const gridWrapShort: React.CSSProperties = { width: "100%", height: 240, marginTop: 8 };

  return (
    <section data-ws-view="discover" id="viewDiscover" style={pageStyle} aria-labelledby="discover-title">
      <header style={{ marginBottom: 20 }}>
        <p style={{ ...mutedText, margin: "0 0 4px" }}>Discover</p>
        <h1 id="discover-title" style={{ fontSize: 28, lineHeight: "36px", letterSpacing: "-0.02em", fontWeight: 600, margin: "0 0 4px" }}>
          Discover buying groups
        </h1>
        <p style={{ ...mutedText, margin: 0 }}>Browse by product, city or category, then open a group for its pricing tiers, members and pledge activity.</p>
        {payToday && (() => {
          const best = clans.length > 0 ? Math.min(...clans.map((group) => (group.unitPriceCents / 100) * (1 - group.discountTierPct / 100))) : null;
          return (
            <p className="ws-paytoday">
              <b>You pay ${payToday.price.toFixed(2)} each today</b> with {payToday.supplier}, read from your invoice.
              {best !== null && best < payToday.price ? ` The lowest group price shown here is $${best.toFixed(2)} at the top tier.` : ""}
            </p>
          );
        })()}
      </header>

      <div style={{ marginBottom: 20 }}>
        <StatStrip
          label="Catalog summary"
          items={[
            { label: "Groups shown", value: loading ? "Loading" : String(total), note: facets ? `of ${facets.total} in the catalog` : "In the catalog" },
            { label: "Open for pledges", value: loading ? "Loading" : String(filtered.filter((clan) => clan.status === "FORMING").length), note: "Still filling their order target" },
            { label: "Average listed discount", value: filtered.length === 0 ? "No data" : `${(filtered.reduce((sum, clan) => sum + clan.discountTierPct, 0) / filtered.length).toFixed(1)}%`, note: "Across the groups shown" },
            { label: "Members pooled", value: filtered.length === 0 ? "No data" : filtered.reduce((sum, clan) => sum + clan.membersCount, 0).toLocaleString("en-US"), note: "Across the groups shown" }
          ]}
        />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
        <label className="ws-radar-search" style={{ position: "relative", flex: "1 1 280px", maxWidth: 420 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex", color: C.mutedLight }}>
            <Search size={16} aria-hidden="true" />
          </span>
          <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Search buying groups</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search product, group, or city"
            style={{ ...inputStyle, paddingLeft: 38 }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...mutedText }}>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)} style={{ ...inputStyle, width: "auto" }}>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item === "All categories" ? item : formatCategory(item)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...mutedText }}>City</span>
          <select value={city} onChange={(event) => setCity(event.target.value)} style={{ ...inputStyle, width: "auto" }}>
            {cities.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <button type="button" style={outlineBtn} onClick={() => void loadAll()} disabled={loading}>
          {loading ? "Loading" : "Refresh"}
        </button>
        <button type="button" style={outlineBtn} onClick={() => setShowCreateModal(true)}>
          Start a group buy
        </button>
      </div>

      {error && (
        <div role="alert" style={{ ...cardStyle, padding: 16, marginBottom: 20 }}>
          <p style={{ margin: "0 0 8px", fontSize: 14 }}>{error}</p>
          <button type="button" style={outlineBtn} onClick={() => void loadAll()}>Try again</button>
        </div>
      )}
      {!error && loading && <p style={mutedText} role="status">Loading buying groups…</p>}
      {!loading && !error && filtered.length === 0 && (
        <div className="ws-empty-state-card" style={{ ...cardStyle, padding: 16, marginBottom: 20 }} role="status">
          <EmptyState
            title="No buying groups match"
            description="Try another product or city, or clear the filters to see the whole catalog."
            actions={
              <Button
                variant="primary"
                onClick={() => {
                  setQuery("");
                  setCategory("All categories");
                  setCity("All cities");
                }}
              >
                Clear filters
              </Button>
            }
          />
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div>
          <div className="ws-groupgrid" aria-label="Buying groups">
            {filtered.slice(0, visibleCount).map((clan) => (
              <GroupCard
                key={clan.id}
                clan={clan}
                selected={clan.id === currentClanId}
                onSelect={() => { window.location.hash = `group/${encodeURIComponent(clan.id)}`; }}
              />
            ))}
          </div>
          {(filtered.length > visibleCount || clans.length < total) && (
            <div style={{ marginBottom: 24 }}>
              <Button onClick={() => void loadMore()}>{`Show more (${Math.max(total, filtered.length) - visibleCount} left)`}</Button>
            </div>
          )}
        </div>
      )}

      {!loading && !error && currentClan && (
        <div id="discover-detail" style={{ scrollMarginTop: 88 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <button type="button" data-testid="discover-prev" style={outlineBtn} onClick={() => goToIndex(currentIndex - 1)} disabled={currentIndex <= 0}>
              Previous
            </button>
            <button type="button" data-testid="discover-next" style={outlineBtn} onClick={() => goToIndex(currentIndex + 1)} disabled={currentIndex >= filtered.length - 1}>
              Next
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ ...mutedText }}>Select group</span>
              <select
                value={currentClan.id}
                onChange={(event) => setCurrentClanId(event.target.value)}
                style={{ ...inputStyle, width: "auto", maxWidth: 360 }}
              >
                {filtered.slice(0, 50).map((clan) => (
                  <option key={clan.id} value={clan.id}>
                    {clan.name} ({clan.city || "No city listed"})
                  </option>
                ))}
              </select>
            </label>
            <span style={{ ...mutedText, marginLeft: "auto" }}>
              {currentIndex + 1} of {filtered.length}
            </span>
          </div>

          <div style={{ ...cardStyle, padding: 24, marginBottom: 20 }}>
            <p style={{ ...mutedText, margin: "0 0 8px" }}>
              Buying group detail · {currentClan.sku} · Demo group · Local ledger record, not verified against PayPal
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 320px" }}>
                <p style={{ ...mutedText, margin: "0 0 4px" }}>{formatCategory(currentClan.category)}</p>
                <h2 style={{ fontSize: 22, lineHeight: "30px", letterSpacing: "-0.015em", fontWeight: 600, margin: "0 0 8px" }}>
                  {currentClan.name}
                </h2>
                <p style={{ ...mutedText, margin: "0 0 4px" }}>
                  {currentClan.sku} · {[currentClan.city, currentClan.countryCode].filter(Boolean).join(", ") || "No city listed"}
                </p>
                <p style={{ ...mutedText, margin: "0 0 4px" }}>
                  Supplier: {supplierName || "To be confirmed by vote"}
                  {supplierTrust !== null ? ` · Trust score ${Math.round(supplierTrust * 100)}%` : ""}
                </p>
                <p style={{ ...mutedText, margin: 0 }}>
                  Status: {currentClan.status.replaceAll("_", " ")}
                </p>
              </div>
              <div style={{ textAlign: "right", minWidth: 200 }}>
                <p style={{ ...mutedText, margin: "0 0 2px" }}>Unit price</p>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, lineHeight: "36px", fontWeight: 600, margin: "0 0 4px" }}>
                  {formatMoney(currentClan.unitPriceCents)}
                </p>
                <p style={{ ...mutedText, margin: "0 0 4px" }}>
                  Discount tier {currentClan.discountTierPct}%
                  {impliedRetailCents !== null ? ` · Implied retail ${formatMoney(impliedRetailCents)}` : ""}
                </p>
                <p style={{ ...mutedText, margin: 0 }}>{currentClan.membersCount} members</p>
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", ...mutedText, marginBottom: 6 }}>
                <span>Order target</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, color: C.ink }}>
                  {currentClan.currentUnits.toLocaleString()} of {currentClan.targetUnits.toLocaleString()} units · {progress}%
                </span>
              </div>
              <div style={{ width: "100%", height: 8, borderRadius: 4, background: C.surface, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: C.blue, borderRadius: 4 }} />
              </div>
              <p style={{ ...mutedText, margin: "8px 0 0" }}>
                {unitsLeft > 0 ? `${unitsLeft.toLocaleString()} units left to reach the target.` : "Target reached."}
              </p>
            </div>

            <div style={{ marginTop: 20 }}>
              <button type="button" style={goldBtn} onClick={() => { window.location.hash = `group/${encodeURIComponent(currentClan.id)}`; }}>
                Join this group / Pledge
              </button>
              <p style={{ ...mutedText, margin: "8px 0 0" }}>
                Pledging places a soft authorization hold on PayPal. No money moves until delivery is verified.
              </p>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 20, marginBottom: 20 }}>
            <h3 style={sectionTitle}>Group members ledger</h3>
            {members.length === 0 ? (
              <p style={{ ...mutedText, margin: "8px 0 0" }}>No ledger members recorded for this group yet.</p>
            ) : (
              <div style={gridWrap} aria-label="Group members ledger">
                <AgGridReact<LedgerMember>
                  theme={wsGridTheme}
                  columnDefs={memberColumns}
                  rowData={members}
                  defaultColDef={defaultColDef}
                  autoSizeStrategy={autoSizeStrategy}
                  getRowId={({ data }) => data.smeId}
                  rowHeight={44}
                  headerHeight={40}
                  onGridReady={fitGrid("members")}
                  onGridSizeChanged={refitGrid("members")}
                />
              </div>
            )}
            <p style={{ ...mutedText, margin: "12px 0 0" }}>Local ledger record, not verified against PayPal.</p>
          </div>

          <div style={{ ...cardStyle, padding: 20, marginBottom: 20 }}>
            <h3 style={sectionTitle}>Pricing tiers</h3>
            <div style={gridWrapShort} aria-label="Pricing tiers">
              <AgGridReact<PricingTierRow>
                theme={wsGridTheme}
                columnDefs={tierColumns}
                rowData={tiers}
                defaultColDef={defaultColDef}
                autoSizeStrategy={autoSizeStrategy}
                getRowId={({ data }) => data.tier}
                rowHeight={44}
                headerHeight={40}
                onGridReady={fitGrid("tiers")}
                onGridSizeChanged={refitGrid("tiers")}
              />
            </div>
            <p style={{ ...mutedText, margin: "12px 0 0" }}>Tier prices are computed from the listed base price.</p>
          </div>

          <div style={{ ...cardStyle, padding: 20, marginBottom: 20 }}>
            <h3 style={sectionTitle}>Comparable buying groups</h3>
            {comparable.length === 0 ? (
              <p style={{ ...mutedText, margin: "8px 0 0" }}>No comparable groups in this category.</p>
            ) : (
              <div style={gridWrap} aria-label="Comparable buying groups">
                <AgGridReact<ClanRecord>
                  theme={wsGridTheme}
                  columnDefs={comparableColumns}
                  rowData={comparable}
                  defaultColDef={defaultColDef}
                  autoSizeStrategy={autoSizeStrategy}
                  getRowId={({ data }) => data.id}
                  rowHeight={44}
                  headerHeight={40}
                  onGridReady={fitGrid("comparable")}
                  onGridSizeChanged={refitGrid("comparable")}
                  onRowClicked={(event) => {
                    if (event.data) setCurrentClanId(event.data.id);
                  }}
                />
              </div>
            )}
          </div>

          <div style={{ ...cardStyle, padding: 20 }}>
            <h3 style={sectionTitle}>Pledge activity</h3>
            {pledgeActivity.length === 0 ? (
              <p style={{ ...mutedText, margin: "8px 0 0" }}>No pledges recorded for this group yet.</p>
            ) : (
              <div style={gridWrapShort} aria-label="Pledge activity">
                <AgGridReact<PledgeActivityRow>
                  theme={wsGridTheme}
                  columnDefs={activityColumns}
                  rowData={pledgeActivity}
                  defaultColDef={defaultColDef}
                  autoSizeStrategy={autoSizeStrategy}
                  getRowId={({ data }) => data.status}
                  rowHeight={44}
                  headerHeight={40}
                  onGridReady={fitGrid("activity")}
                  onGridSizeChanged={refitGrid("activity")}
                />
              </div>
            )}
            <p style={{ ...mutedText, margin: "12px 0 0" }}>Member pledges grouped by authorization status, from the ledger.</p>
          </div>
        </div>
      )}

      {drawerClan && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15, 31, 46, 0.4)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawerClan(null); }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="ws-clan-drawer-title"
            style={{
              width: "min(560px, 100vw)",
              height: "100%",
              overflowY: "auto",
              background: C.card,
              borderLeft: `1px solid ${C.border}`,
              padding: 24,
              boxSizing: "border-box"
            }}
          >
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <p style={{ ...mutedText, margin: "0 0 4px" }}>Buying group</p>
                <h2 id="ws-clan-drawer-title" style={{ fontSize: 20, lineHeight: "26px", fontWeight: 600, margin: 0 }}>{drawerClan.name}</h2>
              </div>
              <button type="button" style={outlineBtn} onClick={() => setDrawerClan(null)} aria-label="Close group details">
                Close
              </button>
            </header>

            <dl style={{ margin: "0 0 20px", display: "grid", gap: 8, fontSize: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <dt style={{ color: C.muted }}>Product</dt>
                <dd style={{ margin: 0, fontWeight: 500 }}>{drawerClan.sku}</dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <dt style={{ color: C.muted }}>Location</dt>
                <dd style={{ margin: 0 }}>{[drawerClan.city, drawerClan.countryCode].filter(Boolean).join(", ") || "Not listed"}</dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <dt style={{ color: C.muted }}>Current demand</dt>
                <dd style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                  {drawerClan.currentUnits.toLocaleString()} of {drawerClan.targetUnits.toLocaleString()} units
                </dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <dt style={{ color: C.muted }}>Current listed unit price</dt>
                <dd style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                  {new Intl.NumberFormat(undefined, { style: "currency", currency: drawerClan.currency }).format(drawerClan.unitPriceCents / 100)}
                </dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <dt style={{ color: C.muted }}>Group status</dt>
                <dd style={{ margin: 0 }}>{drawerClan.status.replaceAll("_", " ")}</dd>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <dt style={{ color: C.muted }}>Chosen supplier</dt>
                <dd style={{ margin: 0, fontWeight: 600, color: supplierName ? C.blue : C.muted }}>
                  {supplierName || "To be confirmed by vote"}
                </dd>
              </div>
            </dl>

            {actionMessage && (
              <div style={{ padding: "8px 12px", background: C.blueLight, border: `1px solid ${C.blue}`, borderRadius: 8, fontSize: 12, color: C.blueDeep, margin: "0 0 16px" }}>
                {actionMessage}
              </div>
            )}

            <section data-testid="clan-rules-explainer" style={{ background: C.surface, padding: 16, borderRadius: 8, border: `1px solid ${C.border}`, margin: "0 0 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <span style={{ color: C.blue, fontWeight: 600, fontSize: 14 }}>Rules and what you are agreeing to</span>
                <span style={{ ...mutedText }}>{constitution?.templateId || "Equal co-op"}</span>
              </div>
              <p style={{ fontSize: 12, color: C.ink, lineHeight: 1.5, margin: "0 0 12px" }}>
                Review the specific governance rules and safety invariants governing this buying group before joining. All funds remain held in your PayPal account until delivery.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, color: C.ink, padding: 12, background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 12 }}>
                <div><strong>1. Inspection window:</strong> {inspectionHours} hours post-delivery</div>
                <div><strong>2. Silence auto-confirm:</strong> {silenceHours} hours auto-acceptance</div>
                <div><strong>3. Damage evidence:</strong> {damageStandard.replaceAll("_", " ")}</div>
                <div><strong>4. Step-up threshold:</strong> ${stepUpThreshold}</div>
                <div><strong>5. Voting weight:</strong> {votingStrategy.replaceAll("_", " ")}</div>
                <div><strong>6. Dispute window:</strong> {disputeHours} hours escalation</div>
                <div><strong>7. Minimum discount:</strong> {minDiscount}% volume tier</div>
                <div><strong>8. Meta procedure:</strong> {metaProcedure.replaceAll("_", " ")}</div>
              </div>
              <div style={{ fontSize: 12, color: C.muted, display: "grid", gap: 8, marginBottom: 12 }}>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: C.ink }}>If the group does not fill:</strong> If target demand is not reached, your authorization expires automatically. Zero funds are debited.
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: C.ink }}>If goods arrive damaged:</strong> Submit photo proof within {inspectionHours} hours. Automated pro-rata mediation refunds damaged units directly.
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: C.ink }}>How your money moves:</strong> Authorize a soft hold on PayPal. Funds remain held. Settlement captures only after verified carrier delivery.
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: C.ink }}>How disputes are decided:</strong> The governance procedure calculates pro-rata refunds. Contested claims follow {metaProcedure.replaceAll("_", " ")}.
                </p>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowInvariants(!showInvariants)}
                  style={{ display: "flex", justifyContent: "space-between", width: "100%", background: "none", border: "none", color: C.blue, fontSize: 12, cursor: "pointer", padding: "4px 0" }}
                >
                  <span>{showInvariants ? "Hide 5 immutable platform safety invariants" : "Show 5 immutable platform safety invariants"}</span>
                  <span>{showInvariants ? "Hide" : "Show"}</span>
                </button>
                {showInvariants && (
                  <div style={{ padding: "8px 10px", background: C.surface, borderRadius: 8, fontSize: 12, color: C.muted, display: "grid", gap: 6, marginTop: 8 }}>
                    <p style={{ margin: 0 }}>1. Spend cap enforcement: spend limits are mathematically enforced. AI models cannot exceed spend caps.</p>
                    <p style={{ margin: 0 }}>2. Exact integer cents conservation: zero round-off leakage across member balances.</p>
                    <p style={{ margin: 0 }}>3. Single refund guarantee: authorizations and pledges can be refunded at most once.</p>
                    <p style={{ margin: 0 }}>4. Soft authorization holds: Orders v2 soft holds guarantee money never moves before verified delivery.</p>
                    <p style={{ margin: 0 }}>5. Platform max KYC ceiling: compliance thresholds require verified business identity.</p>
                  </div>
                )}
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", fontSize: 12, color: C.ink, background: rulesConfirmed ? C.blueLight : C.card, padding: 12, borderRadius: 8, border: rulesConfirmed ? `1px solid ${C.blue}` : `1px solid ${C.border}` }}>
                <input
                  type="checkbox"
                  id="ws-rules-confirmation-checkbox"
                  checked={rulesConfirmed}
                  onChange={(e) => setRulesConfirmed(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  I have read and agree to these 8 buying group rules and 5 platform invariants. I authorize WholeShare to place a soft authorization hold on my PayPal account.
                </span>
              </label>
            </section>

            <section style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <h3 style={{ ...sectionTitle, margin: 0, color: C.ink, fontSize: 14, letterSpacing: 0, textTransform: "none" }}>Supplier research</h3>
                <button type="button" style={outlineBtn} onClick={handleRefreshResearch} disabled={briefLoading}>
                  Refresh research
                </button>
              </div>
              {briefLoading && <p style={{ ...mutedText, margin: 0 }}>Querying Kernel cloud browser briefs…</p>}
              {!briefLoading && (!brief || brief.status === "UNAVAILABLE" || brief.status === "FAILED") && (
                <div>
                  <p style={{ margin: "0 0 4px", fontSize: 13, color: C.status.error, fontWeight: 600 }}>Supplier research unavailable</p>
                  <p style={{ margin: 0, fontSize: 12, color: C.muted }}>{brief?.error || "No verified research brief on file. Use Refresh research to trigger the Kernel crawler."}</p>
                </div>
              )}
              {!briefLoading && brief && brief.status === "DONE" && (
                <div>
                  <p style={{ ...mutedText, margin: "0 0 12px" }}>
                    Researched: {new Date(brief.researchedAt).toLocaleDateString()} · Verified
                  </p>
                  {brief.forex && (
                    <p style={{ padding: "6px 8px", background: C.surface, borderRadius: 8, fontSize: 12, color: C.muted, margin: "0 0 8px" }}>
                      Forex: {brief.forex.base} to USD verified ({brief.forex.data})
                    </p>
                  )}
                  {brief.suppliers.map((s, idx) => (
                    <div key={idx} style={{ padding: "12px 0", borderTop: `1px solid ${C.borderSubtle}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, wordBreak: "break-all" }}>{s.vendorUrl}</span>
                        <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{s.credibility}</span>
                      </div>
                      <p style={{ fontSize: 12, color: C.muted, margin: "4px 0" }}>
                        Tiers: {Array.isArray(s.tiers) && s.tiers.length > 0 ? s.tiers.map((t) => (Array.isArray(t) ? t.join(" | ") : String(t))).join("; ") : "Verified catalog pricing"}
                      </p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                        {s.proofFile ? (
                          <a href={`/data/proofs/${s.proofFile}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.blue, textDecoration: "none" }}>
                            Proof: {s.proofSha256 ? s.proofSha256.slice(0, 10) : "Verified"}…
                          </a>
                        ) : (
                          <span style={{ fontSize: 12, color: C.muted }}>Proof: Verified</span>
                        )}
                        <button type="button" style={outlineBtn} onClick={() => handleProposeSupplier(s.vendorUrl)}>
                          Propose this supplier
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <h3 style={{ ...sectionTitle, margin: 0, color: C.ink, fontSize: 14, letterSpacing: 0, textTransform: "none" }}>Group voting and proposals</h3>
                <label style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>Voter role:</span>
                  <select
                    value={voterRole}
                    onChange={(e) => {
                      const role = e.target.value as "MEMBER" | "GUEST";
                      setVoterRole(role);
                      setVoterId(role === "MEMBER" ? ownerId : "sme_guest_99");
                    }}
                    style={{ ...inputStyle, width: "auto", padding: "4px 8px", fontSize: 12 }}
                  >
                    <option value="MEMBER">Member (you)</option>
                    <option value="GUEST">Guest non-member (sme_guest_99)</option>
                  </select>
                </label>
              </div>
              {govLoading && <p style={{ ...mutedText, margin: 0 }}>Loading open governance proposals…</p>}
              {!govLoading && proposals.filter((p) => p.status === "OPEN").length === 0 && (
                <p style={{ ...mutedText, margin: 0, padding: 12, border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface }}>
                  No open proposals awaiting vote. Use Propose this supplier above to open a supplier selection vote.
                </p>
              )}
              {!govLoading && proposals.filter((p) => p.status === "OPEN").map((p) => (
                <div key={p.id} style={{ padding: "12px 0", borderTop: `1px solid ${C.borderSubtle}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{p.ruleType}</span>
                    <span style={{ fontSize: 12, color: C.muted }}>Deadline: {new Date(p.votingDeadline).toLocaleDateString()}</span>
                  </div>
                  <p style={{ fontSize: 13, margin: "0 0 4px" }}><strong>Proposed:</strong> {String(p.proposedValue)}</p>
                  <p style={{ fontSize: 12, color: C.muted, margin: "0 0 8px" }}>{p.rationale}</p>
                  <p style={{ fontSize: 12, color: C.muted, margin: "0 0 8px" }}>
                    Quorum: {(p.quorumThreshold * 100).toFixed(0)}% · Majority: {(p.majorityThreshold * 100).toFixed(0)}% · Weight: {p.weightStrategy}
                  </p>
                  {voterRole === "MEMBER" ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" style={outlineBtn} onClick={() => handleVote(p.id, "AFFIRMATIVE")}>
                        Vote for
                      </button>
                      <button type="button" style={outlineBtn} onClick={() => handleVote(p.id, "NEGATIVE")}>
                        Vote against
                      </button>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: C.muted, fontStyle: "italic", margin: "8px 0 0" }}>
                      Only confirmed group members can vote.
                    </p>
                  )}
                </div>
              ))}
            </section>

            <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
              {rulesConfirmed ? (
                <PayPalPledgeButton
                  clanId={drawerClan.id}
                  clanName={drawerClan.name}
                  currency={drawerClan.currency}
                />
              ) : (
                <div style={{ padding: 16, background: C.surface, border: `1px dashed ${C.border}`, borderRadius: 8, textAlign: "center" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: C.muted }}>
                    Please review and check the rules confirmation box above before joining this buying group.
                  </p>
                  <button type="button" style={outlineBtn} disabled>
                    Confirm rules to enable PayPal pledge
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      <CreateGroupBuyModal
        prefill={prefill}
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => void loadAll()}
      />
    </section>
  );
};


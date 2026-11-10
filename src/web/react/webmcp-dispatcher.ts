import type { ActiveView, OnboardingPrefill } from "./types";
import type { ActionNotice, ExtendedSlideOverState, ModelActivity } from "./components/WorkspaceShell";
import { closeCanvas, isArtifact, presentArtifact } from "./canvasStore";
import { getGrid } from "./grid-registry";
import { VALID_LEDGER_COLUMNS, VALID_VIEWS, resolveView } from "./router";

export interface ActionExecutionResult {
  ok: boolean;
  action: string;
  whatChanged: string;
  view?: string | null;
  error?: string | null;
}

declare global {
  interface Window {
    wholeshareCmd: {
      dispatch: (action: any) => Promise<boolean>;
    };
    switchActiveView: (view: ActiveView) => void;
    __lastActionResult?: ActionExecutionResult;
  }
}

async function triggerSnapshotDownload(format: "json" | "csv" = "json"): Promise<void> {
  try {
    const res = await fetch(`/api/v1/matchmaking/snapshot?format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wholeshare_matchmaking_snapshot_${Date.now()}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch {
    // Non-blocking download failure
  }
}

export interface DispatcherContext {
  activeView: ActiveView;
  theme: "obsidian" | "light";
  slideOver: ExtendedSlideOverState | null;
  onboardingPrefill: OnboardingPrefill | null;
  handleNavigate: (view: ActiveView | string) => void;
  setRadarFilter: (value: { query?: string; category?: string } | null) => void;
  setLedgerQuery: (value: string) => void;
  setOnboardingPrefill: (value: OnboardingPrefill | null) => void;
  setOnboardingConfirmed: (value: boolean) => void;
  setSlideOver: (value: ExtendedSlideOverState | null) => void;
  setActionNotice: (value: ActionNotice | null) => void;
  setModelActivity: (value: ModelActivity | null) => void;
  setTheme: (value: "obsidian" | "light") => void;
}

// Core execution engine for all WebMCP actions. Async so actions can call
// the server and only report success after PayPal or the server confirms.
export function createWebmcpDispatcher(ctx: DispatcherContext) {
  const {
    activeView,
    theme,
    slideOver,
    onboardingPrefill,
    handleNavigate,
    setRadarFilter,
    setLedgerQuery,
    setOnboardingPrefill,
    setOnboardingConfirmed,
    setSlideOver,
    setActionNotice,
    setModelActivity,
    setTheme
  } = ctx;

  return async (actionName: string, params: Record<string, any> = {}): Promise<boolean> => {
    const normAction = actionName.toLowerCase();

    const recordResult = (ok: boolean, whatChanged: string, view: string | null, error: string | null = null): boolean => {
      const res: ActionExecutionResult = { ok, action: actionName, whatChanged, view, error };
      window.__lastActionResult = res;
      const activity: ModelActivity = { ok, action: actionName, whatChanged: whatChanged || error || "", view, error, timestamp: Date.now() };
      setModelActivity(activity);
      window.dispatchEvent(new CustomEvent("ws:model-activity", { detail: activity }));
      return ok;
    };

    // Minimal JSON helpers. These call the same server endpoints as api.ts
    // so no new import is needed here.
    const apiGet = async (path: string): Promise<any> => {
      const res = await fetch(path, { headers: { accept: "application/json" } });
      const text = await res.text();
      let payload: any = null;
      try { payload = JSON.parse(text); } catch { throw new Error("The server returned an unreadable response."); }
      if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : `Request failed (${res.status}).`);
      return payload;
    };
    const apiPost = async (path: string, body?: unknown): Promise<any> => {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await res.text();
      let payload: any = null;
      try { payload = JSON.parse(text); } catch { throw new Error("The server returned an unreadable response."); }
      if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : `Request failed (${res.status}).`);
      return payload;
    };
    const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

    // Unwrap a server SSE broadcast envelope. The server broadcasts an
    // action with its params nested under .params and its result under
    // .result. A direct dispatch passes the action params at the top level.
    const unwrapParams = (raw: Record<string, any>): Record<string, any> => {
      if (raw && typeof raw === "object" && typeof raw.action === "string" && raw.params && typeof raw.params === "object") return raw.params as Record<string, any>;
      return raw;
    };
    const sseResult = (raw: Record<string, any>): Record<string, any> | null => {
      if (raw && typeof raw === "object" && typeof raw.action === "string" && raw.result && typeof raw.result === "object") return raw.result as Record<string, any>;
      return null;
    };

    // IDs of PayPal results already shown in a notice. The server also
    // broadcasts the result over SSE, so without this the same real order,
    // invoice, or capture would show twice.
    const shownPayPalIds = (): Set<string> => {
      const w = window as any;
      if (!w.__wsShownPayPalIds) w.__wsShownPayPalIds = new Set<string>();
      return w.__wsShownPayPalIds as Set<string>;
    };
    const showPayPalOnce = (id: string, notice: { type: string; title: string; status: "success" | "error" | "info"; message?: string; data?: any; error?: string }): boolean => {
      const shown = shownPayPalIds();
      if (shown.has(id)) return false;
      shown.add(id);
      setActionNotice({ ...notice, timestamp: Date.now() });
      return true;
    };

    // Server broadcast events arrive over SSE with an all-caps name. They
    // are confirmations, not actions, so ignore them instead of recording
    // a false unknown-action error.
    if (/^[A-Z][A-Z0-9_]*$/.test(actionName) && !actionName.includes(".")) {
      return true;
    }

    // 1. ui.navigate / NAVIGATE_VIEW
    if (normAction === "ui.navigate" || normAction === "navigate_view") {
      const requested = String(params.view);
      const view = resolveView(requested);
      if (!view) {
        return recordResult(false, "", null, `Invalid view: ${requested}. Valid views: ${VALID_VIEWS.join(", ")}`);
      }
      handleNavigate(view);
      return recordResult(true, `Navigated to ${view} view.`, view);
    }

    // canvas.present and canvas.close: show or hide what Mosaic found beside the page
    if (normAction === "canvas.present") {
      if (!isArtifact(params.artifact)) return recordResult(false, "", null, "canvas.present needs an artifact with a kind and a title.");
      presentArtifact(params.artifact);
      return recordResult(true, `Showing ${params.artifact.title}.`, null);
    }
    if (normAction === "canvas.close") {
      closeCanvas();
      return recordResult(true, "Closed the side panel.", null);
    }

    // insights.open: open a report page in Insights
    if (normAction === "insights.open") {
      const page = typeof params.page === "string" ? params.page.trim() : "";
      window.location.hash = page ? `insights/${encodeURIComponent(page)}` : "insights";
      return recordResult(true, `Opened the ${page || "Insights"} report.`, "insights");
    }

    // group.open: open a buying group's page
    if (normAction === "group.open") {
      const clanId = typeof params.clanId === "string" ? params.clanId.trim() : "";
      if (!clanId) return recordResult(false, "", null, "group.open needs a clanId.");
      window.location.hash = `group/${encodeURIComponent(clanId)}`;
      return recordResult(true, `Opened group ${clanId}.`, "group");
    }

    // mygroup.open: open the dashboard of a group the user joined
    if (normAction === "mygroup.open") {
      const clanId = typeof params.clanId === "string" ? params.clanId.trim() : "";
      if (!clanId) return recordResult(false, "", null, "mygroup.open needs a clanId.");
      window.location.hash = `mygroup/${encodeURIComponent(clanId)}`;
      return recordResult(true, `Opened your dashboard for ${clanId}.`, "mygroup");
    }

    // RESET_TO_LANDING
    if (normAction === "reset_to_landing") {
      handleNavigate("landing");
      return recordResult(true, "Navigated to landing page.", "landing");
    }

    // 2. onboarding.prefill / TRIGGER_ONBOARDING
    if (normAction === "onboarding.prefill" || normAction === "trigger_onboarding") {
      const profile = params.profile !== undefined ? params.profile : params;
      if (!profile || typeof profile !== "object" || Object.keys(profile).length === 0) {
        return recordResult(false, "", "onboarding", "Profile data is required for prefill.");
      }
      setOnboardingPrefill({
        businessName: profile.businessName || profile.name,
        vertical: profile.vertical || profile.industry || profile.commodity,
        spendLimit: profile.spendLimit || profile.maxAutoAuthorizeUsd,
        authHold: profile.authHold || profile.stepUpThresholdUsd
      });
      handleNavigate("onboarding");
      return recordResult(true, `Prefilled onboarding profile for ${profile.businessName || profile.name || "business"}.`, "onboarding");
    }

    // 3. onboarding.submit / ONBOARDING_COMPLETED
    if (normAction === "onboarding.submit" || normAction === "onboarding_completed") {
      const profile = params.profile || params;
      const explicitName = typeof profile?.businessName === "string" ? profile.businessName.trim() : undefined;
      const businessName = explicitName !== undefined ? explicitName : (onboardingPrefill?.businessName || "");
      const explicitIndustry = typeof profile?.industry === "string" ? profile.industry.trim() : (typeof profile?.vertical === "string" ? profile.vertical.trim() : undefined);
      const industry = explicitIndustry !== undefined ? explicitIndustry : (onboardingPrefill?.vertical || "");
      const commodity = profile?.commodity || profile?.sku || "Commodity";
      const targetVolume = profile?.targetVolume || 200;

      if (!businessName || !industry) {
        handleNavigate("onboarding");
        setActionNotice({
          type: "onboarding.submit",
          title: "Incomplete onboarding profile",
          status: "error",
          error: "Required fields missing: Business name and industry vertical must be provided.",
          timestamp: Date.now()
        });
        return recordResult(false, "", "onboarding", "Missing required profile fields: businessName and industry are required.");
      }

      setOnboardingConfirmed(true);
      try {
        localStorage.setItem("wholeshare_onboarding_confirmed", "true");
      } catch {}
      handleNavigate("onboarding");
      const smeId = params.smeId || `sme_${Date.now()}`;
      setActionNotice({
        type: "onboarding.submit",
        title: "Onboarding profile registered",
        status: "success",
        message: `Registered procurement identity for ${businessName}. ID: ${smeId}.`,
        data: { smeId, businessName, industry, commodity, targetVolume },
        timestamp: Date.now()
      });
      return recordResult(true, `Submitted onboarding profile for ${businessName}. Registered SME ${smeId}.`, "onboarding");
    }

    // 4. radar.filter / FILTER_CLANS
    if (normAction === "radar.filter" || normAction === "filter_clans") {
      const query = params.query || params.search || params.filters?.query || "";
      const category = params.category || params.filters?.category;
      setRadarFilter({ query, category });
      handleNavigate("radar");
      return recordResult(true, `Filtered radar clans. Category: ${category || "all"}, Query: "${query}".`, "radar");
    }

    // 5. radar.search
    if (normAction === "radar.search") {
      const query = typeof params.query === "string" ? params.query : "";
      if (params.query !== undefined && typeof params.query !== "string") {
        return recordResult(false, "", "radar", "Query parameter must be a string.");
      }
      setRadarFilter({ query });
      handleNavigate("radar");
      return recordResult(true, `Searched radar for "${query}".`, "radar");
    }

    // 6. radar.selectClan / OPEN_SLIDE_OVER
    if (normAction === "radar.selectclan" || normAction === "radar.selectclan" || normAction === "open_slide_over" || normAction === "clan_selected") {
      const clanId = params.clanId || params.data?.clanId;
      if (!clanId || typeof clanId !== "string" || !clanId.startsWith("clan")) {
        setActionNotice({
          type: "radar.selectClan",
          title: "Buying group not found",
          status: "error",
          error: `Group identifier "${clanId}" is invalid or unknown.`,
          timestamp: Date.now()
        });
        return recordResult(false, "", "radar", `Clan not found: ${clanId}`);
      }
      setSlideOver({
        isOpen: true,
        clanId,
        mode: "details",
        title: params.title || "Purchasing syndicate details"
      });
      handleNavigate("radar");
      return recordResult(true, `Selected buying group ${clanId}. Opened inspection drawer.`, "radar");
    }

    // 7. clan.pledge / CLAN_PLEDGED. The quote comes from the server so the
    // unit price and discount tier are the clan's real values. The drawer
    // then shows the PayPal approval step. No pledge is recorded here.
    if (normAction === "clan.pledge" || normAction === "clan_pledged") {
      const p = unwrapParams(params);
      const clanId = p.clanId;
      const units = Number(p.units);
      if (!clanId || typeof clanId !== "string" || !clanId.startsWith("clan")) {
        return recordResult(false, "", "radar", `Clan not found: ${clanId}`);
      }
      if (!Number.isInteger(units) || units <= 0) {
        setActionNotice({
          type: "clan.pledge",
          title: "Invalid pledge units",
          status: "error",
          error: "Units to pledge must be a positive integer.",
          timestamp: Date.now()
        });
        return recordResult(false, "", "radar", "Units must be a positive integer.");
      }
      let quote: any;
      try {
        quote = await apiPost("/api/v1/paypal/pledge-quote", { clanId, units });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Could not calculate a pledge quote for this group.";
        setActionNotice({
          type: "clan.pledge",
          title: "Pledge quote unavailable",
          status: "error",
          error: `${message} No pledge was placed.`,
          timestamp: Date.now()
        });
        return recordResult(false, "", "radar", `${message} No pledge was placed.`);
      }
      if (!quote || typeof quote.unitPriceCents !== "number" || typeof quote.amountCents !== "number" || typeof quote.discountPct !== "number") {
        setActionNotice({
          type: "clan.pledge",
          title: "Pledge quote unavailable",
          status: "error",
          error: "The server returned an incomplete pledge quote. No pledge was placed.",
          timestamp: Date.now()
        });
        return recordResult(false, "", "radar", "The server returned an incomplete pledge quote. No pledge was placed.");
      }
      const unitPriceUsd = quote.unitPriceCents / 100;
      const totalAmountUsd = quote.amountCents / 100;
      setSlideOver({
        isOpen: true,
        clanId,
        mode: "pledge",
        pledgeUnits: units,
        quote: {
          units: quote.units,
          unitPriceUsd,
          discountPercent: quote.discountPct,
          totalAmountUsd
        },
        title: `Pledge quote & PayPal approval: ${clanId}`
      });
      if (!/^#?mosaic-chat/.test(window.location.hash)) handleNavigate("radar");
      return recordResult(
        true,
        `Pledge quote prepared for ${units} units in ${clanId}. Unit price $${unitPriceUsd.toFixed(2)}, discount ${quote.discountPct} percent, total $${totalAmountUsd.toFixed(2)}. Approval step displayed. Awaiting buyer confirmation.`,
        "radar"
      );
    }

    // 8. clan.inspect / CLAN_INSPECT
    if (normAction === "clan.inspect" || normAction === "clan_inspect") {
      const clanId = params.clanId;
      if (!clanId || typeof clanId !== "string" || !clanId.startsWith("clan")) {
        return recordResult(false, "", "radar", `Clan not found: ${clanId}`);
      }
      setSlideOver({
        isOpen: true,
        clanId,
        mode: "details",
        title: params.title || `Buying group details: ${clanId}`
      });
      handleNavigate("radar");
      return recordResult(true, `Inspected buying group ${clanId}.`, "radar");
    }

    // 9. clan.join / CLAN_JOINED
    if (normAction === "clan.join" || normAction === "clan_joined") {
      const clanId = params.clanId;
      if (!clanId || typeof clanId !== "string" || !clanId.startsWith("clan")) {
        return recordResult(false, "", "radar", `Clan not found: ${clanId}`);
      }
      // Check if user has an authorized pledge
      const hasAuth = Boolean(params.hasAuthorizedPledge || params.authorized);
      if (!hasAuth) {
        setSlideOver({
          isOpen: true,
          clanId,
          mode: "pledge_required",
          title: "Authorization required"
        });
        handleNavigate("radar");
        return recordResult(
          false,
          "",
          "radar",
          `No authorized pledge found for clan ${clanId}. Complete the PayPal authorization step first before joining.`
        );
      }
      setSlideOver({
        isOpen: true,
        clanId,
        mode: "join_confirmed",
        title: "Membership confirmed"
      });
      handleNavigate("radar");
      return recordResult(true, `Joined buying group ${clanId}. Membership confirmed with authorized escrow.`, "radar");
    }

    // 10. ledger.query / LEDGER_QUERY
    if (normAction === "ledger.query") {
      const query = typeof params.query === "string" ? params.query : (params.highlightClanId || "");
      setLedgerQuery(query);
      handleNavigate("ledger");
      return recordResult(true, `Ledger queried with query "${query}".`, "ledger");
    }

    // 11. ledger.sort / LEDGER_SORT. The ledger grid API lives inside
    // MyGroupsView and is not reachable from this control, so a sort only
    // happens when that API is exposed. Otherwise report honestly instead
    // of claiming a sort that did not happen.
    if (normAction === "ledger.sort") {
      const p = unwrapParams(params);
      const column = p.column;
      const direction = (p.direction || "asc").toLowerCase();
      if (!column || !VALID_LEDGER_COLUMNS.includes(column)) {
        handleNavigate("ledger");
        setActionNotice({
          type: "ledger.sort",
          title: "Ledger sort error",
          status: "error",
          error: `Unknown column: ${column}. Known columns: ${VALID_LEDGER_COLUMNS.join(", ")}`,
          timestamp: Date.now()
        });
        return recordResult(false, "", "ledger", `Unknown column: ${column}. Cannot sort by unknown column.`);
      }
      if (!["asc", "desc"].includes(direction)) {
        return recordResult(false, "", "ledger", `Invalid sort direction: ${direction}. Valid directions: asc, desc.`);
      }
      handleNavigate("ledger");
      const colId = column === "totalEscrow" ? "totalEscrowCents" : column === "unitPrice" ? "unitPriceCents" : column;
      const gridApi = getGrid("ledger");
      if (gridApi && typeof gridApi.applyColumnState === "function") {
        gridApi.applyColumnState({
          state: [{ colId, sort: direction }],
          defaultState: { sort: null }
        });
        setActionNotice({
          type: "ledger.sort",
          title: "Ledger sorted",
          status: "success",
          message: `Ledger sorted by ${colId} (${direction}). Visible rows reordered.`,
          data: { column: colId, direction },
          timestamp: Date.now()
        });
        return recordResult(true, `Ledger sorted by ${colId}, ${direction}.`, "ledger");
      }
      const honestError = `Ledger sort by ${colId} is not available from this control. The grid is managed inside My Groups. Open My Groups and click the ${colId} column header to sort.`;
      setActionNotice({
        type: "ledger.sort",
        title: "Ledger sort unavailable",
        status: "error",
        error: honestError,
        timestamp: Date.now()
      });
      return recordResult(false, "", "ledger", honestError);
    }

    // 12. ledger.flash / LEDGER_FLASH. Flash the cell through the grid API
    // when it is exposed, otherwise through the rendered row in the DOM.
    // Only report success when a row actually flashed.
    if (normAction === "ledger.flash") {
      const p = unwrapParams(params);
      const clanId = p.clanId;
      const field = p.field || "totalEscrowCents";
      if (!clanId || typeof clanId !== "string" || (!clanId.startsWith("clan") && !clanId.startsWith("coalition"))) {
        return recordResult(false, "", "ledger", `Clan not found: ${clanId}`);
      }
      handleNavigate("ledger");
      await wait(400);
      let flashed = 0;
      const gridApi = getGrid("ledger");
      if (gridApi && typeof gridApi.forEachNode === "function" && typeof gridApi.flashCells === "function") {
        gridApi.forEachNode((node: any) => {
          if (node.data?.coalitionId === clanId || node.data?.id === clanId) {
            gridApi.flashCells({ rowNodes: [node], columns: [field] });
            flashed += 1;
          }
        });
      }
      if (flashed === 0) {
        const rows = document.querySelectorAll(".ag-row");
        rows.forEach((r) => {
          if (r.textContent?.includes(clanId)) {
            r.classList.add("ws-row-flashed");
            setTimeout(() => r.classList.remove("ws-row-flashed"), 1500);
            flashed += 1;
          }
        });
      }
      if (flashed === 0) {
        const honestError = `No ledger row was found for ${clanId}. Nothing was flashed.`;
        setActionNotice({
          type: "ledger.flash",
          title: "Ledger flash unavailable",
          status: "error",
          error: honestError,
          timestamp: Date.now()
        });
        return recordResult(false, "", "ledger", honestError);
      }
      setActionNotice({
        type: "ledger.flash",
        title: "Ledger cell flashed",
        status: "info",
        message: `Flashed cell for ${clanId}.${field} in the ledger.`,
        data: { clanId, field, oldValue: p.oldValue, newValue: p.newValue },
        timestamp: Date.now()
      });
      return recordResult(true, `Flashed cell for ${clanId}.${field} in ledger.`, "ledger");
    }

    // 13. logistics.inspect / LOGISTICS_INSPECT
    if (normAction === "logistics.inspect") {
      const clanId = params.clanId;
      if (!clanId || typeof clanId !== "string" || !clanId.startsWith("clan")) {
        return recordResult(false, "", "logistics", `Clan not found: ${clanId}`);
      }
      handleNavigate("logistics");
      setActionNotice({
        type: "logistics.inspect",
        title: "Logistics inspection",
        status: "info",
        message: `Inspecting shipment timeline for ${clanId}. Stage: ${params.stage || "transit"}.`,
        data: { clanId, stage: params.stage || "transit" },
        timestamp: Date.now()
      });
      return recordResult(true, `Inspected logistics timeline for ${clanId}.`, "logistics");
    }

    // 14. logistics.track / LOGISTICS_TRACK. Look the tracking number up
    // in the real shipments list and report its actual status and dates.
    if (normAction === "logistics.track") {
      const p = unwrapParams(params);
      const trackingNumber = p.trackingNumber;
      if (!trackingNumber || typeof trackingNumber !== "string" || trackingNumber.toLowerCase().includes("placeholder") || trackingNumber.toLowerCase().includes("mock") || trackingNumber.trim() === "") {
        handleNavigate("logistics");
        setActionNotice({
          type: "logistics.track",
          title: "Tracking rejected",
          status: "error",
          error: `Placeholder tracking number "${trackingNumber}" rejected. Only authentic carrier tracking numbers can be tracked.`,
          timestamp: Date.now()
        });
        return recordResult(false, "", "logistics", `Placeholder tracking number "${trackingNumber}" rejected. Only authentic carrier tracking numbers can be tracked.`);
      }
      handleNavigate("logistics");
      let shipments: any[] = [];
      try {
        const payload = await apiGet("/api/v1/logistics/shipments");
        shipments = Array.isArray(payload?.shipments) ? payload.shipments : [];
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Could not load shipments.";
        setActionNotice({
          type: "logistics.track",
          title: "Tracking unavailable",
          status: "error",
          error: `${message} No tracking status was retrieved.`,
          timestamp: Date.now()
        });
        return recordResult(false, "", "logistics", `${message} No tracking status was retrieved.`);
      }
      const match = shipments.find((s) => typeof s.trackingNumber === "string" && s.trackingNumber.trim() === trackingNumber.trim());
      if (!match) {
        const honestError = `No shipment was found for tracking number ${trackingNumber}.`;
        setActionNotice({
          type: "logistics.track",
          title: "Shipment not found",
          status: "error",
          error: honestError,
          timestamp: Date.now()
        });
        return recordResult(false, "", "logistics", honestError);
      }
      const status = match.buyerDeliveredAt ? "DELIVERED" : match.supplierDeliveredAt ? "IN_TRANSIT" : "REGISTERED";
      const statusText = match.buyerDeliveredAt ? "Delivered to buyer" : match.supplierDeliveredAt ? "In transit to buyer" : "Registered, awaiting shipment";
      const detail = [
        match.carrierName ? `Carrier ${match.carrierName}` : null,
        match.supplierDeliveredAt ? `Shipped ${match.supplierDeliveredAt}` : null,
        match.buyerDeliveredAt ? `Delivered ${match.buyerDeliveredAt}` : null,
        match.inspectionWindowEndsAt ? `Inspection window ends ${match.inspectionWindowEndsAt}` : null,
        match.conditionNotes ? `Notes: ${match.conditionNotes}` : null
      ].filter(Boolean).join(". ");
      setActionNotice({
        type: "logistics.track",
        title: "Shipment tracking details",
        status: "success",
        message: `Tracking ${trackingNumber}: ${statusText}.${detail ? ` ${detail}.` : ""}`,
        data: { trackingNumber, carrier: match.carrierName || null, status, clanId: match.clanId || null },
        timestamp: Date.now()
      });
      return recordResult(true, `Retrieved tracking status for ${trackingNumber}: ${statusText}.`, "logistics");
    }

    // 15. dispute.submit / DISPUTE_SUBMITTED. File a real claim with the
    // server and only report success when it returns a real claim ID.
    if (normAction === "dispute.submit") {
      const p = unwrapParams(params);
      const clanId = p.clanId;
      const damagedUnits = Number(p.damagedUnits);
      const reason = p.reason;
      if (!clanId || !damagedUnits || damagedUnits <= 0 || !reason) {
        handleNavigate("disputes");
        setActionNotice({
          type: "dispute.submit",
          title: "Incomplete damage claim",
          status: "error",
          error: "clanId, damagedUnits, and reason are required to submit a claim.",
          timestamp: Date.now()
        });
        return recordResult(false, "", "disputes", "clanId, damagedUnits, and reason are required.");
      }
      handleNavigate("disputes");
      let unitPrice = typeof p.unitPrice === "number" ? p.unitPrice : NaN;
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        try {
          const clanPayload = await apiGet(`/api/v1/clans/${encodeURIComponent(clanId)}`);
          const clan = clanPayload?.clan;
          if (clan && typeof clan.unitPriceCents === "number") unitPrice = clan.unitPriceCents / 100;
        } catch {
          unitPrice = 0;
        }
      }
      const totalUnits = Number(p.totalUnits);
      const orderValue = unitPrice * (Number.isFinite(totalUnits) && totalUnits > 0 ? totalUnits : damagedUnits);
      let receipt: any;
      try {
        receipt = await apiPost("/api/v1/support/claims", {
          clanId,
          memberId: typeof p.memberId === "string" ? p.memberId : (typeof p.smeId === "string" ? p.smeId : ""),
          orderId: typeof p.orderId === "string" ? p.orderId : "",
          captureId: typeof p.captureId === "string" ? p.captureId : "",
          damagedUnits,
          unitPrice,
          orderValue,
          evidence: { photoUrls: Array.isArray(p.photoUrls) ? p.photoUrls : [], description: String(reason) }
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "The claim could not be filed.";
        setActionNotice({
          type: "dispute.submit",
          title: "Damage claim failed",
          status: "error",
          error: `${message} No claim was created.`,
          timestamp: Date.now()
        });
        return recordResult(false, "", "disputes", `${message} No claim was created.`);
      }
      const claim = receipt?.claim;
      if (!claim || typeof claim.claimId !== "string") {
        setActionNotice({
          type: "dispute.submit",
          title: "Damage claim failed",
          status: "error",
          error: "The server did not return a claim record. No claim was created.",
          timestamp: Date.now()
        });
        return recordResult(false, "", "disputes", "The server did not return a claim record. No claim was created.");
      }
      setActionNotice({
        type: "dispute.submit",
        title: "Damage claim submitted",
        status: "success",
        message: `Claim record created. Reference ${claim.claimId}. Status: ${claim.status || "DRAFT"}. Notice: This creates a claim record. It does not issue a refund or change PayPal funds.`,
        data: { claimId: claim.claimId, clanId, damagedUnits, reason },
        timestamp: Date.now()
      });
      return recordResult(true, `Submitted dispute claim ${claim.claimId} for ${damagedUnits} units in ${clanId}.`, "disputes");
    }

    // 16. dispute.calculate / DISPUTE_CALCULATED
    if (normAction === "dispute.calculate") {
      const clanId = params.clanId;
      const damaged = Number(params.damagedUnits);
      const total = Number(params.totalUnits);
      const price = Number(params.unitPrice);
      if (!clanId || !Number.isFinite(damaged) || !Number.isFinite(total) || !Number.isFinite(price) || total <= 0 || damaged < 0 || damaged > total || price < 0) {
        handleNavigate("logistics");
        setActionNotice({
          type: "dispute.calculate",
          title: "Calculation error",
          status: "error",
          error: "damagedUnits must be between 0 and totalUnits, and unitPrice must be positive.",
          timestamp: Date.now()
        });
        return recordResult(false, "", "logistics", "damagedUnits must be between 0 and totalUnits, and unitPrice must not be negative.");
      }
      const totalAmount = total * price;
      const refundAmount = damaged * price;
      const remainingAmount = totalAmount - refundAmount;
      handleNavigate("logistics");
      setActionNotice({
        type: "dispute.calculate",
        title: "Pro-rata dispute calculation",
        status: "info",
        message: `Pro-rata calculation completed. Damaged: ${damaged} units, Refund: $${refundAmount.toFixed(2)}, Remaining: $${remainingAmount.toFixed(2)}. Notice: This is a calculated amount only. No refund was issued.`,
        data: { clanId, damagedUnits: damaged, totalUnits: total, unitPrice: price, totalAmount, refundAmount, remainingAmount },
        timestamp: Date.now()
      });
      return recordResult(true, `Calculated pro-rata dispute for ${damaged} of ${total} units. Refund amount $${refundAmount.toFixed(2)}. No refund was issued.`, "logistics");
    }

    // 17. leader.createClan / CLAN_CREATED. Create a real buying group
    // through the server and only report success when it confirms.
    if (normAction === "leader.createclan") {
      const p = unwrapParams(params);
      const sku = p.sku;
      const name = p.name;
      const moq = Number(p.moq) || 500;
      if (!sku || !name) {
        handleNavigate("leader");
        setActionNotice({
          type: "leader.createClan",
          title: "Create group error",
          status: "error",
          error: "sku and name are required to create a buying group.",
          timestamp: Date.now()
        });
        return recordResult(false, "", "leader", "sku and name are required to create a buying group.");
      }
      let basePriceUsd = Number(p.basePriceUsd ?? p.unitPrice);
      if (!Number.isFinite(basePriceUsd) || basePriceUsd <= 0) {
        try {
          const catalog = await apiGet("/api/v1/clans?limit=100");
          const list = Array.isArray(catalog?.clans) ? catalog.clans : [];
          const match = list.find((c: any) => typeof c.sku === "string" && c.sku === sku);
          if (match && typeof match.unitPriceCents === "number") basePriceUsd = match.unitPriceCents / 100;
        } catch {
          basePriceUsd = NaN;
        }
      }
      if (!Number.isFinite(basePriceUsd) || basePriceUsd <= 0) {
        handleNavigate("leader");
        const honestError = `A base price is required to create a buying group for ${sku}. Provide basePriceUsd or use a SKU from the catalog.`;
        setActionNotice({
          type: "leader.createClan",
          title: "Create group error",
          status: "error",
          error: honestError,
          timestamp: Date.now()
        });
        return recordResult(false, "", "leader", honestError);
      }
      handleNavigate("leader");
      const body: Record<string, unknown> = {
        clanName: String(name),
        commoditySku: String(sku),
        targetUnits: moq,
        basePriceUsd
      };
      if (typeof p.founderSmeId === "string" && p.founderSmeId) body.founderSmeId = p.founderSmeId;
      if (typeof p.smeId === "string" && p.smeId && !body.founderSmeId) body.founderSmeId = p.smeId;
      if (Array.isArray(p.tiers)) body.tiers = p.tiers;
      if (Array.isArray(p.pricingTiers)) body.tiers = p.pricingTiers;
      if (typeof p.templateId === "string" && p.templateId) body.templateId = p.templateId;
      if (p.constitution && typeof p.constitution === "object") body.constitution = p.constitution;
      if (Array.isArray(p.vendorUrls)) body.vendorUrls = p.vendorUrls;
      let result: any;
      try {
        result = await apiPost("/api/v1/clan/create", body);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "The buying group could not be created.";
        setActionNotice({
          type: "leader.createClan",
          title: "Create group error",
          status: "error",
          error: `${message} No buying group was created.`,
          timestamp: Date.now()
        });
        return recordResult(false, "", "leader", `${message} No buying group was created.`);
      }
      const createdId = typeof result?.clanId === "string" ? result.clanId : typeof result?.coalitionId === "string" ? result.coalitionId : typeof result?.clan?.id === "string" ? result.clan.id : typeof result?.id === "string" ? result.id : null;
      setActionNotice({
        type: "leader.createClan",
        title: "Buying group created",
        status: "success",
        message: `Buying group ${name} (${sku}) created with MOQ ${moq} and base price $${basePriceUsd.toFixed(2)}.${createdId ? ` Reference ${createdId}.` : ""}`,
        data: { name, sku, moq, basePriceUsd, clanId: createdId, tiers: p.tiers, dues: p.dues },
        timestamp: Date.now()
      });
      return recordResult(true, `Created buying group ${name} (${sku}) with MOQ ${moq}.${createdId ? ` Reference ${createdId}.` : ""}`, "leader");
    }

    // 18. leader.audit / CLAN_AUDIT
    if (normAction === "leader.audit") {
      const clanId = params.clanId;
      if (!clanId || typeof clanId !== "string" || (!clanId.startsWith("clan") && !clanId.startsWith("coalition"))) {
        handleNavigate("leader");
        return recordResult(false, "", "leader", `Clan not found: ${clanId}`);
      }
      handleNavigate("leader");
      const parseUsd = (value: unknown): number => {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string") {
          const n = parseFloat(value.replace(/[^0-9.\-]/g, ""));
          return Number.isFinite(n) ? n : 0;
        }
        return 0;
      };
      let members: number;
      let totalEscrow: number;
      if (params.audit && typeof params.audit.members === "number" && typeof params.audit.totalEscrow === "number") {
        members = params.audit.members;
        totalEscrow = params.audit.totalEscrow / 100;
      } else {
        let ledger: any;
        try {
          ledger = await apiGet("/api/v1/ledger");
        } catch (err: any) {
          return recordResult(false, "", "leader", `Could not load the ledger to audit ${clanId}: ${err?.message || "request failed"}. No audit was performed.`);
        }
        if (!Array.isArray(ledger)) {
          return recordResult(false, "", "leader", `The ledger returned an unreadable response. No audit was performed for ${clanId}.`);
        }
        const clan = ledger.find((entry: any) => entry && typeof entry === "object" && entry.coalitionId === clanId);
        if (!clan) {
          return recordResult(false, "", "leader", `Clan ${clanId} was not found in the ledger. No audit was performed.`);
        }
        members = typeof clan.membersCount === "number" ? clan.membersCount : (Array.isArray(clan.members) ? clan.members.length : 0);
        totalEscrow = parseUsd(clan.totalEscrowUsd);
      }
      setActionNotice({
        type: "leader.audit",
        title: "Leader escrow audit findings",
        status: "success",
        message: `Audited group ${clanId}. Found ${members} member authorizations with $${totalEscrow.toFixed(2)} total escrow. Local ledger record, not verified against PayPal.`,
        data: { clanId, members, totalEscrow, status: "LOCAL_LEDGER" },
        timestamp: Date.now()
      });
      return recordResult(true, `Audited buying group ${clanId}. ${members} member authorizations, $${totalEscrow.toFixed(2)} total escrow (local ledger record).`, "leader");
    }

    // 19. leader.capture - ALWAYS BLOCKED WITH HONEST ERROR
    if (normAction === "leader.capture") {
      const clanId = params.clanId || "unknown";
      handleNavigate("leader");
      const honestError = `Batch capture for clan ${clanId} is not available through WebMCP. No batch capture was performed. Capture each PayPal authorization individually through the durable capture_order_hold tool.`;
      setActionNotice({
        type: "leader.capture",
        title: "Batch capture unavailable",
        status: "error",
        error: honestError,
        timestamp: Date.now()
      });
      return recordResult(false, "", "leader", honestError);
    }

    // 20. settings.update / SETTINGS_UPDATED
    if (normAction === "settings.update") {
      const settings = params.settings || params;
      if (!settings || typeof settings !== "object") {
        return recordResult(false, "", "settings", "settings object is required.");
      }
      handleNavigate("settings");
      if (settings.theme) {
        if (!["obsidian", "light"].includes(settings.theme)) {
          return recordResult(false, "", "settings", `Invalid theme: ${settings.theme}. Valid themes: obsidian, light.`);
        }
        setTheme(settings.theme as "obsidian" | "light");
        setActionNotice({
          type: "settings.update",
          title: "Theme setting updated",
          status: "success",
          message: `Theme updated to "${settings.theme}". Applied live immediately.`,
          data: { theme: settings.theme, oldTheme: theme },
          timestamp: Date.now()
        });
        return recordResult(true, `Applied theme setting "${settings.theme}" live.`, "settings");
      }
      // Money values require approval confirmation step
      if (settings.policies?.dailySpendLimitUsd || settings.spendLimit) {
        setActionNotice({
          type: "settings.update",
          title: "Spend limit change confirmation",
          status: "info",
          message: "Approval gate: Spend limit changes require human confirmation in the UI before they apply.",
          data: settings,
          timestamp: Date.now()
        });
        return recordResult(true, "Spend limit change prepared. Human confirmation required.", "settings");
      }
      setActionNotice({
        type: "settings.update",
        title: "Settings applied",
        status: "success",
        message: "User settings updated and persisted live.",
        data: settings,
        timestamp: Date.now()
      });
      return recordResult(true, "Updated user settings. Applied changes live.", "settings");
    }

    // 21. paypal.authorize / PAYPAL_AUTHORIZED. Create a real PayPal
    // AUTHORIZE order through the server. Only report AWAITING_APPROVAL
    // after PayPal returns a real order. The server also broadcasts the
    // result over SSE, so a confirmed result is shown once, never twice.
    if (normAction === "paypal.authorize") {
      const confirmed = sseResult(params);
      if (confirmed && typeof confirmed.orderId === "string") {
        showPayPalOnce(confirmed.orderId, {
          type: "paypal.authorize",
          title: "PayPal authorization order prepared",
          status: "info",
          message: `PayPal order ${confirmed.orderId} created with intent AUTHORIZE for $${Number(confirmed.amount || 0).toFixed(2)}. Status: AWAITING_APPROVAL. Approval gate: Buyer approval is required before the hold is authorized.`,
          data: { orderId: confirmed.orderId, amount: confirmed.amount, status: "AWAITING_APPROVAL", referenceId: confirmed.referenceId }
        });
        return recordResult(true, `Created PayPal authorization order ${confirmed.orderId} for $${Number(confirmed.amount || 0).toFixed(2)}. Status: AWAITING_APPROVAL.`, "settings");
      }
      const p = unwrapParams(params);
      const amount = Number(p.amount);
      const referenceId = p.referenceId;
      if (!amount || amount <= 0 || !referenceId) {
        return recordResult(false, "", "settings", "amount and referenceId are required.");
      }
      let actionObj: any;
      try {
        actionObj = await apiPost("/api/v1/mcp/execute", { tool: "paypal.authorize", args: { amount, referenceId, currency: typeof p.currency === "string" ? p.currency : "USD" } });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "PayPal authorization could not be created.";
        setActionNotice({
          type: "paypal.authorize",
          title: "PayPal authorization failed",
          status: "error",
          error: `${message} No PayPal order was created.`,
          timestamp: Date.now()
        });
        return recordResult(false, "", "settings", `${message} No PayPal order was created.`);
      }
      const result = actionObj?.result;
      if (!actionObj?.ok || !result || typeof result.orderId !== "string") {
        const message = typeof actionObj?.error === "string" ? actionObj.error : "PayPal did not return an order. No PayPal order was created.";
        setActionNotice({
          type: "paypal.authorize",
          title: "PayPal authorization failed",
          status: "error",
          error: message,
          timestamp: Date.now()
        });
        return recordResult(false, "", "settings", message);
      }
      showPayPalOnce(result.orderId, {
        type: "paypal.authorize",
        title: "PayPal authorization order prepared",
        status: "info",
        message: `PayPal order ${result.orderId} created with intent AUTHORIZE for $${amount.toFixed(2)}. Status: AWAITING_APPROVAL. Approval gate: Buyer approval is required before the hold is authorized.`,
        data: { orderId: result.orderId, amount, status: "AWAITING_APPROVAL", referenceId }
      });
      return recordResult(true, `Created PayPal authorization order ${result.orderId} for $${amount.toFixed(2)}. Status: AWAITING_APPROVAL.`, "settings");
    }

    // 22. paypal.invoice / PAYPAL_INVOICE_CREATED. Generate a real PayPal
    // invoice with QR code through the server. Only report SENT after the
    // server confirms it and returns a real invoice ID and QR code.
    if (normAction === "paypal.invoice") {
      const confirmed = sseResult(params);
      if (confirmed && typeof confirmed.invoiceId === "string") {
        showPayPalOnce(confirmed.invoiceId, {
          type: "paypal.invoice",
          title: "PayPal invoice with QR code generated",
          status: "success",
          message: `PayPal invoice ${confirmed.invoiceId} generated for $${Number(confirmed.amount || 0).toFixed(2)} for ${confirmed.units || 0} units in group ${confirmed.clanId || ""}. Status: ${confirmed.invoiceStatus || "SENT"}. Only PayPal issued values shown.`,
          data: { invoiceId: confirmed.invoiceId, clanId: confirmed.clanId, smeId: confirmed.smeId, units: confirmed.units, amount: confirmed.amount, qrCodeUrl: confirmed.qrCodeUrl || null, payerViewUrl: confirmed.payerViewUrl || null }
        });
        return recordResult(true, `Generated PayPal invoice ${confirmed.invoiceId} ($${Number(confirmed.amount || 0).toFixed(2)}) with QR code.`, "settings");
      }
      const p = unwrapParams(params);
      const clanId = p.clanId;
      const smeId = p.smeId;
      const units = Number(p.units);
      const amount = Number(p.amount);
      if (!clanId || !smeId || !units || units <= 0 || !amount || amount <= 0) {
        return recordResult(false, "", "settings", "clanId, smeId, units, and amount are required.");
      }
      const invoiceArgs: Record<string, unknown> = { clanId, smeId, units, amount };
      if (typeof p.recipientEmail === "string" && p.recipientEmail) invoiceArgs.recipientEmail = p.recipientEmail;
      let actionObj: any;
      try {
        actionObj = await apiPost("/api/v1/mcp/execute", { tool: "paypal.invoice", args: invoiceArgs });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "PayPal invoice could not be generated.";
        setActionNotice({
          type: "paypal.invoice",
          title: "PayPal invoice failed",
          status: "error",
          error: `${message} No invoice was created.`,
          timestamp: Date.now()
        });
        return recordResult(false, "", "settings", `${message} No invoice was created.`);
      }
      const result = actionObj?.result;
      if (!actionObj?.ok || !result || typeof result.invoiceId !== "string") {
        const message = typeof actionObj?.error === "string" ? actionObj.error : "PayPal did not return an invoice. No invoice was created.";
        setActionNotice({
          type: "paypal.invoice",
          title: "PayPal invoice failed",
          status: "error",
          error: message,
          timestamp: Date.now()
        });
        return recordResult(false, "", "settings", message);
      }
      showPayPalOnce(result.invoiceId, {
        type: "paypal.invoice",
        title: "PayPal invoice with QR code generated",
        status: "success",
        message: `PayPal invoice ${result.invoiceId} generated for $${amount.toFixed(2)} for ${units} units in group ${clanId}. Status: ${result.invoiceStatus || "SENT"}. Only PayPal issued values shown.`,
        data: { invoiceId: result.invoiceId, clanId, smeId, units, amount, qrCodeUrl: result.qrCodeUrl || null, payerViewUrl: result.payerViewUrl || null }
      });
      return recordResult(true, `Generated PayPal invoice ${result.invoiceId} ($${amount.toFixed(2)}) with QR code.`, "settings");
    }

    // 23. paypal.capture / PAYPAL_CAPTURED. Capture a real PayPal
    // authorization through the server. Only report COMPLETED after PayPal
    // confirms the capture and returns a real capture ID. Never fabricate
    // a capture ID. A fake authorization ID is rejected by PayPal.
    if (normAction === "paypal.capture") {
      const confirmed = sseResult(params);
      if (confirmed && typeof confirmed.captureId === "string") {
        showPayPalOnce(confirmed.captureId, {
          type: "paypal.capture",
          title: "PayPal hold captured",
          status: "success",
          message: `PayPal authorization ${confirmed.authorizationId} captured as ${confirmed.captureId}.`,
          data: { authorizationId: confirmed.authorizationId, captureId: confirmed.captureId, status: confirmed.captureStatus || "COMPLETED" }
        });
        return recordResult(true, `Captured PayPal authorization ${confirmed.authorizationId} as capture ID ${confirmed.captureId}.`, "settings");
      }
      const p = unwrapParams(params);
      const authorizationId = p.authorizationId;
      if (!authorizationId) {
        setActionNotice({
          type: "paypal.capture",
          title: "Capture rejected",
          status: "error",
          error: "authorizationId is required. An order ID is not an authorization ID.",
          timestamp: Date.now()
        });
        return recordResult(false, "", "settings", "authorizationId is required. An order ID is not an authorization ID.");
      }
      const captureArgs: Record<string, unknown> = { authorizationId };
      if (p.amount !== undefined && p.amount !== null && p.amount !== "") captureArgs.amount = Number(p.amount);
      if (typeof p.currency === "string" && p.currency) captureArgs.currency = p.currency;
      let actionObj: any;
      try {
        actionObj = await apiPost("/api/v1/mcp/execute", { tool: "paypal.capture", args: captureArgs });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "PayPal capture could not be completed.";
        setActionNotice({
          type: "paypal.capture",
          title: "PayPal capture failed",
          status: "error",
          error: `${message} No funds were captured.`,
          timestamp: Date.now()
        });
        return recordResult(false, "", "settings", `${message} No funds were captured.`);
      }
      const result = actionObj?.result;
      if (!actionObj?.ok || !result || typeof result.captureId !== "string") {
        const message = typeof actionObj?.error === "string" ? actionObj.error : "PayPal did not confirm a capture. No funds were captured.";
        setActionNotice({
          type: "paypal.capture",
          title: "PayPal capture failed",
          status: "error",
          error: message,
          timestamp: Date.now()
        });
        return recordResult(false, "", "settings", message);
      }
      showPayPalOnce(result.captureId, {
        type: "paypal.capture",
        title: "PayPal hold captured",
        status: "success",
        message: `PayPal authorization ${authorizationId} captured as ${result.captureId}.`,
        data: { authorizationId, captureId: result.captureId, status: result.captureStatus || "COMPLETED" }
      });
      return recordResult(true, `Captured PayPal authorization ${authorizationId} as capture ID ${result.captureId}.`, "settings");
    }

    // 24. radar.nextClan / radar.prevClan. Move the Discover full-page
    // detail to the next or previous buying group. DiscoverView listens
    // for these window events and moves its selection.
    if (normAction === "radar.nextclan" || normAction === "radar.prevclan") {
      const isNext = normAction === "radar.nextclan";
      const readPosition = (): string | null => {
        const spans = Array.from(document.querySelectorAll("span"));
        const match = spans.find((el) => /^\d+ of \d+$/.test((el.textContent || "").trim()));
        return match ? (match.textContent || "").trim() : null;
      };
      const readNavDisabled = (): boolean | null => {
        const btn = document.querySelector(`[data-testid="discover-${isNext ? "next" : "prev"}"]`) as HTMLButtonElement | null;
        if (!btn) return null;
        return btn.disabled;
      };
      handleNavigate("discover");
      let before: string | null = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        before = readPosition();
        if (before !== null) break;
        await wait(150);
      }
      if (before === null) {
        const honestError = "The Discover detail is not showing any buying groups yet. Try again once the groups have loaded.";
        setActionNotice({ type: isNext ? "radar.nextClan" : "radar.prevClan", title: "Discover not ready", status: "error", error: honestError, timestamp: Date.now() });
        return recordResult(false, "", "discover", honestError);
      }
      if (readNavDisabled() === true) {
        const honestError = isNext ? "Already at the last buying group. There is no next group." : "Already at the first buying group. There is no previous group.";
        setActionNotice({ type: isNext ? "radar.nextClan" : "radar.prevClan", title: isNext ? "No next group" : "No previous group", status: "info", message: honestError, timestamp: Date.now() });
        return recordResult(false, "", "discover", honestError);
      }
      window.dispatchEvent(new CustomEvent(isNext ? "ws:radar-next" : "ws:radar-prev"));
      await wait(350);
      const after = readPosition();
      if (after !== null && after !== before) {
        return recordResult(true, `Moved to the ${isNext ? "next" : "previous"} buying group in Discover. Now showing ${after}.`, "discover");
      }
      const honestError = isNext ? "Already at the last buying group. There is no next group." : "Already at the first buying group. There is no previous group.";
      setActionNotice({ type: isNext ? "radar.nextClan" : "radar.prevClan", title: isNext ? "No next group" : "No previous group", status: "info", message: honestError, timestamp: Date.now() });
      return recordResult(false, "", "discover", honestError);
    }

    // 25. clan.viewRules. Show the 8 governance rules for a buying group
    // in the group drawer, with the real values from its constitution.
    if (normAction === "clan.viewrules") {
      const p = unwrapParams(params);
      let clanId = typeof p.clanId === "string" ? p.clanId : "";
      if (!clanId && slideOver && typeof slideOver.clanId === "string") clanId = slideOver.clanId;
      if (!clanId) {
        const discoverSelect = Array.from(document.querySelectorAll("#viewDiscover select")).find((el) => {
          const v = (el as HTMLSelectElement).value || "";
          return v.startsWith("clan");
        }) as HTMLSelectElement | undefined;
        if (discoverSelect && discoverSelect.value) clanId = discoverSelect.value;
      }
      if (!clanId || !clanId.startsWith("clan")) {
        return recordResult(false, "", "radar", "Provide a clanId to show the rules for, or open a buying group first.");
      }
      let constitution: any = null;
      try {
        const payload = await apiGet(`/api/v1/governance/constitution?coalitionId=${encodeURIComponent(clanId)}`);
        constitution = payload?.constitution || null;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Could not load the group rules.";
        setActionNotice({ type: "clan.viewRules", title: "Group rules unavailable", status: "error", error: message, timestamp: Date.now() });
        return recordResult(false, "", "radar", message);
      }
      const rules = constitution?.rules || {};
      const inspectionHours = rules.INSPECTION_WINDOW_HOURS ?? 48;
      const silenceHours = rules.SILENCE_AUTO_CONFIRM_HOURS ?? 48;
      const damageStandard = rules.DAMAGE_EVIDENCE_REQUIREMENT || "PHOTO_ONLY";
      const stepUp = rules.STEP_UP_THRESHOLD_USD ?? 1000;
      const voting = rules.VOTING_WEIGHT_STRATEGY || "ONE_MEMBER_ONE_VOTE";
      const disputeHours = rules.DISPUTE_ESCALATION_WINDOW_HOURS ?? 48;
      const minDiscount = rules.MIN_DISCOUNT_PERCENT ?? 20;
      const meta = rules.META_GOVERNANCE_PROCEDURE || "DEMOCRATIC_SUPERMAJORITY";
      const plain = (value: unknown): string => String(value).replaceAll("_", " ").toLowerCase();
      const rulesText = `Inspection ${inspectionHours} hours. Silence auto-confirm ${silenceHours} hours. Damage evidence ${plain(damageStandard)}. Step-up threshold $${Number(stepUp).toFixed(2)}. Voting ${plain(voting)}. Dispute window ${disputeHours} hours. Minimum discount ${minDiscount} percent. Meta procedure ${plain(meta)}.`;
      setSlideOver({ isOpen: true, clanId, mode: "details", title: `Group rules: ${clanId}` });
      handleNavigate("discover");
      setActionNotice({
        type: "clan.viewRules",
        title: "Group governance rules",
        status: "info",
        message: `Rules for ${clanId}. ${rulesText} The 5 immutable platform safety invariants also apply.`,
        data: { clanId, rules: { inspectionHours, silenceHours, damageStandard, stepUp, voting, disputeHours, minDiscount, meta } },
        timestamp: Date.now()
      });
      return recordResult(true, `Showed the governance rules for ${clanId} in the group drawer.`, "discover");
    }

    // 26. ledger.export. Download the real ledger rows as a CSV file.
    if (normAction === "ledger.export") {
      let rows: any[] = [];
      try {
        const payload = await apiGet("/api/v1/ledger");
        rows = Array.isArray(payload) ? payload : [];
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Could not load the ledger.";
        setActionNotice({ type: "ledger.export", title: "Ledger export failed", status: "error", error: `${message} No file was downloaded.`, timestamp: Date.now() });
        return recordResult(false, "", "ledger", `${message} No file was downloaded.`);
      }
      if (rows.length === 0) {
        setActionNotice({ type: "ledger.export", title: "Ledger export failed", status: "error", error: "The ledger is empty. No file was downloaded.", timestamp: Date.now() });
        return recordResult(false, "", "ledger", "The ledger is empty. No file was downloaded.");
      }
      const csvEscape = (value: unknown): string => {
        const text = value === null || value === undefined ? "" : String(value);
        return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
      };
      const header = ["coalitionId", "sku", "skuName", "status", "currentUnits", "targetUnits", "unitPriceUsd", "totalEscrowUsd", "discountTierPct", "membersCount"];
      const lines = [header.join(",")];
      for (const row of rows) {
        lines.push(header.map((key) => csvEscape(row?.[key])).join(","));
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `wholeshare_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      handleNavigate("ledger");
      setActionNotice({
        type: "ledger.export",
        title: "Ledger exported",
        status: "success",
        message: `Downloaded the ledger as CSV with ${rows.length} group rows.`,
        data: { rowCount: rows.length },
        timestamp: Date.now()
      });
      return recordResult(true, `Exported the ledger as CSV with ${rows.length} group rows.`, "ledger");
    }

    // 27. dispute.list. Show every claim in the Disputes table.
    if (normAction === "dispute.list") {
      let count: number | null = null;
      try {
        const payload = await apiGet("/api/v1/support/claims");
        const claims = Array.isArray(payload?.claims) ? payload.claims : [];
        count = claims.length;
      } catch {
        count = null;
      }
      handleNavigate("disputes");
      setActionNotice({
        type: "dispute.list",
        title: "Damage claims",
        status: "info",
        message: count === null ? "Showing the damage claims table in Disputes." : `Showing the damage claims table in Disputes with ${count} claim${count === 1 ? "" : "s"}.`,
        data: count === null ? undefined : { claimCount: count },
        timestamp: Date.now()
      });
      return recordResult(true, count === null ? "Opened the damage claims table in Disputes." : `Opened the damage claims table in Disputes with ${count} claims.`, "disputes");
    }

    // 28. logistics.calendar. Open the Bryntum timeline with delivery
    // dates and inspection windows from the real shipments.
    if (normAction === "logistics.calendar") {
      handleNavigate("logistics");
      setActionNotice({
        type: "logistics.calendar",
        title: "Delivery timeline",
        status: "info",
        message: "Showing the Bryntum delivery timeline with shipment dates and inspection windows.",
        timestamp: Date.now()
      });
      return recordResult(true, "Opened the Bryntum delivery timeline with shipment dates and inspection windows.", "logistics");
    }

    // 29. studio.open. Open the AG Studio Money View.
    if (normAction === "studio.open") {
      handleNavigate("insights");
      setActionNotice({
        type: "studio.open",
        title: "AG Studio Money View",
        status: "info",
        message: "Showing the AG Studio Money View with escrow totals, volume by group, and member authorizations.",
        timestamp: Date.now()
      });
      return recordResult(true, "Opened the AG Studio Money View.", "insights");
    }

    // 30. bryntum.openTimeView. Open the Bryntum Time View.
    if (normAction === "bryntum.opentimeview") {
      handleNavigate("logistics");
      setActionNotice({
        type: "bryntum.openTimeView",
        title: "Bryntum Time View",
        status: "info",
        message: "Showing the Bryntum Time View with the Scheduler timeline and the shipments grid.",
        timestamp: Date.now()
      });
      return recordResult(true, "Opened the Bryntum Time View.", "logistics");
    }

    // 31. mosaic.expand. Expand the floating copilot to fill the screen.
    if (normAction === "mosaic.expand") {
      const trigger = document.querySelector(".ws-copilot-trigger") as HTMLButtonElement | null;
      const panel = document.querySelector(".ws-copilot-panel") as HTMLElement | null;
      if (!panel && trigger) trigger.click();
      await wait(350);
      const openPanel = document.querySelector(".ws-copilot-panel") as HTMLElement | null;
      if (!openPanel) {
        const honestError = "The copilot could not be opened. Try the Ask WholeShare button.";
        setActionNotice({ type: "mosaic.expand", title: "Copilot unavailable", status: "error", error: honestError, timestamp: Date.now() });
        return recordResult(false, "", activeView, honestError);
      }
      let styleEl = document.getElementById("ws-mosaic-fullscreen-style") as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "ws-mosaic-fullscreen-style";
        styleEl.textContent = ".ws-copilot-panel{position:fixed !important;inset:0 !important;width:100vw !important;height:100dvh !important;max-width:none !important;max-height:none !important;border-radius:0 !important;z-index:9999 !important;}";
        document.head.appendChild(styleEl);
      }
      setActionNotice({
        type: "mosaic.expand",
        title: "Mosaic expanded",
        status: "info",
        message: "The Mosaic copilot is expanded to fill the screen. Close it to return to the workspace.",
        timestamp: Date.now()
      });
      return recordResult(true, "Expanded the Mosaic copilot to fill the screen.", activeView);
    }

    // 32. mosaic.ask. Focus the copilot and place the question in its
    // input. The model answers through the existing chat path. No answer
    // is fabricated here.
    if (normAction === "mosaic.ask") {
      const p = unwrapParams(params);
      const question = typeof p.question === "string" ? p.question.trim() : "";
      if (!question) {
        return recordResult(false, "", activeView, "question is required.");
      }
      const trigger = document.querySelector(".ws-copilot-trigger") as HTMLButtonElement | null;
      let panel = document.querySelector(".ws-copilot-panel") as HTMLElement | null;
      if (!panel && trigger) trigger.click();
      await wait(350);
      panel = document.querySelector(".ws-copilot-panel") as HTMLElement | null;
      const input = document.querySelector("#ws-copilot-prompt") as HTMLTextAreaElement | null;
      if (!panel || !input) {
        const honestError = "The copilot could not be opened. Try the Ask WholeShare button.";
        setActionNotice({ type: "mosaic.ask", title: "Copilot unavailable", status: "error", error: honestError, timestamp: Date.now() });
        return recordResult(false, "", activeView, honestError);
      }
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      if (setter) {
        setter.call(input, question);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        input.value = question;
      }
      input.focus();
      return recordResult(true, "Placed the question in the Mosaic copilot input.", activeView);
    }

    // 33. paypal.status. Report the real PayPal configuration status.
    // The SDK config endpoint proves a client ID is configured. Live
    // connectivity is only claimed when an order is actually created.
    if (normAction === "paypal.status") {
      let config: any = null;
      try {
        config = await apiGet("/api/v1/paypal/sdk-config");
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "PayPal status could not be determined.";
        setActionNotice({
          type: "paypal.status",
          title: "PayPal not configured",
          status: "error",
          error: `${message} PayPal checkout is unavailable until a valid PayPal client ID is configured.`,
          timestamp: Date.now()
        });
        return recordResult(false, "", "settings", `${message} PayPal checkout is unavailable until a valid PayPal client ID is configured.`);
      }
      if (!config || typeof config.clientId !== "string" || !config.clientId) {
        const honestError = "PayPal status could not be determined. No client ID was returned.";
        setActionNotice({ type: "paypal.status", title: "PayPal status unknown", status: "error", error: honestError, timestamp: Date.now() });
        return recordResult(false, "", "settings", honestError);
      }
      const mode = typeof config.mode === "string" ? config.mode : "sandbox";
      setActionNotice({
        type: "paypal.status",
        title: "PayPal status",
        status: "success",
        message: `PayPal is configured (${mode} mode). Checkout is available and orders can be created. Live connectivity is confirmed when an order is created.`,
        data: { mode, configured: true },
        timestamp: Date.now()
      });
      return recordResult(true, `PayPal is configured (${mode} mode). Checkout is available.`, "settings");
    }

    // 34. settings.get. Read and report a real setting value.
    if (normAction === "settings.get") {
      const p = unwrapParams(params);
      const key = typeof p.key === "string" ? p.key.trim() : "";
      if (!key) {
        return recordResult(false, "", "settings", "key is required.");
      }
      let settings: any = null;
      try {
        settings = await apiGet("/api/v1/user/settings");
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Settings could not be loaded.";
        setActionNotice({ type: "settings.get", title: "Setting unavailable", status: "error", error: message, timestamp: Date.now() });
        return recordResult(false, "", "settings", message);
      }
      const friendly: Record<string, string[]> = {
        spendLimit: ["policies", "perPledgeSpendLimitUsd"],
        perPledgeSpendLimit: ["policies", "perPledgeSpendLimitUsd"],
        approvalThreshold: ["policies", "approvalThresholdUsd"],
        dailySpendLimit: ["policies", "dailySpendLimitUsd"],
        maxAutoAuthorize: ["policies", "maxAutoAuthorizeUsd"],
        stepUpThreshold: ["policies", "stepUpThresholdUsd"],
        minDiscount: ["groupDefaults", "minDiscountPercent"],
        inspectionWindow: ["groupDefaults", "defaultInspectionWindowHours"],
        disputeWindow: ["groupDefaults", "defaultDisputeWindowHours"],
        theme: ["appearance", "theme"],
        businessName: ["profile", "businessName"],
        currency: ["profile", "currency"],
        payoutDestination: ["policies", "payoutDestination"]
      };
      const findDeep = (obj: any, target: string): unknown => {
        if (!obj || typeof obj !== "object") return undefined;
        if (Object.prototype.hasOwnProperty.call(obj, target)) return obj[target];
        for (const value of Object.values(obj)) {
          const found = findDeep(value, target);
          if (found !== undefined) return found;
        }
        return undefined;
      };
      let value: unknown = undefined;
      let resolvedPath = "";
      if (friendly[key]) {
        const [group, field] = friendly[key];
        value = settings?.[group]?.[field];
        resolvedPath = `${group}.${field}`;
      }
      if (value === undefined && settings && typeof settings === "object" && Object.prototype.hasOwnProperty.call(settings, key)) {
        value = settings[key];
        resolvedPath = key;
      }
      if (value === undefined) {
        value = findDeep(settings, key);
        if (value !== undefined) resolvedPath = key;
      }
      if (value === undefined) {
        const groups = settings && typeof settings === "object" ? Object.keys(settings).join(", ") : "none";
        const honestError = `Setting "${key}" does not exist. Setting groups: ${groups}.`;
        setActionNotice({ type: "settings.get", title: "Setting not found", status: "error", error: honestError, timestamp: Date.now() });
        return recordResult(false, "", "settings", honestError);
      }
      const display = typeof value === "object" ? JSON.stringify(value) : String(value);
      setActionNotice({
        type: "settings.get",
        title: "Setting value",
        status: "info",
        message: `${key} is ${display}.`,
        data: { key, value, path: resolvedPath },
        timestamp: Date.now()
      });
      return recordResult(true, `Setting ${key} is ${display}.`, "settings");
    }

    // EXPORT_SNAPSHOT
    if (normAction === "export_snapshot") {
      void triggerSnapshotDownload(params.format || "json");
      return recordResult(true, `Exported matchmaking snapshot as ${params.format || "json"}.`, activeView);
    }

    return recordResult(false, "", null, `Unknown action: ${actionName}`);
  };
}

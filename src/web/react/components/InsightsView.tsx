import React, { useCallback, useEffect, useRef, useState } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { AgStudioAiModule } from "ag-studio";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { AG_STUDIO_LICENSE_KEY } from "../agGridLicense";
import { wsStudioTheme } from "../theme/gridTheme";
import { buildMosaicStudioAi } from "../studioAiHarness";
import { registerStudioTools } from "../studioWebMcp";
import { fetchSourceRows, loadStudioData, StudioLoad, STUDIO_REPORT_STATE, type BusinessScope } from "../studioReports";

async function loadSavedState(): Promise<unknown | null> {
  try {
    const response = await fetch("/api/v1/studio/state", { headers: { accept: "application/json" } });
    const payload = (await response.json()) as { state?: unknown };
    return payload.state ?? null;
  } catch {
    return null;
  }
}

export const InsightsView: React.FC<{ page?: string }> = ({ page }) => {
  const [load, setLoad] = useState<StudioLoad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [initial, setInitial] = useState<unknown>(null);
  const [saved, setSaved] = useState<"none" | "saved" | "saving">("none");
  const [hasSaved, setHasSaved] = useState(false);
  const [pageId, setPageId] = useState<string>("");
  const [liveNote, setLiveNote] = useState<string>("Live");
  const [profile, setProfile] = useState<BusinessScope | null>(null);
  const [scope, setScope] = useState<"mine" | "all" | null>(null);
  const engineRef = useRef<{ applyTransaction: (tx: unknown) => Promise<unknown> } | null>(null);
  const known = useRef<Map<string, Map<string, string>>>(new Map());
  const studioToolsRelease = useRef<(() => void) | null>(null);
  useEffect(() => () => { studioToolsRelease.current?.(); studioToolsRelease.current = null; }, []);
  const apiRef = useRef<{ getState: () => unknown; setState: (state: unknown) => void; clearHistory?: () => void } | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/v1/user/settings").then((r) => r.json()).then((p: { profile?: { product?: string; city?: string } }) => {
      if (!live) return;
      const own = { product: String(p.profile?.product ?? "").trim(), city: String(p.profile?.city ?? "").trim() };
      setProfile(own.product || own.city ? own : null);
      setScope(own.product || own.city ? "mine" : "all");
    }).catch(() => { if (live) setScope("all"); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (scope === null) return;
    let cancelled = false;
    Promise.all([loadStudioData(scope === "mine" ? profile : null), loadSavedState()])
      .then(([studio, state]) => {
        if (cancelled) return;
        for (const source of (studio.data as { sources: Array<{ id: string; data: Array<Record<string, unknown>> }> }).sources) {
          known.current.set(source.id, new Map(source.data.map((row) => [String(row.id), JSON.stringify(row)])));
        }
        setLoad(studio);
        setHasSaved(Boolean(state));
        const base = (state ?? STUDIO_REPORT_STATE) as { pages?: Array<{ id: string; name: string }>; selectedPageId?: string };
        const wanted = page && base.pages?.find((entry) => entry.id === page || entry.name.toLowerCase().includes(page.toLowerCase()));
        const start = wanted ? { ...base, selectedPageId: wanted.id } : base;
        setInitial(start);
        setPageId(String(start.selectedPageId ?? base.pages?.[0]?.id ?? ""));
      })
      .catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load the data for reports."); });
    return () => { cancelled = true; };
  }, [page, scope, profile]);

  useEffect(() => {
    (window as unknown as { __wholeshareScreen?: unknown }).__wholeshareScreen = { view: "insights", editMode };
    return () => { (window as unknown as { __wholeshareScreen?: unknown }).__wholeshareScreen = undefined; };
  }, [editMode]);

  // Keep Studio in step with the platform. Each change (Mosaic or a person) becomes a Studio data transaction,
  // so widgets update in place with no reload.
  const refreshTables = useCallback(async (tables: string[]) => {
    const engine = engineRef.current;
    if (!engine) return;
    const transactions: Array<Record<string, unknown>> = [];
    for (const tableId of tables) {
      try {
        const fresh = await fetchSourceRows(tableId);
        const before = known.current.get(tableId) ?? new Map<string, string>();
        const next = new Map<string, string>();
        const add: unknown[] = [];
        const update: unknown[] = [];
        for (const row of fresh) {
          const key = String(row.id);
          const text = JSON.stringify(row);
          next.set(key, text);
          if (!before.has(key)) add.push(row);
          else if (before.get(key) !== text) update.push(row);
        }
        const remove = Array.from(before.keys()).filter((key) => !next.has(key));
        if (add.length || update.length || remove.length) transactions.push({ tableId, add, update, remove });
        known.current.set(tableId, next);
      } catch {
        // A failed refresh keeps the last good data on screen.
      }
    }
    if (transactions.length === 0) return;
    try {
      await engine.applyTransaction(transactions.length === 1 ? transactions[0] : transactions);
      setLiveNote(`Updated ${transactions.map((tx) => String(tx.tableId)).join(", ")} at ${new Date().toLocaleTimeString()}`);
    } catch {
      setLiveNote("Live updates paused");
    }
  }, []);

  useEffect(() => {
    const onData = (event: Event) => {
      const sources = (event as CustomEvent<{ sources?: string[] }>).detail?.sources ?? [];
      const tables = sources.map((name) => (name === "paypal_invoices" ? "invoices" : name));
      void refreshTables(tables);
    };
    window.addEventListener("ws:data-changed", onData);
    const timer = window.setInterval(() => { void refreshTables(["invoices"]); }, 30000);
    return () => { window.removeEventListener("ws:data-changed", onData); window.clearInterval(timer); };
  }, [refreshTables]);

  const save = useCallback(async () => {
    const state = apiRef.current?.getState();
    if (!state) return;
    setSaved("saving");
    await fetch("/api/v1/studio/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state }) });
    setHasSaved(true);
    setSaved("saved");
  }, []);

  const goToPage = useCallback((id: string) => {
    setPageId(id);
    const api = apiRef.current;
    if (!api) return;
    const state = api.getState() as { selectedPageId?: string };
    api.setState({ ...state, selectedPageId: id });
  }, []);

  const reset = useCallback(async () => {
    await fetch("/api/v1/studio/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: null }) });
    apiRef.current?.setState(STUDIO_REPORT_STATE);
    setPageId(String((STUDIO_REPORT_STATE as { selectedPageId?: string }).selectedPageId ?? ""));
    apiRef.current?.clearHistory?.();
    setHasSaved(false);
    setSaved("none");
  }, []);

  if (error) {
    return <section className="ws-insights"><Banner status="error" title="Reports could not load" description={error} collapsible={false} /></section>;
  }

  return (
    <section className="ws-insights" data-ws-view="insights">
      <header className="ws-insights-head">
        <div>
          <h1>Insights</h1>
          <p>Reports on PayPal invoices, holds, groups, deliveries and claims. Use Edit reports to change a chart, or ask Mosaic.</p>
        </div>
        <div className="ws-insights-actions">
          {load && <Badge variant="green" label={liveNote} />}
          {load && <Badge variant="blue" label={`${load.counts.groups.toLocaleString("en-US")} groups · ${load.counts.members.toLocaleString("en-US")} pledges · ${load.counts.invoices} PayPal invoices`} />}
          <Button variant="secondary" label={editMode ? "Done editing" : "Edit reports"} onClick={() => setEditMode((value) => !value)} />
          {editMode && <span className="lp-gold"><Button variant="primary" label={saved === "saving" ? "Saving" : saved === "saved" ? "Saved" : "Save my reports"} onClick={() => void save()} /></span>}
          {editMode && hasSaved && <Button variant="ghost" label="Reset to shipped reports" onClick={() => void reset()} />}
        </div>
      </header>

      {load?.invoiceError && <Banner status="warning" title="PayPal invoices are not in these reports" description={load.invoiceError} collapsible={false} />}

      {profile && (
        <SegmentedControl label="Data shown" value={scope ?? "all"} onChange={(value) => { setLoad(null); setScope(value as "mine" | "all"); }}>
          <SegmentedControlItem value="mine" label={`My business${profile.product ? `: ${profile.product}` : ""}${profile.city ? ` in ${profile.city}` : ""}`} />
          <SegmentedControlItem value="all" label="All groups" />
        </SegmentedControl>
      )}

      {load && initial && (
        <SegmentedControl label="Report page" value={pageId} onChange={goToPage}>
          {((initial as { pages?: Array<{ id: string; name: string }> }).pages ?? []).map((entry) => (
            <SegmentedControlItem key={entry.id} value={entry.id} label={entry.name} />
          ))}
        </SegmentedControl>
      )}

      <div className="ws-insights-stage">
        {!load || !initial ? (
          <Skeleton height={560} />
        ) : (
          <AgStudioProvider modules={[AgStudioAiModule]} licenseKey={AG_STUDIO_LICENSE_KEY}>
            <AgStudio
              style={{ height: "100%", width: "100%" }}
              data={load.data as never}
              theme={wsStudioTheme}
              layout={{ widgetBorderEnabled: true }}
              mode={editMode ? "edit" : "view"}
              panels={{ edit: { left: ["data", "filters"], right: ["edit", "ai"] }, view: { left: [], right: ["ai"] } }}
              initialState={initial as never}
              onApiReady={(event) => {
                apiRef.current = event.api as never;
                engineRef.current = ((event.api as unknown as { getDataEngine?: () => unknown }).getDataEngine?.() ?? null) as never;
                (window as unknown as { __studioApi?: unknown }).__studioApi = event.api;
                studioToolsRelease.current?.();
                try { studioToolsRelease.current = registerStudioTools(event.api as never); } catch { studioToolsRelease.current = null; }
              }}
              ai={(params) => buildMosaicStudioAi(params.api) as never}
            />
          </AgStudioProvider>
        )}
      </div>
    </section>
  );
};

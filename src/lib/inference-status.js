import { durableHarness } from "./durable-harness.js";
import { getModelSpend, friendlyModelError } from "./model-client.js";
import { mosaicProvider } from "./mosaic-config.js";

// A real probe of the model, so the landing page can say how long Mosaic takes to wake and respond.
// It makes one tiny request to the provider. Nothing here is cached or invented: the times are the measured ones.
const FRESH_MS = 5 * 60 * 1000;
const MIN_GAP_MS = 20 * 1000;

const state = { phase: "idle", startedAt: 0, readyAt: 0, lastMs: null, coldMs: null, error: "", errorKind: "", probes: 0, lastProbeAt: 0, refreshing: false };

// A key the provider rejected will not fix itself. Anything else, such as a slow reply, is retried.
const keyProblem = (error) => /HTTP (401|403|402)|insufficient|credit|billing/i.test(String(error?.message ?? error));

function probe() {
  if (state.phase === "warming" || state.refreshing) return;
  if (Date.now() - state.lastProbeAt < MIN_GAP_MS) return;
  // A model that already answered stays "ready" while it is checked again, so the chip never claims it is waking when it is not.
  const background = state.phase === "ready";
  if (background) state.refreshing = true;
  else { state.phase = "warming"; state.startedAt = Date.now(); }
  const started = Date.now();
  state.lastProbeAt = started;
  durableHarness.warmUp()
    .then(() => {
      const ms = Date.now() - started;
      state.lastMs = ms;
      if (!background || state.coldMs === null) state.coldMs = ms;
      state.probes += 1;
      state.readyAt = Date.now();
      state.error = "";
      state.errorKind = "";
      state.phase = "ready";
      state.refreshing = false;
    })
    .catch((error) => {
      state.refreshing = false;
      // One missed check after a good answer is not an outage. Keep showing ready and try again later.
      if (background && !keyProblem(error)) return;
      state.phase = "error";
      state.errorKind = keyProblem(error) ? "key" : "slow";
      state.error = friendlyModelError(error);
    });
}

// Called at boot so the first visitor finds the model already awake.
export function startInferenceProbe() {
  probe();
}

export function getInferenceStatus() {
  const stale = state.phase === "ready" && Date.now() - state.readyAt > FRESH_MS;
  if (state.phase === "idle" || state.phase === "error" || stale) probe();
  const spend = getModelSpend();
  const provider = mosaicProvider();
  return {
    phase: state.phase,
    provider: provider === "fireworks" ? "Fireworks AI" : provider,
    mode: provider === "fireworks" ? "serverless" : "dedicated",
    model: String(process.env.MOSAIC_MODEL_NAME || "").split("/").pop() || "",
    elapsedMs: state.phase === "warming" ? Date.now() - state.startedAt : null,
    lastMs: state.lastMs,
    coldMs: state.coldMs,
    readyAt: state.readyAt ? new Date(state.readyAt).toISOString() : null,
    calls: spend.calls,
    error: state.phase === "error" ? state.error : "",
    errorKind: state.phase === "error" ? state.errorKind : ""
  };
}

import { durableHarness } from "./durable-harness.js";
import { getModelSpend } from "./model-client.js";
import { mosaicProvider } from "./mosaic-config.js";

// A real probe of the model, so the landing page can say how long Mosaic takes to wake and respond.
// It makes one tiny request to the provider. Nothing here is cached or invented: the times are the measured ones.
const FRESH_MS = 5 * 60 * 1000;
const MIN_GAP_MS = 20 * 1000;

const state = { phase: "idle", startedAt: 0, readyAt: 0, lastMs: null, coldMs: null, error: "", probes: 0, lastProbeAt: 0 };

function probe(wake = true) {
  if (state.phase === "warming") return;
  if (Date.now() - state.lastProbeAt < MIN_GAP_MS) return;
  state.phase = "warming";
  state.startedAt = Date.now();
  state.lastProbeAt = state.startedAt;
  state.error = "";
  durableHarness.warmUp()
    .then(() => {
      const ms = Date.now() - state.startedAt;
      state.lastMs = ms;
      // A probe after boot or after a quiet period shows the wake-up time. Others show the warm response time.
      if (wake) state.coldMs = ms;
      state.probes += 1;
      state.readyAt = Date.now();
      state.phase = "ready";
    })
    .catch((error) => {
      state.phase = "error";
      state.error = String(error?.message ?? "The model did not answer.").slice(0, 160);
    });
}

// Called at boot so the first visitor finds the model already awake.
export function startInferenceProbe() {
  probe();
}

export function getInferenceStatus() {
  const stale = state.phase === "ready" && Date.now() - state.readyAt > FRESH_MS;
  if (state.phase === "idle" || state.phase === "error" || stale) probe(true);
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
    error: state.phase === "error" ? state.error : ""
  };
}

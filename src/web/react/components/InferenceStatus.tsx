import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, Zap } from "lucide-react";

interface Status {
  phase: "idle" | "warming" | "ready" | "error";
  provider: string;
  mode: string;
  model: string;
  elapsedMs: number | null;
  lastMs: number | null;
  coldMs: number | null;
  calls: number;
  error: string;
  errorKind?: string;
}

const seconds = (ms: number | null): string => (ms === null ? "" : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`);

// Tells the visitor what is happening behind Mosaic: serverless inference that wakes on demand.
// The numbers come from a real request to the provider, measured by the server.
export const InferenceStatus: React.FC = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [toast, setToast] = useState(false);
  const was = useRef<string>("");

  useEffect(() => {
    let live = true;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const next = (await (await fetch("/api/v1/mosaic/status")).json()) as Status;
        if (!live) return;
        if (was.current && was.current !== "ready" && next.phase === "ready") {
          setToast(true);
          window.setTimeout(() => setToast(false), 6000);
        }
        was.current = next.phase;
        setStatus(next);
        timer = window.setTimeout(tick, next.phase === "ready" ? 30000 : 1500);
      } catch {
        if (live) timer = window.setTimeout(tick, 5000);
      }
    };
    void tick();
    return () => { live = false; window.clearTimeout(timer); };
  }, []);

  if (!status) return null;
  const ready = status.phase === "ready";
  const failed = status.phase === "error";
  return (
    <>
      <div className="lp-infer" data-state={status.phase} role="status" aria-live="polite">
        <span className="lp-infer-icon" aria-hidden="true">{ready ? <CheckCircle2 size={18} /> : failed ? <Zap size={18} /> : <LoaderCircle size={18} className="lp-spin" />}</span>
        <div className="lp-infer-text">
          <strong>{ready ? "Mosaic is awake" : failed ? (status.errorKind === "key" ? "Mosaic needs attention" : "Mosaic is resting") : `Waking Mosaic${status.elapsedMs !== null ? ` · ${seconds(status.elapsedMs)}` : ""}`}</strong>
          <span>
            {ready
              ? `${status.provider} serverless inference${status.model ? ` · ${status.model}` : ""} · replies in about ${seconds(status.lastMs)}${status.coldMs ? ` · woke in ${seconds(status.coldMs)}` : ""}`
              : failed
                ? (status.errorKind === "key" ? status.error : "The model did not answer just now. You can keep browsing, and it retries on its own.")
                : "Serverless inference loads the model on demand, so the first request after a quiet period takes a little longer. Mosaic opens up as soon as it answers."}
          </span>
        </div>
        {!ready && !failed && <span className="lp-infer-bar" aria-hidden="true"><i /></span>}
      </div>
      {toast && <div className="lp-infer-toast" role="status">Mosaic is awake. Ask it anything.</div>}
    </>
  );
};

import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { AlertTriangle, Check, Globe, Grid3x3, CalendarRange, BarChart3, Wallet, Sparkles } from "lucide-react";
import { toolMeta, ToolSystem } from "../toolMeta";

export interface TraceItem {
  key: string;
  tool?: string;
  label: string;
  pending: boolean;
  ok: boolean;
  href?: string;
  detail?: string;
  startedAt?: number;
}

const ICONS: Record<ToolSystem, React.ReactNode> = {
  kernel: <Globe size={16} />,
  paypal: <Wallet size={16} />,
  grid: <Grid3x3 size={16} />,
  bryntum: <CalendarRange size={16} />,
  studio: <BarChart3 size={16} />,
  app: <Sparkles size={16} />
};

const TINT: Record<ToolSystem, { bg: string; fg: string }> = {
  kernel: { bg: "#E8F7FA", fg: "#0E7F8E" },
  paypal: { bg: "#EBF4FA", fg: "#0070BA" },
  grid: { bg: "#EEF6EE", fg: "#2A7A44" },
  bryntum: { bg: "#F1EEFB", fg: "#6B4FD0" },
  studio: { bg: "#FFF4D6", fg: "#7A5600" },
  app: { bg: "#F4EFEB", fg: "#0F1F2E" }
};

function useTick(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export const ToolTrace: React.FC<{ items: TraceItem[] }> = ({ items }) => {
  const now = useTick(items.some((item) => item.pending));
  const root = useRef<HTMLDivElement | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!root.current) return;
    const fresh = Array.from(root.current.querySelectorAll<HTMLElement>("[data-trace-row]")).filter((node) => !seen.current.has(node.dataset.traceRow ?? ""));
    fresh.forEach((node) => seen.current.add(node.dataset.traceRow ?? ""));
    if (fresh.length === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(fresh, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.32, ease: "power2.out", stagger: 0.06 });
  }, [items]);

  return (
    <div ref={root} className="ws-trace" role="list" aria-label="What Mosaic is doing">
      {items.map((item) => {
        const meta = toolMeta(item.tool);
        const tint = TINT[meta.system];
        return (
          <div key={item.key} data-trace-row={item.key} role="listitem" className={`ws-trace-row${item.pending ? " is-running" : ""}${!item.ok && !item.pending ? " is-failed" : ""}`}>
            <span className="ws-trace-icon" style={{ background: tint.bg, color: tint.fg }} aria-hidden="true">{ICONS[meta.system]}</span>
            <div className="ws-trace-body">
              <div className="ws-trace-head">
                <span className="ws-trace-system" style={{ color: tint.fg }}>{meta.systemLabel}</span>
                <b>{item.pending ? meta.running : item.label}</b>
              </div>
              <span className="ws-trace-why">{item.pending ? `${item.detail ?? meta.why}${item.startedAt && now - item.startedAt > 2500 ? ` (${Math.round((now - item.startedAt) / 1000)} s)` : ""}` : item.href ? <a href={item.href} target="_blank" rel="noreferrer">Open the link</a> : meta.why}</span>
            </div>
            <span className="ws-trace-state" aria-label={item.pending ? "Running" : item.ok ? "Done" : "Failed"}>
              {item.pending ? <span className="ws-trace-spinner" /> : item.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
            </span>
          </div>
        );
      })}
    </div>
  );
};

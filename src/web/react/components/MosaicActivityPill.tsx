import React, { useEffect, useSyncExternalStore } from "react";
import { getLiveState, startMosaicLive, subscribeLive } from "../mosaicLive";

export const MosaicActivityPill: React.FC = () => {
  useEffect(() => {
    startMosaicLive();
  }, []);
  const live = useSyncExternalStore(subscribeLive, getLiveState);
  if (!live.active && live.items.length === 0) return null;
  return (
    <aside className="ws-live" role="status" aria-live="polite" aria-label="Mosaic activity">
      <p className="ws-live-title">
        <span className={`ws-live-dot ${live.active ? "is-active" : ""}`} aria-hidden="true" />
        {live.active ? "Mosaic is working" : "Mosaic finished"}
      </p>
      <ul>
        {live.items.map((item) => (
          <li key={item.key} className={item.pending ? "is-pending" : item.ok ? "is-ok" : "is-failed"}>
            {item.label}
            {item.href && (
              <>
                {" "}
                <a href={item.href} target="_blank" rel="noopener noreferrer" className="ws-live-link">Open</a>
              </>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
};

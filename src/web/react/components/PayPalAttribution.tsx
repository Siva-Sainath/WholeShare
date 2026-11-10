import React, { useEffect, useState } from "react";

// PayPal glyph from Simple Icons (CC0). The PayPal name and mark remain trademarks of PayPal.
const PAYPAL_PATH =
  "M15.607 4.653H8.941L6.645 19.251H1.82L4.862 0h7.995c3.754 0 6.375 2.294 6.473 5.513-.648-.478-2.105-.86-3.722-.86m6.57 5.546c0 3.41-3.01 6.853-6.958 6.853h-2.493L11.595 24H6.74l1.845-11.538h3.592c4.208 0 7.346-3.634 7.153-6.949a5.24 5.24 0 0 1 2.848 4.686M9.653 5.546h6.408c.907 0 1.942.222 2.363.541-.195 2.741-2.655 5.483-6.441 5.483H8.714Z";

// Everything here runs against PayPal's sandbox unless the server is switched to live. Say so wherever PayPal appears.
export function usePayPalMode(): "sandbox" | "live" | null {
  const [mode, setMode] = useState<"sandbox" | "live" | null>(null);
  useEffect(() => {
    fetch("/api/v1/paypal/connect/status").then((response) => response.json()).then((payload: { mode?: string }) => setMode(payload.mode === "live" ? "live" : "sandbox")).catch(() => setMode(null));
  }, []);
  return mode;
}

export const SandboxBadge: React.FC = () => {
  const mode = usePayPalMode();
  if (mode !== "sandbox") return null;
  return <span className="ws-sandbox-badge" title="Every PayPal action in this app runs in PayPal's sandbox. No real money moves.">PayPal sandbox</span>;
};

export const PayPalMark: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={PAYPAL_PATH} fill="#003087" />
  </svg>
);

export const PayPalAttribution: React.FC<{ align?: "start" | "center" | "end" }> = ({ align = "center" }) => {
  const mode = usePayPalMode();
  return (
  <footer className="ws-paypal-lockup" aria-label="Payment platform attribution" style={{ justifyContent: align === "start" ? "flex-start" : align === "end" ? "flex-end" : "center" }}>
    <span className="ws-paypal-lockup-inner">
      <PayPalMark size={20} />
      <span>
        Payments powered by <b>PayPal</b>{mode === "sandbox" ? " (sandbox, no real money)" : ""}
      </span>
    </span>
  </footer>
  );
};

import React, { useCallback, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { PayPalMark } from "./PayPalAttribution";
import { disconnectPayPalApi, fetchPayPalConnection, PayPalConnection, startPayPalConnect } from "../api";

interface Props {
  /** Called right before the browser leaves for PayPal, so a flow can save its progress. */
  onBeforeRedirect?: () => void;
  /** Called when the connection state changes (loaded, connected, disconnected). */
  onChange?: (state: PayPalConnection) => void;
  /** Shown beside Connect, for flows where connecting is optional. */
  secondary?: React.ReactNode;
}

export const PayPalConnectCard: React.FC<Props> = ({ onBeforeRedirect, onChange, secondary }) => {
  const [state, setState] = useState<PayPalConnection | null>(null);
  const [error, setError] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("paypal") === "error" ? params.get("message") || "PayPal sign-in did not finish." : null;
  });
  const [busy, setBusy] = useState(false);
  const returnUrl = `${window.location.origin}/api/v1/paypal/connect/callback`;

  useEffect(() => {
    const reset = () => setBusy(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  const load = useCallback(() => {
    fetchPayPalConnection().then((value) => { setState(value); onChange?.(value); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not read the PayPal connection."));
  }, [onChange]);

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.has("paypal")) {
      params.delete("paypal");
      params.delete("message");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }
  }, [load]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const { authorizeUrl } = await startPayPalConnect();
      onBeforeRedirect?.();
      window.location.assign(authorizeUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start PayPal sign-in.");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const next = await disconnectPayPalApi();
      setState(next);
      onChange?.(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect PayPal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ws-connect-card">
      <div className="ws-connect-head">
        <span className="ws-connect-mark"><PayPalMark size={22} /></span>
        <div>
          <strong>{state?.connected ? "PayPal is connected" : "Connect your PayPal account"}</strong>
          <p>
            {state?.connected
              ? `Signed in as ${state.email || "your PayPal account"}. Money still moves only when you approve it in PayPal.`
              : "Sign in with PayPal so pledges, invoices and payouts use your account. WholeShare never sees your password."}
          </p>
        </div>
        {state?.connected && <Badge variant="green" label={state.mode === "live" ? "Live" : "Sandbox"} />}
      </div>
      {error && <Banner status="error" title="PayPal could not connect" description={error} isDismissable onDismiss={() => setError(null)} />}
      {state && !state.configured && <Banner status="warning" title="PayPal credentials are missing" description="Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET on the server." />}
      <div className="ws-connect-actions">
        {state?.connected ? (
          <Button variant="secondary" label={busy ? "Disconnecting" : "Disconnect"} isDisabled={busy} onClick={() => void disconnect()} />
        ) : (
          <Button variant="primary" label={busy ? "Opening PayPal" : "Connect with PayPal"} isDisabled={busy || (state !== null && !state.configured)} onClick={() => void connect()} />
        )}
        {secondary}
      </div>
      {!state?.connected && (
        <Collapsible defaultIsOpen={false} trigger={<span style={{ fontSize: 13 }}>PayPal says "invalid client_id or redirect_uri"?</span>}>
          <p style={{ margin: "6px 0", fontSize: 13 }}>
            In the PayPal developer dashboard, open this app, turn on Log in with PayPal, and add this Return URL exactly:
          </p>
          <code style={{ display: "block", padding: "8px 10px", background: "#F4EFEB", borderRadius: 8, fontSize: 12, wordBreak: "break-all" }}>{returnUrl}</code>
        </Collapsible>
      )}
    </div>
  );
};

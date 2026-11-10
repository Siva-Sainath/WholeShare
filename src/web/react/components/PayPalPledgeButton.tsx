import React, { useEffect, useRef, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Stepper, Step } from "@astryxdesign/core/Stepper";
import { authorizePayPalPledge, createPayPalPledgeOrder, fetchPledgeQuote, getPayPalSdkConfig, PayPalAuthorizationReceipt, PledgeQuote, runAgentTool } from "../api";

interface PayPalPaymentSession {
  start: (options: { presentationMode: "auto" }, createOrder: () => Promise<{ orderId: string }>) => Promise<void>;
}

interface PayPalEligibility {
  isEligible: (method: string) => boolean;
}

interface PayPalSdkInstance {
  findEligibleMethods: (options: { currencyCode: string }) => Promise<PayPalEligibility>;
  createPayPalOneTimePaymentSession: (options: {
    onApprove: (data: { orderId: string }) => Promise<void>;
    onCancel: () => void;
    onError: (error: Error) => void;
  }) => PayPalPaymentSession;
}

interface PayPalGlobal {
  createInstance: (options: { clientId: string; components: string[]; pageType: string }) => Promise<PayPalSdkInstance>;
}

declare global {
  interface Window { paypal?: PayPalGlobal; }
}

interface PayPalPledgeButtonProps {
  clanId: string;
  clanName: string;
  currency: string;
}

let sdkInstance: PayPalSdkInstance | null = null;
let sdkPromise: Promise<PayPalSdkInstance> | null = null;

function loadSdkScript(url: string): Promise<void> {
  if (window.paypal) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>("script[data-paypal-checkout-sdk]");
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("PayPal checkout could not load. Check your connection and try again.")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.dataset.paypalCheckoutSdk = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PayPal checkout could not load. Check your connection and try again."));
    document.head.append(script);
  });
}

async function getSdkInstance(): Promise<PayPalSdkInstance> {
  if (sdkInstance) return sdkInstance;
  if (sdkPromise) return sdkPromise;
  sdkPromise = (async () => {
    const config = await getPayPalSdkConfig();
    await loadSdkScript(config.sdkUrl);
    if (!window.paypal) throw new Error("PayPal checkout loaded without its payment interface.");
    const instance = await window.paypal.createInstance({ clientId: config.clientId, components: ["paypal-payments"], pageType: "checkout" });
    sdkInstance = instance;
    return instance;
  })();
  try {
    return await sdkPromise;
  } finally {
    sdkPromise = null;
  }
}

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amountCents / 100);
}

export const PayPalPledgeButton: React.FC<PayPalPledgeButtonProps> = ({ clanId, clanName, currency }) => {
  const buttonHost = useRef<HTMLDivElement>(null);
  const [businessName, setBusinessName] = useState("");
  const [units, setUnits] = useState(1);
  const [quote, setQuote] = useState<PledgeQuote | null>(null);
  const [receipt, setReceipt] = useState<PayPalAuthorizationReceipt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const businessNameRef = useRef(businessName);
  const unitsRef = useRef(units);
  const quoteRef = useRef(quote);
  const busyRef = useRef(busy);
  const receiptRef = useRef(receipt);
  businessNameRef.current = businessName;
  unitsRef.current = units;
  quoteRef.current = quote;
  busyRef.current = busy;
  receiptRef.current = receipt;

  useEffect(() => {
    let cancelled = false;
    setQuote(null);
    const timer = window.setTimeout(() => {
      void fetchPledgeQuote({ clanId, units }).then((nextQuote) => {
        if (!cancelled) {
          setQuote(nextQuote);
          setMessage(null);
        }
      }).catch((error: unknown) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not calculate this pledge.");
      });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [clanId, units]);

  useEffect(() => {
    let cancelled = false;
    let button: HTMLElement | null = null;
    let session: PayPalPaymentSession | null = null;

    void getSdkInstance().then(async (sdk) => {
      const eligibility = await sdk.findEligibleMethods({ currencyCode: currency });
      if (!eligibility.isEligible("paypal")) throw new Error("PayPal is not available for this account or currency.");
      if (cancelled || !buttonHost.current) return;

      session = sdk.createPayPalOneTimePaymentSession({
        onApprove: async ({ orderId }) => {
          busyRef.current = true;
          setBusy(true);
          setMessage("PayPal approved the order. Confirming the authorization…");
          try {
            const authorized = await authorizePayPalPledge(orderId);
            receiptRef.current = authorized;
            setReceipt(authorized);
            setMessage(null);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "PayPal authorization could not be confirmed. Contact support before retrying.");
          } finally {
            busyRef.current = false;
            setBusy(false);
          }
        },
        onCancel: () => {
          busyRef.current = false;
          setBusy(false);
          setMessage("PayPal checkout was cancelled. No pledge was recorded.");
        },
        onError: (error) => {
          busyRef.current = false;
          setBusy(false);
          setMessage(error.message || "PayPal checkout could not complete. Try again.");
        }
      });

      button = document.createElement("paypal-button");
      button.setAttribute("aria-label", "Continue with PayPal");
      button.addEventListener("click", () => {
        const activeQuote = quoteRef.current;
        const activeBusinessName = businessNameRef.current.trim();
        const activeUnits = unitsRef.current;
        if (!activeQuote || !activeBusinessName || !session || busyRef.current || receiptRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setMessage("Opening secure PayPal checkout…");
        void session.start({ presentationMode: "auto" }, (async () => {
          const order = await createPayPalPledgeOrder({ clanId, units: activeUnits, businessName: activeBusinessName });
          if (order.amountCents !== activeQuote.amountCents || order.currency !== activeQuote.currency) {
            throw new Error("The group quote changed. Review the updated total and try again.");
          }
          return { orderId: order.orderId };
        })()).catch((error: unknown) => {
          busyRef.current = false;
          setBusy(false);
          setMessage(error instanceof Error ? error.message : "PayPal checkout could not start.");
        });
      });
      buttonHost.current.append(button);
      setSdkReady(true);
    }).catch((error: unknown) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : "PayPal checkout is unavailable.");
    });

    return () => {
      cancelled = true;
      button?.remove();
      setSdkReady(false);
    };
  }, [clanId, currency]);

  const [step, setStep] = useState(0);
  const [invoice, setInvoice] = useState<{ number: string; qr: string } | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const needsStepUp = Boolean(quote && quote.amountCents >= 100000);
  const createStepUpInvoice = async () => {
    if (!quote) return;
    setInvoiceBusy(true);
    setMessage(null);
    try {
      const result = await runAgentTool("generate_step_up_invoice", { amountCents: quote.amountCents, buyerId: "sme_austin_01", memo: `Step-up for ${clanName}, ${quote.units} units` });
      setInvoice({ number: String(result.invoiceNumber ?? ""), qr: String(result.qrCodeUrl ?? "") });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the step-up invoice.");
    } finally {
      setInvoiceBusy(false);
    }
  };
  const total = quote ? formatMoney(quote.amountCents, quote.currency) : "Calculating…";
  const canContinue = step === 0 ? Boolean(businessName.trim() && quote) : step === 1 ? !needsStepUp || Boolean(invoice) : true;
  const stepNames = ["Order", "Review", "PayPal"];

  return <div className="ws-pledge-wizard" data-testid="paypal-pledge">
    <div className="ws-pledge-head">
      <h3>Join this buying group</h3>
      <p>{clanName}</p>
    </div>
    <Stepper activeStep={receipt ? 3 : step} label="Pledge progress" onStepClick={(index) => { if (!receipt && index <= step) setStep(index); }}>
      {stepNames.map((name, index) => <Step key={name} step={index} label={name} />)}
    </Stepper>

    <div className="ws-pledge-body" hidden={step !== 0 || Boolean(receipt)}>
      <label className="ws-paypal-field">Business name
        <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} autoComplete="organization" maxLength={120} />
      </label>
      <label className="ws-paypal-field">Units to pledge
        <input type="number" min="1" max="10000" step="1" value={units} onChange={(event) => setUnits(Math.max(1, Number(event.target.value) || 1))} />
      </label>
    </div>

    <div className="ws-pledge-summary" aria-live="polite">
      <div className="ws-pledge-row"><span>Units</span><span>{units}</span></div>
      <div className="ws-pledge-row"><span>Unit price</span><span>{quote ? formatMoney(quote.unitPriceCents, quote.currency) : "…"}</span></div>
      <div className="ws-pledge-row"><span>Tier discount</span><span>{quote ? `${quote.discountPct}%` : "…"}</span></div>
      <div className="ws-pledge-row ws-pledge-total"><span>PayPal authorization total</span><strong>{total}</strong></div>
    </div>

    <div className="ws-pledge-body" hidden={step !== 1 || Boolean(receipt)}>
      <p className="ws-paypal-pledge-note">Business: <strong>{businessName || "not entered"}</strong>. Nothing is charged now. PayPal places a hold only after you approve it, and the hold is captured only if the group reaches its order target.</p>
    </div>

    {step === 1 && !receipt && needsStepUp && (
      <div className="ws-pledge-stepup">
        <strong>Step-up verification</strong>
        <p>Pledges of $1,000 or more need a PayPal invoice before the hold. {invoice ? `Invoice ${invoice.number} is ready.` : "Create it now, then continue."}</p>
        {invoice?.qr.startsWith("data:image") && <img src={invoice.qr} alt={`PayPal QR code for invoice ${invoice.number}`} width={132} height={132} />}
        {!invoice && <Button variant="secondary" label={invoiceBusy ? "Creating invoice" : "Create PayPal invoice"} isDisabled={invoiceBusy} onClick={() => void createStepUpInvoice()} />}
      </div>
    )}

    <div className="ws-pledge-body" hidden={step !== 2 || Boolean(receipt)}>
      <p className="ws-paypal-pledge-note">PayPal first creates the order. Your funds are placed on hold only after you approve it with PayPal.</p>
    </div>
    <div className={`ws-paypal-button-host ${busy || !quote || !businessName.trim() || receipt ? "is-disabled" : ""}`} ref={buttonHost} hidden={step !== 2 || Boolean(receipt)} aria-label="PayPal checkout button" />

    {!receipt && step < 2 && (
      <div className="ws-pledge-actions">
        {step > 0 && <Button variant="secondary" label="Back" onClick={() => setStep(step - 1)} />}
        <span className="lp-gold"><Button variant="primary" label="Continue" isDisabled={!canContinue} onClick={() => setStep(step + 1)} /></span>
      </div>
    )}
    {!receipt && step === 2 && <div className="ws-pledge-actions"><Button variant="secondary" label="Back" onClick={() => setStep(1)} /></div>}
    {step === 2 && !sdkReady && !message && <p className="ws-paypal-status" role="status">Loading PayPal checkout…</p>}
    {message && <p className="ws-paypal-status" role={receipt ? "status" : "alert"}>{message}</p>}
    {receipt && <div className="ws-pledge-done"><span className="lp-gold"><Button variant="primary" label="Open My groups" onClick={() => { window.location.hash = "my-groups"; }} /></span></div>}
    {receipt && <Banner status="success" title="Pledge authorized" description={`PayPal confirmed the authorization. ${receipt.units} units are pledged to this group. Order ${receipt.orderId}.`} />}
  </div>;
};

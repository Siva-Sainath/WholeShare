import React, { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { fetchUserOverview, runAgentTool, UserOverview } from "../api";

const Gold: React.FC<React.ComponentProps<typeof Button>> = (props) => <Button {...props} variant={props.variant === "primary" ? "secondary" : props.variant} />;
const asText = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : "");
const dollarsToCents = (value: string) => Math.round(Number(value) * 100);

interface CardProps { title: string; note: string; children: React.ReactNode; result?: React.ReactNode; error?: string | null }
const ActionCard: React.FC<CardProps> = ({ title, note, children, result, error }) => (
  <article className="ws-hub-card ws-hub-action">
    <div><strong>{title}</strong><p className="ws-hub-sub">{note}</p></div>
    {children}
    {error && <Banner status="error" title="PayPal could not complete that" description={error} />}
    {result}
  </article>
);

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; type?: string }> = ({ label, value, onChange, type = "text" }) => (
  <label className="ws-hub-field">{label}<input type={type} value={value} onChange={(e) => onChange(e.target.value)} /></label>
);

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); } finally { setBusy(false); }
  };
  return { busy, error, run };
}

export const StepUpCard: React.FC = () => {
  const [amount, setAmount] = useState("1500");
  const [memo, setMemo] = useState("Pledge above the step-up threshold");
  const [out, setOut] = useState<{ number: string; qr: string; id: string } | null>(null);
  const { busy, error, run } = useAction();
  return (
    <ActionCard title="Step-up invoice" note="Pledges above $1,000 need a PayPal invoice the owner pays by QR before funds are held." error={error} result={out && (
      <div className="ws-hub-result"><Badge variant="blue" label={out.number} />{out.qr.startsWith("data:image") && <img className="ws-hub-qr" src={out.qr} alt={`PayPal QR for ${out.number}`} width={132} height={132} />}<p className="ws-hub-sub">Invoice {out.id} created in the PayPal sandbox.</p></div>
    )}>
      <Field label="Amount (USD)" value={amount} onChange={setAmount} type="number" />
      <Field label="Memo" value={memo} onChange={setMemo} />
      <Gold variant="primary" label={busy ? "Creating invoice" : "Create invoice"} isDisabled={busy || dollarsToCents(amount) < 100000} onClick={() => void run(async () => {
        const r = await runAgentTool("generate_step_up_invoice", { amountCents: dollarsToCents(amount), memo });
        setOut({ number: asText(r.invoiceNumber), qr: asText(r.qrCodeUrl), id: asText(r.invoiceId) });
      })} />
      {dollarsToCents(amount) < 100000 && <p className="ws-hub-sub">Step-up applies from $1,000.</p>}
    </ActionCard>
  );
};

export const SubscriptionCard: React.FC = () => {
  const [name, setName] = useState("WholeShare Monthly Group Dues");
  const [amount, setAmount] = useState("50");
  const [email, setEmail] = useState("");
  const [out, setOut] = useState<{ plan: string; sub?: string; approval?: string } | null>(null);
  const { busy, error, run } = useAction();
  return (
    <ActionCard title="Recurring group dues" note="Create a PayPal billing plan, then a subscription the member approves in PayPal." error={error} result={out && (
      <div className="ws-hub-result"><Badge variant="green" label={`Plan ${out.plan}`} />{out.sub && <p className="ws-hub-sub">Subscription {out.sub}</p>}{out.approval && <a className="ws-hub-link" href={out.approval} target="_blank" rel="noreferrer">Member approves in PayPal</a>}</div>
    )}>
      <Field label="Plan name" value={name} onChange={setName} />
      <Field label="Monthly amount (USD)" value={amount} onChange={setAmount} type="number" />
      <Field label="Subscriber PayPal email (optional)" value={email} onChange={setEmail} type="email" />
      <Gold variant="primary" label={busy ? "Creating" : email ? "Create plan and subscription" : "Create plan"} isDisabled={busy || !name.trim() || dollarsToCents(amount) <= 0} onClick={() => void run(async () => {
        const plan = await runAgentTool("create_subscription_plan", { name, amountCents: dollarsToCents(amount), intervalUnit: "MONTH" });
        const planId = asText(plan.planId);
        if (!email.trim()) { setOut({ plan: planId }); return; }
        const sub = await runAgentTool("create_subscription", { planId, subscriberEmail: email.trim() });
        setOut({ plan: planId, sub: asText(sub.subscriptionId), approval: asText(sub.approvalUrl) || undefined });
      })} />
    </ActionCard>
  );
};

export const PayoutCard: React.FC<{ overview: UserOverview | null; groupId?: string }> = ({ overview, groupId }) => {
  const [group, setGroup] = useState("");
  const [email, setEmail] = useState("");
  const [out, setOut] = useState<{ status: string; detail: string } | null>(null);
  const { busy, error, run } = useAction();
  const options = overview?.joinedClans ?? [];
  const chosen = groupId || group || options[0]?.clanId || "";
  return (
    <ActionCard title="Release supplier payout" note="PayPal Payouts release once the 48 hour window passed with no claim or dispute. WholeShare checks that first." error={error} result={out && (
      <div className="ws-hub-result"><Badge variant={out.status === "SUCCESS" ? "green" : "yellow"} label={out.status.replace(/_/g, " ").toLowerCase()} /><p className="ws-hub-sub">{out.detail}</p></div>
    )}>
      {!groupId && <label className="ws-hub-field">Group
        <select value={chosen} onChange={(e) => setGroup(e.target.value)}>{options.length === 0 && <option value="">No groups joined</option>}{options.map((g) => <option key={g.clanId} value={g.clanId}>{g.skuName}</option>)}</select>
      </label>}
      <Field label="Supplier PayPal email" value={email} onChange={setEmail} type="email" />
      <Gold variant="primary" label={busy ? "Checking eligibility" : "Check and release"} isDisabled={busy || !chosen || !email.includes("@")} onClick={() => void run(async () => {
        const r = await runAgentTool("settle_supplier_payout", { coalitionId: chosen, supplierEmail: email.trim() });
        const evaluation = typeof r.clanEvaluation === "object" && r.clanEvaluation ? JSON.stringify(r.clanEvaluation) : "";
        const payout = typeof r.payoutResult === "object" && r.payoutResult ? (r.payoutResult as Record<string, unknown>) : {};
        setOut({ status: asText(payout.status) || asText(r.status) || "UNKNOWN", detail: asText(payout.error) || evaluation.slice(0, 240) || "Payout evaluated." });
      })} />
    </ActionCard>
  );
};

export const CaptureCard: React.FC = () => {
  const [authId, setAuthId] = useState("");
  const [amount, setAmount] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  return (
    <ActionCard title="Capture an escrow hold" note="Turn an authorized PayPal hold into a payment once delivery is confirmed." error={error} result={out && <div className="ws-hub-result"><Badge variant="green" label="captured" /><p className="ws-hub-sub">{out}</p></div>}>
      <Field label="PayPal authorization ID" value={authId} onChange={setAuthId} />
      <Field label="Amount (USD)" value={amount} onChange={setAmount} type="number" />
      <Gold variant="primary" label={busy ? "Capturing" : "Capture funds"} isDisabled={busy || !authId.trim() || dollarsToCents(amount) <= 0} onClick={() => void run(async () => {
        const r = await runAgentTool("capture_order_hold", { authorizationId: authId.trim(), amountCents: dollarsToCents(amount), currency: "USD", isFinalCapture: true });
        setOut(`Capture ${asText(r.captureId) || asText(r.id) || ""} ${asText(r.status)}`.trim());
      })} />
    </ActionCard>
  );
};

export const PayPalActionsPanel: React.FC = () => {
  const [overview, setOverview] = useState<UserOverview | null>(null);
  React.useEffect(() => { fetchUserOverview().then(setOverview).catch(() => setOverview(null)); }, []);
  return (
    <div className="ws-hub-cards ws-hub-cards--wide">
      <StepUpCard />
      <SubscriptionCard />
      <PayoutCard overview={overview} />
      <CaptureCard />
    </div>
  );
};

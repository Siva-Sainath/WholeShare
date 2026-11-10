import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { PayPalActionsPanel } from "./PayPalActionsPanel";
import { PayPalMark } from "./PayPalAttribution";
import { StatStrip } from "./StatStrip";
import {
  approveClaim, ClaimRecord, confirmDelivery, DebtRecord, evaluateGroupExit, fetchClaims, fetchLiquidity, fetchPayPalDisputes, fetchPayPalInvoices,
  fetchUserOverview, leaveGroup, LiquiditySummary, respondToClaim, sendInvoiceReminder, settleDebt, ToolkitDispute, ToolkitInvoice, UserOverview
} from "../api";

const Gold: React.FC<React.ComponentProps<typeof Button>> = (props) => <Button {...props} variant={props.variant === "primary" ? "secondary" : props.variant} />;

type Tab = "invoices" | "disputes" | "claims" | "dues" | "delivery" | "exit" | "actions";

const money = (value: string | number, currency = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value) || 0);
const cents = (value: number) => money(value / 100);
const when = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");

const STATUS_VARIANT: Record<string, "green" | "blue" | "yellow" | "red" | "gray"> = {
  PAID: "green", SENT: "blue", DRAFT: "gray", UNPAID: "yellow", CANCELLED: "gray", PARTIALLY_PAID: "yellow",
  BUYER_APPROVED: "blue", SETTLED: "green", REJECTED: "red", OPEN: "yellow", RESOLVED: "green"
};
const StatusBadge: React.FC<{ status: string }> = ({ status }) => <Badge variant={STATUS_VARIANT[status] ?? "gray"} label={status.replace(/_/g, " ").toLowerCase()} />;

const Panel: React.FC<{ title: string; note?: string; children: React.ReactNode; action?: React.ReactNode }> = ({ title, note, children, action }) => (
  <section className="ws-hub-panel">
    <header className="ws-hub-panel-head">
      <div><h2>{title}</h2>{note && <p>{note}</p>}</div>
      {action}
    </header>
    {children}
  </section>
);

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read that photo."));
    reader.readAsDataURL(file);
  });
}

export const PayPalHubView: React.FC = () => {
  const [tab, setTab] = useState<Tab>("invoices");
  const [invoices, setInvoices] = useState<ToolkitInvoice[] | null>(null);
  const [disputes, setDisputes] = useState<ToolkitDispute[] | null>(null);
  const [claims, setClaims] = useState<ClaimRecord[] | null>(null);
  const [overview, setOverview] = useState<UserOverview | null>(null);
  const [liquidity, setLiquidity] = useState<LiquiditySummary | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Tab | "overview", string>>>({});
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [exitInfo, setExitInfo] = useState<Record<string, Awaited<ReturnType<typeof evaluateGroupExit>>>>({});
  const [conditions, setConditions] = useState<Record<string, "GOOD_CONDITION" | "DAMAGED">>({});
  const [photos, setPhotos] = useState<Record<string, File | undefined>>({});

  const fail = (key: Tab | "overview", error: unknown) => setErrors((prev) => ({ ...prev, [key]: error instanceof Error ? error.message : "Request failed." }));
  const ok = (key: Tab | "overview") => setErrors((prev) => ({ ...prev, [key]: undefined }));

  const loadInvoices = useCallback(() => { fetchPayPalInvoices().then((v) => { setInvoices(v); ok("invoices"); }).catch((e) => { setInvoices([]); fail("invoices", e); }); }, []);
  const loadDisputes = useCallback(() => { fetchPayPalDisputes().then((v) => { setDisputes(v); ok("disputes"); }).catch((e) => { setDisputes([]); fail("disputes", e); }); }, []);
  const loadClaims = useCallback(() => { fetchClaims().then((v) => { setClaims(v); ok("claims"); }).catch((e) => { setClaims([]); fail("claims", e); }); }, []);
  const loadOverview = useCallback(() => {
    fetchUserOverview().then((v) => { setOverview(v); ok("overview"); }).catch((e) => fail("overview", e));
    fetchLiquidity().then((v) => { setLiquidity(v); ok("dues"); }).catch((e) => fail("dues", e));
  }, []);

  useEffect(() => { loadInvoices(); loadDisputes(); loadClaims(); loadOverview(); }, [loadInvoices, loadDisputes, loadClaims, loadOverview]);

  const run = async (key: string, work: () => Promise<string | void>) => {
    setBusy(key);
    setNotice(null);
    try {
      const message = await work();
      setNotice({ kind: "success", text: message || "Done." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "That did not work." });
    } finally {
      setBusy(null);
    }
  };

  const openInvoices = useMemo(() => (invoices ?? []).filter((i) => i.status !== "PAID" && i.status !== "CANCELLED"), [invoices]);
  const openTotal = openInvoices.reduce((sum, i) => sum + Number(i.due || 0), 0);
  const debts: DebtRecord[] = overview?.outstandingDebts ?? [];

  const err = errors[tab];

  return (
    <section className="ws-hub" aria-label="PayPal operations">
      <header className="ws-hub-head">
        <div className="ws-hub-title">
          <PayPalMark size={28} />
          <div>
            <h1>PayPal operations</h1>
            <p>Invoices, disputes, claims, dues, delivery and exits. Live from the PayPal sandbox.</p>
          </div>
        </div>
        <Badge variant="blue" label="Sandbox" />
      </header>

      <StatStrip
        label="PayPal summary"
        items={[
          { label: "Open invoices", value: invoices ? String(openInvoices.length) : "Loading", note: invoices ? `${money(openTotal)} due` : undefined },
          { label: "PayPal disputes", value: disputes ? String(disputes.length) : "Loading", note: "From the PayPal disputes API" },
          { label: "Escrow authorized", value: overview ? money(overview.metrics.totalEscrowAuthorizedUsd ?? 0) : "Loading", note: `${overview?.joinedClans.length ?? 0} groups joined` },
          { label: "Outstanding dues", value: liquidity ? cents(liquidity.outstandingDebtCents) : "Loading", note: liquidity ? liquidity.status.toLowerCase() : undefined }
        ]}
      />

      <div className="ws-hub-tabs">
        <SegmentedControl label="PayPal sections" value={tab} onChange={(value) => { setTab(value as Tab); setNotice(null); }}>
          <SegmentedControlItem value="invoices" label="Invoices" />
          <SegmentedControlItem value="disputes" label="Disputes" />
          <SegmentedControlItem value="claims" label="Claims" />
          <SegmentedControlItem value="dues" label="Dues" />
          <SegmentedControlItem value="delivery" label="Delivery" />
          <SegmentedControlItem value="actions" label="Payments" />
          <SegmentedControlItem value="exit" label="Leave a group" />
        </SegmentedControl>
      </div>

      {notice && <Banner status={notice.kind} title={notice.text} isDismissable onDismiss={() => setNotice(null)} />}
      {err && <Banner status="error" title="PayPal request failed" description={err} />}

      {tab === "invoices" && (
        <Panel title="PayPal invoices" note="Real invoices in the PayPal sandbox. Reminders go out through the PayPal Invoicing API." action={<Button size="sm" variant="secondary" label="Refresh" onClick={loadInvoices} />}>
          {invoices === null ? <p className="ws-hub-muted">Loading invoices from PayPal…</p> : invoices.length === 0 ? <EmptyState title="No invoices yet" description="Invoices appear here when a member owes a group balance." /> : (
            <div className="ws-hub-scroll"><table className="ws-hub-table">
              <thead><tr><th>Invoice</th><th>Billed to</th><th>Date</th><th>Amount</th><th>Due</th><th>Status</th><th /></tr></thead>
              <tbody>{invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td><strong>{invoice.invoiceNumber || invoice.id}</strong><span className="ws-hub-sub">{invoice.note}</span></td>
                  <td>{/@(example\.com|wholeshare\.local)$/i.test(invoice.email || "") ? "Sandbox buyer" : invoice.email || "Not recorded"}</td><td>{when(invoice.date)}</td>
                  <td className="ws-tabular-nums">{money(invoice.amount, invoice.currency)}</td><td className="ws-tabular-nums">{money(invoice.due, invoice.currency)}</td>
                  <td><StatusBadge status={invoice.status} /></td>
                  <td>{(invoice.status === "SENT" || invoice.status === "UNPAID") && <Button size="sm" variant="ghost" label={busy === invoice.id ? "Sending" : "Remind"} isDisabled={busy === invoice.id} onClick={() => void run(invoice.id, async () => { await sendInvoiceReminder(invoice.id); return `Reminder sent for ${invoice.invoiceNumber}.`; })} />}</td>
                </tr>))}
              </tbody></table></div>
          )}
        </Panel>
      )}

      {tab === "disputes" && (
        <Panel title="PayPal disputes" note="Customer disputes on your sandbox account (PayPal Disputes API)." action={<Button size="sm" variant="secondary" label="Refresh" onClick={loadDisputes} />}>
          {disputes === null ? <p className="ws-hub-muted">Loading disputes from PayPal…</p> : disputes.length === 0 ? <EmptyState title="No open PayPal disputes" description="Nothing has been escalated to PayPal. Damage claims you file in WholeShare appear under Claims." /> : (
            <div className="ws-hub-scroll"><table className="ws-hub-table"><thead><tr><th>Dispute</th><th>Reason</th><th>Amount</th><th>Opened</th><th>Status</th></tr></thead>
              <tbody>{disputes.map((d) => <tr key={d.id}><td><strong>{d.id}</strong></td><td>{d.reason.replace(/_/g, " ").toLowerCase()}</td><td className="ws-tabular-nums">{d.amount ? money(d.amount, d.currency) : ""}</td><td>{when(d.created)}</td><td><StatusBadge status={d.status} /></td></tr>)}</tbody></table></div>
          )}
        </Panel>
      )}

      {tab === "claims" && (
        <Panel title="Damage claims" note="A claim starts as a draft. You approve it, then the supplier responds. One refund per claim." action={<Button size="sm" variant="secondary" label="Refresh" onClick={loadClaims} />}>
          {claims === null ? <p className="ws-hub-muted">Loading claims…</p> : claims.length === 0 ? <EmptyState title="No claims" description="File one from Disputes, or ask Mosaic to file it with a photo." /> : (
            <div className="ws-hub-scroll"><table className="ws-hub-table"><thead><tr><th>Claim</th><th>Group</th><th>Units</th><th>Claimed</th><th>Status</th><th /></tr></thead>
              <tbody>{claims.slice(0, 40).map((claim) => (
                <tr key={claim.claimId}>
                  <td><strong>{claim.claimId}</strong><span className="ws-hub-sub">{claim.evidence?.description?.slice(0, 70)}</span></td>
                  <td>{claim.clanId}</td><td className="ws-tabular-nums">{claim.damagedUnits}</td><td className="ws-tabular-nums">{money(claim.claimedAmount)}</td>
                  <td><StatusBadge status={claim.status} /></td>
                  <td><div className="ws-hub-actions">
                    {claim.status === "DRAFT" && <Button size="sm" variant="primary" label={busy === claim.claimId ? "Approving" : "Approve and send"} isDisabled={busy === claim.claimId} onClick={() => void run(claim.claimId, async () => { await approveClaim(claim.claimId, claim.memberId); loadClaims(); return `Claim ${claim.claimId} approved and sent to the supplier.`; })} />}
                    {claim.status === "BUYER_APPROVED" && (<>
                      <Button size="sm" variant="secondary" label="Supplier accepts" isDisabled={busy === claim.claimId} onClick={() => void run(claim.claimId, async () => { await respondToClaim({ claimId: claim.claimId, action: "ACCEPT", notes: "Accepted in the supplier demo view." }); loadClaims(); return "Supplier accepted the claim."; })} />
                      <Button size="sm" variant="secondary" label="Supplier rejects" isDisabled={busy === claim.claimId} onClick={() => void run(claim.claimId, async () => { await respondToClaim({ claimId: claim.claimId, action: "REJECT", notes: "Rejected in the supplier demo view." }); loadClaims(); return "Supplier rejected the claim."; })} />
                    </>)}
                  </div></td>
                </tr>))}
              </tbody></table></div>
          )}
          <p className="ws-hub-muted">Supplier buttons act as the supplier's console until suppliers connect. Refunds are not sent to PayPal from here.</p>
        </Panel>
      )}

      {tab === "dues" && (
        <Panel title="Dues and liquidity" note="What your business owes the group, and a PayPal reminder run for overdue invoices." action={<Button size="sm" variant="secondary" label={busy === "remind" ? "Running" : "Remind overdue"} isDisabled={busy === "remind"} onClick={() => void run("remind", async () => { const result = await fetchLiquidity(true); setLiquidity(result); return result.details; })} />}>
          {liquidity && <p className="ws-hub-line"><StatusBadge status={liquidity.status} /> <span>{liquidity.details}</span></p>}
          {debts.length === 0 ? <EmptyState title="No outstanding dues" description="You owe nothing to any group right now." /> : (
            <div className="ws-hub-scroll"><table className="ws-hub-table"><thead><tr><th>Debt</th><th>Group</th><th>Amount</th><th>Status</th><th /></tr></thead>
              <tbody>{debts.map((debt) => { const id = String(debt.debtId ?? debt.id ?? ""); return (
                <tr key={id}><td><strong>{id}</strong><span className="ws-hub-sub">{debt.reason}</span></td><td>{debt.clanId}</td><td className="ws-tabular-nums">{cents(Number(debt.amountCents ?? 0))}</td><td><StatusBadge status={String(debt.status ?? "OPEN")} /></td>
                  <td><Button size="sm" variant="primary" label={busy === id ? "Settling" : "Settle"} isDisabled={busy === id} onClick={() => void run(id, async () => { await settleDebt(id); loadOverview(); return `Debt ${id} settled.`; })} /></td></tr>); })}</tbody></table></div>
          )}
        </Panel>
      )}

      {tab === "delivery" && (
        <Panel title="Confirm delivery" note="Confirming good condition starts the release of escrow. Damaged goods open a claim window.">
          {!overview ? <p className="ws-hub-muted">Loading your groups…</p> : overview.joinedClans.length === 0 ? <EmptyState title="No groups joined" description="Join a group in Discover, then confirm delivery here." /> : (
            <div className="ws-hub-cards">
              {overview.joinedClans.map((group) => {
                const condition = conditions[group.clanId] ?? "GOOD_CONDITION";
                return (
                  <article key={group.clanId} className="ws-hub-card">
                    <div className="ws-hub-card-top"><strong>{group.skuName}</strong><StatusBadge status={group.clanStatus} /></div>
                    <p className="ws-hub-sub">{group.pledgedUnits} units pledged, {money(group.authorizedUsd)} authorized</p>
                    <SegmentedControl label="Condition on arrival" value={condition} onChange={(value) => setConditions((prev) => ({ ...prev, [group.clanId]: value as "GOOD_CONDITION" | "DAMAGED" }))}>
                      <SegmentedControlItem value="GOOD_CONDITION" label="Good condition" />
                      <SegmentedControlItem value="DAMAGED" label="Damaged" />
                    </SegmentedControl>
                    <label className="ws-hub-file">Photo of the delivery (optional)
                      <input type="file" accept="image/*" onChange={(event) => setPhotos((prev) => ({ ...prev, [group.clanId]: event.target.files?.[0] }))} />
                    </label>
                    <Gold variant="primary" label={busy === group.clanId ? "Recording" : "Confirm delivery"} isDisabled={busy === group.clanId} onClick={() => void run(group.clanId, async () => {
                      const file = photos[group.clanId];
                      const message = await confirmDelivery({ orderId: group.paypalOrderId ?? group.clanId, conditionStatus: condition, notes: condition === "DAMAGED" ? "Damage reported on arrival." : "Received in good condition.", photoBase64: file ? await readFileBase64(file) : undefined });
                      loadOverview();
                      return message;
                    })} />
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {tab === "actions" && (
        <Panel title="Payments toolkit" note="Real PayPal sandbox calls: invoicing with QR, billing plans, supplier payouts and captures.">
          <PayPalActionsPanel />
        </Panel>
      )}

      {tab === "exit" && (
        <Panel title="Leave a group" note="Check what leaving costs before you commit. Active escrow holds and unsettled dues block a clean exit.">
          {!overview ? <p className="ws-hub-muted">Loading your groups…</p> : overview.joinedClans.length === 0 ? <EmptyState title="No groups joined" description="You are not in any group." /> : (
            <div className="ws-hub-cards">
              {overview.joinedClans.map((group) => {
                const info = exitInfo[group.clanId];
                return (
                  <article key={group.clanId} className="ws-hub-card">
                    <div className="ws-hub-card-top"><strong>{group.skuName}</strong><StatusBadge status={group.clanStatus} /></div>
                    <p className="ws-hub-sub">{group.pledgedUnits} units, {money(group.authorizedUsd)} authorized</p>
                    {info && (
                      <Banner status={info.canExitImmediately ? "success" : "warning"} title={info.canExitImmediately ? "You can leave without cost" : "Leaving has consequences"} description={`${info.message} Escrow held: ${cents(info.lockedEscrowCents)}. Unsettled dues: ${cents(info.unsettledDebtCents)}.`} />
                    )}
                    <div className="ws-hub-actions">
                      <Button variant="secondary" label={busy === `e-${group.clanId}` ? "Checking" : "Check exit cost"} isDisabled={busy === `e-${group.clanId}`} onClick={() => void run(`e-${group.clanId}`, async () => { const result = await evaluateGroupExit(group.clanId); setExitInfo((prev) => ({ ...prev, [group.clanId]: result })); })} />
                      {info && <Button variant="secondary" label={busy === `l-${group.clanId}` ? "Leaving" : "Leave group"} isDisabled={busy === `l-${group.clanId}`} onClick={() => void run(`l-${group.clanId}`, async () => { const message = await leaveGroup(group.clanId, "Left from the PayPal operations page."); loadOverview(); return message; })} />}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
      )}
    </section>
  );
};

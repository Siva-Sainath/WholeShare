import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Step, Stepper } from "@astryxdesign/core/Stepper";
import {
  acceptGoods, evaluateGroupExit, markSupplierDelivered, fetchLiquidity, fetchUserOverview, JoinedGroup, leaveGroup, LiquiditySummary, settleDebt, UserOverview
} from "../api";
import { PayoutCard, CaptureCard, SubscriptionCard } from "./PayPalActionsPanel";
import { ProductVisual } from "./ProductVisual";

const money = (value: string | number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
const cents = (value: number) => money(value / 100);

const STAGES = ["Forming", "Locked", "Delivered", "Inspection", "Settled"];
function stageIndex(status: string): number {
  switch (status) {
    case "FORMING": return 0;
    case "LOCKED": return 1;
    case "DELIVERED": return 2;
    case "DISPUTED": return 3;
    case "SETTLED": return 4;
    default: return 0;
  }
}

export const GroupDashboardView: React.FC<{ clanId: string }> = ({ clanId }) => {
  const [overview, setOverview] = useState<UserOverview | null>(null);
  const [liquidity, setLiquidity] = useState<LiquiditySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [exitInfo, setExitInfo] = useState<Awaited<ReturnType<typeof evaluateGroupExit>> | null>(null);

  const load = useCallback(() => {
    fetchUserOverview().then(setOverview).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load your groups."));
    fetchLiquidity().then(setLiquidity).catch(() => setLiquidity(null));
  }, []);
  useEffect(() => { load(); }, [load, clanId]);

  const group: JoinedGroup | undefined = overview?.joinedClans.find((entry) => entry.clanId === clanId);

  useEffect(() => {
    if (!group) return;
    (window as unknown as { __wholeshareScreen?: unknown }).__wholeshareScreen = { view: "mygroup", groupId: group.clanId, groupName: group.skuName, status: group.clanStatus, pledgedUnits: group.pledgedUnits, authorizedUsd: group.authorizedUsd };
    return () => { (window as unknown as { __wholeshareScreen?: unknown }).__wholeshareScreen = undefined; };
  }, [group]);

  const run = async (key: string, work: () => Promise<string | void>) => {
    setBusy(key);
    setNotice(null);
    try {
      const message = await work();
      if (message) setNotice({ kind: "success", text: message });
    } catch (cause) {
      setNotice({ kind: "error", text: cause instanceof Error ? cause.message : "That did not work." });
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return <section className="ws-group"><EmptyState title="Could not load this group" description={error} /></section>;
  }
  if (!overview) {
    return <section className="ws-group" aria-busy="true"><Skeleton height={28} width={240} /><Skeleton height={320} /></section>;
  }
  if (!group) {
    return (
      <section className="ws-group">
        <Button variant="ghost" label="Back to My groups" icon={<ArrowLeft size={16} />} onClick={() => { window.location.hash = "my-groups"; }} />
        <EmptyState title="You have not joined this group" description="Join it from its page, then manage delivery, dues and payouts here." />
        <span className="lp-gold"><Button variant="primary" label="Open the group page" onClick={() => { window.location.hash = `group/${encodeURIComponent(clanId)}`; }} /></span>
      </section>
    );
  }

  const stage = stageIndex(group.clanStatus);
  const debts = overview.outstandingDebts;

  return (
    <section className="ws-group ws-gdash" data-ws-view="mygroup">
      <div className="ws-group-top">
        <Button variant="ghost" label="Back to My groups" icon={<ArrowLeft size={16} />} onClick={() => { window.location.hash = "my-groups"; }} />
      </div>

      <header className="ws-gdash-head">
        <div className="ws-gdash-thumb"><ProductVisual product={group.skuName} height={72} rounded={14} /></div>
        <div className="ws-gdash-title">
          <h1>{group.skuName}</h1>
          <p>{group.pledgedUnits.toLocaleString("en-US")} units pledged · {money(group.authorizedUsd)} held on PayPal</p>
        </div>
        <Badge variant={group.clanStatus === "DISPUTED" ? "red" : group.clanStatus === "LOCKED" ? "green" : "blue"} label={group.clanStatus.toLowerCase()} />
        <Button variant="secondary" label="Group page" onClick={() => { window.location.hash = `group/${encodeURIComponent(group.clanId)}`; }} />
      </header>

      <Stepper activeStep={stage} label="Group lifecycle">
        {STAGES.map((name, index) => <Step key={name} step={index} label={name} status={group.clanStatus === "DISPUTED" && index === 3 ? "error" : undefined} />)}
      </Stepper>

      {notice && <Banner status={notice.kind} title={notice.text} isDismissable onDismiss={() => setNotice(null)} collapsible={false} />}

      <div className="ws-gdash-grid">
        <section className="ws-gdash-card">
          <h2>Delivery and payment</h2>
          <p className="ws-group-muted">
            {group.captureId
              ? `Payment released. PayPal capture ${group.captureId}.`
              : group.authorizationId
                ? `${money(group.authorizedUsd)} is held on PayPal (authorization ${group.authorizationId}). It is only captured when you accept the goods.`
                : "This pledge has no PayPal hold behind it, so accepting the goods records the release in WholeShare only."}
          </p>
          <div className="ws-hub-actions">
            <Button
              variant="secondary"
              label={busy === "deliver" ? "Marking delivered" : "Sample supplier marks delivered"}
              isDisabled={busy === "deliver" || Boolean(group.captureId)}
              onClick={() => void run("deliver", async () => { await markSupplierDelivered(group.groupId); load(); return "The sample supplier marked the goods delivered. Inspect them: you have 48 hours."; })}
            />
          </div>
          <div className="ws-hub-actions">
            <span className="lp-gold">
              <Button
                variant="primary"
                label={busy === "accept" ? "Releasing payment" : "Goods are fine, release payment"}
                isDisabled={busy === "accept" || Boolean(group.captureId)}
                onClick={() => void run("accept", async () => { const result = await acceptGoods(group.groupId); load(); return result.captureId ? `Payment released. PayPal capture ${result.captureId}.` : "Payment released."; })}
              />
            </span>
            <Button variant="secondary" label="Report damage" onClick={() => { window.location.hash = "disputes"; }} />
          </div>
        </section>

        <section className="ws-gdash-card">
          <h2>Dues and liquidity</h2>
          {liquidity && <p className="ws-hub-line"><Badge variant={liquidity.status === "LIQUID" ? "green" : "yellow"} label={liquidity.status.toLowerCase()} /> <span>{liquidity.details}</span></p>}
          {debts.length === 0 ? (
            <p className="ws-group-muted">You owe this group nothing right now.</p>
          ) : (
            <div className="ws-gdash-debts">
              {debts.map((debt) => {
                const id = String(debt.debtId ?? debt.id ?? "");
                return (
                  <div key={id} className="ws-gdash-debt">
                    <div><strong>{cents(Number(debt.amountCents ?? 0))}</strong><span>{debt.reason ?? debt.clanId ?? "Group balance"}</span></div>
                    <Button size="sm" variant="secondary" label={busy === id ? "Settling" : "Settle"} isDisabled={busy === id} onClick={() => void run(id, async () => { await settleDebt(id); load(); return `Debt ${id} settled.`; })} />
                  </div>
                );
              })}
            </div>
          )}
          <Button variant="secondary" label={busy === "remind" ? "Sending reminders" : "Remind overdue members"} isDisabled={busy === "remind"} onClick={() => void run("remind", async () => { const result = await fetchLiquidity(true); setLiquidity(result); return result.details; })} />
        </section>

        <section className="ws-gdash-card">
          <h2>Leave this group</h2>
          <p className="ws-group-muted">Check what leaving costs first. Active holds and unsettled dues are listed before you decide.</p>
          {exitInfo && (
            <Banner status={exitInfo.canExitImmediately ? "success" : "warning"} title={exitInfo.canExitImmediately ? "You can leave without cost" : "Leaving has consequences"} description={`${exitInfo.message} Held: ${cents(exitInfo.lockedEscrowCents)}. Unsettled: ${cents(exitInfo.unsettledDebtCents)}.`} collapsible={false} />
          )}
          <div className="ws-hub-actions">
            <Button variant="secondary" label={busy === "exit" ? "Checking" : "Check exit cost"} isDisabled={busy === "exit"} onClick={() => void run("exit", async () => { setExitInfo(await evaluateGroupExit(group.clanId)); })} />
            {exitInfo && <Button variant="secondary" label={busy === "leave" ? "Leaving" : "Leave group"} isDisabled={busy === "leave"} onClick={() => void run("leave", async () => { const message = await leaveGroup(group.clanId, "Left from the group dashboard."); load(); window.setTimeout(() => { window.location.hash = "my-groups"; }, 1200); return message; })} />}
          </div>
        </section>

        <PayoutCard overview={overview} groupId={group.clanId} />
        <CaptureCard />
        <SubscriptionCard />
      </div>
    </section>
  );
};

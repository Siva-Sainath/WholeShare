import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MapPin, ShieldCheck, Truck } from "lucide-react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { AvatarGroup } from "@astryxdesign/core/AvatarGroup";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { fetchClanById, fetchClanGovernance, ClanDetail, GovernanceConstitution } from "../api";
import { MembersGrid } from "./MembersGrid";
import { ProductVisual } from "./ProductVisual";
import { PayPalPledgeButton } from "./PayPalPledgeButton";

interface Tier { minUnits: number; discountPct: number; }

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusTone: Record<string, "blue" | "green" | "yellow" | "gray"> = { FORMING: "blue", LOCKED: "green", DELIVERED: "green", DISPUTED: "yellow" };

async function fetchTiers(clanId: string): Promise<Tier[]> {
  const response = await fetch(`/api/v1/clans/${encodeURIComponent(clanId)}`, { headers: { accept: "application/json" } });
  const payload = (await response.json()) as { clan?: { tiers?: Tier[] } };
  return Array.isArray(payload.clan?.tiers) ? payload.clan.tiers : [];
}

export const GroupView: React.FC<{ clanId: string }> = ({ clanId }) => {
  const [clan, setClan] = useState<ClanDetail | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [constitution, setConstitution] = useState<GovernanceConstitution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rulesConfirmed, setRulesConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setClan(null);
    setError(null);
    setRulesConfirmed(false);
    fetchClanById(clanId).then((value) => { if (!cancelled) setClan(value); }).catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load this group."); });
    fetchTiers(clanId).then((value) => { if (!cancelled) setTiers(value); }).catch(() => undefined);
    fetchClanGovernance(clanId).then((value) => { if (!cancelled) setConstitution(value.constitution); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [clanId]);

  useEffect(() => {
    if (!clan) return;
    const screen = { view: "group", groupId: clan.id, groupName: clan.name, status: clan.status, progressPct: clan.progressPct, unitPriceUsd: clan.unitPriceCents / 100, rulesConfirmed };
    (window as unknown as { __wholeshareScreen?: unknown }).__wholeshareScreen = screen;
    return () => { (window as unknown as { __wholeshareScreen?: unknown }).__wholeshareScreen = undefined; };
  }, [clan, rulesConfirmed]);

  const rules = constitution?.rules;
  const inspectionHours = rules?.INSPECTION_WINDOW_HOURS || 48;
  const reachedPct = useMemo(() => (clan ? tiers.filter((tier) => clan.currentUnits >= tier.minUnits).reduce((best, tier) => Math.max(best, tier.discountPct), 0) : 0), [clan, tiers]);
  const nextTier = useMemo(() => (clan ? tiers.find((tier) => tier.minUnits > clan.currentUnits) ?? null : null), [clan, tiers]);

  if (error) {
    return (
      <section className="ws-group">
        <Button variant="ghost" label="Back to Discover" icon={<ArrowLeft size={16} />} onClick={() => { window.location.hash = "discover"; }} />
        <EmptyState title="Group not found" description={error} />
      </section>
    );
  }
  if (!clan) {
    return (
      <section className="ws-group" aria-busy="true">
        <Skeleton height={28} width={220} />
        <div className="ws-group-grid"><Skeleton height={380} /><Skeleton height={380} /></div>
      </section>
    );
  }

  const members = clan.members ?? [];
  const fillLeft = Math.max(0, clan.targetUnits - clan.currentUnits);

  return (
    <section className="ws-group" data-ws-view="group">
      <div className="ws-group-top">
        <Button variant="ghost" label="Back to Discover" icon={<ArrowLeft size={16} />} onClick={() => { window.location.hash = "discover"; }} />
      </div>

      <div className="ws-group-grid">
        <div className="ws-group-media">
          <ProductVisual product={`${clan.name} ${clan.sku}`} category={clan.category} height={380} rounded={16} />
          <div className="ws-group-supplier">
            <ShieldCheck size={18} strokeWidth={1.8} />
            <div>
              <strong>{clan.supplierName ?? "Supplier on file"}</strong>
              <span>{typeof clan.supplierTrustScore === "number" ? `Trust score ${Math.round(clan.supplierTrustScore * 100)} of 100` : "Trust score not rated"}</span>
            </div>
          </div>
        </div>

        <div className="ws-group-main">
          <div className="ws-group-badges">
            <Badge variant={statusTone[clan.status] ?? "gray"} label={clan.status.toLowerCase()} />
            {clan.city && <span className="ws-group-city"><MapPin size={14} /> {clan.city}{clan.countryCode ? `, ${clan.countryCode}` : ""}</span>}
          </div>
          <h1>{clan.name}</h1>
          <p className="ws-group-sku">{clan.sku}</p>

          <div className="ws-group-price">
            <span className="ws-group-price-main">{usd(Math.round(clan.unitPriceCents * (100 - reachedPct) / 100))}</span>
            <span className="ws-group-price-note">per unit{reachedPct > 0 ? `, ${reachedPct}% off the ${usd(clan.unitPriceCents)} list price` : " at list price"}</span>
          </div>

          <div className="ws-group-progress">
            <ProgressBar label="Group progress" isLabelHidden value={Math.min(clan.currentUnits, clan.targetUnits)} max={clan.targetUnits} variant={clan.progressPct >= 100 ? "success" : "accent"} />
            <div className="ws-group-progress-row">
              <span>{clan.currentUnits.toLocaleString("en-US")} of {clan.targetUnits.toLocaleString("en-US")} units</span>
              <span>{fillLeft > 0 ? `${fillLeft.toLocaleString("en-US")} to fill` : "Target reached"}</span>
            </div>
          </div>

          {tiers.length > 0 && (
            <div className="ws-group-tiers" aria-label="Volume tiers">
              {tiers.map((tier) => {
                const reached = clan.currentUnits >= tier.minUnits;
                return (
                  <div key={tier.minUnits} className={`ws-tier${reached ? " is-reached" : ""}${nextTier && nextTier.minUnits === tier.minUnits ? " is-next" : ""}`}>
                    <b>{tier.discountPct}% off</b>
                    <span>{tier.minUnits.toLocaleString("en-US")}+ units</span>
                    <small>{reached ? "Unlocked" : nextTier && nextTier.minUnits === tier.minUnits ? `${(tier.minUnits - clan.currentUnits).toLocaleString("en-US")} more to unlock` : "Locked"}</small>
                  </div>
                );
              })}
            </div>
          )}

          <div className="ws-group-meta">
            <span><Truck size={15} /> Delivery inspection window: {inspectionHours} hours</span>
            {typeof (clan as { estimatedDeliveryDays?: number }).estimatedDeliveryDays === "number" && <span>Delivery in {(clan as { estimatedDeliveryDays?: number }).estimatedDeliveryDays} days</span>}
            <span>{clan.membersCount} {clan.membersCount === 1 ? "member" : "members"}</span>
          </div>
          {(clan as { fulfilment?: { mode: string; points: Array<{ label: string; address: string; city: string }> } }).fulfilment && (
            <div className="ws-group-meta" aria-label="Receiving points">
              <span><Truck size={15} /> {(clan as { fulfilment?: { mode: string } }).fulfilment?.mode === "MULTIPLE_POINTS" ? "Receiving points" : "Receiving point"}: {((clan as { fulfilment?: { points: Array<{ label: string; address: string; city: string }> } }).fulfilment?.points ?? []).map((point) => [point.label, point.address, point.city].filter(Boolean).join(", ")).join(" | ")}</span>
            </div>
          )}

          <div className="ws-group-pledge">
            {clan.status === "FORMING" ? (
              <>
                <CheckboxInput
                  label="I agree to this group's rules"
                  description="I authorize WholeShare to place a soft hold on my PayPal account. Nothing is charged until the group fills and delivery is verified."
                  value={rulesConfirmed}
                  onChange={setRulesConfirmed}
                />
                {rulesConfirmed ? (
                  <PayPalPledgeButton clanId={clan.id} clanName={clan.name} currency={clan.currency} />
                ) : (
                  <Banner status="info" title="Review the rules to pledge" description="Tick the box above to unlock the PayPal pledge." collapsible={false} />
                )}
              </>
            ) : (
              <Banner status="info" title={`This group is ${clan.status.toLowerCase()}`} description="New pledges are only accepted while a group is forming." collapsible={false} />
            )}
          </div>
        </div>
      </div>

      <div className="ws-group-sections">
        <Collapsible defaultIsOpen trigger={<span className="ws-group-trigger">Members</span>}>
          {members.length === 0 ? (
            <p className="ws-group-muted">No pledges recorded for this group yet.</p>
          ) : (
            <>
              <MembersGrid members={members} />
            </>
          )}
        </Collapsible>

        <Collapsible defaultIsOpen={false} trigger={<span className="ws-group-trigger">Rules you agree to</span>}>
          <div className="ws-group-rules">
            <div><b>Inspection window</b><span>{inspectionHours} hours after delivery</span></div>
            <div><b>Silence auto-confirm</b><span>{rules?.SILENCE_AUTO_CONFIRM_HOURS || 48} hours</span></div>
            <div><b>Damage evidence</b><span>{String(rules?.DAMAGE_EVIDENCE_REQUIREMENT || "PHOTO_ONLY").replaceAll("_", " ").toLowerCase()}</span></div>
            <div><b>Step-up invoice</b><span>from ${rules?.STEP_UP_THRESHOLD_USD || 1000}</span></div>
            <div><b>Voting</b><span>{String(rules?.VOTING_WEIGHT_STRATEGY || "ONE_MEMBER_ONE_VOTE").replaceAll("_", " ").toLowerCase()}</span></div>
            <div><b>Dispute window</b><span>{rules?.DISPUTE_ESCALATION_WINDOW_HOURS || 48} hours</span></div>
            <div><b>Minimum discount</b><span>{rules?.MIN_DISCOUNT_PERCENT || 20}%</span></div>
          </div>
          <p className="ws-group-muted">If the group does not fill, your authorization expires and nothing is charged. If goods arrive damaged, file a claim with photos inside the inspection window.</p>
        </Collapsible>
      </div>
    </section>
  );
};

import React, { useEffect, useState } from "react";
import { Award, Clock, ShieldCheck, TrendingDown } from "lucide-react";
import type { Artifact, CompareGroup } from "../canvasStore";
import { fetchUserSettings } from "../api";

const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// "New York Takeout Containers 32 oz (Garden State)" becomes "Garden State".
const shortName = (name: string) => (name.match(/\(([^)]+)\)\s*$/)?.[1] ?? name).replace(/^New York\s+/i, "");

interface Row {
  label: string;
  value: (group: CompareGroup) => string;
  best?: (groups: CompareGroup[]) => string | null;
  raw?: (group: CompareGroup) => number | null;
}

// Best value for a row: the group id that wins, given whether lower or higher is better.
const winner = (groups: CompareGroup[], pick: (group: CompareGroup) => number | null, dir: "min" | "max"): string | null => {
  const scored = groups.map((group) => ({ id: group.id, v: pick(group) })).filter((entry): entry is { id: string; v: number } => entry.v !== null);
  if (scored.length < 2) return null;
  scored.sort((a, b) => (dir === "min" ? a.v - b.v : b.v - a.v));
  return scored[0].v === scored[1].v ? null : scored[0].id;
};

const Bars: React.FC<{ title: string; groups: CompareGroup[]; value: (group: CompareGroup) => number | null; format: (value: number) => string; lowerIsBetter?: boolean }> = ({ title, groups, value, format, lowerIsBetter }) => {
  const values = groups.map((group) => value(group) ?? 0);
  const top = Math.max(...values, 0.0001);
  const best = lowerIsBetter ? Math.min(...values.filter((v) => v > 0)) : Math.max(...values);
  return (
    <div className="ws-cmp-bars">
      <b>{title}</b>
      {groups.map((group, index) => (
        <div key={group.id} className="ws-cmp-bar-row">
          <span>{shortName(group.name)}</span>
          <div className="ws-cmp-bar-track"><div className={`ws-cmp-bar${values[index] === best ? " is-best" : ""}`} style={{ width: `${Math.max(6, (values[index] / top) * 100)}%` }} /></div>
          <em>{value(group) === null ? "n/a" : format(values[index])}</em>
        </div>
      ))}
    </div>
  );
};

export const CompareArtifact: React.FC<{ artifact: Artifact }> = ({ artifact }) => {
  const compare = artifact.compare;
  const [today, setToday] = useState<{ supplier: string; unitPriceUsd: number } | null>(null);
  useEffect(() => {
    fetchUserSettings().then((settings) => {
      const profile = settings?.profile ?? {};
      if (profile.currentSupplier && Number(profile.currentUnitPriceUsd) > 0) setToday({ supplier: String(profile.currentSupplier), unitPriceUsd: Number(profile.currentUnitPriceUsd) });
    }).catch(() => undefined);
  }, []);
  if (!compare) return null;
  const { groups, units, verdict } = compare;
  const nameOf = (full: string | null) => (full ? shortName(full) : "n/a");
  const groupByName = (full: string | null) => groups.find((group) => group.name === full);

  const rows: Row[] = [
    { label: `Unit price at ${units} units`, value: (g) => usd(g.unitPriceAtYourUnits), best: (gs) => winner(gs, (g) => g.unitPriceAtYourUnits, "min") },
    { label: `Total for ${units} units`, value: (g) => usd(g.totalForYourUnits), best: (gs) => winner(gs, (g) => g.totalForYourUnits, "min") },
    ...(today ? [{ label: `You pay today (${today.supplier})`, value: () => usd(today.unitPriceUsd * units) }, { label: "You save against today", value: (g: CompareGroup) => usd(today.unitPriceUsd * units - g.totalForYourUnits), best: (gs: CompareGroup[]) => winner(gs, (g) => today.unitPriceUsd * units - g.totalForYourUnits, "max") }] : []),
    { label: "List price", value: (g) => usd(g.listUnitPrice) },
    { label: "Tier discount reached", value: (g) => `${g.discountPctAtYourUnits}% off`, best: (gs) => winner(gs, (g) => g.discountPctAtYourUnits, "max") },
    { label: "Next tier", value: (g) => (g.nextTier ? `${g.nextTier.discountPct}% at ${g.nextTier.atUnits} units, ${g.nextTier.unitsAway} away` : "Top tier reached") },
    { label: "Filled", value: (g) => `${g.fillPct}% (${g.unitsRemaining} units left)`, best: (gs) => winner(gs, (g) => g.fillPct, "max") },
    { label: "Delivery", value: (g) => (g.deliveryDays === null ? "Not stated" : `${g.deliveryDays} days`), best: (gs) => winner(gs, (g) => g.deliveryDays, "min") },
    { label: "Supplier", value: (g) => g.supplier || "Not stated" },
    { label: "Supplier trust", value: (g) => (g.supplierTrust === null ? "Not rated" : g.supplierTrust.toFixed(2)), best: (gs) => winner(gs, (g) => g.supplierTrust, "max") },
    { label: "You can join", value: (g) => (g.joinable ? "Yes, with PayPal" : "Not right now") }
  ];

  const cards = [
    { icon: <TrendingDown size={18} />, label: "Cheapest total", group: groupByName(verdict.cheapestTotal), detail: (g?: CompareGroup) => (g ? usd(g.totalForYourUnits) : "") },
    { icon: <Clock size={18} />, label: "Fastest delivery", group: groupByName(verdict.fastestDelivery), detail: (g?: CompareGroup) => (g?.deliveryDays != null ? `${g.deliveryDays} days` : "") },
    { icon: <ShieldCheck size={18} />, label: "Most trusted supplier", group: groupByName(verdict.mostTrustedSupplier), detail: (g?: CompareGroup) => (g?.supplierTrust != null ? `Trust ${g.supplierTrust.toFixed(2)}` : "") },
    { icon: <Award size={18} />, label: "Closest to filling", group: groupByName(verdict.closestToFilling), detail: (g?: CompareGroup) => (g ? `${g.fillPct}% filled` : "") }
  ];

  return (
    <div className="ws-cmp">
      <div className="ws-cmp-verdicts">
        {cards.map((card) => (
          <div key={card.label} className="ws-cmp-verdict">
            <span className="ws-cmp-icon">{card.icon}</span>
            <small>{card.label}</small>
            <b>{nameOf(card.group?.name ?? null)}</b>
            <em>{card.detail(card.group)}</em>
          </div>
        ))}
      </div>
      <div className="ws-cmp-table-wrap">
        <table className="ws-cmp-table">
          <thead>
            <tr><th>What matters</th>{groups.map((group) => <th key={group.id}>{shortName(group.name)}<small>{group.city}</small></th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const best = row.best?.(groups) ?? null;
              return (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {groups.map((group) => <td key={group.id} className={best === group.id ? "is-best" : undefined}>{row.value(group)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="ws-cmp-charts">
        <Bars title={`Total for ${units} units`} groups={groups} value={(g) => g.totalForYourUnits} format={usd} lowerIsBetter />
        <Bars title="Delivery time" groups={groups} value={(g) => g.deliveryDays} format={(v) => `${v} days`} lowerIsBetter />
        <Bars title="Supplier trust" groups={groups} value={(g) => g.supplierTrust} format={(v) => v.toFixed(2)} />
        <Bars title="Group filled" groups={groups} value={(g) => g.fillPct} format={(v) => `${v}%`} />
      </div>
    </div>
  );
};

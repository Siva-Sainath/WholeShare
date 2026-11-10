import React from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import type { ClanRecord } from "../api";
import { ProductVisual } from "./ProductVisual";

const CATEGORY_LABELS: Record<string, string> = {
  PROCESS_BATCH_PRODUCTION: "Batch production",
  DISCRETE_MANUFACTURING: "Manufacturing",
  PACKAGING_MATERIALS: "Packaging materials",
  PACKAGING: "Packaging",
  TEXTILES_APPAREL: "Textiles and apparel",
  CLEANTECH_ENERGY: "Cleantech and energy",
  FOOD_AND_BEVERAGE: "Food and beverage",
  RESTAURANT_EQUIPMENT: "Restaurant equipment",
  ELECTRICAL: "Electrical",
  CONSTRUCTION: "Construction",
  JANITORIAL: "Janitorial",
  MEDICAL_SUPPLIES: "Medical supplies"
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replaceAll("_", " ").toLowerCase();
}

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export const GroupCard: React.FC<{ clan: ClanRecord; selected: boolean; onSelect: () => void }> = ({ clan, selected, onSelect }) => (
  <ClickableCard label={`Open ${clan.name}`} onClick={onSelect} padding={4}>
    <div className={`ws-group-card ${selected ? "is-selected" : ""}`}>
      <ProductVisual product={`${clan.name} ${clan.sku}`} category={clan.category} height={128} />
      <div className="ws-group-card-top">
        <span className="ws-group-card-cat">{categoryLabel(clan.category)}</span>
        {clan.status === "LOCKED" && <Badge variant="info" label="Locked" />}
        {clan.status === "SETTLED" && <Badge variant="success" label="Settled" />}
      </div>
      <p className="ws-group-card-name">{clan.name}</p>
      <p className="ws-group-card-meta">
        {clan.city ?? "Location not listed"} · {clan.membersCount} members
      </p>
      <p className="ws-group-card-price">
        {usd(clan.unitPriceCents)}
        <small>{clan.discountTierPct}% off list</small>
      </p>
      <ProgressBar label={`${clan.name} pledged`} isLabelHidden value={Math.min(clan.currentUnits, clan.targetUnits)} max={clan.targetUnits} variant={clan.progressPct >= 100 ? "success" : "accent"} />
      <p className="ws-group-card-foot">
        {clan.currentUnits.toLocaleString("en-US")} of {clan.targetUnits.toLocaleString("en-US")} units · {clan.progressPct}%
      </p>
    </div>
  </ClickableCard>
);

import React, { useState } from "react";
import { imageFor } from "../productImages";
import {
  Battery, Boxes, Coffee, Cog, Droplets, HardHat, Leaf, Milk, Nut, Package, Plug, SprayCan,
  Stethoscope, Sun, Shirt, UtensilsCrossed, Wheat, Cookie, Zap, type LucideIcon
} from "lucide-react";

interface Rule {
  pattern: RegExp;
  icon: LucideIcon;
}

const RULES: Rule[] = [
  { pattern: /coffee|espresso|arabica/i, icon: Coffee },
  { pattern: /olive|oil|vinegar/i, icon: Droplets },
  { pattern: /pistachio|almond|nut|cashew/i, icon: Nut },
  { pattern: /flour|grain|wheat|sesame|rice|oat|seed/i, icon: Wheat },
  { pattern: /milk|dairy|cheese|butter|cream/i, icon: Milk },
  { pattern: /chocolate|cocoa|cookie|sugar/i, icon: Cookie },
  { pattern: /vanilla|tea|herb|spice|extract|leaf|organic/i, icon: Leaf },
  { pattern: /solar|photovoltaic|panel|geothermal/i, icon: Sun },
  { pattern: /battery|storage|inverter/i, icon: Battery },
  { pattern: /turbine|wind|generator|power/i, icon: Zap },
  { pattern: /cable|wire|conduit|breaker|switch|outlet|electrical|lighting|led/i, icon: Plug },
  { pattern: /denim|fabric|cotton|jersey|apparel|knit|thread|yarn|textile|garment|linen/i, icon: Shirt },
  { pattern: /glove|nitrile|syringe|monitor|medical|mask|gauze|clinical|bandage|exam/i, icon: Stethoscope },
  { pattern: /cleaner|detergent|disinfect|janitorial|mop|sanitizer|soap|towel|tissue/i, icon: SprayCan },
  { pattern: /oven|fryer|prep table|kitchen|restaurant|refrigerat|stainless|cookware|dish/i, icon: UtensilsCrossed },
  { pattern: /cement|concrete|lumber|insulation|drywall|rebar|construction|scaffold|brick|asphalt/i, icon: HardHat },
  { pattern: /box|bag|corrugated|carton|film|wrap|shrink|pallet|label|tape|packag|pouch/i, icon: Package },
  { pattern: /steel|aluminum|bolt|fastener|carbide|collet|machin|extruded|alloy|titanium|nut and/i, icon: Cog }
];

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  PROCESS_BATCH_PRODUCTION: Leaf,
  DISCRETE_MANUFACTURING: Cog,
  PACKAGING_MATERIALS: Package,
  PACKAGING: Boxes,
  TEXTILES_APPAREL: Shirt,
  CLEANTECH_ENERGY: Sun,
  FOOD_AND_BEVERAGE: Wheat,
  RESTAURANT_EQUIPMENT: UtensilsCrossed,
  ELECTRICAL: Plug,
  CONSTRUCTION: HardHat,
  JANITORIAL: SprayCan,
  MEDICAL_SUPPLIES: Stethoscope
};

const TINTS = [
  { bg: "#EBF4FA", fg: "#0070BA" },
  { bg: "#F4EFEB", fg: "#0F1F2E" },
  { bg: "#FFF4D6", fg: "#7A5600" },
  { bg: "#EEF1F4", fg: "#3F4F60" }
];

function tintFor(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export function iconFor(productName: string, category?: string): LucideIcon {
  const match = RULES.find((rule) => rule.pattern.test(productName));
  if (match) return match.icon;
  return (category && CATEGORY_ICONS[category]) || Package;
}

export const CategoryIcon: React.FC<{ category: string; size?: number }> = ({ category, size = 18 }) => {
  const Icon = CATEGORY_ICONS[category] ?? Package;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
};

export const ProductVisual: React.FC<{ product: string; category?: string; height?: number; rounded?: number }> = ({ product, category, height = 88, rounded = 12 }) => {
  const Icon = iconFor(product, category);
  const tint = tintFor(category ?? product);
  const src = imageFor(product, category);
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <div className="ws-product-visual ws-product-photo" style={{ height, borderRadius: rounded }}>
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      </div>
    );
  }
  return (
    <div className="ws-product-visual" style={{ height, borderRadius: rounded, background: tint.bg, color: tint.fg }} aria-hidden="true">
      <Icon size={Math.round(height * 0.46)} strokeWidth={1.5} />
    </div>
  );
};

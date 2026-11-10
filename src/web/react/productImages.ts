// Maps a product name to a bundled, openly licensed photo (see public/img/products/CREDITS.json).
interface ImageRule {
  pattern: RegExp;
  file: string;
}

import manifest from "./productImageManifest.json";

const IMAGE_RULES: ImageRule[] = [
  { pattern: /cashew/i, file: "cashew" },
  { pattern: /almond|macadamia|pecan/i, file: "almond" },
  { pattern: /walnut|hazelnut/i, file: "walnut" },
  { pattern: /saffron/i, file: "saffron" },
  { pattern: /cardamom/i, file: "cardamom" },
  { pattern: /\bpepper\b|chilli|chili/i, file: "pepper" },
  { pattern: /basmati|jasmine rice|hom mali/i, file: "basmati" },
  { pattern: /\bdates\b|\bfigs\b/i, file: "dates" },
  { pattern: /turmeric|cinnamon/i, file: "turmeric" },
  { pattern: /esp32|arduino|microcontroller|single-board|board computer|development board/i, file: "microcontroller" },
  { pattern: /pcb|circuit board|printed circuit|semiconductor/i, file: "pcb" },
  { pattern: /li-ion|lithium|battery|lifepo/i, file: "battery" },
  { pattern: /\bled\b|panel light|street light|grow light/i, file: "led" },
  { pattern: /resistor|capacitor|terminal block|connector|sensor|oled|display/i, file: "resistor" },
  { pattern: /\bwire\b|\bcable\b|harness|copper|solder/i, file: "wire" },
  { pattern: /bearing/i, file: "bearing" },
  { pattern: /welding|electrode/i, file: "welding" },
  { pattern: /silk|brocade|satin|scarf/i, file: "silk" },
  { pattern: /jute|hessian/i, file: "jute" },
  { pattern: /yarn/i, file: "yarn" },
  { pattern: /sandstone|stone|slab|paving|marble/i, file: "stone" },
  { pattern: /rebar|tmt|steel coil|galvanized steel|seamless pipe/i, file: "rebar" },
  { pattern: /resin|pellet|hdpe|polyethylene/i, file: "plastic" },
  { pattern: /coconut oil|palm|castor|cooking oil/i, file: "castor" },
  { pattern: /argan|neem|essential oil/i, file: "neem" },
  { pattern: /face mask|surgical mask/i, file: "mask" },
  { pattern: /induction|knife|chef|cutlery|tableware/i, file: "induction" },
  { pattern: /coffee|espresso|arabica|yirgacheffe|sidamo/i, file: "coffee" },
  { pattern: /olive|arbequina|vinegar/i, file: "olive-oil" },
  { pattern: /pistachio|almond|cashew|\bnut paste/i, file: "pistachio" },
  { pattern: /flour|wheat|grain/i, file: "flour" },
  { pattern: /\brice\b|\boats?\b|sesame|\bseeds?\b/i, file: "rice" },
  { pattern: /vanilla/i, file: "vanilla" },
  { pattern: /\btea\b|herb|matcha/i, file: "tea" },
  { pattern: /spice|pepper|paprika|saffron|extract/i, file: "spice" },
  { pattern: /chocolate|cocoa|cacao/i, file: "chocolate" },
  { pattern: /honey|syrup|jam/i, file: "honey" },
  { pattern: /tile|porcelain|ceramic|flooring/i, file: "tiles" },
  { pattern: /solar|photovoltaic|monocrystalline|bifacial|inverter/i, file: "solar" },
  { pattern: /geothermal|heat pump|hydronic|thermal|exchanger/i, file: "heat" },
  { pattern: /pump|valve|hydraulic/i, file: "pump" },
  { pattern: /\bbolts?\b|\bnuts?\b|fastener|screw|rivet|titanium|stainless hex/i, file: "bolts" },
  { pattern: /carbide|end mill|collet|chuck|cutter|tool/i, file: "tool" },
  { pattern: /denim|selvedge|indigo|fabric|cotton|jersey|textile|knit/i, file: "denim" },
  { pattern: /glove|nitrile|syringe|medical|mask|gauze|clinical/i, file: "gloves" },
  { pattern: /cleaner|detergent|disinfect|janitorial|sanitizer|soap|towel|tissue/i, file: "janitorial" },
  { pattern: /kitchen|restaurant|oven|fryer|prep table|cookware/i, file: "kitchen" },
  { pattern: /lumber|timber|plywood|insulation|drywall|rebar|construction/i, file: "lumber" },
  { pattern: /bottle|jar|glass/i, file: "bottles" },
  { pattern: /pallet|shrink|stretch|film|wrap|label|tape/i, file: "pallet" },
  { pattern: /box|carton|corrugated|kraft|bag|pouch|packag|shipping/i, file: "boxes" },
  { pattern: /container|freight|cargo/i, file: "container" }
];

const CATEGORY_FALLBACK: Record<string, string> = {
  PROCESS_BATCH_PRODUCTION: "spice",
  FOOD_AND_BEVERAGE: "flour",
  PACKAGING_MATERIALS: "boxes",
  PACKAGING: "boxes",
  TEXTILES_APPAREL: "denim",
  CLEANTECH_ENERGY: "solar",
  DISCRETE_MANUFACTURING: "tool",
  ELECTRICAL: "solar",
  CONSTRUCTION: "lumber",
  RESTAURANT_EQUIPMENT: "kitchen",
  JANITORIAL: "janitorial",
  MEDICAL_SUPPLIES: "gloves"
};

function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Picks a photo of the right kind of product. Groups of the same product in different cities get different photos.
export function imageFor(product: string, category?: string, seed: string = product): string | null {
  const hit = IMAGE_RULES.find((rule) => rule.pattern.test(product) && (manifest as Record<string, string[]>)[rule.file]);
  const file = hit?.file ?? (category ? CATEGORY_FALLBACK[category] : undefined);
  const variants = file ? (manifest as Record<string, string[]>)[file] : undefined;
  if (!variants || variants.length === 0) return null;
  return `/img/products/${variants[seedOf(seed) % variants.length]}.jpg`;
}

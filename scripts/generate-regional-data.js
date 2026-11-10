import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Builds groups and suppliers that follow geography: each city lists goods the region is known for,
// and its suppliers are local. Output is deterministic. Original seeded groups keep their ids.
// Supplier names, sites and contacts are invented. Run: node scripts/generate-regional-data.js

function hash(text) { let h = 2166136261; for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pick = (r, list) => list[Math.floor(r() * list.length)];

const V = { F: "FOOD_AND_BEVERAGE", T: "TEXTILES_APPAREL", M: "DISCRETE_MANUFACTURING", E: "ELECTRICAL", C: "CONSTRUCTION", P: "PROCESS_BATCH_PRODUCTION", K: "PACKAGING_MATERIALS", S: "CLEANTECH_ENERGY", R: "RESTAURANT_EQUIPMENT", J: "JANITORIAL", H: "MEDICAL_SUPPLIES" };
const CUR = { US: "USD", CA: "CAD", MX: "MXN", DE: "EUR", IT: "EUR", FR: "EUR", NL: "EUR", ES: "EUR", PT: "EUR", GR: "EUR", BE: "EUR", AT: "EUR", GB: "GBP", JP: "JPY", IN: "INR", CN: "CNY" };

// city, country, lat, lng, [product|vertical|unit|low USD|high USD]
const CITIES = [
  ["Kochi", "IN", 9.93, 76.27, ["Green Cardamom 8mm Bold Alleppey|F|5 kg bag|315|468", "Malabar Black Pepper 550 GL|F|25 kg sack|195|285", "Cold-Pressed Coconut Oil Virgin|F|20 L drum|88|132"]],
  ["Guntur", "IN", 16.31, 80.44, ["Teja Dried Red Chilli S17|F|25 kg sack|62|98", "Turmeric Powder Curcumin 5% Polished|F|25 kg sack|62|94"]],
  ["Ludhiana", "IN", 30.9, 75.86, ["Hex Bolt M8x40 Zinc Plated Grade 8.8|M|box of 500|42|68", "Stainless Steel A2 Hex Nut M10|M|box of 1,000|38|62", "Cold Rolled Steel Coil 1.2mm|M|ton|620|790"]],
  ["Tiruppur", "IN", 11.11, 77.34, ["Organic Cotton Combed Knit Fabric 180 GSM|T|roll of 100 m|380|580", "Cotton Jersey T-Shirt Blank Unisex|T|carton of 100|420|640"]],
  ["Surat", "IN", 21.17, 72.83, ["Polyester Mesh Sportswear Fabric 130 GSM|T|roll of 100 m|188|288", "Banarasi Silk Brocade Fabric Heritage Weave|T|roll of 50 m|1120|1840"]],
  ["Coimbatore", "IN", 11.0, 76.96, ["Submersible Pump 1HP Stainless|M|carton of 4|320|480", "Industrial Electric Motor 3-Phase 5HP|E|unit|180|290"]],
  ["Pune", "IN", 18.52, 73.86, ["Precision CNC Turned Brass Fittings|M|carton of 500|260|410", "Aluminium Die Cast Housing Auto Grade|M|pallet of 200|900|1480"]],
  ["Bengaluru", "IN", 12.97, 77.59, ["ESP32 Development Board 38-pin WiFi Bluetooth|E|box of 50|185|295", "Industrial Single-Board Computer Module 4GB|E|box of 20|980|1480", "LED Panel Light 18W 600x600 Warm White|E|carton of 10|245|395"]],
  ["Kolkata", "IN", 22.57, 88.36, ["Darjeeling First Flush Tea FTGFOP1|F|5 kg chest|215|385", "Handloom Jute Hessian Cloth 10oz|T|roll of 100 m|210|330"]],
  ["Jaipur", "IN", 26.91, 75.79, ["Block-Printed Cotton Voile Jaipur|T|roll of 60 m|264|408", "Sandstone Paving Slab Natural 600x300|C|pallet of 60|420|690"]],
  ["Mumbai", "IN", 19.08, 72.88, ["Nitrile Examination Gloves Powder-Free M|H|case of 1,000|64|104", "Cashew Kernels W320 Premium Whole|F|25 kg carton|215|298"]],
  ["Rajkot", "IN", 22.3, 70.8, ["Deep Groove Ball Bearing 6204-2RS|M|box of 100|98|154", "Diesel Engine Fuel Injection Pump|M|carton of 10|540|820"]],
  ["Moradabad", "IN", 28.84, 78.78, ["Solid Brass Door Handle Set|M|carton of 50|260|410", "Brass Ball Valve 1/2in BSP|M|carton of 50|134|208"]],
  ["Shenzhen", "CN", 22.54, 114.06, ["ESP32 Development Board 38-pin WiFi Bluetooth|E|box of 50|172|265", "18650 Li-ion Cell 3000mAh 3.7V|E|box of 100|520|780", "SMD LED 0603 Warm White Reel 4,000pc|E|reel|26|46", "USB-C to USB-C Cable 1m 100W PD|E|box of 100|240|380"]],
  ["Dongguan", "CN", 23.02, 113.75, ["Multilayer PCB 4-Layer Prototype Batch|E|batch of 100|180|320", "Injection Molded ABS Enclosure|M|pallet of 500|650|980"]],
  ["Ningbo", "CN", 29.87, 121.55, ["Self-Tapping Screw 4.8x38 Phillips Zinc|M|box of 1,000|18|32", "Threaded Rod M12 Class 8.8 1m Zinc|M|bundle of 50|52|84", "Hydraulic Bottle Jack 5 Ton|M|case of 10|224|338"]],
  ["Foshan", "CN", 23.02, 113.12, ["Ceramic Floor Tile 600x600 Glazed Vitrified|C|pallet of 48|880|1340", "Aluminium Profile Window Frame 6063|C|bundle of 100|760|1180"]],
  ["Guangzhou", "CN", 23.13, 113.26, ["Polyester Satin Fabric Printed 150D|T|roll of 100 m|165|260", "Led Street Light 100W Die Cast|S|carton of 4|380|560"]],
  ["Ho Chi Minh City", "VN", 10.82, 106.63, ["Cashew Kernels W320 Premium Whole|F|25 kg carton|205|285", "Robusta Coffee Beans Screen 18 Green|F|60 kg sack|168|240", "Frozen Pangasius Fillet IQF|F|10 kg carton|42|68"]],
  ["Hanoi", "VN", 21.03, 105.85, ["Bamboo Cutting Board Commercial|R|carton of 100|240|380", "Lacquerware Serving Tray Set|R|carton of 24|180|290"]],
  ["Bangkok", "TH", 13.76, 100.5, ["Jasmine Rice Hom Mali Grade A|F|50 kg sack|62|92", "Natural Rubber Latex Gloves Medium|H|case of 1,000|58|94"]],
  ["Penang", "MY", 5.41, 100.33, ["Semiconductor Test Socket Kit|E|box of 10|820|1320", "Nitrile Examination Gloves Powder-Free M|H|case of 1,000|58|96"]],
  ["Jakarta", "ID", -6.2, 106.85, ["RBD Palm Cooking Oil 18 L|P|carton of 20|520|760", "Sumatra Mandheling Arabica Green Coffee|F|60 kg sack|210|310"]],
  ["Colombo", "LK", 6.93, 79.85, ["Ceylon Orange Pekoe Black Tea|F|25 kg sack|98|148", "Cinnamon Quills Alba Grade|F|25 kg carton|235|340"]],
  ["Dhaka", "BD", 23.81, 90.41, ["Cotton Woven Trousers Bulk Production|T|carton of 100|620|940", "Jute Yarn 6 Lb Spun|T|bale|180|280"]],
  ["Sialkot", "PK", 32.49, 74.53, ["Surgical Scissors Stainless Steel Set|H|box of 50|260|420", "Football Match Ball Size 5|T|carton of 40|340|520"]],
  ["Taichung", "TW", 24.15, 120.67, ["Pneumatic Quick Coupling Set 1/4in|M|carton of 100|72|118", "CNC Machine Tool Spindle Cartridge|M|unit|820|1300"]],
  ["Osaka", "JP", 34.69, 135.5, ["Deep Groove Ball Bearing 6204-2RS|M|box of 100|140|210", "Precision Stainless Kitchen Knife 210mm|R|carton of 24|420|640"]],
  ["Nagoya", "JP", 35.18, 136.91, ["Automotive Wire Harness Assembly|E|carton of 100|520|820", "Tungsten Carbide Drill Bit Set 19-piece|M|case of 20|190|290"]],
  ["Seoul", "KR", 37.57, 126.98, ["Lithium Polymer Battery Pack 3.7V 5000mAh|E|box of 50|640|980", "OLED Display Module 0.96in I2C|E|box of 100|330|520"]],
  ["Gaziantep", "TR", 37.07, 37.38, ["Pistachio Kernels Raw Sorted|F|10 kg carton|175|265", "Baklava Phyllo Dough Frozen|F|carton of 10|48|78"]],
  ["Izmir", "TR", 38.42, 27.14, ["Extra Virgin Olive Oil Early Harvest|F|5 L tin|62|98", "Dried Aegean Figs Grade 1|F|10 kg carton|74|116"]],
  ["Bursa", "TR", 40.19, 29.06, ["Terry Cotton Towels 500 GSM|T|carton of 120|380|590", "Woven Cotton Canvas Duck 12oz Natural|T|roll of 50 m|245|375"]],
  ["Jaen", "ES", 37.77, -3.79, ["Cold-Pressed Extra Virgin Spanish Arbequina Olive Oil|F|5 L tin|58|90", "Picual Olive Oil Bulk IBC|F|1000 L IBC|3400|4800"]],
  ["Kalamata", "GR", 37.04, 22.11, ["Kalamata Olives Brined Jumbo|F|5 kg tub|38|62", "Greek Thyme Honey Raw|F|carton of 12|96|150"]],
  ["Modena", "IT", 44.65, 10.93, ["Ceramic Floor Tile 600x600 Glazed Vitrified|C|pallet of 48|980|1520", "Balsamic Vinegar of Modena IGP|F|carton of 6|68|110"]],
  ["Prato", "IT", 43.88, 11.1, ["Recycled Wool Blend Suiting Fabric|T|roll of 50 m|620|980", "Cotton Jersey Knit 220 GSM|T|roll of 100 m|420|660"]],
  ["Brescia", "IT", 45.54, 10.22, ["Stainless Steel Prep Table 1.5m with Shelf|R|unit|248|398", "Precision Ground Steel Shafts|M|bundle of 20|420|690"]],
  ["Parma", "IT", 44.8, 10.33, ["Parmigiano Reggiano 24 Month Wheel|F|wheel 38 kg|820|1180", "Durum Semolina Pasta Bronze Cut|F|carton of 12|42|68"]],
  ["Stuttgart", "DE", 48.78, 9.18, ["Socket Head Cap Screw M6x20 Grade 12.9|M|box of 500|45|72", "Precision Linear Guide Rail 20mm|M|carton of 10|380|620"]],
  ["Solingen", "DE", 51.17, 7.08, ["Stainless Steel Chef Knife Forged|R|carton of 24|520|820", "Professional Scissors Set|J|carton of 48|260|410"]],
  ["Nuremberg", "DE", 49.45, 11.08, ["Terminal Block Connector 5.08mm 4-Pin|E|box of 500|125|198", "Industrial Proximity Sensor M18|E|carton of 25|390|620"]],
  ["Hamburg", "DE", 53.55, 9.99, ["Specialty Roasted Coffee Beans 1 kg|F|carton of 10|98|148", "Shipping Container Corner Casting Kit|M|pallet of 50|820|1280"]],
  ["Rotterdam", "NL", 51.92, 4.48, ["Cut Tulip Bulbs Mixed Variety|F|carton of 500|180|290", "Hydroponic Grow Light LED 400W|S|carton of 4|520|780"]],
  ["Antwerp", "BE", 51.22, 4.4, ["Belgian Dark Chocolate Couverture 70%|F|10 kg block|98|150", "Industrial Diamond Cutting Discs|M|box of 25|420|690"]],
  ["Lyon", "FR", 45.76, 4.84, ["Silk Scarf Blanks Habotai 8mm|T|carton of 100|620|980", "Dijon Mustard Food Service 5 kg|F|carton of 4|34|58"]],
  ["Porto", "PT", 41.15, -8.61, ["Natural Cork Wine Stoppers Grade A|K|bag of 5,000|180|290", "Ceramic Tableware Hotel Grade|R|carton of 48|240|380"]],
  ["London", "GB", 51.51, -0.13, ["Earl Grey Loose Leaf Tea Bulk|F|5 kg bag|58|92", "Corrugated Mailer Box 12x9x4 Kraft|K|bundle of 200|260|410"]],
  ["Manchester", "GB", 53.48, -2.24, ["Waterproof Technical Jacket Shell Fabric|T|roll of 50 m|520|820", "Industrial Cleaning Concentrate 5L|J|case of 4|44|74"]],
  ["Houston", "US", 29.76, -95.37, ["Polyethylene Resin HDPE Pellets|P|bulk bag 1 ton|1120|1480", "Carbon Steel Seamless Pipe 2in Sch40|M|bundle of 20|1540|2140", "Oilfield Valve Gate 4in API 6D|M|unit|380|620"]],
  ["Detroit", "US", 42.33, -83.05, ["Brake Rotor Vented Passenger Car|M|pallet of 40|880|1320", "Automotive Wiring Harness Assembly|E|carton of 100|640|960"]],
  ["Fresno", "US", 36.74, -119.79, ["Raw Almonds Nonpareil 27/30|F|25 kg carton|178|248", "Pistachio Kernels Raw Sorted|F|10 kg carton|182|268", "Walnut Halves Light Extra 25kg|F|25 kg carton|154|226"]],
  ["Portland", "US", 45.52, -122.68, ["Specialty Single-Origin Coffee Green|F|60 kg sack|390|560", "Craft Beer Bottles Amber 330ml|K|pallet of 2,000|620|910"]],
  ["Austin", "US", 30.27, -97.74, ["Single-Board Computer Module 4GB Industrial|E|box of 20|940|1420", "Cold-Pressed Texas Pecan Halves|F|10 kg carton|168|242"]],
  ["Chicago", "US", 41.88, -87.63, ["Corrugated Mailer Box 12x9x4 Kraft|K|bundle of 200|215|335", "Concentrated Floor Cleaner Lemon 5L|J|case of 4|52|88"]],
  ["Los Angeles", "US", 34.05, -118.24, ["Organic Cotton Tee Blanks Heavyweight|T|carton of 100|520|780", "Solar Street Light 60W All-in-One|S|carton of 6|940|1420"]],
  ["Toronto", "CA", 43.65, -79.38, ["Maple Syrup Grade A Dark 18 L|F|pail|118|172", "Wild Blueberry Frozen IQF|F|10 kg carton|52|84"]],
  ["Monterrey", "MX", 25.69, -100.32, ["TMT Rebar Fe500D 12mm 12m|C|bundle of 40|880|1260", "Galvanized Steel Sheet 0.5mm|M|ton|690|880"]],
  ["Guadalajara", "MX", 20.66, -103.35, ["Agave Syrup Organic Light|F|carton of 12|98|150", "Printed Circuit Board Assembly Service Batch|E|batch of 100|420|690"]],
  ["Medellin", "CO", 6.24, -75.58, ["Colombian Supremo Coffee Green|F|70 kg sack|340|480", "Cut Flowers Roses Export Grade|F|box of 250 stems|92|148"]],
  ["Santos", "BR", -23.96, -46.33, ["Brazilian Santos Arabica Green Coffee|F|60 kg sack|240|330", "Raw Cane Sugar ICUMSA 45|F|50 kg sack|36|54"]],
  ["Addis Ababa", "ET", 9.03, 38.74, ["Ethiopian Yirgacheffe Coffee Green Grade 1|F|60 kg sack|420|590", "Sesame Seeds Humera Hulled|F|50 kg sack|92|142"]],
  ["Nairobi", "KE", -1.29, 36.82, ["Kenya AA Coffee Green|F|60 kg sack|440|610", "Kenya Black Tea CTC BP1|F|50 kg sack|98|148"]],
  ["Abidjan", "CI", 5.36, -4.01, ["Cocoa Beans Grade 1 Fermented|F|60 kg sack|240|340", "Raw Cashew Nuts in Shell|F|80 kg sack|120|190"]],
  ["Cairo", "EG", 30.04, 31.24, ["Giza Extra-Long Staple Cotton Fabric|T|roll of 100 m|420|660", "Fresh Orange Export Valencia|F|carton 15 kg|8|14"]],
  ["Casablanca", "MA", 33.57, -7.59, ["Argan Oil Cosmetic Grade|P|carton of 24 L|480|720", "Moroccan Olive Oil Extra Virgin|F|5 L tin|44|70"]],
  ["Dubai", "AE", 25.2, 55.27, ["Medjool Dates Jumbo|F|5 kg box|68|104", "Aluminium Extrusion Profile Anodized|C|bundle of 100|760|1160"]],
  ["Auckland", "NZ", -36.85, 174.76, ["Manuka Honey UMF 10+ Bulk|F|carton of 12|520|780", "Merino Wool Yarn Worsted|T|carton of 20|620|940"]],
  ["Melbourne", "AU", -37.81, 144.96, ["Macadamia Kernels Style 1|F|10 kg carton|290|410", "Merino Base Layer Fabric|T|roll of 50 m|480|740"]]
];

const COUNTRY_NAME = { IN: "India", CN: "China", VN: "Vietnam", TH: "Thailand", MY: "Malaysia", ID: "Indonesia", LK: "Sri Lanka", BD: "Bangladesh", PK: "Pakistan", TW: "Taiwan", JP: "Japan", KR: "South Korea", TR: "Turkey", ES: "Spain", GR: "Greece", IT: "Italy", DE: "Germany", NL: "Netherlands", BE: "Belgium", FR: "France", PT: "Portugal", GB: "United Kingdom", US: "United States", CA: "Canada", MX: "Mexico", CO: "Colombia", BR: "Brazil", ET: "Ethiopia", KE: "Kenya", CI: "Ivory Coast", EG: "Egypt", MA: "Morocco", AE: "United Arab Emirates", NZ: "New Zealand", AU: "Australia" };
const PREFIX = {
  IN: ["Shree", "Bharat", "Maruti", "Kaveri", "Anand", "Sai", "Hindustan", "Aryan"], CN: ["Huaxin", "Zhongke", "Golden Bridge", "Hongda", "Pearl River"], VN: ["Saigon", "Mekong", "Lotus", "Viet Star"],
  TH: ["Siam", "Chao Phraya", "Andaman"], MY: ["Penang", "Malaya", "Straits"], ID: ["Nusantara", "Garuda", "Sumatra"], LK: ["Ceylon", "Lanka", "Serendib"], BD: ["Padma", "Meghna", "Dhaka"], PK: ["Punjab", "Indus", "Sialkot"],
  TW: ["Formosa", "Taiyang", "Jade"], JP: ["Yamato", "Sakura", "Kobayashi"], KR: ["Hanbit", "Daehan", "Seoul Star"], TR: ["Anadolu", "Ege", "Marmara"], ES: ["Andaluza", "Iberia", "Sierra"], GR: ["Hellenic", "Aegean", "Peloponnese"],
  IT: ["Bianchi", "Rinaldi", "Colombo"], DE: ["Kaiser", "Brandt", "Hartmann"], NL: ["Van der Berg", "Hollandia", "Maas"], BE: ["Vandenberghe", "Flandria", "Brabo"], FR: ["Dubois", "Lumiere", "Rhone"], PT: ["Douro", "Atlantica", "Lusitana"],
  GB: ["Albion", "Thames", "Pennine"], US: ["Summit", "Lone Star", "Great Lakes", "Pacific"], CA: ["Northern", "Maple Leaf", "Lakeshore"], MX: ["Del Norte", "Sierra", "Aztec"], CO: ["Andes", "Cafetera", "Antioquia"], BR: ["Paulista", "Santos", "Mantiqueira"],
  ET: ["Abyssinia", "Rift Valley", "Sidama"], KE: ["Kilimanjaro", "Savanna", "Mount Kenya"], CI: ["Ivoire", "Lagune", "Cote Verte"], EG: ["Nile", "Delta", "Pharaoh"], MA: ["Atlas", "Souss", "Medina"], AE: ["Gulf", "Emirates", "Palm"],
  NZ: ["Kiwi", "Southern Alps", "Waikato"], AU: ["Southern Cross", "Murray", "Coastal"]
};
const SUFFIX = { IN: ["Industries", "Exports", "Enterprises", "Pvt Ltd"], CN: ["Co., Ltd", "Manufacturing"], DE: ["GmbH", "Werke GmbH"], IT: ["S.p.A.", "S.r.l."], US: ["LLC", "Corp", "Supply Co"], GB: ["Ltd", "Group"], JP: ["Co., Ltd", "Seiki"], ES: ["S.A."], FR: ["SAS"], TR: ["A.S."], MX: ["S.A. de C.V."], NL: ["B.V."], BE: ["N.V."], PT: ["Lda"], BR: ["Ltda"], CO: ["S.A.S."], default: ["Trading Co", "Group", "Exports"] };
const VERT_WORD = { FOOD_AND_BEVERAGE: ["Foods", "Agro", "Growers", "Estates"], TEXTILES_APPAREL: ["Textiles", "Mills", "Weaving"], DISCRETE_MANUFACTURING: ["Precision", "Forge", "Engineering"], ELECTRICAL: ["Electronics", "Systems", "Electro"], CONSTRUCTION: ["Materials", "Stone", "Building"], PROCESS_BATCH_PRODUCTION: ["Chemicals", "Processing", "Blend"], PACKAGING_MATERIALS: ["Packaging", "Print", "Pack"], CLEANTECH_ENERGY: ["Solar", "Energy", "Power"], RESTAURANT_EQUIPMENT: ["Kitchen", "Hospitality", "Equipment"], JANITORIAL: ["Hygiene", "Clean", "Care"], MEDICAL_SUPPLIES: ["Medical", "Surgical", "Health"] };
const CERTS = { FOOD_AND_BEVERAGE: ["FSSAI", "HACCP", "ISO 22000", "BRC", "Organic"], TEXTILES_APPAREL: ["OEKO-TEX", "GOTS", "WRAP"], DISCRETE_MANUFACTURING: ["ISO 9001", "IATF 16949", "ISO 14001"], ELECTRICAL: ["ISO 9001", "RoHS", "CE", "UL"], CONSTRUCTION: ["ISO 9001", "CE"], PROCESS_BATCH_PRODUCTION: ["ISO 9001", "REACH", "GMP"], PACKAGING_MATERIALS: ["ISO 9001", "FSC", "BRC"], CLEANTECH_ENERGY: ["IEC", "ISO 9001", "UL"], RESTAURANT_EQUIPMENT: ["NSF", "CE", "ISO 9001"], JANITORIAL: ["ISO 9001", "Ecolabel"], MEDICAL_SUPPLIES: ["ISO 13485", "CE", "FDA"] };
const SUPPLIER_CITY_PREFER = { US: "Summit" };

const clansPrev = JSON.parse(readFileSync("data/seeded-clans.json", "utf8"));
function referencedClanIds() {
  const found = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!name.endsWith(".json") || /seeded-clans|suppliers|clan-members|pre-/.test(name)) continue;
      for (const match of readFileSync(full, "utf8").matchAll(/clan-[a-z0-9-]+/g)) found.add(match[0]);
    }
  };
  for (const dir of [".scratch", "data"]) if (existsSync(dir)) walk(dir);
  return found;
}
// Keep original groups that claims, shipments or the ledger point to, plus a few per product spread over cities.
const referenced = referencedClanIds();
const keptPerProduct = new Map();
const originals = clansPrev.filter((c) => !String(c.id).startsWith("clan-gen-")).filter((c) => {
  if (referenced.has(c.id)) return true;
  const kept = keptPerProduct.get(c.canonicalSku) ?? [];
  if (kept.length >= 4 || kept.includes(c.city)) return false;
  keptPerProduct.set(c.canonicalSku, [...kept, c.city]);
  return true;
});
const suppliers = existsSync("data/suppliers.json") ? JSON.parse(readFileSync("data/suppliers.json", "utf8")).filter((s) => !s.regional) : [];

function makeSupplier(city, cc, vertical, index) {
  const r = rng(hash(`${city}-${vertical}-${index}`));
  const prefix = pick(r, PREFIX[cc] ?? ["Global"]);
  const word = pick(r, VERT_WORD[vertical]);
  const suffix = pick(r, SUFFIX[cc] ?? SUFFIX.default);
  const name = `${prefix} ${city === "Ho Chi Minh City" ? "Saigon" : city.split(" ")[0]} ${word} ${suffix}`.replace(/\s+/g, " ");
  const site = slug(name);
  const certs = CERTS[vertical].filter(() => r() < 0.65);
  if (certs.length === 0) certs.push(CERTS[vertical][0]);
  return {
    id: `sup-${slug(city)}-${slug(word)}-${index}`,
    name, country: COUNTRY_NAME[cc] ?? cc, countryCode: cc, city, categories: [vertical], products: [], certifications: certs, capabilities: [],
    yearsInBusiness: 5 + Math.floor(r() * 38), employees: [30, 80, 160, 400, 900][Math.floor(r() * 5)],
    leadTimeDays: ["IN", "CN", "VN", "TH", "ID", "BD", "PK", "LK", "ET", "KE", "CI"].includes(cc) ? 14 + Math.floor(r() * 24) : 5 + Math.floor(r() * 16),
    minOrderUnits: [50, 100, 200, 500][Math.floor(r() * 4)], paymentTerms: pick(r, ["PayPal escrow", "Net 30", "30% advance, 70% on shipment"]),
    acceptsPayPal: r() < 0.82, trustScore: Number((0.82 + r() * 0.17).toFixed(2)), onTimeRatePct: Math.round(80 + r() * 19), defectRatePct: Number((r() * 2.2).toFixed(1)),
    website: `https://www.${site}.example`, contact: { name: "Sales desk", email: `sales@${site}.example` },
    tiers: [{ minUnits: 500, discountPct: 8 + Math.floor(r() * 6) }, { minUnits: 1000, discountPct: 14 + Math.floor(r() * 6) }, { minUnits: 2000, discountPct: 20 + Math.floor(r() * 8) }],
    source: "simulated", regional: true, lastVerifiedAt: "2026-10-28"
  };
}

const SIZES = [100, 150, 200, 300, 400, 500, 800, 1000, 1500, 2000];
const SUFFIXES = ["Purchasing Syndicate", "Buying Group", "Wholesale Pool", "Bulk Buyers Circle", "Trade Cooperative"];
const generated = [];
const newSuppliers = [];

for (const [city, cc, lat, lng, items] of CITIES) {
  const supplierByVertical = new Map();
  for (const item of items) {
    const [product, vkey, unit, lowUsd, highUsd] = item.split("|");
    const vertical = V[vkey];
    if (!supplierByVertical.has(vertical)) {
      const pair = [makeSupplier(city, cc, vertical, 1), makeSupplier(city, cc, vertical, 2)];
      supplierByVertical.set(vertical, pair);
      newSuppliers.push(...pair);
    }
    const pair = supplierByVertical.get(vertical);
    const r = rng(hash(`${city}-${product}`));
    const groups = 2 + Math.floor(r() * 2);
    for (let g = 0; g < groups; g += 1) {
      const supplier = pair[g % 2];
      supplier.products.push(product);
      const target = SIZES[Math.floor(r() * SIZES.length)];
      const progress = r();
      const current = Math.floor(target * progress * (r() < 0.1 ? 1.05 : 1));
      const price = Math.round((Number(lowUsd) + r() * (Number(highUsd) - Number(lowUsd))) * 100);
      const short = product.split(" ").slice(0, 3).join(" ");
      generated.push({
        id: `clan-gen-${slug(city)}-${slug(product).slice(0, 36)}-${g + 1}`,
        name: `${city} ${short} ${SUFFIXES[Math.floor(r() * SUFFIXES.length)]}`,
        industryVertical: vertical, canonicalSku: product, unit,
        hsCodePrefix: `${String(1000 + Math.floor(r() * 8000)).slice(0, 4)}.${String(10 + Math.floor(r() * 80))}`,
        city, countryCode: cc, settlementCurrency: CUR[cc] ?? "USD", targetUnits: target, currentUnits: current, baseUnitPriceCents: price,
        discountTiers: [
          { minUnits: Math.round(target * 0.25), discountPct: 10 + Math.floor(r() * 8) },
          { minUnits: Math.round(target * 0.5), discountPct: 18 + Math.floor(r() * 8) },
          { minUnits: target, discountPct: 26 + Math.floor(r() * 10) }
        ],
        estimatedDeliveryDays: 4 + Math.floor(r() * 20), supplierId: supplier.id, supplierName: supplier.name, supplierTrustScore: supplier.trustScore,
        corridorId: `${city} Port and Air Cargo`, lat, lng,
        memberCount: Math.max(1, Math.min(25, Math.round(current / Math.max(1, target / (3 + Math.floor(r() * 18)))))),
        status: current >= target ? "LOCKED" : "FORMING", isCrossBorder: cc !== "US",
        createdAt: new Date(Date.UTC(2026, 10, 9 - Math.floor(r() * 25))).toISOString(), demo: true
      });
    }
  }
}

const seen = new Set();
const uniqueClans = generated.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
const merged = [...suppliers, ...newSuppliers.map((s) => ({ ...s, products: [...new Set(s.products)] }))];
writeFileSync("data/suppliers.json", JSON.stringify(merged, null, 2));
writeFileSync("data/seeded-clans.json", JSON.stringify([...originals, ...uniqueClans], null, 2));
const countries = new Set(uniqueClans.map((c) => c.countryCode));
console.log(`Wrote ${uniqueClans.length} regional groups in ${new Set(uniqueClans.map((c) => c.city)).size} cities across ${countries.size} countries, plus ${newSuppliers.length} local suppliers. Kept ${originals.length} original groups.`);

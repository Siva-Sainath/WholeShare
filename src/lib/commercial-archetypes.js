export const COMMERCIAL_ARCHETYPES = Object.freeze([
  {
    id: "DISCRETE_MANUFACTURING",
    domain: "Precision Machining & Advanced Manufacturing",
    archetypeTitle: "Discrete Manufacturing & Precision Machining",
    description: "Transforms raw bars, billets, sheets, and fasteners into physical parts via subtractive or additive tooling.",
    keywords: [
      "aluminum", "steel", "titanium", "carbide", "end mill", "drill bit",
      "coolant", "cnc", "lathe", "collet", "anodized", "fastener",
      "machining", "billet", "brass", "copper", "bar stock", "milling"
    ],
    primaryOutputs: [
      "precision machined metal components",
      "custom aerospace fittings",
      "fabricated metal assemblies"
    ],
    categoryMatchers: {
      RAW_MATERIAL: ["aluminum", "steel", "titanium", "brass", "copper", "bar stock", "billet", "sheet", "plate"],
      TOOLING: ["end mill", "carbide", "drill bit", "tap", "reamer", "insert", "collet"],
      CONSUMABLE: ["coolant", "lubricant", "cutting oil", "fluid", "abrasive", "solvent"],
      PACKAGING: ["corrugated", "crate", "antistatic", "bubble", "pallet"],
      MRO: ["spindle belt", "way lube", "wiper", "filter", "seal"]
    },
    poolingCommodityKeywords: ["aluminum", "steel", "bar stock", "coolant", "cutting oil", "corrugated"]
  },
  {
    id: "PROCESS_BATCH_PRODUCTION",
    domain: "Commercial Baking & Process Batch Production",
    archetypeTitle: "Process & Batch Recipe Production",
    description: "Formulates bulk food or chemical ingredients into recipe based consumable batches.",
    keywords: [
      "flour", "sugar", "yeast", "butter", "malt", "hops",
      "vanilla", "oil", "emulsifier", "extract", "ingredient", "baking",
      "brewery", "cocoa", "grain", "salt", "puree", "distillery"
    ],
    primaryOutputs: [
      "artisan baked goods",
      "specialty bottled beverages",
      "formulated food products"
    ],
    categoryMatchers: {
      RAW_MATERIAL: ["flour", "sugar", "grain", "yeast", "butter", "malt", "hops", "salt", "cocoa"],
      TOOLING: ["mixer blade", "proofing basket", "baking sheet", "pan liner", "thermometer"],
      CONSUMABLE: ["parchment paper", "sanitizer", "cleaning wash", "filter pad"],
      PACKAGING: ["bag", "box", "carton", "bottle", "keg", "label", "liner"],
      MRO: ["oven gasket", "mixer belt", "food grade grease", "seal"]
    },
    poolingCommodityKeywords: ["flour", "sugar", "grain", "salt", "parchment paper", "carton", "bottle"]
  },
  {
    id: "CONTROLLED_ENVIRONMENT_AGRICULTURE",
    domain: "Controlled Environment Agriculture & Vertical Farming",
    archetypeTitle: "Controlled Environment & Bio-Agricultural Production",
    description: "Cultivates living biological flora, microgreens, or fungi in indoor climate controlled matrices.",
    keywords: [
      "rockwool", "nutrient", "seeds", "coco coir", "hydroponic", "perlite",
      "substrate", "fertilizer", "spore", "ph down", "grow light", "aeroponic",
      "microgreen", "plugs", "macro concentrate"
    ],
    primaryOutputs: [
      "specialty microgreens",
      "organic culinary herbs",
      "fresh leafy greens",
      "gourmet mushrooms"
    ],
    categoryMatchers: {
      RAW_MATERIAL: ["seeds", "spores", "seedlings", "plugs", "starter"],
      TOOLING: ["harvest shears", "trays", "light ballast", "humidity sensor"],
      CONSUMABLE: ["rockwool", "nutrient", "coco coir", "perlite", "ph buffer", "fertilizer"],
      PACKAGING: ["clamshell", "vented bag", "punnet", "produce box", "pallet"],
      MRO: ["irrigation drip line", "pump impeller", "fan motor", "filter"]
    },
    poolingCommodityKeywords: ["rockwool", "coco coir", "nutrient", "fertilizer", "clamshell", "produce box"]
  },
  {
    id: "SERVICE_REPAIR_MRO",
    domain: "Automotive & Mechanical Equipment Repair (MRO)",
    archetypeTitle: "Service, Repair, Maintenance & Overhaul",
    description: "Diagnoses, services, and overhauls mechanical, automotive, or industrial machinery.",
    keywords: [
      "brake", "rotor", "compressor", "refrigerant", "gasket", "filter",
      "lubricant", "spark plug", "motor oil", "bearing", "alternator",
      "strut", "caliper", "hydraulic fluid", "serpentine belt"
    ],
    primaryOutputs: [
      "certified vehicle repairs",
      "restored HVAC systems",
      "overhauled industrial machinery"
    ],
    categoryMatchers: {
      RAW_MATERIAL: ["brake pad", "rotor", "compressor", "bearing", "spark plug", "strut"],
      TOOLING: ["scan tool", "torque wrench", "socket", "puller", "multimeter"],
      CONSUMABLE: ["motor oil", "brake cleaner", "refrigerant", "grease", "shop towels", "antifreeze"],
      PACKAGING: ["parts bag", "core return box", "shipping tag"],
      MRO: ["hydraulic seal", "drain plug", "hose clamp", "fuse"]
    },
    poolingCommodityKeywords: ["motor oil", "brake cleaner", "shop towels", "refrigerant", "antifreeze"]
  },
  {
    id: "HOSPITALITY_FOOD_SERVICE",
    domain: "Hospitality, Restaurant & Catering Operations",
    archetypeTitle: "Hospitality & Commercial Food Service",
    description: "Prepares ready to consume meals, specialty beverages, and dining hospitality services.",
    keywords: [
      "sirloin", "chicken", "produce", "cheese", "cream", "cooking oil",
      "take-out", "napkin", "menu", "restaurant", "catering", "dining",
      "seafood", "fries", "condiment", "beverage"
    ],
    primaryOutputs: [
      "prepared restaurant dishes",
      "catered event services",
      "artisan culinary dishes"
    ],
    categoryMatchers: {
      RAW_MATERIAL: ["beef", "chicken", "seafood", "produce", "cheese", "dairy", "seasoning"],
      TOOLING: ["chef knife", "saute pan", "cutting board", "thermocouple"],
      CONSUMABLE: ["frying oil", "parchment", "foil", "dish detergent", "sanitizer", "gloves"],
      PACKAGING: ["to-go container", "clamshell", "paper bag", "napkin", "cup", "lid"],
      MRO: ["fryer basket", "gasket", "griddle stone", "light bulb"]
    },
    poolingCommodityKeywords: ["frying oil", "to-go container", "napkin", "gloves", "paper bag"]
  },
  {
    id: "RETAIL_DISTRIBUTION_FULFILLMENT",
    domain: "Retail Distribution, Kitting & E-Commerce Fulfillment",
    archetypeTitle: "Retail Distribution & E-Commerce Fulfillment",
    description: "Warehouses, kits, repackages, and dispatches finished consumer or commercial goods.",
    keywords: [
      "mailer", "mailers", "void fill", "corrugated box", "shipping label", "shipping labels",
      "bubble wrap", "pallet jack", "inventory", "fulfillment", "wholesale sku", "tape",
      "carton", "poly mailer", "stretch wrap", "shipping boxes", "shipping box"
    ],
    primaryOutputs: [
      "fulfilled consumer orders",
      "kitted subscription shipments",
      "wholesale distribution dispatches"
    ],
    categoryMatchers: {
      RAW_MATERIAL: ["wholesale merchandise", "inventory goods", "apparel sku", "retail stock"],
      TOOLING: ["tape dispenser", "barcode scanner", "box cutter", "heat sealer"],
      CONSUMABLE: ["void fill", "bubble wrap", "packing paper", "thermal ribbon"],
      PACKAGING: ["poly mailer", "corrugated box", "shipping label", "tape", "stretch wrap"],
      MRO: ["pallet jack wheel", "conveyor roller", "battery", "printer head"]
    },
    poolingCommodityKeywords: ["corrugated box", "poly mailer", "shipping label", "tape", "stretch wrap"]
  },
  {
    id: "ARTISAN_SPECIALTY_CRAFT",
    domain: "Ceramic Arts & Specialty Pottery Production",
    archetypeTitle: "Artisan, Specialty Craft & Creative Production",
    description: "Hand shapes and thermally fires minerals, clay, wood, or glass into bespoke artisan objects.",
    keywords: [
      "clay", "glaze", "kiln", "stoneware", "bisque", "cone",
      "pottery", "ceramic", "slip", "underglaze", "throwing", "ceramic arts"
    ],
    primaryOutputs: [
      "functional stoneware ceramics",
      "custom pottery dinnerware",
      "bespoke ceramic art"
    ],
    categoryMatchers: {
      RAW_MATERIAL: ["clay", "stoneware", "porcelain", "raw feldspar", "silica", "frit"],
      TOOLING: ["trimming tool", "rib", "sponge", "bat", "kiln shelf", "post"],
      CONSUMABLE: ["glaze", "underglaze", "wax resist", "kiln wash", "cones"],
      PACKAGING: ["bubble wrap", "packing peanuts", "heavy box", "tissue"],
      MRO: ["element wire", "thermocouple", "relay", "peephole plug"]
    },
    poolingCommodityKeywords: ["clay", "stoneware", "glaze", "kiln wash", "bubble wrap"]
  }
]);

export const GENERALIZED_COMMERCIAL_FALLBACK = Object.freeze({
  id: "GENERALIZED_COMMERCIAL_OPERATIONS",
  domain: "Generalized Commercial Operations",
  archetypeTitle: "Autonomous Commercial Enterprise",
  description: "Autonomous commercial enterprise executing dynamic input-output transformations.",
  primaryOutputs: [
    "specialized commercial goods",
    "custom industrial products",
    "commercial services"
  ],
  categoryMatchers: {
    RAW_MATERIAL: ["material", "stock", "component", "part", "substance", "substrate"],
    TOOLING: ["tool", "instrument", "device", "gauge", "applicator", "fixture"],
    CONSUMABLE: ["fluid", "compound", "agent", "chemical", "cleaner", "solution"],
    PACKAGING: ["carton", "box", "wrap", "container", "bag", "label"],
    MRO: ["spare", "replacement", "fitting", "valve", "seal", "fastener"]
  },
  poolingCommodityKeywords: ["box", "carton", "wrap", "tape", "container", "label"]
});

export function findMatchingArchetype(lineItemDescriptions = []) {
  if (!Array.isArray(lineItemDescriptions) || lineItemDescriptions.length === 0) {
    return {
      archetype: GENERALIZED_COMMERCIAL_FALLBACK,
      score: 0,
      matchedKeywords: []
    };
  }

  const combinedText = lineItemDescriptions.join(" ").toLowerCase();
  let bestArchetype = GENERALIZED_COMMERCIAL_FALLBACK;
  let highestScore = 0;
  let bestMatches = [];

  for (const archetype of COMMERCIAL_ARCHETYPES) {
    let score = 0;
    const matches = [];

    for (const kw of archetype.keywords) {
      if (combinedText.includes(kw.toLowerCase())) {
        const weight = kw.includes(" ") ? 3 : 1;
        score += weight;
        matches.push(kw);
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestArchetype = archetype;
      bestMatches = matches;
    }
  }

  if (highestScore === 0) {
    return {
      archetype: GENERALIZED_COMMERCIAL_FALLBACK,
      score: 0,
      matchedKeywords: []
    };
  }

  return {
    archetype: bestArchetype,
    score: highestScore,
    matchedKeywords: bestMatches
  };
}

export function classifyMaterialCategory(itemDescription = "", archetype = GENERALIZED_COMMERCIAL_FALLBACK) {
  const desc = itemDescription.toLowerCase();
  const matchers = archetype.categoryMatchers || GENERALIZED_COMMERCIAL_FALLBACK.categoryMatchers;

  for (const [category, keywords] of Object.entries(matchers)) {
    for (const kw of keywords) {
      if (desc.includes(kw.toLowerCase())) {
        return category;
      }
    }
  }

  if (desc.includes("box") || desc.includes("pack") || desc.includes("wrap") || desc.includes("bag")) {
    return "PACKAGING";
  }
  if (desc.includes("oil") || desc.includes("fluid") || desc.includes("wash") || desc.includes("paper")) {
    return "CONSUMABLE";
  }
  if (desc.includes("tool") || desc.includes("blade") || desc.includes("drill") || desc.includes("cutter")) {
    return "TOOLING";
  }
  if (desc.includes("seal") || desc.includes("filter") || desc.includes("belt") || desc.includes("plug")) {
    return "MRO";
  }

  return "RAW_MATERIAL";
}

export function isPoolingCandidate(materialName = "", archetype = GENERALIZED_COMMERCIAL_FALLBACK) {
  const name = materialName.toLowerCase();
  const poolingKeywords = archetype.poolingCommodityKeywords || GENERALIZED_COMMERCIAL_FALLBACK.poolingCommodityKeywords;

  for (const kw of poolingKeywords) {
    if (name.includes(kw.toLowerCase())) {
      return true;
    }
  }

  const standardCommodityVerbs = ["bulk", "50lb", "barrel", "case", "pail", "pallet", "drum", "carton"];
  return standardCommodityVerbs.some(verb => name.includes(verb));
}

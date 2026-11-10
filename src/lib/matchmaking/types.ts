export interface MatchVector {
  smeName: string;
  industryVertical: string;
  city: string;
  countryCode: string;
  settlementCurrency: string;
  canonicalSku: string;
  hsCodePrefix: string;
  quantityRequested: number;
  currentUnitCostBaseline?: number;
  maxDeliveryDays: number;
}

export interface DiscountTier {
  minUnits: number;
  discountPct: number;
}

export interface FulfilmentPoint {
  label: string;
  address: string;
  city: string;
  countryCode?: string;
}

export interface Fulfilment {
  mode: "SINGLE_POINT" | "MULTIPLE_POINTS";
  points: FulfilmentPoint[];
}

export interface ClanCandidate {
  id: string;
  name: string;
  industryVertical: string;
  canonicalSku: string;
  hsCodePrefix: string;
  city: string;
  countryCode: string;
  settlementCurrency: string;
  targetUnits: number;
  currentUnits: number;
  baseUnitPriceCents: number;
  discountTiers: DiscountTier[];
  estimatedDeliveryDays: number;
  supplierId: string;
  supplierName: string;
  supplierTrustScore: number;
  corridorId?: string;
  lat: number;
  lng: number;
  memberCount: number;
  status: "FORMING" | "MOQ_REACHED" | "PAYPAL_AUTH_LOCKED" | "IN_TRANSIT" | "DISPUTE_OPEN" | "SETTLED";
  isCrossBorder?: boolean;
  createdAt: string;
  fulfilment?: Fulfilment;
}

export interface ScoringWeights {
  semanticAlignment: number;
  marginalDiscount: number;
  moqVelocity: number;
  corridorEfficiency: number;
  deliveryCompatibility: number;
  supplierTrust: number;
}

export interface FeatureBreakdown {
  semanticAlignment: number;
  marginalDiscount: number;
  moqVelocity: number;
  corridorEfficiency: number;
  deliveryCompatibility: number;
  supplierTrust: number;
}

export type RecommendationType =
  | "BEST_OVERALL_SAVINGS"
  | "FASTEST_DELIVERY"
  | "CLOSEST_TO_INSTANT_LOCK";

export interface ScoredClan {
  clan: ClanCandidate;
  matchScore: number;
  recommendationType: RecommendationType;
  featureBreakdown: FeatureBreakdown;
  summaryPill: string;
  marginalDiscountPercent: number;
  effectiveUnitCostCents: number;
  totalPoolUnitsAfterJoin: number;
  moqCompletionRatio: number;
  isDomestic: boolean;
  transitDays: number;
}

export interface GazetteerCity {
  city: string;
  region: string;
  countryCode: string;
  lat: number;
  lng: number;
  paypalCurrency: string;
  majorPortOrHub: string;
  typicalLocalDistricts: string[];
  dominantB2BSectors: string[];
}


import type { ActiveView } from "./types";

export const VALID_VIEWS: ActiveView[] = [
  "landing",
  "onboarding",
  "discover",
  "my-groups",
  "disputes",
  "agents",
  "paypal",
  "group",
  "mygroup",
  "insights",
  "settings",
  "mosaic-chat"
];

export const LEGACY_VIEW_ALIASES: Record<string, ActiveView> = {
  radar: "discover",
  ledger: "my-groups",
  inventory: "my-groups",
  leader: "my-groups",
  logistics: "disputes",
  subscriptions: "settings",
  mosaic: "mosaic-chat"
};

export const resolveView = (view: string): ActiveView | null => {
  const target = LEGACY_VIEW_ALIASES[view] ?? view;
  return VALID_VIEWS.includes(target as ActiveView) ? (target as ActiveView) : null;
};

export const VALID_LEDGER_COLUMNS = [
  "skuName",
  "sku",
  "currentUnits",
  "targetUnits",
  "unitPriceCents",
  "totalEscrowCents",
  "status",
  "totalEscrow",
  "unitPrice",
  "name"
];

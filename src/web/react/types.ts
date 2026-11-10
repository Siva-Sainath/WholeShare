export type ActiveView =
  | "landing"
  | "onboarding"
  | "discover"
  | "my-groups"
  | "disputes"
  | "agents"
  | "paypal"
  | "group"
  | "mygroup"
  | "insights"
  | "settings"
  | "mosaic-chat";

export interface ClanSummary {
  id: string;
  name: string;
  category: string;
  industryVertical: string;
  memberCount: number;
  maxMembers: number;
  totalVolume: number;
  moqTarget: number;
  progressPercent: number;
  discountRate: number;
  status: "OPEN" | "LOCKED" | "FULFILLED";
}

export interface SlideOverState {
  isOpen: boolean;
  clanId?: string;
  title?: string;
}

export interface OnboardingPrefill {
  businessName?: string;
  vertical?: string;
  spendLimit?: number;
  authHold?: number;
}

export type WebCmdAction =
  | { action: "NAVIGATE_VIEW"; params: { view: ActiveView } }
  | { action: "RESET_TO_LANDING" }
  | { action: "FILTER_CLANS"; params: { query?: string; category?: string } }
  | { action: "OPEN_SLIDE_OVER"; params: { clanId: string; title?: string } }
  | { action: "TRIGGER_ONBOARDING"; params?: { businessName?: string; industry?: string; spendLimit?: number } }
  | { action: "EXPORT_SNAPSHOT"; params?: { format?: "json" | "csv" } }
  | { action: "LEDGER_QUERY"; params: { query: string } };

export interface ReviewerPersona {
  id: string;
  label: string;
  businessName: string;
  lockedAmount: string;
  category: string;
  view: ActiveView;
}


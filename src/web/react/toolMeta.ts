// Which system a tool talks to and a plain sentence for why Mosaic is using it.
// The chat shows this while a tool runs, the way a coding agent shows its tool calls.

export type ToolSystem = "kernel" | "paypal" | "grid" | "bryntum" | "studio" | "app";

export interface ToolMeta {
  system: ToolSystem;
  systemLabel: string;
  running: string;
  why: string;
}

const APP: Pick<ToolMeta, "system" | "systemLabel"> = { system: "app", systemLabel: "WholeShare" };

export const TOOL_META: Record<string, ToolMeta> = {
  kernel_research_web_fact: { system: "kernel", systemLabel: "Kernel cloud browser", running: "Reading a web page", why: "Opening a real browser in the cloud to read the page, so the answer comes from the live site and not from memory." },
  find_suppliers: { system: "kernel", systemLabel: "Supplier search", running: "Looking for suppliers", why: "Checking the supplier directory first, then searching the web in a Kernel browser when you asked for new ones." },
  kernel_read_supplier_site: { system: "kernel", systemLabel: "Kernel cloud browser", running: "Reading a supplier site", why: "Browsing the supplier's own pages for prices, minimum order and lead time. It only reads and never submits a form." },
  query: { ...APP, running: "Reading the data", why: "Reading live rows and totals so the answer comes from your data, not memory." },
  resolve: { ...APP, running: "Finding the exact item", why: "Matching your words to the real group, shipment or supplier." },
  compare_groups: { system: "grid", systemLabel: "AG Grid", running: "Comparing the groups", why: "Pricing the same units in each group and weighing price, tier, delivery and supplier trust." },
  join_group: { system: "paypal", systemLabel: "PayPal", running: "Preparing your pledge", why: "Pricing the pledge and opening the PayPal approval step. You approve there. Mosaic never does." },
  setup_profile: { ...APP, running: "Setting up your profile", why: "Saving the details you gave and opening Settings so you can review them." },
  send_invoice_reminder: { system: "paypal", systemLabel: "PayPal", running: "Sending an invoice reminder", why: "Asking PayPal to remind the buyer about an open invoice. This is the sandbox, so nothing reaches a real inbox." },
  track_shipment: { system: "kernel", systemLabel: "Kernel cloud browser", running: "Tracking the shipment", why: "Comparing what WholeShare recorded with the carrier's own tracking page." },
  start_group_buy: { ...APP, running: "Setting up your group buy", why: "Opening the form with the details you gave. Nothing publishes until you review it." },
  present: { system: "grid", systemLabel: "AG Grid", running: "Putting the results in the side panel", why: "Showing the real rows in a grid you can sort, filter, group and chart." },
  ui_filter_clans: { ...APP, running: "Filtering buying groups", why: "Applying the search to the live catalog." },
  ui_navigate_view: { ...APP, running: "Opening a screen", why: "Taking you to the screen that holds this." },
  ui_open_group: { ...APP, running: "Opening a group", why: "Opening the group page where you can pledge." },
  ui_open_my_group: { ...APP, running: "Opening your group dashboard", why: "Opening the dashboard for a group you joined." },
  ui_open_report: { system: "studio", systemLabel: "AG Studio", running: "Opening a report", why: "Opening a live report built on your PayPal and group data." },
  query_escrow_ledger: { system: "paypal", systemLabel: "Escrow ledger", running: "Reading the escrow ledger", why: "Reading your pledges and holds from the local ledger." },
  prepare_pledge_quote: { system: "paypal", systemLabel: "PayPal", running: "Preparing a pledge quote", why: "Pricing a pledge. A quote is not an authorization. You approve on PayPal." },
  open_paypal_dashboard: { system: "paypal", systemLabel: "PayPal", running: "Preparing a PayPal link", why: "Building a link to PayPal's own page. Mosaic never approves payments." },
  file_damage_claim: { system: "bryntum", systemLabel: "Claims board", running: "Filing a damage claim", why: "Saving a draft claim with your photos. Nothing goes to the supplier until you review it." },
  schedule_move_delivery: { system: "bryntum", systemLabel: "Bryntum Scheduler", running: "Moving a delivery", why: "Changing the delivery date. The change is validated, logged and can be undone." },
  schedule_extend_inspection: { system: "bryntum", systemLabel: "Bryntum Scheduler", running: "Extending an inspection window", why: "Giving you more time to inspect delivered goods." },
  schedule_book_slot: { system: "bryntum", systemLabel: "Bryntum Scheduler", running: "Booking a receiving slot", why: "Reserving a time at the dock." },
  schedule_resolve_conflicts: { system: "bryntum", systemLabel: "Bryntum Scheduler", running: "Resolving schedule conflicts", why: "Finding deliveries that overlap and spacing them out." },
  explain_escrow_document: { ...APP, running: "Explaining an escrow document", why: "Reading the document and describing it in plain words." },
  get_clan_constitution: { ...APP, running: "Reading the group rules", why: "Looking up how this group votes, refunds and settles." },
  ui_open_slide_over: { ...APP, running: "Opening a detail panel", why: "Showing the details beside the page you are on." },
  ui_export_snapshot: { ...APP, running: "Exporting what is on screen", why: "Saving the current view so you can share it." },
  schedule_undo: { system: "bryntum", systemLabel: "Bryntum Scheduler", running: "Undoing a schedule change", why: "Restoring the previous delivery date." }
};

export function toolMeta(tool: string | undefined): ToolMeta {
  return (tool && TOOL_META[tool]) || { ...APP, running: "Working", why: "Doing a step for you." };
}

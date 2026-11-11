import { Scheduler } from "@bryntum/scheduler-enterprise";
import { claimRef, plainGroupName } from "./react/claimRef";
import { Toast } from "@bryntum/core-enterprise";
import { Grid } from "@bryntum/grid-enterprise";
import { Calendar } from "@bryntum/calendar-enterprise";
import { TaskBoard } from "@bryntum/taskboard-enterprise";
import { isCarrierFormatTracking } from "../lib/tracking-format.js";

declare const process: { env: { BRYNTUM_LICENSE_KEY?: string } };

// The trial key is injected at bundle time from BRYNTUM_LICENSE_KEY. It is never committed.
if (typeof window !== "undefined" && process.env.BRYNTUM_LICENSE_KEY) {
  const target = window as unknown as { bryntum?: { licenseKey?: string } };
  target.bryntum ??= {};
  target.bryntum.licenseKey = process.env.BRYNTUM_LICENSE_KEY;
}

export interface ShipmentTimelineRecord {
  id: string;
  clanId: string;
  memberId?: string;
  trackingNumber: string;
  carrierName?: string;
  product?: string;
  quantity?: number;
  status?: string;
  shipDate?: string;
  expectedDeliveryAt?: string;
  supplierDeliveredAt?: string;
  buyerDeliveredAt?: string;
  inspectionWindowEndsAt?: string;
  source?: string;
  conditionNotes?: string;
  createdAt?: string;
}

export interface ClanTimelineResource {
  status?: string;
  id: string;
  name: string;
  carrier: string;
  tracking: string;
}

export interface ClanTimelineEvent {
  id: string;
  resourceId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  eventColor?: string;
  cls?: string;
}

export interface ClanTimelineTimeRange {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
}

export interface ShipmentTimelineData {
  resources: ClanTimelineResource[];
  events: ClanTimelineEvent[];
  timeRanges: ClanTimelineTimeRange[];
}


function parseRecordDate(value: string | undefined): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatGridDate(value: Date | string | null | undefined): string {
  const date = value instanceof Date ? value : parseRecordDate(typeof value === "string" ? value : undefined);
  if (!date) return "Not recorded";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export interface CalendarDeadlineEvent {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  eventColor?: string;
  cls?: string;
  note?: string;
}

export function buildCalendarEvents(shipments: ShipmentTimelineRecord[] = []): CalendarDeadlineEvent[] {
  const events: CalendarDeadlineEvent[] = [];
  for (const s of shipments) {
    if (!s.clanId || s.source === "simulated" || !isCarrierFormatTracking(s.trackingNumber)) continue;
    const buy = parseRecordDate(s.buyerDeliveredAt);
    const inspEnd = parseRecordDate(s.inspectionWindowEndsAt);
    const ref = (s.product || "").replace(/\s*\(.*\)\s*$/, "").slice(0, 38) || s.trackingNumber || s.clanId;
    const track = s.trackingNumber ? `Tracking ${s.trackingNumber}` : "";
    if (buy) {
      events.push({
        id: `cal-delivery-${s.id}`,
        name: `Delivered: ${ref}`,
        note: track,
        startDate: buy,
        endDate: buy,
        eventColor: "#0070ba"
      });
    } else {
      const exp = parseRecordDate(s.expectedDeliveryAt || s.shipDate);
      if (exp) {
        events.push({
          id: `cal-expected-${s.id}`,
          name: `Arriving: ${ref}`,
          note: track,
          startDate: exp,
          endDate: exp,
          eventColor: "#5C6A79"
        });
      }
    }
    if (buy && inspEnd && inspEnd.getTime() > buy.getTime()) {
      events.push({
        id: `cal-inspection-${s.id}`,
        name: `Inspection: ${ref}`,
        note: track,
        startDate: buy,
        endDate: inspEnd,
        eventColor: "#FFC439",
        cls: "ws-inspection-event"
      });
    }
  }
  return events;
}

export interface ClaimTaskRecord {
  claimId: string;
  clanId: string;
  memberId?: string;
  damagedUnits?: number;
  unitPrice?: number;
  orderValue?: number;
  claimedAmount?: number;
  status: string;
  createdAt?: string;
}

function taskBoardColumnForStatus(status: string): string {
  const value = (status || "").toUpperCase();
  if (value === "DRAFT") return "draft";
  if (value === "SETTLED" || value === "RESOLVED") return "settled";
  if (value === "REJECTED") return "rejected";
  return "supplier";
}

export function buildClaimTasks(claims: ClaimTaskRecord[] = []): any[] {
  return claims.map((c) => {
    const amount = typeof c.claimedAmount === "number" ? c.claimedAmount : c.orderValue;
    const filed = parseRecordDate(c.createdAt);
    const filedLabel = filed ? filed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not recorded";
    const units = typeof c.damagedUnits === "number" ? `${c.damagedUnits} units damaged` : "Units not recorded";
    const amountLabel = typeof amount === "number" ? `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Amount not recorded";
    return {
      id: c.claimId,
      name: (c as ClaimTaskRecord & { product?: string }).product || c.claimId,
      status: taskBoardColumnForStatus(c.status),
      eventColor: ({ draft: "orange", supplier: "blue", settled: "green", rejected: "red" } as Record<string, string>)[taskBoardColumnForStatus(c.status)],
      memberId: (c as ClaimTaskRecord & { memberId?: string }).memberId || "",
      description: `${claimRef(c.claimId)} · ${units} · ${amountLabel} · Filed ${filedLabel}`
    };
  });
}

export function buildShipmentTimelineData(
  shipments: ShipmentTimelineRecord[] = [],
  _ledgerClans: any[] = []
): ShipmentTimelineData {
  const resources: ClanTimelineResource[] = [];
  const events: ClanTimelineEvent[] = [];
  const timeRanges: ClanTimelineTimeRange[] = [];

  // Resources and events come only from real shipments. One row per shipment.
  const now = new Date();

  for (const s of shipments) {
    if (!s.clanId || s.source === "simulated" || !isCarrierFormatTracking(s.trackingNumber)) continue;
    const record = s as ShipmentTimelineRecord & { status?: string; product?: string };
    const status = String(record.status || "").toUpperCase();
    resources.push({
      id: s.id,
      name: record.product || s.clanId,
      carrier: s.carrierName || "Carrier not recorded",
      tracking: s.trackingNumber || "Not recorded",
      status
    } as ClanTimelineResource);

    const sup = parseRecordDate(s.supplierDeliveredAt);
    const buy = parseRecordDate(s.buyerDeliveredAt);
    const inspEnd = parseRecordDate(s.inspectionWindowEndsAt);
    if (sup && buy && buy.getTime() >= sup.getTime()) {
      const effectiveEnd = buy.getTime() === sup.getTime() ? new Date(buy.getTime() + 24 * 3600 * 1000) : buy;
      events.push({ id: `shipment-transit-${s.id}`, resourceId: s.id, name: "Delivered", startDate: sup, endDate: effectiveEnd, cls: "ws-ev-delivered" });
    } else if (sup) {
      const exp = parseRecordDate(s.expectedDeliveryAt);
      const effectiveEnd = exp && exp.getTime() > sup.getTime() ? exp : new Date(sup.getTime() + 3 * 24 * 3600 * 1000);
      const delayed = status === "DELAYED";
      events.push({ id: `shipment-transit-${s.id}`, resourceId: s.id, name: delayed ? "Delayed" : "In transit", startDate: sup, endDate: effectiveEnd, cls: delayed ? "ws-ev-delayed" : "ws-ev-transit" });
    }
    if (buy && inspEnd && inspEnd.getTime() > buy.getTime()) {
      events.push({ id: `shipment-inspection-${s.id}`, resourceId: s.id, name: "Inspection", startDate: buy, endDate: inspEnd, cls: "ws-inspection-event ws-ev-inspection" });
      if (now.getTime() >= buy.getTime() && now.getTime() <= inspEnd.getTime()) {
        timeRanges.push({ id: `range-inspection-${s.id}`, name: "", startDate: buy, endDate: inspEnd });
      }
    }
  }

  return { resources, events, timeRanges };
}

const schedulerInstances = new Map<string, Scheduler>();
let activeSchedulerInstance: Scheduler | null = null;
let activeGridInstance: Grid | null = null;
let activeCalendarInstance: Calendar | null = null;
let activeTaskBoardInstance: TaskBoard | null = null;

// The Scheduler that is on screen now, if any. Used by the Bryntum WebMCP tools.
export function getBryntumScheduler(): Scheduler | null {
  const instances = Array.from(schedulerInstances.values());
  return instances[instances.length - 1] ?? null;
}

export function destroyBryntumScheduler(containerId?: string): void {
  const ids = containerId ? [containerId] : Array.from(schedulerInstances.keys());
  for (const id of ids) {
    const instance = schedulerInstances.get(id);
    if (!instance) continue;
    try {
      instance.destroy();
    } catch {
      // Ignore
    }
    schedulerInstances.delete(id);
    if (activeSchedulerInstance === instance) activeSchedulerInstance = null;
  }
}

export function destroyBryntumGrid(): void {
  if (activeGridInstance) {
    try {
      activeGridInstance.destroy();
    } catch {
      // Ignore
    }
    activeGridInstance = null;
  }
}

export function destroyBryntumCalendar(): void {
  if (activeCalendarInstance) {
    try {
      activeCalendarInstance.destroy();
    } catch {
      // Ignore
    }
    activeCalendarInstance = null;
  }
}

export function destroyBryntumTaskBoard(): void {
  if (activeTaskBoardInstance) {
    try {
      activeTaskBoardInstance.destroy();
    } catch {
      // Ignore
    }
    activeTaskBoardInstance = null;
  }
}

const HOUR_MS = 3600 * 1000;

async function postSchedule(path: string, body: Record<string, unknown>): Promise<{ summary: string }> {
  const response = await fetch(`/api/v1/schedule/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json()) as { error?: string; change?: { summary?: string } };
  if (!response.ok) throw new Error(payload.error || "The schedule could not be changed.");
  return { summary: payload.change?.summary || "Schedule updated" };
}

async function postClaim(path: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`/api/v1/support/claims/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "The claim could not be changed.");
}

const isTransit = (id: string) => id.startsWith("shipment-transit-");
const isInspection = (id: string) => id.startsWith("shipment-inspection-");

export function initBryntumScheduler(
  shipments: any = [],
  targetContainerId: string = "bryntumSchedulerMount",
  height: number = 560,
  compact: boolean = false
): Scheduler | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const container = document.getElementById(targetContainerId);
  if (!container) {
    return null;
  }

  destroyBryntumScheduler(targetContainerId);
  container.innerHTML = "";

  const shipmentList = Array.isArray(shipments) ? shipments : (shipments?.shipments || []);
  const { resources, events, timeRanges } = buildShipmentTimelineData(shipmentList);

  const DAY_MS = 24 * 3600 * 1000;
  const activeShipments = shipmentList.filter((s: any) => {
    const st = (s.status || "").toLowerCase();
    return st === "in_transit" || st === "delayed" || st === "transit";
  });

  // Window spans the earliest active dispatch to the latest expected delivery, so
  // in-flight bars and the inspection windows of recent deliveries are both in view.
  const dispatchTimes: number[] = [];
  const expectedTimes: number[] = [];
  for (const s of activeShipments) {
    const sup = parseRecordDate(s.supplierDeliveredAt || s.shipDate);
    const exp = parseRecordDate(s.expectedDeliveryAt);
    if (sup) dispatchTimes.push(sup.getTime());
    if (exp) expectedTimes.push(exp.getTime());
  }

  let startDate: Date;
  let endDate: Date;
  if (dispatchTimes.length > 0) {
    startDate = new Date(Math.min(...dispatchTimes) - 4 * DAY_MS);
    endDate = new Date((expectedTimes.length > 0 ? Math.max(...expectedTimes) : Math.max(...dispatchTimes)) + 2 * DAY_MS);
  } else {
    const allTimes = events.flatMap((e) => [e.startDate.getTime(), e.endDate.getTime()]);
    startDate = allTimes.length > 0 ? new Date(Math.min(...allTimes) - DAY_MS) : new Date();
    endDate = allTimes.length > 0 ? new Date(Math.max(...allTimes) + DAY_MS) : new Date(startDate.getTime() + 14 * DAY_MS);
  }
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  const activeClanIds = new Set(activeShipments.map((s: any) => s.id));
  const visibleResourceIds = new Set(
    events
      .filter((e) => e.endDate.getTime() >= startDate.getTime() && e.startDate.getTime() <= endDate.getTime())
      .map((e) => e.resourceId)
  );
  const visibleResources = resources
    .filter((r) => visibleResourceIds.has(r.id))
    .sort((x, y) => Number(activeClanIds.has(y.id)) - Number(activeClanIds.has(x.id)));

  const viewPreset = "weekAndDay";

  // Pattern adapted from bryntum/showcases (Logistics Control Tower & DockSchedule)
  const instance = new Scheduler({
    appendTo: container,
    startDate,
    endDate,
    viewPreset,
    barMargin: 10,
    rowHeight: 52,
    height,
    columns: compact
      ? [{ text: "Shipment", field: "name", width: 170 }]
      : [
          { text: "Shipment", field: "name", width: 260 },
          { text: "Carrier", field: "carrier", width: 90 },
          { text: "Tracking", field: "tracking", width: 150 }
        ],
    resources: visibleResources,
    events,
    timeRanges,
    listeners: {
      // Only a shipment still on the road can be moved. Delivered bars stay put.
      beforeEventDrag: ({ eventRecord }: any) => isTransit(String(eventRecord.id)) && eventRecord.cls !== "ws-ev-delivered" && !String(eventRecord.cls || "").includes("ws-ev-delivered"),
      beforeEventResize: ({ eventRecord }: any) => (isTransit(String(eventRecord.id)) && !String(eventRecord.cls || "").includes("ws-ev-delivered")) || isInspection(String(eventRecord.id)),
      beforeEventDropFinalize: ({ context }: any) => {
        context.async = true;
        const record = context.eventRecord;
        const days = Math.round((context.endDate.getTime() - record.endDate.getTime()) / DAY_MS);
        if (days === 0) { context.finalize(false); return; }
        postSchedule("move", { shipment: String(record.resourceId), days, reason: "Dragged on the timeline" })
          .then((result) => { Toast.show(result.summary); context.finalize(true); })
          .catch((err: Error) => { Toast.show(err.message); context.finalize(false); });
      },
      beforeEventResizeFinalize: ({ context }: any) => {
        context.async = true;
        const record = context.eventRecord;
        if (context.startDate.getTime() !== record.startDate.getTime()) { Toast.show("Only the end can move. The start is when it was dispatched or delivered."); context.finalize(false); return; }
        const request = isInspection(String(record.id))
          ? postSchedule("extend-inspection", { shipment: String(record.resourceId), hours: Math.round((context.endDate.getTime() - record.startDate.getTime()) / HOUR_MS) })
          : postSchedule("move", { shipment: String(record.resourceId), days: Math.round((context.endDate.getTime() - record.endDate.getTime()) / DAY_MS), reason: "Resized on the timeline" });
        request
          .then((result) => { Toast.show(result.summary); context.finalize(true); })
          .catch((err: Error) => { Toast.show(err.message); context.finalize(false); });
      }
    },
    features: {
      stripe: true,
      eventDrag: { constrainDragToResource: true },
      eventResize: true,
      timeRanges: {
        showCurrentTimeLine: false,
        showHeaderElements: false
      },
      eventTooltip: {
        template: (data: any) => `
          <div class="ws-timeline-tooltip" style="padding: 8px;">
            <div style="font-weight: 600; font-size: 13px; color: #0F1F2E;">${data.eventRecord.name}</div>
            <div style="font-size: 11px; color: #5C6A79; margin-top: 4px;">Start: ${data.eventRecord.startDate.toLocaleString()}</div>
            <div style="font-size: 11px; color: #5C6A79;">End: ${data.eventRecord.endDate.toLocaleString()}</div>
          </div>
        `
      }
    },
    eventRenderer: ({ eventRecord }: any) => {
      const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `<span class="ws-ev-label"><b>${eventRecord.name}</b><small>${fmt(eventRecord.startDate)} to ${fmt(eventRecord.endDate)}</small></span>`;
    }
  });

  try {
    instance.zoomToSpan({ startDate, endDate, leftMargin: 8, rightMargin: 8 });
  } catch {
    // Fit is cosmetic. The configured window still renders.
  }

  schedulerInstances.set(targetContainerId, instance);
  activeSchedulerInstance = instance;
  return instance;
}

// Pattern adapted from bryntum/showcases (ShipmentGridPanel)
export function initBryntumGrid(
  data: any[] = [],
  targetContainerId: string = "bryntumGridMount",
  height: number = 360
): Grid | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const container = document.getElementById(targetContainerId);
  if (!container) {
    return null;
  }

  destroyBryntumGrid();
  container.innerHTML = "";

  const rows = (Array.isArray(data) ? data : []).map((s: any) => {
    const buy = parseRecordDate(s.buyerDeliveredAt);
    const sup = parseRecordDate(s.supplierDeliveredAt);
    return {
      trackingNumber: s.trackingNumber || "Not recorded",
      carrierName: s.carrierName || "Not recorded",
      clanId: plainGroupName((s as { groupName?: string }).groupName, s.clanId || "") || "Not recorded",
      supplierDeliveredAt: sup,
      buyerDeliveredAt: buy,
      deliveryStatus: buy ? "Delivered" : sup ? "In transit" : "Scheduled"
    };
  });

  activeGridInstance = new Grid({
    appendTo: container,
    height,
    data: rows,
    features: {
      stripe: true
    },
    columns: [
      { text: "Tracking", field: "trackingNumber", flex: 1.2 },
      { text: "Carrier", field: "carrierName", flex: 1 },
      { text: "Buying group", field: "clanId", flex: 1.4 },
      { text: "Dispatched", field: "supplierDeliveredAt", flex: 1, renderer: ({ value }: any) => formatGridDate(value) },
      { text: "Delivered", field: "buyerDeliveredAt", flex: 1, renderer: ({ value }: any) => formatGridDate(value) },
      { text: "Status", field: "deliveryStatus", flex: 0.8 }
    ]
  });

  return activeGridInstance;
}

// Pattern adapted from bryntum/showcases (Calendar integration)
export function initBryntumCalendar(
  shipments: any = [],
  targetContainerId: string = "bryntumCalendarMount",
  height: number = 520
): Calendar | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const container = document.getElementById(targetContainerId);
  if (!container) {
    return null;
  }

  destroyBryntumCalendar();
  container.innerHTML = "";

  const shipmentList = Array.isArray(shipments) ? shipments : (shipments?.shipments || []);
  const events = buildCalendarEvents(shipmentList);

  activeCalendarInstance = new Calendar({
    appendTo: container,
    height,
    date: new Date("2026-11-09T00:00:00.000Z"),
    events,
    modes: {
      day: false,
      week: false,
      month: true,
      year: false,
      agenda: true
    }
  });

  return activeCalendarInstance;
}

// Pattern adapted from bryntum/showcases (TaskBoard integration)
export function initBryntumTaskBoard(
  claims: any = [],
  targetContainerId: string = "bryntumTaskBoardMount",
  height: number = 420
): TaskBoard | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const container = document.getElementById(targetContainerId);
  if (!container) {
    return null;
  }

  destroyBryntumTaskBoard();
  container.innerHTML = "";

  const claimList = Array.isArray(claims) ? claims : (claims?.claims || []);
  const tasks = buildClaimTasks(claimList);

  activeTaskBoardInstance = new TaskBoard({
    appendTo: container,
    height,
    columnField: "status",
    features: { taskEdit: false },
    columns: [
      { id: "draft", text: "Draft", color: "orange" },
      { id: "supplier", text: "With supplier", color: "blue" },
      { id: "settled", text: "Settled", color: "green" },
      { id: "rejected", text: "Rejected", color: "red" }
    ],
    tasks,
    listeners: {
      // Approving a claim is a real action and the server decides. The supplier's answer is theirs, so cards are not dragged past With supplier.
      beforeTaskDrop: async ({ taskRecords, targetColumn }: any) => {
        const task = taskRecords[0];
        const from = String(task.status);
        const to = String(targetColumn.id);
        if (from === to) return false;
        try {
          if (from === "draft" && to === "supplier") {
            await postClaim("approve", { claimId: String(task.id), memberId: String(task.memberId || "") });
            Toast.show(`Approved ${claimRef(String(task.id))}. It is now with the supplier.`);
          } else if (from === "supplier") {
            Toast.show("With the supplier. This card moves to Settled or Rejected when they answer.");
            return false;
          } else {
            Toast.show("A claim moves from Draft to With supplier when you approve it.");
            return false;
          }
          return true;
        } catch (err) {
          Toast.show((err as Error).message);
          return false;
        }
      }
    }
  });

  return activeTaskBoardInstance;
}

export function zoomBryntumScheduler(direction: "in" | "out" | "fit"): void {
  const scheduler = activeSchedulerInstance;
  if (!scheduler) return;
  if (direction === "in") scheduler.zoomIn();
  else if (direction === "out") scheduler.zoomOut();
  else scheduler.zoomToFit({ leftMargin: 8, rightMargin: 8 });
}

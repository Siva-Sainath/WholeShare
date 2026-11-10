import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getDeliveryStorage } from "../storage/delivery.storage.ts";
import { getClanById } from "./matchmaking/clanStore.ts";
import { isCarrierFormatTracking } from "./tracking-format.js";
import { actionDispatcher } from "./web-actions.js";

// The one place that changes delivery dates, inspection windows and receiving slots.
// Mosaic's tools and the Bryntum Scheduler (drag and resize) both call these functions, so a change made by
// either one is validated the same way, logged the same way and can be undone the same way.

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_TRANSIT_DAYS = 45;
const MIN_INSPECTION_HOURS = 24;
const MAX_INSPECTION_HOURS = 96;
const DOCK_PER_DAY = 2;

function dataPath(name) {
  return resolve(process.cwd(), ".scratch", name);
}

function readJson(file, fallback) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

const LOG_FILE = () => dataPath("schedule-log.json");
const SLOT_FILE = () => dataPath("schedule-slots.json");

const toIso = (ms) => new Date(ms).toISOString();
const dayKey = (iso) => String(iso).slice(0, 10);
const isWeekend = (ms) => [0, 6].includes(new Date(ms).getUTCDay());

function records() {
  return getDeliveryStorage().getAll().filter((record) => record.source !== "simulated" && isCarrierFormatTracking(record.trackingNumber));
}

function inFlight(record) {
  return !record.buyerDeliveredAt && Boolean(record.expectedDeliveryAt);
}

function cityOf(record) {
  return getClanById(record.clanId)?.city ?? "Unknown";
}

function label(record) {
  return record.product || getClanById(record.clanId)?.canonicalSku || record.clanId;
}

const stem = (word) => word.replace(/(ies)$/, "y").replace(/(es|s)$/, "");

// Accepts an id, a group id, a tracking number or words from the product name. Must match exactly one record.
export function findShipment(query, { needInFlight = false, needDelivered = false } = {}) {
  const text = String(query || "").trim().toLowerCase();
  if (!text) throw new Error("Say which shipment. Use its product, group id or tracking number.");
  let pool = records();
  if (needInFlight) pool = pool.filter(inFlight);
  if (needDelivered) pool = pool.filter((record) => Boolean(record.buyerDeliveredAt));
  const exact = pool.filter((record) => [record.id, record.trackingNumber, record.clanId].some((value) => String(value).toLowerCase() === text));
  const hits = exact.length > 0 ? exact : pool.filter((record) => [record.id, record.clanId, record.trackingNumber, record.product, record.carrierName].some((value) => String(value ?? "").toLowerCase().includes(text)) || text.split(/\s+/).map(stem).every((word) => String(record.product ?? "").toLowerCase().includes(word)));
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) throw new Error(`No ${needInFlight ? "in transit " : needDelivered ? "delivered " : ""}shipment matches '${query}'.`);
  const options = hits.slice(0, 5).map((record) => `${record.id} (${label(record)})`).join("; ");
  throw new Error(`'${query}' matches ${hits.length} shipments. Be more specific: ${options}.`);
}

function appendLog(entry) {
  const log = readJson(LOG_FILE(), []);
  const full = { id: `chg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), undone: false, ...entry };
  log.push(full);
  writeJson(LOG_FILE(), log.slice(-200));
  actionDispatcher.broadcast("SCHEDULE_CHANGED", { change: full });
  return full;
}

function save(record) {
  getDeliveryStorage().upsert(record);
}

function describeDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function moveDelivery({ shipment, days, toDate, actor = "person", reason = "" }) {
  const record = findShipment(shipment, { needInFlight: true });
  const current = Date.parse(record.expectedDeliveryAt);
  let target;
  if (toDate) {
    const parsed = Date.parse(toDate);
    if (Number.isNaN(parsed)) throw new Error(`'${toDate}' is not a date.`);
    target = Date.parse(`${dayKey(toIso(parsed))}T${record.expectedDeliveryAt.slice(11)}`);
  } else if (Number.isFinite(Number(days))) {
    target = current + Number(days) * DAY_MS;
  } else {
    throw new Error("Give a number of days to shift or a new date.");
  }
  const dispatch = Date.parse(record.supplierDeliveredAt || record.shipDate || record.createdAt);
  if (target < dispatch + DAY_MS) {
    const earliest = dispatch + DAY_MS;
    const room = Math.floor((current - earliest) / DAY_MS);
    throw new Error(`A delivery cannot arrive less than a day after the supplier dispatched it. The earliest possible date for ${label(record)} is ${describeDate(toIso(earliest))}.${room >= 1 ? ` You can move it up by at most ${room} ${room === 1 ? "day" : "days"}.` : " It is already at the earliest date."}`);
  }
  if (target > dispatch + MAX_TRANSIT_DAYS * DAY_MS) throw new Error(`A delivery cannot be scheduled more than ${MAX_TRANSIT_DAYS} days after dispatch.`);
  if (target === current) throw new Error("That is already the delivery date.");
  const before = record.expectedDeliveryAt;
  const updated = { ...record, expectedDeliveryAt: toIso(target) };
  save(updated);
  const change = appendLog({ kind: "move", shipmentId: record.id, product: label(record), field: "expectedDeliveryAt", before, after: updated.expectedDeliveryAt, actor, reason, summary: `Moved the ${label(record)} delivery from ${describeDate(before)} to ${describeDate(updated.expectedDeliveryAt)}` });
  return { status: "SUCCESS", change, shipment: updated };
}

export function extendInspection({ shipment, hours, actor = "person", reason = "" }) {
  const record = findShipment(shipment, { needDelivered: true });
  const delivered = Date.parse(record.buyerDeliveredAt);
  const newHours = Number(hours);
  if (!Number.isFinite(newHours)) throw new Error("Give the inspection window in hours.");
  if (newHours < MIN_INSPECTION_HOURS || newHours > MAX_INSPECTION_HOURS) throw new Error(`An inspection window must be between ${MIN_INSPECTION_HOURS} and ${MAX_INSPECTION_HOURS} hours.`);
  const before = record.inspectionWindowEndsAt;
  const target = delivered + newHours * HOUR_MS;
  if (toIso(target) === before) throw new Error(`The inspection window is already ${newHours} hours.`);
  const updated = { ...record, inspectionWindowEndsAt: toIso(target) };
  save(updated);
  const change = appendLog({ kind: "inspection", shipmentId: record.id, product: label(record), field: "inspectionWindowEndsAt", before, after: updated.inspectionWindowEndsAt, actor, reason, summary: `Set the ${label(record)} inspection window to ${newHours} hours, ending ${describeDate(updated.inspectionWindowEndsAt)}` });
  return { status: "SUCCESS", change, shipment: updated };
}

export function bookSlot({ shipment, date, hour, point = "", actor = "person" }) {
  const record = findShipment(shipment, { needInFlight: true });
  const day = dayKey(toIso(Date.parse(date)));
  const slotHour = Number(hour);
  if (!Number.isInteger(slotHour) || slotHour < 6 || slotHour > 18) throw new Error("Receiving slots run from 6 to 18 o'clock.");
  const city = cityOf(record);
  // A group can receive at one point or several. Each point has its own dock, so two points can take a delivery at the same hour.
  const points = getClanById(record.clanId)?.fulfilment?.points ?? [];
  const wanted = String(point || "").trim().toLowerCase();
  const chosen = points.find((candidate) => String(candidate.label).toLowerCase() === wanted) ?? (wanted ? null : points[0]);
  if (wanted && !chosen) throw new Error(`This group receives at: ${points.map((candidate) => candidate.label).join(", ") || "one point"}. Pick one of those.`);
  const dock = chosen?.label ? `${city} (${chosen.label})` : city;
  const slots = readJson(SLOT_FILE(), []);
  const taken = slots.find((slot) => (slot.dock ?? slot.city) === dock && slot.date === day && slot.hour === slotHour && slot.shipmentId !== record.id);
  if (taken) throw new Error(`The ${dock} dock is already booked at ${slotHour}:00 on ${day} for ${taken.product}. Pick another hour.`);
  const previous = slots.find((slot) => slot.shipmentId === record.id) ?? null;
  const next = slots.filter((slot) => slot.shipmentId !== record.id).concat({ shipmentId: record.id, product: label(record), city, dock, date: day, hour: slotHour });
  writeJson(SLOT_FILE(), next);
  const change = appendLog({ kind: "slot", shipmentId: record.id, product: label(record), field: "receivingSlot", before: previous, after: { date: day, hour: slotHour }, actor, summary: `Booked the ${city} receiving dock at ${slotHour}:00 on ${describeDate(day)} for ${label(record)}` });
  return { status: "SUCCESS", change, slot: next.find((slot) => slot.shipmentId === record.id) };
}

export function getConflicts() {
  const flights = records().filter(inFlight);
  const conflicts = [];
  const byCityDay = new Map();
  for (const record of flights) {
    const key = `${cityOf(record)}|${dayKey(record.expectedDeliveryAt)}`;
    byCityDay.set(key, [...(byCityDay.get(key) ?? []), record]);
  }
  for (const [key, group] of byCityDay) {
    if (group.length > DOCK_PER_DAY) {
      const [city, day] = key.split("|");
      conflicts.push({ kind: "dock", city, date: day, shipmentIds: group.map((record) => record.id), message: `${group.length} deliveries are due at the ${city} dock on ${describeDate(day)}. The dock handles ${DOCK_PER_DAY} a day.` });
    }
  }
  for (const record of flights) {
    if (isWeekend(Date.parse(record.expectedDeliveryAt))) {
      conflicts.push({ kind: "weekend", shipmentIds: [record.id], date: dayKey(record.expectedDeliveryAt), message: `${label(record)} is due on a weekend (${describeDate(record.expectedDeliveryAt)}), when receiving is closed.` });
    }
    if (record.status === "DELAYED") {
      conflicts.push({ kind: "delayed", shipmentIds: [record.id], date: dayKey(record.expectedDeliveryAt), message: `${label(record)} is delayed by the carrier and now due ${describeDate(record.expectedDeliveryAt)}.` });
    }
  }
  for (const record of records().filter((entry) => entry.buyerDeliveredAt && entry.inspectionWindowEndsAt)) {
    const end = Date.parse(record.inspectionWindowEndsAt);
    if (end > Date.now() && isWeekend(end)) {
      conflicts.push({ kind: "inspection-weekend", shipmentIds: [record.id], date: dayKey(record.inspectionWindowEndsAt), message: `The ${label(record)} inspection window ends on a weekend (${describeDate(record.inspectionWindowEndsAt)}).` });
    }
  }
  return conflicts;
}

// Proposes the smallest moves that clear dock overload and weekend deliveries. With apply true, makes them.
export function resolveConflicts({ apply = false, actor = "person" } = {}) {
  const proposals = [];
  const claimed = new Map();
  const load = (record) => `${cityOf(record)}|${dayKey(record.expectedDeliveryAt)}`;
  for (const record of records().filter(inFlight)) claimed.set(load(record), (claimed.get(load(record)) ?? 0) + 1);
  const weekendFix = (ms) => (new Date(ms).getUTCDay() === 6 ? 2 : new Date(ms).getUTCDay() === 0 ? 1 : 0);
  const touched = new Set();
  for (const conflict of getConflicts().filter((entry) => entry.kind === "dock" || entry.kind === "weekend")) {
    for (const id of conflict.shipmentIds.slice(conflict.kind === "dock" ? DOCK_PER_DAY : 0)) {
      if (touched.has(id)) continue;
      const record = records().find((entry) => entry.id === id);
      if (!record) continue;
      let shift = conflict.kind === "weekend" ? weekendFix(Date.parse(record.expectedDeliveryAt)) : 1;
      let guard = 0;
      while (guard < 7) {
        const target = Date.parse(record.expectedDeliveryAt) + shift * DAY_MS;
        const key = `${cityOf(record)}|${dayKey(toIso(target))}`;
        if (!isWeekend(target) && (claimed.get(key) ?? 0) < DOCK_PER_DAY) break;
        shift += 1;
        guard += 1;
      }
      const targetKey = `${cityOf(record)}|${dayKey(toIso(Date.parse(record.expectedDeliveryAt) + shift * DAY_MS))}`;
      claimed.set(load(record), (claimed.get(load(record)) ?? 1) - 1);
      claimed.set(targetKey, (claimed.get(targetKey) ?? 0) + 1);
      touched.add(id);
      proposals.push({ shipmentId: id, product: label(record), shiftDays: shift, reason: conflict.message });
    }
  }
  if (!apply) return { status: "SUCCESS", applied: false, conflicts: getConflicts().length, proposals };
  const changes = [];
  for (const proposal of proposals) {
    try {
      changes.push(moveDelivery({ shipment: proposal.shipmentId, days: proposal.shiftDays, actor, reason: proposal.reason }).change);
    } catch (err) {
      proposal.error = err.message;
    }
  }
  return { status: "SUCCESS", applied: true, proposals, changes, remaining: getConflicts().length };
}

export function undoLast({ actor = "person" } = {}) {
  const log = readJson(LOG_FILE(), []);
  const last = [...log].reverse().find((entry) => !entry.undone);
  if (!last) throw new Error("Nothing to undo.");
  if (last.kind === "slot") {
    const slots = readJson(SLOT_FILE(), []).filter((slot) => slot.shipmentId !== last.shipmentId);
    writeJson(SLOT_FILE(), last.before ? slots.concat({ ...last.before, shipmentId: last.shipmentId, product: last.product, city: last.before.city ?? "Unknown" }) : slots);
  } else {
    const record = records().find((entry) => entry.id === last.shipmentId);
    if (!record) throw new Error("That shipment no longer exists.");
    save({ ...record, [last.field]: last.before });
  }
  last.undone = true;
  writeJson(LOG_FILE(), log);
  const summary = `Undid: ${last.summary}`;
  actionDispatcher.broadcast("SCHEDULE_CHANGED", { change: { ...last, kind: "undo", summary, actor } });
  return { status: "SUCCESS", undone: last, summary };
}

export function getScheduleState() {
  return {
    inFlight: records().filter(inFlight).map((record) => ({ id: record.id, clanId: record.clanId, product: label(record), city: cityOf(record), status: record.status, dispatchedAt: record.supplierDeliveredAt, expectedAt: record.expectedDeliveryAt })),
    delivered: records().filter((record) => record.buyerDeliveredAt).sort((a, b) => Date.parse(b.buyerDeliveredAt) - Date.parse(a.buyerDeliveredAt)).slice(0, 8).map((record) => ({ id: record.id, clanId: record.clanId, product: label(record), city: cityOf(record), deliveredAt: record.buyerDeliveredAt, inspectionEndsAt: record.inspectionWindowEndsAt })),
    conflicts: getConflicts(),
    slots: readJson(SLOT_FILE(), []),
    log: readJson(LOG_FILE(), []).slice(-20).reverse()
  };
}

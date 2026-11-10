import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { moveDelivery, extendInspection, bookSlot, getConflicts, resolveConflicts, undoLast, findShipment } from "../src/lib/schedule-service.js";

const delivery = resolve(process.cwd(), ".scratch/developer-2-escrow-settlement-disputes/delivery-records.json");
const backup = `${delivery}.test-backup`;
const logFile = resolve(process.cwd(), ".scratch/schedule-log.json");
const slotFile = resolve(process.cwd(), ".scratch/schedule-slots.json");

before(() => {
  copyFileSync(delivery, backup);
  for (const file of [logFile, slotFile]) if (existsSync(file)) rmSync(file);
});
after(() => {
  copyFileSync(backup, delivery);
  rmSync(backup);
  for (const file of [logFile, slotFile]) if (existsSync(file)) rmSync(file);
});

test("finds a shipment by product words and rejects ambiguity", () => {
  assert.equal(findShipment("corrugated", { needInFlight: true }).carrierName.length > 0, true);
  assert.throws(() => findShipment("pistachio", { needInFlight: true }), /matches 2 shipments/);
  assert.throws(() => findShipment("nothing like this"), /No shipment matches/);
});

test("moves a delivery, logs it, and undoes it", () => {
  const before = findShipment("corrugated", { needInFlight: true }).expectedDeliveryAt;
  const result = moveDelivery({ shipment: "corrugated", days: -2, actor: "mosaic", reason: "test" });
  assert.equal(result.status, "SUCCESS");
  assert.notEqual(result.shipment.expectedDeliveryAt, before);
  assert.equal(result.change.actor, "mosaic");
  undoLast();
  assert.equal(findShipment("corrugated", { needInFlight: true }).expectedDeliveryAt, before);
});

test("refuses deliveries before dispatch and past the limit", () => {
  assert.throws(() => moveDelivery({ shipment: "corrugated", days: -60 }), /less than a day/);
  assert.throws(() => moveDelivery({ shipment: "corrugated", days: 90 }), /more than 45 days/);
  assert.throws(() => moveDelivery({ shipment: "corrugated" }), /number of days/);
});

test("inspection windows stay between 24 and 96 hours", () => {
  const delivered = findShipment("del-clan-austin-cold-pressed-extra-004-sme_seattle_01", { needDelivered: true });
  assert.ok(delivered.buyerDeliveredAt);
  assert.throws(() => extendInspection({ shipment: delivered.id, hours: 12 }), /between 24 and 96/);
  assert.throws(() => extendInspection({ shipment: delivered.id, hours: 200 }), /between 24 and 96/);
  const result = extendInspection({ shipment: delivered.id, hours: 72 });
  assert.equal(Date.parse(result.shipment.inspectionWindowEndsAt) - Date.parse(delivered.buyerDeliveredAt), 72 * 3600 * 1000);
  undoLast();
});

test("one receiving slot per hour per city", () => {
  bookSlot({ shipment: "corrugated", date: "2026-11-20", hour: 9 });
  assert.throws(() => bookSlot({ shipment: "combed", date: "2026-11-20", hour: 9 }), /already booked/);
  const other = bookSlot({ shipment: "combed", date: "2026-11-20", hour: 10 });
  assert.equal(other.slot.hour, 10);
});

test("resolving conflicts clears weekend deliveries", () => {
  const preview = resolveConflicts({ apply: false });
  assert.equal(preview.applied, false);
  const applied = resolveConflicts({ apply: true, actor: "mosaic" });
  assert.equal(applied.applied, true);
  assert.equal(getConflicts().filter((conflict) => conflict.kind === "weekend" || conflict.kind === "dock").length, 0);
});

test("books the dock of a receiving point and rejects a point the group does not have", async () => {
  const { rebaseStoryShipments } = await import("../src/lib/story-clock.js");
  rebaseStoryShipments();
  const booked = bookSlot({ shipment: "takeout container", date: "2026-11-21", hour: 8 });
  assert.match(booked.slot.dock, /Flushing \(Back door, Main St\)/);
  assert.throws(() => bookSlot({ shipment: "takeout container", date: "2026-11-21", hour: 9, point: "Loading bay 9" }), /receives at/);
});

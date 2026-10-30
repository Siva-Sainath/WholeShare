import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DeliveryAdapter,
  DeliveryConfirmationError,
  FORTY_EIGHT_HOURS_MS,
  TWO_DAYS_MS,
} from "../src/adapter/delivery.adapter.ts";
import { DeliveryStorage } from "../src/storage/delivery.storage.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_STORAGE_PATH = path.join(__dirname, "test-delivery-records.json");

describe("Ticket 08: Two-Party Delivery Confirmation & Inspection Clock Invariants", () => {
  let storage: DeliveryStorage;
  let adapter: DeliveryAdapter;

  beforeEach(() => {
    if (fs.existsSync(TEST_STORAGE_PATH)) {
      fs.unlinkSync(TEST_STORAGE_PATH);
    }
    storage = new DeliveryStorage(TEST_STORAGE_PATH);
    adapter = new DeliveryAdapter(storage);
  });

  describe("1. Single-Write Invariant (ADR-0011)", () => {
    it("allows supplier to record delivery timestamp once", () => {
      const t0 = new Date("2026-10-26T10:00:00.000Z");
      const record = adapter.confirmDelivery({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        role: "supplier",
        deliveredAt: t0,
        trackingNumber: "1Z9999999999999999",
      });

      assert.equal(record.supplierDeliveredAt, t0.toISOString());
      assert.equal(record.buyerDeliveredAt, null);
      assert.equal(record.inspectionWindowEndsAt, null);
    });

    it("rejects attempt by supplier to overwrite an existing supplier confirmation", () => {
      const t0 = new Date("2026-10-26T10:00:00.000Z");
      adapter.confirmDelivery({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        role: "supplier",
        deliveredAt: t0,
      });

      const tLater = new Date("2026-10-26T12:00:00.000Z");
      assert.throws(
        () => {
          adapter.confirmDelivery({
            clanId: "clan-austin-organic-flour-01",
            memberId: "buyer-maria-bakery",
            role: "supplier",
            deliveredAt: tLater,
          });
        },
        (err: any) => {
          assert.equal(err instanceof DeliveryConfirmationError, true);
          assert.equal(err.code, "OVERWRITE_FORBIDDEN");
          return true;
        }
      );
    });

    it("rejects attempt by buyer to overwrite an existing buyer confirmation", () => {
      const t0 = new Date("2026-10-26T14:00:00.000Z");
      adapter.confirmDelivery({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        role: "buyer",
        deliveredAt: t0,
      });

      const tLater = new Date("2026-10-26T16:00:00.000Z");
      assert.throws(
        () => {
          adapter.confirmDelivery({
            clanId: "clan-austin-organic-flour-01",
            memberId: "buyer-maria-bakery",
            role: "buyer",
            deliveredAt: tLater,
          });
        },
        (err: any) => {
          assert.equal(err instanceof DeliveryConfirmationError, true);
          assert.equal(err.code, "OVERWRITE_FORBIDDEN");
          return true;
        }
      );
    });

    it("accepts Developer 1 coalitionId and smeId for delivery confirmation", () => {
      const t0 = new Date("2026-10-26T10:00:00.000Z");
      const record = adapter.confirmDelivery({
        coalitionId: "coalition_flour_01",
        smeId: "sme_artisan_tx",
        role: "supplier",
        deliveredAt: t0,
        trackingNumber: "1Z9999999999999999",
      });

      assert.equal(record.clanId, "coalition_flour_01");
      assert.equal(record.memberId, "sme_artisan_tx");
      assert.equal(record.supplierDeliveredAt, t0.toISOString());
    });
  });

  describe("2. 48-Hour Inspection Clock Trigger (ADR-0011)", () => {
    it("starts 48-hour inspection countdown from the later of supplier and buyer confirmation", () => {
      // Scenario from ADR-0011 & Spec:
      // Supplier confirms delivery at T0.
      // Buyer confirms delivery at T0 + 4 hours.
      // Inspection countdown ends exactly 48 hours after buyer confirmation (T0 + 52 hours).
      const t0 = new Date("2026-10-26T08:00:00.000Z");
      const tBuyer = new Date("2026-10-26T12:00:00.000Z"); // T0 + 4 hours

      adapter.confirmDelivery({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        role: "supplier",
        deliveredAt: t0,
      });

      const updated = adapter.confirmDelivery({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-maria-bakery",
        role: "buyer",
        deliveredAt: tBuyer,
        conditionNotes: "20 bags damaged with forklift punctures",
      });

      assert.equal(updated.supplierDeliveredAt, t0.toISOString());
      assert.equal(updated.buyerDeliveredAt, tBuyer.toISOString());

      // Expected window end: T0 + 4 hours + 48 hours = T0 + 52 hours
      const expectedEnd = new Date(tBuyer.getTime() + FORTY_EIGHT_HOURS_MS).toISOString();
      assert.equal(updated.inspectionWindowEndsAt, expectedEnd);
      assert.equal(updated.conditionNotes, "20 bags damaged with forklift punctures");
    });

    it("handles buyer confirming before supplier properly", () => {
      const tBuyer = new Date("2026-10-26T08:00:00.000Z");
      const tSupplier = new Date("2026-10-26T10:00:00.000Z"); // Later

      adapter.confirmDelivery({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-golden-crust",
        role: "buyer",
        deliveredAt: tBuyer,
      });

      const updated = adapter.confirmDelivery({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-golden-crust",
        role: "supplier",
        deliveredAt: tSupplier,
      });

      const expectedEnd = new Date(tSupplier.getTime() + FORTY_EIGHT_HOURS_MS).toISOString();
      assert.equal(updated.inspectionWindowEndsAt, expectedEnd);
    });
  });

  describe("3. 2-Day Silence Auto-Confirmation Rule (ADR-0011)", () => {
    it("does not auto-confirm if less than 48 hours have elapsed since supplier confirmation", () => {
      const t0 = new Date("2026-10-26T10:00:00.000Z");
      adapter.confirmDelivery({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-sweet-treats",
        role: "supplier",
        deliveredAt: t0,
      });

      // Check after 24 hours (before 2 days)
      const checkDate = new Date("2026-10-27T10:00:00.000Z");
      const record = adapter.evaluateAutoConfirmation(
        "clan-austin-organic-flour-01",
        "buyer-sweet-treats",
        checkDate
      );

      assert.equal(record?.buyerDeliveredAt, null);
      assert.equal(record?.inspectionWindowEndsAt, null);
    });

    it("auto-confirms after 48 hours of buyer silence and starts the 48-hour inspection countdown then", () => {
      const t0 = new Date("2026-10-26T10:00:00.000Z");
      adapter.confirmDelivery({
        clanId: "clan-austin-organic-flour-01",
        memberId: "buyer-sweet-treats",
        role: "supplier",
        deliveredAt: t0,
      });

      // Check after 50 hours (more than 48 hours / 2 days)
      const checkDate = new Date(t0.getTime() + 50 * 60 * 60 * 1000);
      const record = adapter.evaluateAutoConfirmation(
        "clan-austin-organic-flour-01",
        "buyer-sweet-treats",
        checkDate
      );

      // Auto-confirmed timestamp must equal T0 + 48 hours (2 days)
      const expectedAutoConfirmed = new Date(t0.getTime() + TWO_DAYS_MS).toISOString();
      assert.equal(record?.buyerDeliveredAt, expectedAutoConfirmed);
      assert.equal(record?.source, "auto_confirmed");

      // Inspection window ends 48 hours after auto-confirmed (T0 + 96 hours)
      const expectedEnd = new Date(t0.getTime() + TWO_DAYS_MS + FORTY_EIGHT_HOURS_MS).toISOString();
      assert.equal(record?.inspectionWindowEndsAt, expectedEnd);
    });
  });
});

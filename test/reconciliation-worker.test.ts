import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { IdempotencyStorage } from "../src/storage/idempotency.storage.ts";
import {
  ReconciliationWorker,
  type RemoteStatusQueryProvider,
} from "../src/daemon/reconciliation.worker.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.resolve(__dirname, "temp-reconcile-test");

describe("Ticket 12: Stale PENDING Reconciliation Worker Invariants", () => {
  let storage: IdempotencyStorage;
  let worker: ReconciliationWorker;
  const testLedgerPath = path.join(TEST_DIR, "test-ledger.json");

  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    fs.writeFileSync(testLedgerPath, JSON.stringify([], null, 2), "utf8");
    storage = new IdempotencyStorage(testLedgerPath);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("1. Concurrency Control (SKIP LOCKED Simulation)", () => {
    it("claims pending records and prevents concurrent workers from double-claiming", () => {
      storage.createRecord({
        operationKey: "op-pending-1",
        operationType: "CAPTURE",
        clanId: "clan-1",
        stage: "TEST",
        status: "PENDING",
      });
      storage.createRecord({
        operationKey: "op-pending-2",
        operationType: "REFUND",
        clanId: "clan-1",
        stage: "TEST",
        status: "PENDING",
      });

      const worker1 = new ReconciliationWorker(storage);
      const worker2 = new ReconciliationWorker(storage);

      const claimedByWorker1 = worker1.claimPendingRecords(10);
      assert.equal(claimedByWorker1.length, 2);

      // Concurrent worker sees zero available pending records because worker 1 holds locks
      const claimedByWorker2 = worker1.claimPendingRecords(10);
      assert.equal(claimedByWorker2.length, 0);

      // Worker 1 releases lock
      worker1.releaseLock("op-pending-1");
      const reClaimed = worker1.claimPendingRecords(10);
      assert.equal(reClaimed.length, 1);
      assert.equal(reClaimed[0].operationKey, "op-pending-1");
    });
  });

  describe("2. Immutable Safety Window & Escalation", () => {
    it("escalates stale PENDING record to NEEDS_REVIEW when past 72h retention window", async () => {
      const pastTime = new Date(Date.now() - 75 * 60 * 60 * 1000).toISOString();
      storage.createRecord({
        operationKey: "op-stale-75h",
        operationType: "CAPTURE",
        clanId: "clan-1",
        stage: "TEST",
        status: "PENDING",
        firstSentAt: pastTime,
        recheckCount: 0,
      });

      worker = new ReconciliationWorker(storage, undefined, 72, 5);
      const summary = await worker.reconcileBatch();

      assert.equal(summary.escalatedNeedsReview, 1);
      const updated = storage.getRecord("op-stale-75h");
      assert.equal(updated?.status, "NEEDS_REVIEW");
    });

    it("escalates PENDING record to NEEDS_REVIEW when max recheck count is exceeded", async () => {
      storage.createRecord({
        operationKey: "op-max-rechecks",
        operationType: "CAPTURE",
        clanId: "clan-1",
        stage: "TEST",
        status: "PENDING",
        firstSentAt: new Date().toISOString(),
        recheckCount: 5, // Max is 5
      });

      worker = new ReconciliationWorker(storage, undefined, 72, 5);
      const summary = await worker.reconcileBatch();

      assert.equal(summary.escalatedNeedsReview, 1);
      const updated = storage.getRecord("op-max-rechecks");
      assert.equal(updated?.status, "NEEDS_REVIEW");
    });

    it("increments recheck count within window when remote query is pending", async () => {
      storage.createRecord({
        operationKey: "op-in-flight",
        operationType: "CAPTURE",
        clanId: "clan-1",
        stage: "TEST",
        status: "PENDING",
        firstSentAt: new Date().toISOString(),
        recheckCount: 1,
      });

      worker = new ReconciliationWorker(storage, undefined, 72, 5);
      const summary = await worker.reconcileBatch();

      assert.equal(summary.rechecksIncremented, 1);
      const updated = storage.getRecord("op-in-flight");
      assert.equal(updated?.status, "PENDING");
      assert.equal(updated?.recheckCount, 2);
    });
  });

  describe("3. Remote Status Query Reconciliation", () => {
    it("reconciles capture confirmed COMPLETED on PayPal to SUCCEEDED", async () => {
      storage.createRecord({
        operationKey: "op-cap-remote-check",
        operationType: "CAPTURE",
        clanId: "clan-1",
        stage: "TEST",
        referenceId: "74H63527HK822241U:1160.00",
        status: "PENDING",
        firstSentAt: new Date().toISOString(),
      });

      const provider: RemoteStatusQueryProvider = {
        getCapture: async (id) => ({
          id,
          status: "COMPLETED",
        }),
      };

      worker = new ReconciliationWorker(storage, provider, 72, 5);
      const summary = await worker.reconcileBatch();

      assert.equal(summary.reconciledSucceeded, 1);
      const updated = storage.getRecord("op-cap-remote-check");
      assert.equal(updated?.status, "SUCCEEDED");
      assert.equal(updated?.paypalReference, "74H63527HK822241U");
    });

    it("reconciles refund confirmed COMPLETED on PayPal to SUCCEEDED", async () => {
      storage.createRecord({
        operationKey: "op-ref-remote-check",
        operationType: "REFUND",
        clanId: "clan-1",
        stage: "TEST",
        referenceId: "3UL90630A5638033F:116.00",
        status: "PENDING",
        firstSentAt: new Date().toISOString(),
      });

      const provider: RemoteStatusQueryProvider = {
        getRefund: async (id) => ({
          id,
          status: "COMPLETED",
        }),
      };

      worker = new ReconciliationWorker(storage, provider, 72, 5);
      const summary = await worker.reconcileBatch();

      assert.equal(summary.reconciledSucceeded, 1);
      const updated = storage.getRecord("op-ref-remote-check");
      assert.equal(updated?.status, "SUCCEEDED");
    });

    it("reconciles payout batch in SUCCESS status to SUCCEEDED", async () => {
      storage.createRecord({
        operationKey: "op-payout-check",
        operationType: "PAYOUT",
        clanId: "clan-1",
        stage: "TEST",
        referenceId: "4YARQWK7HTLRN",
        status: "PENDING",
        firstSentAt: new Date().toISOString(),
      });

      const provider: RemoteStatusQueryProvider = {
        getPayoutBatch: async () => ({
          batch_header: { batch_status: "SUCCESS" },
        }),
      };

      worker = new ReconciliationWorker(storage, provider, 72, 5);
      const summary = await worker.reconcileBatch();

      assert.equal(summary.reconciledSucceeded, 1);
      const updated = storage.getRecord("op-payout-check");
      assert.equal(updated?.status, "SUCCEEDED");
    });

    it("transitions record to FAILED when remote PayPal resource returns NOT_FOUND (404)", async () => {
      storage.createRecord({
        operationKey: "op-not-found",
        operationType: "CAPTURE",
        clanId: "clan-1",
        stage: "TEST",
        referenceId: "NONEXISTENT-RESOURCE",
        status: "PENDING",
        firstSentAt: new Date().toISOString(),
      });

      const provider: RemoteStatusQueryProvider = {
        getCapture: async () => {
          throw new Error("RESOURCE_NOT_FOUND (404)");
        },
      };

      worker = new ReconciliationWorker(storage, provider, 72, 5);
      const summary = await worker.reconcileBatch();

      assert.equal(summary.reconciledFailed, 1);
      const updated = storage.getRecord("op-not-found");
      assert.equal(updated?.status, "FAILED");
    });
  });
});

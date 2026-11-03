import test, { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  IdempotencyStorage,
  IdempotencyRecordConflictError,
} from "../src/storage/idempotency.storage.ts";
import {
  PayPalMoneyGateway,
  IdempotencyInFlightError,
  IdempotencyRetentionExpiredError,
} from "../src/gateway/PayPalMoneyGateway.ts";
import { generateIdempotencyKey } from "../src/domain/money-math.ts";

describe("Ticket 06: Idempotency Storage and Write-Before-Call Engine", () => {
  let tempDir: string;
  let ledgerFile: string;
  let storage: IdempotencyStorage;

  const testConfig = {
    mode: "sandbox" as const,
    clientId: "client-id-test-01",
    clientSecret: "client-secret-test-01",
    baseUrl: "https://api-m.sandbox.paypal.com",
    webhookId: "WH-TEST-001",
    port: 3000,
    keyRetentionHours: 72,
    maxPendingRecheckCount: 5,
    authorizationValidityDays: 29,
    reconciliationPollIntervalSeconds: 300,
    inspectionWindowHours: 48,
    PAYPAL_MODE: "sandbox" as const,
    PAYPAL_CLIENT_ID: "client-id-test-01",
    PAYPAL_CLIENT_SECRET: "client-secret-test-01",
    PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
    PAYPAL_WEBHOOK_ID: "WH-TEST-001",
    PORT: 3000,
    PAYPAL_KEY_RETENTION_HOURS: 72,
    MAX_PENDING_RECHECK_COUNT: 5,
    AUTHORIZATION_VALIDITY_DAYS: 29,
    RECONCILIATION_POLL_INTERVAL_SECONDS: 300,
    INSPECTION_WINDOW_HOURS: 48,
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "syndicate-idemp-test-"));
    ledgerFile = path.join(tempDir, "test-ledger.json");
    storage = new IdempotencyStorage(ledgerFile);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("1. IdempotencyStorage CRUD and Invariants", () => {
    it("creates a new record with status PENDING, default timestamps, and recheckCount 0", async () => {
      const opKey = generateIdempotencyKey("CAPTURE", "clan-100", "member-01", "HOLD", "ref-100");

      const record = await storage.create({
        operationKey: opKey,
        operationType: "CAPTURE",
        clanId: "clan-100",
        memberId: "member-01",
        stage: "HOLD",
        referenceId: "ref-100",
      });

      assert.ok(record.id);
      assert.equal(record.operationKey, opKey);
      assert.equal(record.status, "PENDING");
      assert.equal(record.recheckCount, 0);
      assert.equal(record.paypalReference, null);
      assert.ok(record.firstSentAt);
      assert.ok(record.createdAt);
      assert.ok(record.lastCheckedAt);

      const fetched = await storage.get(opKey);
      assert.deepEqual(fetched, record);
    });

    it("rejects creating duplicate record with identical operationKey", async () => {
      const opKey = generateIdempotencyKey("CAPTURE", "clan-100", "member-01", "HOLD", "ref-dup");

      await storage.create({
        operationKey: opKey,
        operationType: "CAPTURE",
        clanId: "clan-100",
        stage: "HOLD",
      });

      await assert.rejects(
        async () => {
          await storage.create({
            operationKey: opKey,
            operationType: "CAPTURE",
            clanId: "clan-100",
            stage: "HOLD",
          });
        },
        IdempotencyRecordConflictError
      );
    });

    it("updates record status from PENDING to SUCCEEDED and sets paypalReference", async () => {
      const opKey = generateIdempotencyKey("AUTHORIZE", "clan-100", "member-01", "HOLD", "ref-success");

      await storage.create({
        operationKey: opKey,
        operationType: "AUTHORIZATION",
        clanId: "clan-100",
        stage: "HOLD",
      });

      const updated = await storage.update(opKey, {
        status: "SUCCEEDED",
        paypalReference: "ORD-PP-SUCCESS-99",
      });

      assert.equal(updated.status, "SUCCEEDED");
      assert.equal(updated.paypalReference, "ORD-PP-SUCCESS-99");

      const retrieved = await storage.get(opKey);
      assert.equal(retrieved?.status, "SUCCEEDED");
      assert.equal(retrieved?.paypalReference, "ORD-PP-SUCCESS-99");
    });

    it("updates record status from PENDING to FAILED on error", async () => {
      const opKey = generateIdempotencyKey("REFUND", "clan-100", "member-01", "CLAIM", "ref-fail");

      await storage.create({
        operationKey: opKey,
        operationType: "REFUND",
        clanId: "clan-100",
        stage: "CLAIM",
      });

      const updated = await storage.update(opKey, { status: "FAILED" });
      assert.equal(updated.status, "FAILED");

      const retrieved = await storage.get(opKey);
      assert.equal(retrieved?.status, "FAILED");
    });

    it("filters records by clanId and status", async () => {
      const key1 = generateIdempotencyKey("CAPTURE", "clan-alpha", "m1", "ST1", "r1");
      const key2 = generateIdempotencyKey("CAPTURE", "clan-alpha", "m2", "ST1", "r2");
      const key3 = generateIdempotencyKey("CAPTURE", "clan-beta", "m3", "ST1", "r3");

      await storage.create({ operationKey: key1, operationType: "CAPTURE", clanId: "clan-alpha", stage: "ST1" });
      await storage.create({ operationKey: key2, operationType: "CAPTURE", clanId: "clan-alpha", stage: "ST1" });
      await storage.create({ operationKey: key3, operationType: "CAPTURE", clanId: "clan-beta", stage: "ST1" });

      await storage.update(key1, { status: "SUCCEEDED" });

      const clanAlpha = await storage.list({ clanId: "clan-alpha" });
      assert.equal(clanAlpha.length, 2);

      const succeeded = await storage.list({ status: "SUCCEEDED" });
      assert.equal(succeeded.length, 1);
      assert.equal(succeeded[0].operationKey, key1);
    });

    it("verifies schema conformity across all required fields", async () => {
      const key = generateIdempotencyKey("VOID", "clan-100", "m1", "VOID", "r-schema");
      await storage.create({
        operationKey: key,
        operationType: "VOID",
        clanId: "clan-100",
        stage: "VOID",
      });

      const isValid = await storage.verifySchema();
      assert.equal(isValid, true);
    });
  });

  describe("2. Write-Before-Call Pattern Invariants", () => {
    it("writes PENDING record BEFORE dispatching external call and updates to SUCCEEDED on completion", async () => {
      const gateway = new PayPalMoneyGateway(testConfig, storage);
      let capturedInFlightStatus: string | null = null;

      // Intercept paymentsController capture to check storage state during flight
      const opKey = generateIdempotencyKey("CAPTURE", "clan-wbc-01", "buyer-01", "FINAL_CAPTURE", "auth-7788:580.00");
      (gateway as any).paymentsController = {
        captureAuthorizedPayment: async () => {
          // Check storage right when execution is in flight
          const inFlight = await storage.get(opKey);
          capturedInFlightStatus = inFlight?.status || null;

          return {
            result: {
              id: "CAP-PP-VERIFIED-7788",
              status: "COMPLETED",
              amount: { currencyCode: "USD", value: "580.00" },
              finalCapture: true,
            },
          };
        },
      };

      const result = await gateway.captureAuthorization({
        authorizationId: "auth-7788",
        clanId: "clan-wbc-01",
        memberId: "buyer-01",
        amount: 580.0,
        finalCapture: true,
      });

      assert.equal(capturedInFlightStatus, "PENDING");
      assert.equal(result.captureId, "CAP-PP-VERIFIED-7788");
      assert.equal(result.status, "COMPLETED");

      const postRecord = await storage.get(opKey);
      assert.equal(postRecord?.status, "SUCCEEDED");
      assert.equal(postRecord?.paypalReference, "CAP-PP-VERIFIED-7788");
    });

    it("updates record to FAILED on external exception", async () => {
      const gateway = new PayPalMoneyGateway(testConfig, storage);
      const opKey = generateIdempotencyKey("CAPTURE", "clan-err-01", "buyer-01", "FINAL_CAPTURE", "auth-fail:200.00");

      (gateway as any).paymentsController = {
        captureAuthorizedPayment: async () => {
          throw new Error("Simulated network connection timeout");
        },
      };

      await assert.rejects(
        async () => {
          await gateway.captureAuthorization({
            authorizationId: "auth-fail",
            clanId: "clan-err-01",
            memberId: "buyer-01",
            amount: 200.0,
          });
        },
        /Simulated network connection timeout/
      );

      const record = await storage.get(opKey);
      assert.equal(record?.status, "FAILED");
    });

    it("prevents blind resend while PENDING within retention window and increments recheckCount", async () => {
      const gateway = new PayPalMoneyGateway(testConfig, storage);
      const opKey = generateIdempotencyKey("CAPTURE", "clan-flight-01", "buyer-01", "FINAL_CAPTURE", "auth-flight:500.00");

      // Pre-seed a record in PENDING state (e.g. earlier request in flight)
      await storage.create({
        operationKey: opKey,
        operationType: "CAPTURE",
        clanId: "clan-flight-01",
        memberId: "buyer-01",
        stage: "FINAL_CAPTURE",
        referenceId: "auth-flight:500.00",
        status: "PENDING",
        firstSentAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
        recheckCount: 0,
      });

      // Attempt to invoke again while in flight
      await assert.rejects(
        async () => {
          await gateway.captureAuthorization({
            authorizationId: "auth-flight",
            clanId: "clan-flight-01",
            memberId: "buyer-01",
            amount: 500.0,
          });
        },
        (err: Error) => {
          assert(err instanceof IdempotencyInFlightError);
          assert(err.message.includes("is already in-flight"));
          assert.equal((err as IdempotencyInFlightError).recheckCount, 1);
          return true;
        }
      );

      const updated = await storage.get(opKey);
      assert.equal(updated?.recheckCount, 1);
      assert.equal(updated?.status, "PENDING");
    });

    it("transitions record to NEEDS_REVIEW when duplicate request arrives past 72h retention window", async () => {
      const gateway = new PayPalMoneyGateway(testConfig, storage);
      const opKey = generateIdempotencyKey("CAPTURE", "clan-old-01", "buyer-01", "FINAL_CAPTURE", "auth-old:500.00");

      // Pre-seed record created 75 hours ago (> 72h retention limit)
      const SEVENTY_FIVE_HOURS_AGO = new Date(Date.now() - 75 * 60 * 60 * 1000).toISOString();
      await storage.create({
        operationKey: opKey,
        operationType: "CAPTURE",
        clanId: "clan-old-01",
        memberId: "buyer-01",
        stage: "FINAL_CAPTURE",
        referenceId: "auth-old:500.00",
        status: "PENDING",
        firstSentAt: SEVENTY_FIVE_HOURS_AGO,
        recheckCount: 2,
      });

      await assert.rejects(
        async () => {
          await gateway.captureAuthorization({
            authorizationId: "auth-old",
            clanId: "clan-old-01",
            memberId: "buyer-01",
            amount: 500.0,
          });
        },
        (err: Error) => {
          assert(err instanceof IdempotencyRetentionExpiredError);
          assert(err.message.includes("Transitioned to NEEDS_REVIEW"));
          return true;
        }
      );

      const record = await storage.get(opKey);
      assert.equal(record?.status, "NEEDS_REVIEW");
    });

    it("returns existing result without re-executing external call when operation has SUCCEEDED", async () => {
      const gateway = new PayPalMoneyGateway(testConfig, storage);
      let externalCallCount = 0;

      (gateway as any).paymentsController = {
        captureAuthorizedPayment: async () => {
          externalCallCount++;
          return {
            result: {
              id: "CAP-CALL-ONCE-99",
              status: "COMPLETED",
              amount: { currencyCode: "USD", value: "300.00" },
              finalCapture: true,
            },
          };
        },
        getCapturedPayment: async () => ({
          result: {
            id: "CAP-CALL-ONCE-99",
            status: "COMPLETED",
            amount: { currencyCode: "USD", value: "300.00" },
            finalCapture: true,
          },
        }),
      };

      // First execution
      const first = await gateway.captureAuthorization({
        authorizationId: "auth-once",
        clanId: "clan-cached-01",
        memberId: "buyer-01",
        amount: 300.0,
      });

      assert.equal(externalCallCount, 1);
      assert.equal(first.captureId, "CAP-CALL-ONCE-99");

      // Second execution with identical idempotency parameters
      const second = await gateway.captureAuthorization({
        authorizationId: "auth-once",
        clanId: "clan-cached-01",
        memberId: "buyer-01",
        amount: 300.0,
      });

      // External capture call was not repeated
      assert.equal(externalCallCount, 1);
      assert.equal(second.captureId, "CAP-CALL-ONCE-99");
      assert.equal(second.status, "COMPLETED");
    });
  });

  describe("3. voidAuthorization Invariant Tests", () => {
    it("calls voidPayment with idempotency key and updates status to SUCCEEDED", async () => {
      const gateway = new PayPalMoneyGateway(testConfig, storage);
      let voidedId: string | null = null;
      let passedRequestId: string | null = null;

      (gateway as any).paymentsController = {
        voidPayment: async ({ authorizationId, paypalRequestId }: any) => {
          voidedId = authorizationId;
          passedRequestId = paypalRequestId;
          return {
            result: {
              id: authorizationId,
              status: "VOIDED",
            },
          };
        },
      };

      const result = await gateway.voidAuthorization("auth-cancel-123", "clan-cancel-01", "member-01");

      assert.equal(result.authorizationId, "auth-cancel-123");
      assert.equal(result.status, "VOIDED");
      assert.equal(voidedId, "auth-cancel-123");
      assert.ok(passedRequestId);

      const opKey = generateIdempotencyKey("VOID", "clan-cancel-01", "member-01", "VOID_AUTHORIZATION", "auth-cancel-123");
      assert.equal(passedRequestId, opKey);

      const record = await storage.get(opKey);
      assert.equal(record?.status, "SUCCEEDED");
      assert.equal(record?.paypalReference, "auth-cancel-123");
    });
  });

  describe("4. finalBatchCapture Invariant Tests", () => {
    it("enforces 100% member authorization invariant: rejects when any member is in CREATED status", async () => {
      const gateway = new PayPalMoneyGateway(testConfig, storage);

      const membersFixture = [
        {
          memberId: "buyer-authorized-1",
          name: "Buyer 1",
          quantity: 200,
          unitPrice: 7.20,
          status: "AUTHORIZED",
          authorizationId: "auth-ok-1",
        },
        {
          memberId: "buyer-pending-2",
          name: "Buyer 2",
          quantity: 150,
          unitPrice: 7.20,
          status: "CREATED", // Has not completed authorization hold
          orderId: "order-pending-2",
        },
      ];

      await assert.rejects(
        async () => {
          await gateway.finalBatchCapture("clan-test-invar-01", {
            members: membersFixture,
          });
        },
        (err: Error) => {
          assert(err.message.includes("100% of clan members must be AUTHORIZED before capturing"));
          assert(err.message.includes("buyer-pending-2"));
          return true;
        }
      );
    });

    it("rejects batch capture when member is missing authorizationId", async () => {
      const gateway = new PayPalMoneyGateway(testConfig, storage);

      const membersFixture = [
        {
          memberId: "buyer-authorized-1",
          quantity: 200,
          unitPrice: 7.20,
          status: "AUTHORIZED",
          authorizationId: "auth-ok-1",
        },
        {
          memberId: "buyer-no-auth",
          quantity: 100,
          unitPrice: 7.20,
          status: "AUTHORIZED",
          // missing authorizationId
        },
      ];

      await assert.rejects(
        async () => {
          await gateway.finalBatchCapture("clan-test-invar-02", {
            members: membersFixture,
          });
        },
        (err: Error) => {
          assert(err.message.includes("100% of clan members must be AUTHORIZED"));
          assert(err.message.includes("buyer-no-auth"));
          return true;
        }
      );
    });

    it("executes batch capture at final unlocked tier price with final_capture: true and transitions Clan to LOCKED", async () => {
      const gateway = new PayPalMoneyGateway(testConfig, storage);

      const members = [
        {
          memberId: "buyer-alpha",
          name: "Alpha Bakeries",
          quantity: 300,
          unitPrice: 7.20,
          status: "AUTHORIZED",
          authorizationId: "auth-batch-alpha",
        },
        {
          memberId: "buyer-beta",
          name: "Beta Bagels",
          quantity: 300,
          unitPrice: 7.20,
          status: "AUTHORIZED",
          authorizationId: "auth-batch-beta",
        },
      ];

      const capturedCalls: any[] = [];
      (gateway as any).paymentsController = {
        captureAuthorizedPayment: async ({ authorizationId, body }: any) => {
          capturedCalls.push({ authorizationId, body });
          return {
            result: {
              id: `CAP-${authorizationId}`,
              status: "COMPLETED",
              amount: body.amount,
              finalCapture: body.finalCapture,
            },
          };
        },
        getCapturedPayment: async ({ captureId }: any) => ({
          result: {
            id: captureId,
            status: "COMPLETED",
          },
        }),
      };

      const result = await gateway.finalBatchCapture("clan-batch-success-01", {
        members,
        tiers: [
          { minQuantity: 500, unitPrice: 5.80 },
          { minQuantity: 200, unitPrice: 7.20 },
        ],
      });

      // Total quantity = 600 -> Unlocks 500 MOQ tier ($5.80/bag)
      assert.equal(result.clanState, "LOCKED");
      assert.equal(result.totalQuantity, 600);
      assert.equal(result.effectiveTier.unitPrice, 5.80);
      assert.equal(result.captures.length, 2);

      // Captured amount: 300 * $5.80 = $1,740.00 each
      // Initial hold: 300 * $7.20 = $2,160.00 each
      // Released hold: $2,160 - $1,740 = $420.00 each
      assert.equal(result.totalCapturedAmount, 3480.0);
      assert.equal(result.totalReleasedHoldAmount, 840.0);

      assert.equal(capturedCalls.length, 2);
      for (const call of capturedCalls) {
        assert.equal(call.body.amount.value, "1740.00");
        assert.equal(call.body.finalCapture, true);
      }
    });
  });
});

import test, { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import {
  PayPalWebhookHandler,
  WebhookVerificationError,
  isTrustedPayPalCertUrl,
  normalizeHeaders,
  validateRequiredHeaders,
  type PayPalWebhookHeaders,
  type PayPalWebhookEvent,
  type ClanStateRecord,
} from "../src/gateway/paypal-webhook.handler.ts";

describe("PayPal Webhook Signature Verification & Ingestion Module", () => {
  const TEST_WEBHOOK_ID = "3T268446FF552533R";
  const TEST_STORAGE_DIR = path.join(process.cwd(), ".scratch", "test-webhook-storage");
  const PROCESSED_PATH = path.join(TEST_STORAGE_DIR, "processed-events.json");
  const BUFFER_PATH = path.join(TEST_STORAGE_DIR, "out-of-order-events.json");

  // Generate real cryptographic RSA keypair for signature tests
  const { publicKey: testPublicKey, privateKey: testPrivateKey } =
    crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

  const testCertUrl =
    "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-TEST-SUITE-KEY-001";

  function createTestSignature(
    transmissionId: string,
    transmissionTime: string,
    webhookId: string,
    body: string
  ): string {
    const crc = zlib.crc32(Buffer.from(body, "utf8")) >>> 0;
    const data = `${transmissionId}|${transmissionTime}|${webhookId}|${crc}`;
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(data);
    return signer.sign(testPrivateKey, "base64");
  }

  beforeEach(() => {
    if (fs.existsSync(TEST_STORAGE_DIR)) {
      fs.rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
    }
  });

  // ==========================================================================
  // 1. Header Validation & Certificate URL Security Tests
  // ==========================================================================

  describe("1. Header and Cert URL Security Validation", () => {
    it("normalizes headers regardless of case sensitivity", () => {
      const raw = {
        "PAYPAL-AUTH-ALGO": "SHA256withRSA",
        "PayPal-Transmission-Id": "trans-12345",
        "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
      };
      const normalized = normalizeHeaders(raw);
      assert.equal(normalized["paypal-auth-algo"], "SHA256withRSA");
      assert.equal(normalized["paypal-transmission-id"], "trans-12345");
      assert.equal(
        normalized["paypal-cert-url"],
        "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1"
      );
    });

    it("detects missing mandatory PayPal transmission headers and fails fast", () => {
      const partialHeaders = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
      };
      const validation = validateRequiredHeaders(partialHeaders);
      assert.equal(validation.isValid, false);
      assert.deepEqual(validation.missing, [
        "paypal-transmission-id",
        "paypal-transmission-sig",
        "paypal-transmission-time",
      ]);
    });

    it("throws WebhookVerificationError with MISSING_HEADERS code if headers incomplete", async () => {
      const handler = new PayPalWebhookHandler({
        webhookId: TEST_WEBHOOK_ID,
        processedEventsPath: PROCESSED_PATH,
        outOfOrderEventsPath: BUFFER_PATH,
      });

      await assert.rejects(
        async () => {
          await handler.verifyWebhookSignature(
            { "paypal-auth-algo": "SHA256withRSA" },
            JSON.stringify({ id: "event-1" })
          );
        },
        (err: Error) => {
          assert(err instanceof WebhookVerificationError);
          assert.equal(err.code, "MISSING_HEADERS");
          assert(err.message.includes("missing mandatory PayPal headers"));
          return true;
        }
      );
    });

    it("verifies trusted PayPal certificate URLs and rejects rogue hostnames (SSRF prevention)", () => {
      // Valid URLs
      assert.equal(
        isTrustedPayPalCertUrl("https://api.sandbox.paypal.com/v1/notifications/certs/CERT-123"),
        true
      );
      assert.equal(
        isTrustedPayPalCertUrl("https://api-m.paypal.com/v1/notifications/certs/CERT-LIVE-456"),
        true
      );
      assert.equal(
        isTrustedPayPalCertUrl("https://api.paypal.com/v1/notifications/certs/CERT-789"),
        true
      );

      // Untrusted URLs
      assert.equal(
        isTrustedPayPalCertUrl("http://api.sandbox.paypal.com/v1/notifications/certs/CERT-123"),
        false,
        "HTTP non-TLS must be rejected"
      );
      assert.equal(
        isTrustedPayPalCertUrl("https://attacker-domain.com/v1/notifications/certs/CERT-123"),
        false,
        "Third-party domain must be rejected"
      );
      assert.equal(
        isTrustedPayPalCertUrl("https://api.sandbox.paypal.com.attacker.com/v1/notifications/certs/CERT-123"),
        false,
        "Subdomain prefix spoof must be rejected"
      );
      assert.equal(
        isTrustedPayPalCertUrl("https://api.sandbox.paypal.com/malicious/path"),
        false,
        "Non-cert path must be rejected"
      );
    });
  });

  // ==========================================================================
  // 2. Cryptographic Signature Verification & Tamper Resistance
  // ==========================================================================

  describe("2. Cryptographic Signature Verification & Tamper Resistance", () => {
    it("successfully verifies valid cryptographic signature using RSA-SHA256 and CRC32", async () => {
      const handler = new PayPalWebhookHandler({
        webhookId: TEST_WEBHOOK_ID,
        verificationMode: "crypto",
        processedEventsPath: PROCESSED_PATH,
        outOfOrderEventsPath: BUFFER_PATH,
        certResolver: async () => testPublicKey,
      });

      const transmissionId = "trans-valid-test-001";
      const transmissionTime = "2026-10-26T14:30:00.000Z";
      const sampleEvent: PayPalWebhookEvent = {
        id: "WH-SAMPLE-EVENT-001",
        create_time: transmissionTime,
        resource_type: "capture",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP-TEST-RESOURCE-01",
          status: "COMPLETED",
          amount: { currency_code: "USD", value: "720.00" },
        },
      };

      const bodyString = JSON.stringify(sampleEvent);
      const signature = createTestSignature(
        transmissionId,
        transmissionTime,
        TEST_WEBHOOK_ID,
        bodyString
      );

      const headers: PayPalWebhookHeaders = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": testCertUrl,
        "paypal-transmission-id": transmissionId,
        "paypal-transmission-sig": signature,
        "paypal-transmission-time": transmissionTime,
      };

      const result = await handler.verifyWebhookSignature(headers, bodyString);
      assert.equal(result.verified, true);
      assert.equal(result.status, "SUCCESS");
      assert.equal(result.strategy, "crypto");
    });

    it("rejects tampered payloads where amounts or fields have been modified", async () => {
      const handler = new PayPalWebhookHandler({
        webhookId: TEST_WEBHOOK_ID,
        verificationMode: "crypto",
        processedEventsPath: PROCESSED_PATH,
        outOfOrderEventsPath: BUFFER_PATH,
        certResolver: async () => testPublicKey,
      });

      const transmissionId = "trans-tamper-test-002";
      const transmissionTime = "2026-10-26T14:31:00.000Z";
      const legitimatePayload = JSON.stringify({
        id: "WH-TAMPER-TEST-001",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: { id: "CAP-01", amount: { value: "100.00" } },
      });

      // Signature computed on legitimate $100.00 payload
      const signature = createTestSignature(
        transmissionId,
        transmissionTime,
        TEST_WEBHOOK_ID,
        legitimatePayload
      );

      // Tampered payload: attacker changed value to $999.00
      const tamperedPayload = JSON.stringify({
        id: "WH-TAMPER-TEST-001",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: { id: "CAP-01", amount: { value: "999.00" } },
      });

      const headers: PayPalWebhookHeaders = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": testCertUrl,
        "paypal-transmission-id": transmissionId,
        "paypal-transmission-sig": signature,
        "paypal-transmission-time": transmissionTime,
      };

      const result = await handler.verifyWebhookSignature(headers, tamperedPayload);
      assert.equal(result.verified, false);
      assert.equal(result.status, "FAILURE");
      assert(result.reason?.includes("Cryptographic signature mismatch"));
    });

    it("fails fast with INVALID_SIGNATURE error on forged or corrupt signatures", async () => {
      const handler = new PayPalWebhookHandler({
        webhookId: TEST_WEBHOOK_ID,
        verificationMode: "crypto",
        processedEventsPath: PROCESSED_PATH,
        outOfOrderEventsPath: BUFFER_PATH,
        certResolver: async () => testPublicKey,
      });

      const headers: PayPalWebhookHeaders = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": testCertUrl,
        "paypal-transmission-id": "trans-forged-003",
        "paypal-transmission-sig": Buffer.from("forged-signature-bytes").toString("base64"),
        "paypal-transmission-time": "2026-10-26T14:32:00.000Z",
      };

      const payload = JSON.stringify({
        id: "WH-FORGED-001",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
      });

      await assert.rejects(
        async () => {
          await handler.handleWebhook(headers, payload);
        },
        (err: Error) => {
          assert(err instanceof WebhookVerificationError);
          assert.equal(err.code, "INVALID_SIGNATURE");
          return true;
        }
      );
    });

    it("rejects signatures signed with mismatched webhook ID", async () => {
      const handler = new PayPalWebhookHandler({
        webhookId: TEST_WEBHOOK_ID,
        verificationMode: "crypto",
        processedEventsPath: PROCESSED_PATH,
        outOfOrderEventsPath: BUFFER_PATH,
        certResolver: async () => testPublicKey,
      });

      const transmissionId = "trans-wrong-webhook-004";
      const transmissionTime = "2026-10-26T14:33:00.000Z";
      const payload = JSON.stringify({
        id: "WH-WRONG-WHID-001",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
      });

      // Signature computed with a DIFFERENT webhook ID
      const signatureWithOtherId = createTestSignature(
        transmissionId,
        transmissionTime,
        "DIFFERENT-WEBHOOK-ID-XYZ",
        payload
      );

      const headers: PayPalWebhookHeaders = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": testCertUrl,
        "paypal-transmission-id": transmissionId,
        "paypal-transmission-sig": signatureWithOtherId,
        "paypal-transmission-time": transmissionTime,
      };

      const result = await handler.verifyWebhookSignature(headers, payload);
      assert.equal(result.verified, false);
      assert.equal(result.status, "FAILURE");
    });
  });

  // ==========================================================================
  // 3. Deduplication and Idempotent Ingestion Tests
  // ==========================================================================

  describe("3. Deduplication and Idempotent Event Storage", () => {
    it("processes a new webhook event and records its event ID to durable storage", async () => {
      const handler = new PayPalWebhookHandler({
        webhookId: TEST_WEBHOOK_ID,
        verificationMode: "crypto",
        processedEventsPath: PROCESSED_PATH,
        outOfOrderEventsPath: BUFFER_PATH,
        certResolver: async () => testPublicKey,
      });

      const transmissionId = "trans-dedup-001";
      const transmissionTime = "2026-10-26T14:35:00.000Z";
      const sampleEvent: PayPalWebhookEvent = {
        id: "WH-DEDUP-UNIQUE-001",
        create_time: transmissionTime,
        resource_type: "authorization",
        event_type: "PAYMENT.AUTHORIZATION.CREATED",
        resource: { id: "AUTH-TEST-DEDUP-01", status: "CREATED" },
      };

      const bodyString = JSON.stringify(sampleEvent);
      const signature = createTestSignature(
        transmissionId,
        transmissionTime,
        TEST_WEBHOOK_ID,
        bodyString
      );

      const headers: PayPalWebhookHeaders = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": testCertUrl,
        "paypal-transmission-id": transmissionId,
        "paypal-transmission-sig": signature,
        "paypal-transmission-time": transmissionTime,
      };

      const result = await handler.handleWebhook(headers, bodyString);
      assert.equal(result.success, true);
      assert.equal(result.status, "PROCESSED");
      assert.equal(result.eventId, "WH-DEDUP-UNIQUE-001");

      // Verify file persistence
      assert.equal(fs.existsSync(PROCESSED_PATH), true);
      const stored = handler.getProcessedEvents();
      assert.equal(stored.length, 1);
      assert.equal(stored[0].eventId, "WH-DEDUP-UNIQUE-001");
      assert.equal(handler.isDuplicate("WH-DEDUP-UNIQUE-001"), true);
    });

    it("silently acknowledges duplicates without state mutation", async () => {
      const handler = new PayPalWebhookHandler({
        webhookId: TEST_WEBHOOK_ID,
        verificationMode: "crypto",
        processedEventsPath: PROCESSED_PATH,
        outOfOrderEventsPath: BUFFER_PATH,
        certResolver: async () => testPublicKey,
      });

      const clanState: ClanStateRecord = {
        clanId: "clan-dedup-test",
        state: "THRESHOLD_MET",
        orders: [
          {
            memberId: "member-alpha",
            orderId: "ORD-ALPHA-01",
            status: "AUTHORIZED",
            authorizationId: "AUTH-ALPHA-01",
          },
        ],
      };

      const transmissionId = "trans-dedup-002";
      const transmissionTime = "2026-10-26T14:36:00.000Z";
      const sampleEvent: PayPalWebhookEvent = {
        id: "WH-DEDUP-REPEAT-002",
        create_time: transmissionTime,
        resource_type: "capture",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP-ALPHA-01",
          custom_id: "clan-dedup-test:member-alpha",
          status: "COMPLETED",
        },
      };

      const bodyString = JSON.stringify(sampleEvent);
      const signature = createTestSignature(
        transmissionId,
        transmissionTime,
        TEST_WEBHOOK_ID,
        bodyString
      );

      const headers: PayPalWebhookHeaders = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": testCertUrl,
        "paypal-transmission-id": transmissionId,
        "paypal-transmission-sig": signature,
        "paypal-transmission-time": transmissionTime,
      };

      // 1. First delivery
      const firstResult = await handler.handleWebhook(headers, bodyString, clanState);
      assert.equal(firstResult.status, "PROCESSED");
      assert.equal(clanState.orders[0].status, "CAPTURED");

      // Intentionally tamper with in-memory order status to verify no second mutation occurs
      clanState.orders[0].status = "CAPTURED";
      let mutationCount = 0;
      const originalCaptureId = clanState.orders[0].captureId;

      // 2. Duplicate delivery (exact same event ID)
      const duplicateResult = await handler.handleWebhook(headers, bodyString, clanState);
      assert.equal(duplicateResult.success, true);
      assert.equal(duplicateResult.status, "DUPLICATE_IGNORED");
      assert.equal(
        duplicateResult.message.includes("silently acknowledged without state mutation"),
        true
      );
      assert.equal(clanState.orders[0].captureId, originalCaptureId);

      // Verify processed events store still has exactly 1 entry
      const stored = handler.getProcessedEvents();
      assert.equal(stored.length, 1);
      assert.equal(stored[0].eventId, "WH-DEDUP-REPEAT-002");
    });
  });

  // ==========================================================================
  // 4. Out-of-Order Message Handling & State Resilience Tests
  // ==========================================================================

  describe("4. Out-of-Order Delivery Resilience", () => {
    it("safely buffers capture events arriving before order or authorization is recorded locally", async () => {
      const handler = new PayPalWebhookHandler({
        webhookId: TEST_WEBHOOK_ID,
        verificationMode: "crypto",
        processedEventsPath: PROCESSED_PATH,
        outOfOrderEventsPath: BUFFER_PATH,
        certResolver: async () => testPublicKey,
      });

      // Local state has order in CREATED status (not yet AUTHORIZED)
      const clanState: ClanStateRecord = {
        clanId: "clan-ooo-test",
        state: "FORMING",
        orders: [
          {
            memberId: "buyer-ooo-01",
            orderId: "ORD-OOO-01",
            status: "CREATED",
          },
        ],
      };

      const transmissionId = "trans-ooo-capture-001";
      const transmissionTime = "2026-10-26T14:40:00.000Z";
      const outOfOrderCaptureEvent: PayPalWebhookEvent = {
        id: "WH-OOO-CAPTURE-001",
        create_time: transmissionTime,
        resource_type: "capture",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP-OOO-EARLY-01",
          custom_id: "clan-ooo-test:buyer-ooo-01",
          status: "COMPLETED",
        },
      };

      const bodyString = JSON.stringify(outOfOrderCaptureEvent);
      const signature = createTestSignature(
        transmissionId,
        transmissionTime,
        TEST_WEBHOOK_ID,
        bodyString
      );

      const headers: PayPalWebhookHeaders = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": testCertUrl,
        "paypal-transmission-id": transmissionId,
        "paypal-transmission-sig": signature,
        "paypal-transmission-time": transmissionTime,
      };

      const result = await handler.handleWebhook(headers, bodyString, clanState);

      // Assert event is buffered and ledger is NOT corrupted
      assert.equal(result.success, true);
      assert.equal(result.status, "OUT_OF_ORDER_BUFFERED");
      assert.equal(result.buffered, true);
      assert.equal(clanState.orders[0].status, "CREATED"); // Order state preserved, NOT forced to CAPTURED

      // Verify event is in out-of-order buffer
      const buffered = handler.getBufferedEvents();
      assert.equal(buffered.length, 1);
      assert.equal(buffered[0].eventId, "WH-OOO-CAPTURE-001");
      assert.equal(buffered[0].eventType, "PAYMENT.CAPTURE.COMPLETED");
    });

    it("replays and completes buffered capture when prerequisite authorization arrives", async () => {
      const handler = new PayPalWebhookHandler({
        webhookId: TEST_WEBHOOK_ID,
        verificationMode: "crypto",
        processedEventsPath: PROCESSED_PATH,
        outOfOrderEventsPath: BUFFER_PATH,
        certResolver: async () => testPublicKey,
      });

      const clanState: ClanStateRecord = {
        clanId: "clan-replay-test",
        state: "FORMING",
        orders: [
          {
            memberId: "buyer-replay-01",
            orderId: "ORD-REPLAY-01",
            status: "CREATED",
          },
        ],
      };

      // 1. Out-of-order capture arrives first
      const captureTime = "2026-10-26T14:41:00.000Z";
      const captureEvent: PayPalWebhookEvent = {
        id: "WH-REPLAY-CAP-001",
        create_time: captureTime,
        resource_type: "capture",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP-REPLAY-01",
          custom_id: "clan-replay-test:buyer-replay-01",
          status: "COMPLETED",
        },
      };

      const capBody = JSON.stringify(captureEvent);
      const capSig = createTestSignature(
        "trans-replay-cap-1",
        captureTime,
        TEST_WEBHOOK_ID,
        capBody
      );

      const capHeaders: PayPalWebhookHeaders = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": testCertUrl,
        "paypal-transmission-id": "trans-replay-cap-1",
        "paypal-transmission-sig": capSig,
        "paypal-transmission-time": captureTime,
      };

      const capResult = await handler.handleWebhook(capHeaders, capBody, clanState);
      assert.equal(capResult.status, "OUT_OF_ORDER_BUFFERED");
      assert.equal(clanState.orders[0].status, "CREATED");

      // 2. Prerequisite Authorization arrives
      const authTime = "2026-10-26T14:42:00.000Z";
      const authEvent: PayPalWebhookEvent = {
        id: "WH-REPLAY-AUTH-001",
        create_time: authTime,
        resource_type: "authorization",
        event_type: "PAYMENT.AUTHORIZATION.CREATED",
        resource: {
          id: "AUTH-REPLAY-01",
          custom_id: "clan-replay-test:buyer-replay-01",
          status: "CREATED",
        },
      };

      const authBody = JSON.stringify(authEvent);
      const authSig = createTestSignature(
        "trans-replay-auth-1",
        authTime,
        TEST_WEBHOOK_ID,
        authBody
      );

      const authHeaders: PayPalWebhookHeaders = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": testCertUrl,
        "paypal-transmission-id": "trans-replay-auth-1",
        "paypal-transmission-sig": authSig,
        "paypal-transmission-time": authTime,
      };

      const authResult = await handler.handleWebhook(authHeaders, authBody, clanState);
      assert.equal(authResult.status, "PROCESSED");
      assert.deepEqual(authResult.replayedEvents, ["WH-REPLAY-CAP-001"]);

      // Verify order has successfully and cleanly transitioned to CAPTURED
      assert.equal(clanState.orders[0].status, "CAPTURED");
      assert.equal(clanState.orders[0].authorizationId, "AUTH-REPLAY-01");
      assert.equal(clanState.orders[0].captureId, "CAP-REPLAY-01");

      // Verify buffered event was removed from queue
      assert.equal(handler.getBufferedEvents().length, 0);
    });

    it("safely buffers refund arriving before capture is recorded", async () => {
      const handler = new PayPalWebhookHandler({
        webhookId: TEST_WEBHOOK_ID,
        verificationMode: "crypto",
        processedEventsPath: PROCESSED_PATH,
        outOfOrderEventsPath: BUFFER_PATH,
        certResolver: async () => testPublicKey,
      });

      const clanState: ClanStateRecord = {
        clanId: "clan-refund-ooo",
        state: "LOCKED",
        orders: [
          {
            memberId: "buyer-refund-01",
            orderId: "ORD-REFUND-01",
            status: "AUTHORIZED",
            authorizationId: "AUTH-REFUND-01",
          },
        ],
      };

      const refundTime = "2026-10-26T14:45:00.000Z";
      const refundEvent: PayPalWebhookEvent = {
        id: "WH-REFUND-EARLY-001",
        create_time: refundTime,
        resource_type: "refund",
        event_type: "PAYMENT.CAPTURE.REFUNDED",
        resource: {
          id: "REF-EARLY-01",
          custom_id: "clan-refund-ooo:buyer-refund-01",
          links: [{ href: "https://api.sandbox.paypal.com/v2/payments/captures/CAP-UNRECORDED-01", rel: "up" }],
        },
      };

      const bodyString = JSON.stringify(refundEvent);
      const signature = createTestSignature(
        "trans-refund-early-1",
        refundTime,
        TEST_WEBHOOK_ID,
        bodyString
      );

      const headers: PayPalWebhookHeaders = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": testCertUrl,
        "paypal-transmission-id": "trans-refund-early-1",
        "paypal-transmission-sig": signature,
        "paypal-transmission-time": refundTime,
      };

      const result = await handler.handleWebhook(headers, bodyString, clanState);
      assert.equal(result.status, "OUT_OF_ORDER_BUFFERED");
      assert.equal(clanState.orders[0].status, "AUTHORIZED"); // State not mutated
      assert.equal(handler.getBufferedEvents().length, 1);
    });
  });
});

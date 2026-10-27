import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { getGatewayConfig } from "../config/gateway.config.ts";
import type { GatewayConfig } from "../config/gateway.config.ts";
import {
  canTransitionMemberState,
  transitionMemberState,
  type MemberState,
  type ClanState,
} from "../domain/money-math.ts";

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface PayPalWebhookHeaders {
  "paypal-auth-algo"?: string;
  "paypal-cert-url"?: string;
  "paypal-transmission-id"?: string;
  "paypal-transmission-sig"?: string;
  "paypal-transmission-time"?: string;
  [key: string]: string | undefined;
}

export interface PayPalWebhookResource {
  id?: string;
  status?: string;
  custom_id?: string;
  amount?: {
    currency_code?: string;
    value?: string;
  };
  seller_payable_breakdown?: {
    gross_amount?: { currency_code?: string; value?: string };
    paypal_fee?: { currency_code?: string; value?: string };
    net_amount?: { currency_code?: string; value?: string };
  };
  links?: Array<{ href: string; rel: string; method?: string }>;
  [key: string]: unknown;
}

export interface PayPalWebhookEvent<T = PayPalWebhookResource> {
  id: string;
  create_time: string;
  resource_type: string;
  event_type: string;
  summary?: string;
  resource: T;
  links?: Array<{ href: string; rel: string; method?: string }>;
  event_version?: string;
  resource_version?: string;
}

export type WebhookVerificationStatus = "SUCCESS" | "FAILURE";

export interface SignatureVerificationResult {
  verified: boolean;
  strategy: "api" | "crypto";
  status: WebhookVerificationStatus;
  reason?: string;
  transmissionId?: string;
  details?: Record<string, unknown>;
}

export interface ProcessedEventRecord {
  eventId: string;
  eventType: string;
  resourceType?: string;
  resourceId?: string;
  processedAt: string;
  status: "PROCESSED" | "DUPLICATE_IGNORED" | "OUT_OF_ORDER_BUFFERED";
  summary?: string;
}

export interface BufferedEventRecord {
  eventId: string;
  eventType: string;
  resourceId?: string;
  clanId?: string;
  memberId?: string;
  bufferedAt: string;
  reason: string;
  event: PayPalWebhookEvent;
}

export interface WebhookHandlerOptions {
  webhookId?: string;
  config?: GatewayConfig;
  processedEventsPath?: string;
  outOfOrderEventsPath?: string;
  verificationMode?: "auto" | "api" | "crypto";
  certResolver?: (url: string) => Promise<string>;
  fetchFn?: typeof fetch;
}

export type WebhookIngestionStatus =
  | "PROCESSED"
  | "DUPLICATE_IGNORED"
  | "OUT_OF_ORDER_BUFFERED"
  | "REJECTED";

export interface WebhookIngestionResult {
  success: boolean;
  status: WebhookIngestionStatus;
  eventId?: string;
  eventType?: string;
  message: string;
  verification?: SignatureVerificationResult;
  buffered?: boolean;
  replayedEvents?: string[];
  details?: Record<string, unknown>;
}

export interface ClanOrderRecord {
  memberId: string;
  orderId: string;
  status: MemberState | string;
  authorizationId?: string;
  captureId?: string;
  refundId?: string;
  orderAmount?: number;
  [key: string]: unknown;
}

export interface ClanStateRecord {
  clanId: string;
  state: ClanState | string;
  orders: ClanOrderRecord[];
  [key: string]: unknown;
}

// ============================================================================
// Error Definitions
// ============================================================================

export class WebhookVerificationError extends Error {
  readonly code:
    | "MISSING_HEADERS"
    | "INVALID_SIGNATURE"
    | "UNTRUSTED_CERT_URL"
    | "UNSUPPORTED_ALGO"
    | "API_VERIFICATION_FAILED"
    | "PAYLOAD_TAMPERED";
  readonly details?: Record<string, unknown>;

  constructor(
    code:
      | "MISSING_HEADERS"
      | "INVALID_SIGNATURE"
      | "UNTRUSTED_CERT_URL"
      | "UNSUPPORTED_ALGO"
      | "API_VERIFICATION_FAILED"
      | "PAYLOAD_TAMPERED",
    message: string,
    details?: Record<string, unknown>
  ) {
    super(`[WebhookVerificationError - ${code}]: ${message}`);
    this.name = "WebhookVerificationError";
    this.code = code;
    this.details = details;
  }
}

// ============================================================================
// Header & Security Helpers
// ============================================================================

export const REQUIRED_PAYPAL_WEBHOOK_HEADERS = [
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
] as const;

export function normalizeHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (val !== undefined && val !== null) {
      const lower = key.toLowerCase();
      normalized[lower] = Array.isArray(val) ? val[0] : String(val);
    }
  }
  return normalized;
}

export function validateRequiredHeaders(headers: Record<string, string>): {
  isValid: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  for (const headerName of REQUIRED_PAYPAL_WEBHOOK_HEADERS) {
    if (!headers[headerName] || headers[headerName].trim() === "") {
      missing.push(headerName);
    }
  }
  return { isValid: missing.length === 0, missing };
}

/**
 * Validates that certificate URLs target an authentic PayPal HTTPS endpoint.
 * Protects against SSRF and fraudulent rogue cert URLs.
 */
export function isTrustedPayPalCertUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    const isPayPalHost = host === "paypal.com" || host.endsWith(".paypal.com");
    if (!isPayPalHost) return false;
    return parsed.pathname.startsWith("/v1/notifications/certs/");
  } catch {
    return false;
  }
}

// ============================================================================
// PayPal Webhook Handler Implementation
// ============================================================================

export class PayPalWebhookHandler {
  private config: GatewayConfig;
  private webhookId: string;
  private verificationMode: "auto" | "api" | "crypto";
  private processedEventsPath: string;
  private outOfOrderEventsPath: string;
  private certResolver?: (url: string) => Promise<string>;
  private fetchFn: typeof fetch;
  private certCache: Map<string, string> = new Map();

  constructor(options: WebhookHandlerOptions = {}) {
    this.config = options.config || getGatewayConfig();
    this.webhookId =
      options.webhookId ||
      this.config.webhookId ||
      process.env.PAYPAL_WEBHOOK_ID ||
      "";
    this.verificationMode = options.verificationMode || "auto";
    this.certResolver = options.certResolver;
    this.fetchFn = options.fetchFn || globalThis.fetch;

    const baseDir = process.cwd();
    this.processedEventsPath =
      options.processedEventsPath ||
      path.join(baseDir, "idempotency", "processed-events.json");
    this.outOfOrderEventsPath =
      options.outOfOrderEventsPath ||
      path.join(baseDir, "idempotency", "out-of-order-events.json");

    this.ensureStorageDirectories();
  }

  private ensureStorageDirectories(): void {
    const procDir = path.dirname(this.processedEventsPath);
    if (!fs.existsSync(procDir)) {
      fs.mkdirSync(procDir, { recursive: true });
    }
    const oooDir = path.dirname(this.outOfOrderEventsPath);
    if (!fs.existsSync(oooDir)) {
      fs.mkdirSync(oooDir, { recursive: true });
    }
  }

  public getWebhookId(): string {
    return this.webhookId;
  }

  // ==========================================================================
  // Deduplication & Event Storage
  // ==========================================================================

  public getProcessedEvents(): ProcessedEventRecord[] {
    try {
      if (!fs.existsSync(this.processedEventsPath)) {
        return [];
      }
      const raw = fs.readFileSync(this.processedEventsPath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : parsed.processedEvents || [];
    } catch {
      return [];
    }
  }

  public isDuplicate(eventId: string): boolean {
    if (!eventId) return false;
    const events = this.getProcessedEvents();
    return events.some((e) => e.eventId === eventId);
  }

  public recordProcessedEvent(record: ProcessedEventRecord): void {
    this.ensureStorageDirectories();
    const events = this.getProcessedEvents();
    const existingIndex = events.findIndex((e) => e.eventId === record.eventId);
    if (existingIndex >= 0) {
      events[existingIndex] = record;
    } else {
      events.push(record);
    }
    fs.writeFileSync(
      this.processedEventsPath,
      JSON.stringify({ processedEvents: events, lastUpdated: new Date().toISOString() }, null, 2),
      "utf8"
    );
  }

  // ==========================================================================
  // Out-of-Order Event Buffer Storage
  // ==========================================================================

  public getBufferedEvents(): BufferedEventRecord[] {
    try {
      if (!fs.existsSync(this.outOfOrderEventsPath)) {
        return [];
      }
      const raw = fs.readFileSync(this.outOfOrderEventsPath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : parsed.bufferedEvents || [];
    } catch {
      return [];
    }
  }

  public bufferOutOfOrderEvent(
    event: PayPalWebhookEvent,
    reason: string,
    metadata?: { clanId?: string; memberId?: string; resourceId?: string }
  ): void {
    this.ensureStorageDirectories();
    const buffered = this.getBufferedEvents();
    const existingIndex = buffered.findIndex((b) => b.eventId === event.id);

    const record: BufferedEventRecord = {
      eventId: event.id,
      eventType: event.event_type,
      resourceId: metadata?.resourceId || event.resource?.id,
      clanId: metadata?.clanId,
      memberId: metadata?.memberId,
      bufferedAt: new Date().toISOString(),
      reason,
      event,
    };

    if (existingIndex >= 0) {
      buffered[existingIndex] = record;
    } else {
      buffered.push(record);
    }

    fs.writeFileSync(
      this.outOfOrderEventsPath,
      JSON.stringify({ bufferedEvents: buffered, lastUpdated: new Date().toISOString() }, null, 2),
      "utf8"
    );
  }

  public removeBufferedEvent(eventId: string): void {
    const buffered = this.getBufferedEvents();
    const filtered = buffered.filter((b) => b.eventId !== eventId);
    fs.writeFileSync(
      this.outOfOrderEventsPath,
      JSON.stringify({ bufferedEvents: filtered, lastUpdated: new Date().toISOString() }, null, 2),
      "utf8"
    );
  }

  // ==========================================================================
  // Cryptographic Signature Verification
  // ==========================================================================

  /**
   * Fetches the X.509 certificate from the specified cert URL.
   * Enforces security validation and caches retrieved certificates in memory.
   */
  private async fetchCertificate(certUrl: string): Promise<string> {
    if (this.certResolver) {
      return await this.certResolver(certUrl);
    }

    if (this.certCache.has(certUrl)) {
      return this.certCache.get(certUrl)!;
    }

    if (!isTrustedPayPalCertUrl(certUrl)) {
      throw new WebhookVerificationError(
        "UNTRUSTED_CERT_URL",
        `Certificate URL '${certUrl}' does not match trusted PayPal HTTPS domains.`
      );
    }

    const res = await this.fetchFn(certUrl, { method: "GET" });
    if (!res.ok) {
      throw new WebhookVerificationError(
        "UNTRUSTED_CERT_URL",
        `Failed to fetch PayPal certificate from ${certUrl}: HTTP ${res.status}`
      );
    }

    const certPem = await res.text();
    this.certCache.set(certUrl, certPem);
    return certPem;
  }

  /**
   * Computes the unsigned 32-bit CRC-32 checksum of the raw JSON payload.
   */
  public computePayloadCrc32(rawBody: string | Buffer): number {
    const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
    return zlib.crc32(buf) >>> 0;
  }

  /**
   * Verifies signature locally using X.509 certificate and RSA-SHA256 signature verification.
   * Data string format: <transmission_id>|<transmission_time>|<webhook_id>|<crc32>
   */
  public async verifySignatureLocally(
    headers: Record<string, string>,
    rawBody: string | Buffer
  ): Promise<SignatureVerificationResult> {
    const headerValidation = validateRequiredHeaders(headers);
    if (!headerValidation.isValid) {
      return {
        verified: false,
        strategy: "crypto",
        status: "FAILURE",
        reason: `Missing required PayPal headers: ${headerValidation.missing.join(", ")}`,
      };
    }

    const authAlgo = headers["paypal-auth-algo"];
    const certUrl = headers["paypal-cert-url"];
    const transmissionId = headers["paypal-transmission-id"];
    const transmissionSig = headers["paypal-transmission-sig"];
    const transmissionTime = headers["paypal-transmission-time"];

    // Validate algorithm
    if (authAlgo !== "SHA256withRSA") {
      return {
        verified: false,
        strategy: "crypto",
        status: "FAILURE",
        reason: `Unsupported auth algorithm: ${authAlgo}. Expected SHA256withRSA.`,
      };
    }

    // Retrieve certificate
    let certPem: string;
    try {
      certPem = await this.fetchCertificate(certUrl);
    } catch (err: any) {
      return {
        verified: false,
        strategy: "crypto",
        status: "FAILURE",
        reason: err.message,
      };
    }

    // Compute expected CRC32 and verification data string
    const crc32Val = this.computePayloadCrc32(rawBody);
    const expectedData = `${transmissionId}|${transmissionTime}|${this.webhookId}|${crc32Val}`;

    try {
      const verifier = crypto.createVerify("RSA-SHA256");
      verifier.update(expectedData);
      const isSignatureValid = verifier.verify(
        certPem,
        Buffer.from(transmissionSig, "base64")
      );

      if (!isSignatureValid) {
        return {
          verified: false,
          strategy: "crypto",
          status: "FAILURE",
          reason: "Cryptographic signature mismatch against certificate public key.",
          transmissionId,
          details: { crc32: crc32Val, authAlgo, certUrl },
        };
      }

      return {
        verified: true,
        strategy: "crypto",
        status: "SUCCESS",
        transmissionId,
        details: { crc32: crc32Val, authAlgo },
      };
    } catch (cryptoErr: any) {
      return {
        verified: false,
        strategy: "crypto",
        status: "FAILURE",
        reason: `Cryptographic verification error: ${cryptoErr.message}`,
        transmissionId,
      };
    }
  }

  /**
   * Verifies signature via PayPal's REST API endpoint:
   * POST /v1/notifications/verify-webhook-signature
   */
  public async verifySignatureViaApi(
    headers: Record<string, string>,
    eventPayload: PayPalWebhookEvent | Record<string, unknown>
  ): Promise<SignatureVerificationResult> {
    const headerValidation = validateRequiredHeaders(headers);
    if (!headerValidation.isValid) {
      return {
        verified: false,
        strategy: "api",
        status: "FAILURE",
        reason: `Missing required PayPal headers: ${headerValidation.missing.join(", ")}`,
      };
    }

    const authAlgo = headers["paypal-auth-algo"];
    const certUrl = headers["paypal-cert-url"];
    const transmissionId = headers["paypal-transmission-id"];
    const transmissionSig = headers["paypal-transmission-sig"];
    const transmissionTime = headers["paypal-transmission-time"];

    // Obtain access token
    const authHeader = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString("base64");

    const tokenRes = await this.fetchFn(`${this.config.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new WebhookVerificationError(
        "API_VERIFICATION_FAILED",
        `OAuth token acquisition failed (HTTP ${tokenRes.status}): ${errText}`
      );
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };
    const accessToken = tokenData.access_token;

    const verificationBody = {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: this.webhookId,
      webhook_event: eventPayload,
    };

    const verifyRes = await this.fetchFn(
      `${this.config.baseUrl}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(verificationBody),
      }
    );

    if (!verifyRes.ok) {
      const errText = await verifyRes.text();
      return {
        verified: false,
        strategy: "api",
        status: "FAILURE",
        reason: `PayPal verification API responded with HTTP ${verifyRes.status}: ${errText}`,
        transmissionId,
      };
    }

    const result = (await verifyRes.json()) as { verification_status: string };
    const isSuccess = result.verification_status === "SUCCESS";

    return {
      verified: isSuccess,
      strategy: "api",
      status: isSuccess ? "SUCCESS" : "FAILURE",
      reason: isSuccess ? undefined : "PayPal verification API returned status FAILURE",
      transmissionId,
      details: { verificationStatus: result.verification_status },
    };
  }

  /**
   * Unified verification dispatcher based on configured mode:
   * "api", "crypto", or "auto"
   */
  public async verifyWebhookSignature(
    rawHeaders: Record<string, string | string[] | undefined>,
    body: string | Buffer | PayPalWebhookEvent
  ): Promise<SignatureVerificationResult> {
    const headers = normalizeHeaders(rawHeaders);
    const headerValidation = validateRequiredHeaders(headers);

    if (!headerValidation.isValid) {
      throw new WebhookVerificationError(
        "MISSING_HEADERS",
        `Webhook payload missing mandatory PayPal headers: ${headerValidation.missing.join(", ")}`,
        { missing: headerValidation.missing }
      );
    }

    const rawString =
      typeof body === "string"
        ? body
        : Buffer.isBuffer(body)
        ? body.toString("utf8")
        : JSON.stringify(body);

    const parsedEvent: PayPalWebhookEvent =
      typeof body === "object" && !Buffer.isBuffer(body)
        ? (body as PayPalWebhookEvent)
        : JSON.parse(rawString);

    if (this.verificationMode === "crypto") {
      return await this.verifySignatureLocally(headers, rawString);
    }

    if (this.verificationMode === "api") {
      return await this.verifySignatureViaApi(headers, parsedEvent);
    }

    // "auto" mode: if custom certResolver is provided, use crypto; otherwise use API if clientSecret is configured
    if (this.certResolver) {
      return await this.verifySignatureLocally(headers, rawString);
    }

    if (this.config.clientId && this.config.clientSecret) {
      return await this.verifySignatureViaApi(headers, parsedEvent);
    }

    return await this.verifySignatureLocally(headers, rawString);
  }

  // ==========================================================================
  // Ingestion Pipeline & Out-of-Order Handling
  // ==========================================================================

  /**
   * Parses clanId and memberId from event resource custom_id or reference_id.
   * Format: "clan_id:member_id" or "clan_clanId_member_memberId"
   */
  public parseCustomId(
    customId?: string,
    referenceId?: string
  ): { clanId?: string; memberId?: string } {
    if (customId && customId.includes(":")) {
      const [clanId, memberId] = customId.split(":");
      return { clanId, memberId };
    }

    if (referenceId && referenceId.startsWith("clan_")) {
      const match = referenceId.match(/^clan_(.+)_member_(.+)$/);
      if (match) {
        return { clanId: match[1], memberId: match[2] };
      }
    }

    return {};
  }

  /**
   * Primary Ingestion Method:
   * 1. Validates headers and verifies cryptographic signature (fails fast if invalid).
   * 2. Checks deduplication: if duplicate, silently acknowledges without state mutation.
   * 3. Handles out-of-order deliveries (buffers if prerequisite state is missing).
   * 4. Updates ledger state atomically and records processed event ID.
   */
  public async handleWebhook(
    rawHeaders: Record<string, string | string[] | undefined>,
    body: string | Buffer | PayPalWebhookEvent,
    clanState?: ClanStateRecord
  ): Promise<WebhookIngestionResult> {
    const headers = normalizeHeaders(rawHeaders);

    const rawString =
      typeof body === "string"
        ? body
        : Buffer.isBuffer(body)
        ? body.toString("utf8")
        : JSON.stringify(body);

    const event: PayPalWebhookEvent =
      typeof body === "object" && !Buffer.isBuffer(body)
        ? (body as PayPalWebhookEvent)
        : JSON.parse(rawString);

    // 1. Verify Signature
    const verification = await this.verifyWebhookSignature(headers, rawString);
    if (!verification.verified) {
      throw new WebhookVerificationError(
        "INVALID_SIGNATURE",
        verification.reason || "Webhook signature validation failed",
        verification.details
      );
    }

    // 2. Deduplication Check
    if (this.isDuplicate(event.id)) {
      return {
        success: true,
        status: "DUPLICATE_IGNORED",
        eventId: event.id,
        eventType: event.event_type,
        message: `Duplicate webhook event ${event.id} silently acknowledged without state mutation.`,
        verification,
      };
    }

    // 3. Process Event / Check Out-of-Order
    const ingestion = await this.ingestEvent(event, clanState);

    // 4. Record as Processed
    this.recordProcessedEvent({
      eventId: event.id,
      eventType: event.event_type,
      resourceType: event.resource_type,
      resourceId: event.resource?.id,
      processedAt: new Date().toISOString(),
      status: ingestion.status === "OUT_OF_ORDER_BUFFERED" ? "OUT_OF_ORDER_BUFFERED" : "PROCESSED",
      summary: event.summary,
    });

    return {
      ...ingestion,
      verification,
    };
  }

  /**
   * Internal ingestion logic with out-of-order resilience and replay.
   */
  public async ingestEvent(
    event: PayPalWebhookEvent,
    clanState?: ClanStateRecord
  ): Promise<WebhookIngestionResult> {
    const resource = event.resource || {};
    const { clanId, memberId } = this.parseCustomId(
      resource.custom_id,
      (resource as any).reference_id
    );

    const orderId =
      event.resource_type === "order" || event.event_type.startsWith("CHECKOUT.ORDER")
        ? resource.id
        : undefined;

    const authorizationId =
      event.resource_type === "authorization" ||
      event.event_type.startsWith("PAYMENT.AUTHORIZATION")
        ? resource.id
        : (resource as any).parent_payment;

    const captureId =
      event.resource_type === "capture" || event.event_type.startsWith("PAYMENT.CAPTURE")
        ? resource.id
        : undefined;

    // Out-of-order check: Capture completed before authorization or order is recorded locally
    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const targetOrder = clanState?.orders.find(
        (o) =>
          (memberId && o.memberId === memberId) ||
          (authorizationId && o.authorizationId === authorizationId) ||
          (orderId && o.orderId === orderId)
      );

      // If clanState is provided and order is missing or order is still in CREATED/PLEDGED status:
      if (clanState && (!targetOrder || targetOrder.status === "PLEDGED" || targetOrder.status === "CREATED")) {
        this.bufferOutOfOrderEvent(
          event,
          "Capture arrived before authorization completed in local state",
          { clanId, memberId, resourceId: captureId }
        );

        return {
          success: true,
          status: "OUT_OF_ORDER_BUFFERED",
          eventId: event.id,
          eventType: event.event_type,
          buffered: true,
          message: `Capture event ${event.id} buffered: Order or authorization not yet recorded or in non-terminal state. Ledger protected against corruption.`,
        };
      }

      // Valid in-order transition: apply capture to target order
      if (targetOrder) {
        try {
          if (targetOrder.status === "AUTHORIZED") {
            targetOrder.status = transitionMemberState("AUTHORIZED", "CAPTURED");
          } else {
            targetOrder.status = "CAPTURED";
          }
          targetOrder.captureId = captureId;
        } catch {
          // If transition is invalid, protect state by buffering
          this.bufferOutOfOrderEvent(
            event,
            `Cannot transition order ${targetOrder.orderId} from '${targetOrder.status}' to 'CAPTURED'`,
            { clanId, memberId, resourceId: captureId }
          );
          return {
            success: true,
            status: "OUT_OF_ORDER_BUFFERED",
            eventId: event.id,
            eventType: event.event_type,
            buffered: true,
            message: `Transition not allowed from ${targetOrder.status}; buffered safely.`,
          };
        }
      }

      return {
        success: true,
        status: "PROCESSED",
        eventId: event.id,
        eventType: event.event_type,
        message: `Capture ${captureId} applied successfully.`,
      };
    }

    // Out-of-order check: Refund completed before capture is recorded locally
    if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
      const parentCapture =
        resource.links?.find((l) => l.rel === "up")?.href.split("/").pop() ||
        (resource as any).capture_id;

      const targetOrder = clanState?.orders.find(
        (o) =>
          (memberId && o.memberId === memberId) ||
          (parentCapture && o.captureId === parentCapture)
      );

      if (clanState && (!targetOrder || targetOrder.status !== "CAPTURED")) {
        this.bufferOutOfOrderEvent(
          event,
          "Refund arrived before capture recorded in local state",
          { clanId, memberId, resourceId: resource.id }
        );
        return {
          success: true,
          status: "OUT_OF_ORDER_BUFFERED",
          eventId: event.id,
          eventType: event.event_type,
          buffered: true,
          message: `Refund event ${event.id} buffered safely: target capture not yet recorded.`,
        };
      }

      if (targetOrder) {
        targetOrder.status = transitionMemberState("CAPTURED", "REFUNDED");
        targetOrder.refundId = resource.id;
      }

      return {
        success: true,
        status: "PROCESSED",
        eventId: event.id,
        eventType: event.event_type,
        message: `Refund ${resource.id} processed successfully.`,
      };
    }

    // In-order event: Authorization created or completed
    if (
      event.event_type === "PAYMENT.AUTHORIZATION.CREATED" ||
      event.event_type === "CHECKOUT.ORDER.APPROVED"
    ) {
      let replayedEvents: string[] = [];
      const targetOrder = clanState?.orders.find(
        (o) =>
          (memberId && o.memberId === memberId) ||
          (orderId && o.orderId === orderId)
      );

      if (targetOrder) {
        if (targetOrder.status === "PLEDGED" || targetOrder.status === "CREATED") {
          targetOrder.status = "AUTHORIZED";
        }
        if (authorizationId) {
          targetOrder.authorizationId = authorizationId;
        }

        // Check if there were any buffered out-of-order events waiting for this order
        const buffered = this.getBufferedEvents();
        const pendingForThis = buffered.filter(
          (b) =>
            (memberId && b.memberId === memberId) ||
            (b.resourceId && b.resourceId === authorizationId)
        );

        for (const pending of pendingForThis) {
          if (pending.eventType === "PAYMENT.CAPTURE.COMPLETED") {
            try {
              targetOrder.status = transitionMemberState("AUTHORIZED", "CAPTURED");
              targetOrder.captureId = pending.resourceId;
              this.removeBufferedEvent(pending.eventId);
              replayedEvents.push(pending.eventId);
            } catch {
              // Leave buffered if not yet ready
            }
          }
        }
      }

      return {
        success: true,
        status: "PROCESSED",
        eventId: event.id,
        eventType: event.event_type,
        message: `Authorization/Approval processed successfully.`,
        replayedEvents: replayedEvents.length > 0 ? replayedEvents : undefined,
      };
    }

    // In-order event: Authorization voided
    if (event.event_type === "PAYMENT.AUTHORIZATION.VOIDED") {
      const targetOrder = clanState?.orders.find(
        (o) =>
          (memberId && o.memberId === memberId) ||
          (authorizationId && o.authorizationId === authorizationId)
      );

      if (targetOrder) {
        if (targetOrder.status === "AUTHORIZED" || targetOrder.status === "PLEDGED") {
          targetOrder.status = "VOIDED";
        }
      }

      return {
        success: true,
        status: "PROCESSED",
        eventId: event.id,
        eventType: event.event_type,
        message: `Authorization void processed successfully.`,
      };
    }

    // Default handler for general webhook events (e.g. disputes, tracking)
    return {
      success: true,
      status: "PROCESSED",
      eventId: event.id,
      eventType: event.event_type,
      message: `Event ${event.event_type} processed successfully.`,
    };
  }
}

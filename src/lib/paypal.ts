import { createHash } from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  mode: "sandbox" | "live";
}

export function getPayPalConfig(): PayPalConfig {
  const clientId = process.env.PAYPAL_CLIENT_ID || "";
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
  const baseUrl = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
  const mode = (process.env.PAYPAL_MODE === "live" ? "live" : "sandbox") as "sandbox" | "live";

  return {
    clientId,
    clientSecret,
    baseUrl: baseUrl.replace(/\/$/, ""),
    mode,
  };
}

export interface AccessTokenResponse {
  scope: string;
  access_token: string;
  token_type: string;
  app_id: string;
  expires_in: number;
  nonce: string;
}

export interface AuthorizeOrderRequest {
  clanId: string;
  memberId: string;
  amount: number;
  currency?: string;
  description?: string;
  customId?: string;
}

export interface PayPalOrderResponse {
  id: string;
  status: "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
  intent: "AUTHORIZE" | "CAPTURE";
  purchase_units: {
    reference_id?: string;
    amount: {
      currency_code: string;
      value: string;
    };
    payments?: {
      authorizations?: {
        id: string;
        status: string;
        amount: {
          currency_code: string;
          value: string;
        };
      }[];
    };
  }[];
  links: {
    href: string;
    rel: string;
    method: string;
  }[];
}

export interface CaptureAuthorizationResponse {
  id: string;
  status: "COMPLETED" | "DECLINED" | "PARTIALLY_CAPTURED" | "PENDING" | "FAILED";
  amount: {
    currency_code: string;
    value: string;
  };
  final_capture: boolean;
  seller_protection?: {
    status: string;
  };
}

export interface InvoiceWithQrResponse {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  qrCodeUrl?: string;
  qrCodeBase64?: string;
  paymentLink?: string;
}

export interface ShipmentTrackerRequest {
  transactionId: string;
  trackingNumber: string;
  carrier: "UPS" | "FEDEX" | "USPS" | "DHL" | "OTHER";
  status: "SHIPPED" | "DELIVERED" | "ON_HOLD";
  notifyBuyer?: boolean;
}

export interface DisputePartialRefundRequest {
  captureId: string;
  disputeId?: string;
  refundAmount: number;
  currency?: string;
  noteToPayer?: string;
  reason?: string;
}

/**
 * Generate a deterministic SHA-256 Idempotency Key for PayPal headers
 */
export function generateIdempotencyKey(parts: (string | number)[]): string {
  const seed = parts.join(":");
  return createHash("sha256").update(seed).digest("hex");
}

export class PayPalSandboxClient {
  private config: PayPalConfig;
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(config?: Partial<PayPalConfig>) {
    this.config = { ...getPayPalConfig(), ...config };
  }

  /**
   * 1. getAccessToken(): Executes POST /v1/oauth2/token with HTTP Basic Auth
   */
  async getAccessToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (!forceRefresh && this.cachedToken && this.cachedToken.expiresAt > now + 60000) {
      return this.cachedToken.token;
    }

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error(
        "Missing PayPal credentials. Please provide PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env."
      );
    }

    const authHeader = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString("base64");

    const response = await fetch(`${this.config.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(
        `Failed to authenticate with PayPal Sandbox (HTTP ${response.status}): ${errBody}`
      );
    }

    const data = (await response.json()) as AccessTokenResponse;
    this.cachedToken = {
      token: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };

    return data.access_token;
  }

  /**
   * 2. createAuthorizeOrder(): Executes POST /v2/checkout/orders with intent: "AUTHORIZE"
   * Zero working capital lockup: Authorizes buyer funds without upfront cash deduction.
   */
  async createAuthorizeOrder(req: AuthorizeOrderRequest): Promise<PayPalOrderResponse> {
    const token = await this.getAccessToken();
    const currency = req.currency || "USD";
    const idempotencyKey = generateIdempotencyKey([
      "AUTHORIZE_ORDER",
      req.clanId,
      req.memberId,
      req.amount.toFixed(2),
      currency,
    ]);

    const payload = {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: `clan_${req.clanId}_member_${req.memberId}`,
          description: req.description || `SyndicatePay Clan Commitment - Clan ${req.clanId}`,
          custom_id: req.customId || `${req.clanId}:${req.memberId}`,
          amount: {
            currency_code: currency,
            value: req.amount.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "SyndicatePay B2B",
        landing_page: "NO_PREFERENCE",
        user_action: "CONTINUE",
        return_url: "https://syndicatepay.local/checkout/success",
        cancel_url: "https://syndicatepay.local/checkout/cancel",
      },
    };

    const response = await fetch(`${this.config.baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": idempotencyKey,
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PayPal createAuthorizeOrder failed (HTTP ${response.status}): ${errorText}`);
    }

    return (await response.json()) as PayPalOrderResponse;
  }

  /**
   * 3. captureAuthorizedOrder(): Executes POST /v2/payments/authorizations/{id}/capture
   * Executed when Clan reaches 100% Minimum Order Quantity (MOQ).
   */
  async captureAuthorizedOrder(
    authorizationId: string,
    amount: number,
    currency = "USD",
    finalCapture = true
  ): Promise<CaptureAuthorizationResponse> {
    const token = await this.getAccessToken();
    const idempotencyKey = generateIdempotencyKey([
      "CAPTURE_AUTH",
      authorizationId,
      amount.toFixed(2),
      currency,
    ]);

    const payload = {
      amount: {
        currency_code: currency,
        value: amount.toFixed(2),
      },
      final_capture: finalCapture,
      note_to_payer: "SyndicatePay 100% MOQ Unlocked - Final Wholesale Settlement",
    };

    const response = await fetch(
      `${this.config.baseUrl}/v2/payments/authorizations/${authorizationId}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": idempotencyKey,
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `PayPal captureAuthorizedOrder failed for auth ${authorizationId} (HTTP ${response.status}): ${errorText}`
      );
    }

    return (await response.json()) as CaptureAuthorizationResponse;
  }

  /**
   * 4. createInvoiceWithQr(): Executes POST /v2/invoicing/invoices + QR code generation
   * Used for Step-up human authentication for commitments exceeding $1,000.
   */
  async createInvoiceWithQr(params: {
    recipientEmail: string;
    recipientName: string;
    amount: number;
    description: string;
    currency?: string;
  }): Promise<InvoiceWithQrResponse> {
    const token = await this.getAccessToken();
    const currency = params.currency || "USD";

    // Step A: Generate next invoice number
    const numRes = await fetch(`${this.config.baseUrl}/v2/invoicing/generate-next-invoice-number`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    let invoiceNumber = `INV-SP-${Date.now()}`;
    if (numRes.ok) {
      const numData = (await numRes.json()) as { invoice_number: string };
      invoiceNumber = numData.invoice_number;
    }

    // Step B: Create draft invoice
    const invoicePayload = {
      detail: {
        invoice_number: invoiceNumber,
        reference: "SYNDICATEPAY_STEP_UP",
        invoice_date: new Date().toISOString().split("T")[0],
        currency_code: currency,
        note: "SyndicatePay High-Value Wholesale Step-Up Verification ($1,000+ commitment)",
      },
      invoicer: {
        name: {
          given_name: "SyndicatePay",
          surname: "Clan Escrow",
        },
      },
      primary_recipients: [
        {
          billing_info: {
            name: {
              given_name: params.recipientName,
            },
            email_address: params.recipientEmail,
          },
        },
      ],
      items: [
        {
          name: params.description,
          quantity: "1",
          unit_amount: {
            currency_code: currency,
            value: params.amount.toFixed(2),
          },
          unit_of_measure: "QUANTITY",
        },
      ],
    };

    const createRes = await fetch(`${this.config.baseUrl}/v2/invoicing/invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(invoicePayload),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Failed to create PayPal invoice (HTTP ${createRes.status}): ${err}`);
    }

    const createdData = (await createRes.json()) as {
      id: string;
      status: string;
      detail: { invoice_number: string };
      links: { href: string; rel: string }[];
    };
    const invoiceId = createdData.id;

    // Step C: Generate QR code for invoice
    let qrCodeBase64: string | undefined;
    const qrRes = await fetch(
      `${this.config.baseUrl}/v2/invoicing/invoices/${invoiceId}/generate-qr-code`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ width: 400, height: 400 }),
      }
    );

    if (qrRes.ok) {
      const qrData = (await qrRes.json()) as { qr_code?: string };
      qrCodeBase64 = qrData.qr_code;
    }

    const payLink = createdData.links?.find((l) => l.rel === "payer-view")?.href;

    return {
      invoiceId,
      invoiceNumber: createdData.detail?.invoice_number || invoiceNumber,
      status: createdData.status,
      qrCodeBase64,
      paymentLink: payLink,
    };
  }

  /**
   * 5. createShipmentTracking(): Executes POST /v1/shipping/trackers-batch
   * Binds carrier tracking numbers to PayPal orders for automated verification.
   */
  async createShipmentTracking(tracker: ShipmentTrackerRequest): Promise<unknown> {
    const token = await this.getAccessToken();

    const payload = {
      trackers: [
        {
          transaction_id: tracker.transactionId,
          tracking_number: tracker.trackingNumber,
          status: tracker.status,
          carrier: tracker.carrier,
          notify_buyer: tracker.notifyBuyer ?? true,
        },
      ],
    };

    const response = await fetch(`${this.config.baseUrl}/v1/shipping/trackers-batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`createShipmentTracking failed (HTTP ${response.status}): ${err}`);
    }

    return await response.json();
  }

  /**
   * 6. settleDisputeWithPartialRefund(): Executes POST /v2/payments/captures/{id}/refund
   * Customer dispute mediation for damaged shipments & returns.
   */
  async settleDisputeWithPartialRefund(req: DisputePartialRefundRequest): Promise<unknown> {
    const token = await this.getAccessToken();
    const currency = req.currency || "USD";
    const idempotencyKey = generateIdempotencyKey([
      "REFUND_DISPUTE",
      req.captureId,
      req.refundAmount.toFixed(2),
      currency,
    ]);

    const payload = {
      amount: {
        value: req.refundAmount.toFixed(2),
        currency_code: currency,
      },
      note_to_payer:
        req.noteToPayer ||
        `SyndicatePay mediated settlement: Partial refund of $${req.refundAmount.toFixed(2)} for reported damaged units.`,
    };

    const response = await fetch(
      `${this.config.baseUrl}/v2/payments/captures/${req.captureId}/refund`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": idempotencyKey,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(
        `settleDisputeWithPartialRefund failed for capture ${req.captureId} (HTTP ${response.status}): ${err}`
      );
    }

    return await response.json();
  }

  /**
   * Additional Native Primitives: Merchant Insights & Disputes Inspection
   */
  async listDisputes(): Promise<unknown> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.config.baseUrl}/v1/customer/disputes`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`listDisputes failed (HTTP ${response.status}): ${err}`);
    }

    return await response.json();
  }

  async getOrder(orderId: string): Promise<PayPalOrderResponse> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.config.baseUrl}/v2/checkout/orders/${orderId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`getOrder failed for ${orderId} (HTTP ${response.status}): ${err}`);
    }

    return (await response.json()) as PayPalOrderResponse;
  }
}

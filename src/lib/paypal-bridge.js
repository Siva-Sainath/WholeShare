import crypto from "node:crypto";
import "./env.js";

const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";
const DEFAULT_TIMEOUT_MS = parseInt(process.env.PAYPAL_TIMEOUT_MS || "15000", 10);

let cachedAccessToken = null;
let tokenExpiresAt = 0;

export class PayPalConfigurationError extends Error {
  constructor(message = "PayPal credentials not configured.") {
    super(message);
    this.name = "PayPalConfigurationError";
    this.code = "PAYPAL_CONFIGURATION_ERROR";
  }
}

export class PayPalApiError extends Error {
  constructor(message, { status, debugId, code = "PAYPAL_API_ERROR", details } = {}) {
    super(message);
    this.name = "PayPalApiError";
    this.status = status;
    this.debugId = debugId;
    this.code = code;
    this.details = details;
  }
}

export function resetPayPalTokenCache() {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
}

export async function executePayPalRequest(endpointPath, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const url = endpointPath.startsWith("http") ? endpointPath : `${PAYPAL_API_BASE}${endpointPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timer);

    const debugId = res.headers.get("paypal-debug-id") || "unknown";

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const issueSummary = errorBody.message || errorBody.error_description || errorBody.name || JSON.stringify(errorBody);

      if (res.status === 401) {
        throw new PayPalApiError(
          `PayPal rejected this app's sandbox credentials. They may have expired or been changed in the PayPal developer dashboard, so the site owner needs to update them. Debug ID: ${debugId}.`,
          { status: 401, debugId, code: "PAYPAL_AUTH_ERROR", details: errorBody }
        );
      }

      if (res.status === 404) {
        throw new PayPalApiError(
          `PayPal resource not found (HTTP 404). Target: ${endpointPath}. Debug ID: ${debugId}.`,
          { status: 404, debugId, code: "PAYPAL_NOT_FOUND", details: errorBody }
        );
      }

      if (res.status === 422) {
        throw new PayPalApiError(
          `PayPal rejected request data (HTTP 422 Unprocessable Entity): ${issueSummary}. Debug ID: ${debugId}.`,
          { status: 422, debugId, code: "PAYPAL_UNPROCESSABLE_ENTITY", details: errorBody }
        );
      }

      if (res.status >= 500) {
        throw new PayPalApiError(
          `PayPal Sandbox service temporarily unavailable (HTTP ${res.status}). Debug ID: ${debugId}. Check https://www.paypal-status.com/ for ongoing maintenance.`,
          { status: res.status, debugId, code: "PAYPAL_SERVER_ERROR", details: errorBody }
        );
      }

      throw new PayPalApiError(
        `PayPal API call failed with HTTP ${res.status}: ${issueSummary}. Debug ID: ${debugId}.`,
        { status: res.status, debugId, code: "PAYPAL_API_ERROR", details: errorBody }
      );
    }

    return res;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new PayPalApiError(
        `PayPal API request timed out after ${timeoutMs}ms while contacting ${endpointPath}. Check network connection or PayPal Sandbox status.`,
        { status: 504, code: "PAYPAL_TIMEOUT", details: { endpointPath, timeoutMs } }
      );
    }
    if (err instanceof PayPalApiError || err instanceof PayPalConfigurationError) {
      throw err;
    }
    throw new PayPalApiError(
      `PayPal network communication failure: ${err.message}. Ensure api-m.sandbox.paypal.com is reachable.`,
      { status: 503, code: "PAYPAL_NETWORK_ERROR", details: { originalError: err.message } }
    );
  }
}

export async function getPayPalAccessToken(timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId === "SANDBOX_MOCK_CLIENT_ID" || clientId.includes("your_sandbox")) {
    throw new PayPalConfigurationError(
      "PayPal sandbox credentials missing or placeholder in .env. Obtain Sandbox Client ID and Secret from https://developer.paypal.com/dashboard/applications/sandbox."
    );
  }

  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await executePayPalRequest(
    "/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    },
    timeoutMs
  );

  const data = await res.json();
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);
  return cachedAccessToken;
}

export async function createOrderAuthorization({
  amountCents,
  currency = "USD",
  referenceId,
  idempotencyKey,
  returnUrl,
  cancelUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("amountCents must be a positive integer.");
  }

  const token = await getPayPalAccessToken(timeoutMs);
  const requestId = idempotencyKey || `req_${crypto.randomUUID()}`;
  const amountStr = (amountCents / 100).toFixed(2);

  const res = await executePayPalRequest(
    "/v2/checkout/orders",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId
      },
      body: JSON.stringify({
        intent: "AUTHORIZE",
        purchase_units: [
          {
            reference_id: referenceId || `ref_${Date.now()}`,
            amount: {
              currency_code: currency,
              value: amountStr
            }
          }
        ],
        // With return and cancel addresses the approval can be completed on any device, for example from a link sent in a chat.
        ...(returnUrl && cancelUrl ? { payment_source: { paypal: { experience_context: { return_url: returnUrl, cancel_url: cancelUrl, shipping_preference: "NO_SHIPPING", user_action: "CONTINUE", brand_name: "WholeShare" } } } } : {})
      })
    },
    timeoutMs
  );

  const data = await res.json();
  return {
    orderId: data.id,
    status: data.status,
    intent: "AUTHORIZE",
    amountCents,
    currency,
    referenceId,
    idempotencyKey: requestId,
    links: data.links || [],
    approvalUrl: (data.links || []).find((link) => link.rel === "payer-action" || link.rel === "approve")?.href ?? null,
    liveMode: true
  };
}

// Returns money to the buyer from a captured payment. The amount is the refund, in cents.
export async function refundCapture({ captureId, amountCents, currency = "USD", note, idempotencyKey, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!captureId) throw new Error("captureId is required to refund a payment.");
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("amountCents must be a positive integer.");
  const token = await getPayPalAccessToken(timeoutMs);
  const res = await executePayPalRequest(
    `/v2/payments/captures/${captureId}/refund`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": idempotencyKey || `ref_${crypto.randomUUID()}` },
      body: JSON.stringify({ amount: { currency_code: currency, value: (amountCents / 100).toFixed(2) }, ...(note ? { note_to_payer: String(note).slice(0, 255) } : {}) })
    },
    timeoutMs
  );
  const data = await res.json();
  return { refundId: data.id, status: data.status, amountCents, currency, rawResponse: data, liveMode: true };
}

export async function authorizeOrderHold({ orderId, idempotencyKey, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!orderId) {
    throw new Error("orderId is required to authorize an order hold.");
  }

  const token = await getPayPalAccessToken(timeoutMs);
  const requestId = idempotencyKey || `auth_${crypto.randomUUID()}`;

  const res = await executePayPalRequest(
    `/v2/checkout/orders/${orderId}/authorize`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId
      }
    },
    timeoutMs
  );

  const data = await res.json();
  const auth = data.purchase_units?.[0]?.payments?.authorizations?.[0];
  return {
    authorizationId: auth?.id || data.id,
    orderId,
    status: auth?.status || data.status || "AUTHORIZED",
    idempotencyKey: requestId,
    links: data.links || [],
    liveMode: true
  };
}

export async function voidOrderAuthorization({ authorizationId, idempotencyKey, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!authorizationId) throw new Error("authorizationId is required to void an order authorization.");

  const token = await getPayPalAccessToken(timeoutMs);
  const requestId = idempotencyKey || `void_${crypto.randomUUID()}`;
  const response = await executePayPalRequest(
    `/v2/payments/authorizations/${authorizationId}/void`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId
      }
    },
    timeoutMs
  );

  return { authorizationId, status: response.status, idempotencyKey: requestId, liveMode: true };
}

export async function captureOrderHold({
  authorizationId,
  amountCents,
  currency = "USD",
  isFinalCapture = true,
  idempotencyKey,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  if (!authorizationId) {
    throw new Error("authorizationId is required to capture an authorized hold.");
  }

  const token = await getPayPalAccessToken(timeoutMs);
  const requestId = idempotencyKey || `cap_${crypto.randomUUID()}`;
  const amountStr = (amountCents / 100).toFixed(2);

  const payload = {
    final_capture: isFinalCapture
  };

  if (amountCents) {
    payload.amount = {
      currency_code: currency,
      value: amountStr
    };
  }

  const res = await executePayPalRequest(
    `/v2/payments/authorizations/${authorizationId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId
      },
      body: JSON.stringify(payload)
    },
    timeoutMs
  );

  const data = await res.json();
  return {
    captureId: data.id,
    authorizationId,
    status: data.status,
    amountCents,
    currency,
    idempotencyKey: requestId,
    links: data.links || [],
    liveMode: true
  };
}

export async function generateInvoiceWithQr({
  recipientEmail = "buyer@example.com",
  items = [],
  totalCents,
  invoiceNumber,
  memo = "Wholeshare Group Purchasing Step-Up KYC",
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const token = await getPayPalAccessToken(timeoutMs);
  const requestId = `inv_${crypto.randomUUID()}`;
  const amountStr = totalCents ? (totalCents / 100).toFixed(2) : "100.00";
  const assignedInvoiceNumber = invoiceNumber || `INV2-${Date.now()}`;

  const invoiceRes = await executePayPalRequest(
    "/v2/invoicing/invoices",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId
      },
      body: JSON.stringify({
        detail: {
          invoice_number: assignedInvoiceNumber,
          currency_code: "USD",
          note: memo
        },
        primary_recipients: [
          {
            billing_info: {
              email_address: recipientEmail
            }
          }
        ],
        items: items.length > 0 ? items : [
          {
            name: "Wholesale Coalition Allocation",
            quantity: "1",
            unit_amount: {
              currency_code: "USD",
              value: amountStr
            }
          }
        ]
      })
    },
    timeoutMs
  );

  const invoiceData = await invoiceRes.json();
  const invoiceId = invoiceData.id || invoiceData.href?.split("/").pop();
  const cleanIdToken = invoiceId.replace(/^INV2-/, "").replace(/-/g, "");

  let payerViewUrl = `https://www.sandbox.paypal.com/invoice/p/#${cleanIdToken}`;
  let status = "DRAFT";

  try {
    const sendRes = await executePayPalRequest(
      `/v2/invoicing/invoices/${invoiceId}/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          send_to_recipient: true
        })
      },
      timeoutMs
    );
    if (sendRes.ok) {
      status = "SENT";
      try {
        const detailsRes = await executePayPalRequest(
          `/v2/invoicing/invoices/${invoiceId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          },
          timeoutMs
        );
        if (detailsRes.ok) {
          const detailData = await detailsRes.json();
          if (detailData.detail?.metadata?.recipient_view_url) {
            payerViewUrl = detailData.detail.metadata.recipient_view_url;
          }
        }
      } catch (_detailsErr) {}
    }
  } catch (sendErr) {
    console.error(`Warning: PayPal invoice send call failed: ${sendErr.message}`);
  }

  let qrCodeUrl = payerViewUrl;
  try {
    const qrRes = await executePayPalRequest(
      `/v2/invoicing/invoices/${invoiceId}/generate-qr-code`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      },
      timeoutMs
    );
    const qrText = await qrRes.text();
    const base64Match = qrText.match(/(?:text\/plain\s+)([A-Za-z0-9+/=]+)/);
    if (base64Match && base64Match[1]) {
      qrCodeUrl = `data:image/png;base64,${base64Match[1].trim()}`;
    }
  } catch (qrErr) {
    console.error(`Warning: PayPal invoice QR code generation failed: ${qrErr.message}`);
  }

  return {
    invoiceId,
    invoiceNumber: invoiceData.detail?.invoice_number || assignedInvoiceNumber || invoiceId,
    recipientEmail,
    totalCents,
    qrCodeUrl,
    payerViewUrl,
    status,
    liveMode: true
  };
}

export async function registerShipmentTracking({
  trackingNumber,
  carrier = "UPS",
  orderId,
  notifyPayer = true,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  if (!trackingNumber) {
    throw new Error("trackingNumber is required to register shipment tracking.");
  }

  const token = await getPayPalAccessToken(timeoutMs);

  const res = await executePayPalRequest(
    "/v1/shipping/trackers-batch",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        trackers: [
          {
            transaction_id: orderId,
            tracking_number: trackingNumber,
            carrier,
            status: "SHIPPED",
            notify_payer: notifyPayer
          }
        ]
      })
    },
    timeoutMs
  );

  const data = await res.json();
  return {
    trackingNumber,
    carrier,
    orderId,
    status: "SHIPPED",
    trackerId: data.tracker_identifiers?.[0]?.tracker_id || trackingNumber,
    registeredAt: new Date().toISOString(),
    liveMode: true
  };
}

export async function getOrder(orderId, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!orderId) {
    throw new Error("orderId is required.");
  }

  const token = await getPayPalAccessToken(timeoutMs);
  const res = await executePayPalRequest(
    `/v2/checkout/orders/${orderId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    },
    timeoutMs
  );

  return res.json();
}

export async function getInvoice(invoiceId, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!invoiceId) {
    throw new Error("invoiceId is required.");
  }

  const token = await getPayPalAccessToken(timeoutMs);
  const res = await executePayPalRequest(
    `/v2/invoicing/invoices/${invoiceId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    },
    timeoutMs
  );

  return res.json();
}

export async function getShipmentTracking(trackingNumber, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!trackingNumber) {
    throw new Error("trackingNumber is required.");
  }

  const token = await getPayPalAccessToken(timeoutMs);
  const res = await executePayPalRequest(
    `/v1/shipping/trackers/${trackingNumber}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    },
    timeoutMs
  );

  return res.json();
}

let cachedDefaultProductId = null;

export async function createCatalogProduct({
  name = "Wholeshare Procurement Service",
  description = "B2B Group Purchasing Syndicate Subscription",
  type = "SERVICE",
  category = "SOFTWARE",
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const token = await getPayPalAccessToken(timeoutMs);
  const requestId = `prod_${crypto.randomUUID()}`;

  const res = await executePayPalRequest(
    "/v1/catalogs/products",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId
      },
      body: JSON.stringify({
        name,
        description,
        type,
        category
      })
    },
    timeoutMs
  );

  return res.json();
}

export async function ensureDefaultProductId(timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (cachedDefaultProductId) {
    return cachedDefaultProductId;
  }
  const prod = await createCatalogProduct({ timeoutMs });
  cachedDefaultProductId = prod.id;
  return cachedDefaultProductId;
}

export async function createSubscriptionPlan({
  productId,
  name,
  description = "Wholeshare Recurring Procurement Plan",
  unitPriceCents,
  amountCents,
  currency = "USD",
  intervalUnit = "MONTH",
  intervalCount = 1,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const token = await getPayPalAccessToken(timeoutMs);
  const finalCents = unitPriceCents ?? amountCents;
  const amountStr = (finalCents / 100).toFixed(2);
  const requestId = `plan_${crypto.randomUUID()}`;

  const resolvedProductId = productId || (await ensureDefaultProductId(timeoutMs));

  const res = await executePayPalRequest(
    "/v1/billing/plans",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId
      },
      body: JSON.stringify({
        product_id: resolvedProductId,
        name,
        description,
        status: "ACTIVE",
        billing_cycles: [
          {
            frequency: {
              interval_unit: intervalUnit,
              interval_count: intervalCount
            },
            tenure_type: "REGULAR",
            sequence: 1,
            total_cycles: 0,
            pricing_scheme: {
              fixed_price: {
                value: amountStr,
                currency_code: currency
              }
            }
          }
        ],
        payment_preferences: {
          auto_bill_outstanding: true,
          setup_fee_failure_action: "CONTINUE",
          payment_failure_threshold: 3
        }
      })
    },
    timeoutMs
  );

  const data = await res.json();
  return {
    planId: data.id,
    name: data.name,
    status: data.status,
    unitPriceCents: finalCents,
    amountCents: finalCents,
    currency,
    intervalUnit,
    intervalCount,
    links: data.links || [],
    liveMode: true
  };
}

export async function createSubscription({
  planId,
  subscriberEmail,
  subscriberName,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const token = await getPayPalAccessToken(timeoutMs);
  const requestId = `sub_${crypto.randomUUID()}`;

  const res = await executePayPalRequest(
    "/v1/billing/subscriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId
      },
      body: JSON.stringify({
        plan_id: planId,
        subscriber: {
          name: {
            given_name: subscriberName || "Wholeshare Buyer"
          },
          email_address: subscriberEmail
        },
        application_context: {
          brand_name: "Wholeshare Procurement Syndicate",
          user_action: "SUBSCRIBE_NOW"
        }
      })
    },
    timeoutMs
  );

  const data = await res.json();
  return {
    subscriptionId: data.id,
    status: data.status,
    planId,
    subscriberEmail,
    approvalUrl: data.links?.find(l => l.rel === "approve")?.href || "",
    links: data.links || [],
    liveMode: true
  };
}

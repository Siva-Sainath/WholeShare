import crypto from "node:crypto";
import { createSharedPaymentToken } from "./token.js";
import { getRequiredHmacSecret } from "./env.js";

const MAX_REPLAY_WINDOW_SEC = 300;

function resolveSecret(secret) {
  return secret || getRequiredHmacSecret();
}

export function signPayload(rawBody, timestamp, secret = null) {
  const activeSecret = resolveSecret(secret);
  const payload = `${timestamp}.${rawBody}`;
  return crypto
    .createHmac("sha256", activeSecret)
    .update(payload)
    .digest("hex");
}

export function verifyIngressSignature(headers, rawBody, secret = null) {
  const activeSecret = resolveSecret(secret);
  const signature = headers["x-wholeshare-signature"];
  const timestampHeader = headers["x-wholeshare-timestamp"];

  if (!signature || !timestampHeader) {
    return { valid: false, reason: "Missing signature or timestamp header." };
  }

  const timestamp = parseInt(timestampHeader, 10);
  const now = Math.floor(Date.now() / 1000);

  if (isNaN(timestamp) || Math.abs(now - timestamp) > MAX_REPLAY_WINDOW_SEC) {
    return { valid: false, reason: "Timestamp exceeds 300-second replay window." };
  }

  const payload = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac("sha256", activeSecret)
    .update(payload)
    .digest("hex");

  try {
    const matches = crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
    return matches ? { valid: true } : { valid: false, reason: "Signature mismatch." };
  } catch {
    return { valid: false, reason: "Invalid signature encoding." };
  }
}

export function handleBotIngressMandate(headers, body, rawBodyString, secret = null) {
  const verification = verifyIngressSignature(headers, rawBodyString, secret);
  if (!verification.valid) {
    return {
      status: 401,
      response: {
        error: "UNAUTHORIZED",
        message: verification.reason
      }
    };
  }

  const {
    buyerId,
    buyerName,
    buyerEmail,
    sku,
    requestedUnits,
    maxSpendCents,
    stepUpThresholdCents,
    minDiscountPct,
    callbackUrl
  } = body;

  if (!buyerId || !sku || !Number.isInteger(requestedUnits) || !Number.isInteger(maxSpendCents)) {
    return {
      status: 400,
      response: {
        error: "BAD_REQUEST",
        message: "Missing required mandate fields: buyerId, sku, requestedUnits, and maxSpendCents."
      }
    };
  }

  const token = createSharedPaymentToken({
    buyerId,
    sku,
    maxSpendCents,
    stepUpThresholdCents: stepUpThresholdCents || 100000
  });

  const taskId = `task_${crypto.randomBytes(8).toString("hex")}`;

  return {
    status: 202,
    response: {
      status: "ACCEPTED",
      taskId,
      buyerId,
      sku,
      requestedUnits,
      sharedPaymentToken: token.tokenId,
      expiresAt: token.expiresAt,
      callbackRegistered: Boolean(callbackUrl)
    }
  };
}

export function signEgressPayload(eventType, data, secret = null) {
  const activeSecret = resolveSecret(secret);
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadString = JSON.stringify({
    event: eventType,
    data,
    timestamp
  });

  const signature = crypto
    .createHmac("sha256", activeSecret)
    .update(`${timestamp}.${payloadString}`)
    .digest("hex");

  return {
    headers: {
      "Content-Type": "application/json",
      "X-Wholeshare-Signature": signature,
      "X-Wholeshare-Timestamp": String(timestamp)
    },
    body: payloadString
  };
}

export function formatSseEvent(eventType, payload) {
  return `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function dispatchEgressWebhook(callbackUrl, eventType, data, secret = null) {
  if (!callbackUrl) {
    return { delivered: false, reason: "No callbackUrl provided." };
  }

  const { headers, body } = signEgressPayload(eventType, data, secret);

  try {
    const res = await fetch(callbackUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(5000)
    });

    return {
      delivered: res.ok,
      status: res.status
    };
  } catch (err) {
    return {
      delivered: false,
      reason: err.message
    };
  }
}


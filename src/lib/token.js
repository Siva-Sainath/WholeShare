import crypto from "node:crypto";

const DEFAULT_SECRET = process.env.WHOSHARE_TOKEN_SECRET || "wholeshare-dev-insecure-secret-key-32b";
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24;

export function createSharedPaymentToken(mandate, secret = DEFAULT_SECRET, ttlMs = DEFAULT_TTL_MS) {
  const {
    buyerId,
    sku,
    maxSpendCents,
    stepUpThresholdCents,
    nonce = crypto.randomUUID()
  } = mandate;

  if (!buyerId || !sku || !Number.isInteger(maxSpendCents)) {
    throw new Error("Invalid mandate parameters for token creation.");
  }

  const tokenId = `spt_${crypto.randomBytes(12).toString("hex")}`;
  const expiresAt = Date.now() + ttlMs;

  const payload = [
    tokenId,
    buyerId,
    sku,
    maxSpendCents,
    stepUpThresholdCents,
    expiresAt,
    nonce
  ].join("|");

  const hmacSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return {
    tokenId,
    buyerId,
    sku,
    maxAuthorizedCents: maxSpendCents,
    stepUpThresholdCents,
    expiresAt,
    nonce,
    hmacSignature
  };
}

export function verifySharedPaymentToken(token, secret = DEFAULT_SECRET) {
  if (!token || typeof token !== "object") {
    return false;
  }

  const {
    tokenId,
    buyerId,
    sku,
    maxAuthorizedCents,
    stepUpThresholdCents,
    expiresAt,
    nonce,
    hmacSignature
  } = token;

  if (typeof expiresAt !== "number" || Date.now() > expiresAt) {
    return false;
  }

  if (typeof hmacSignature !== "string" || hmacSignature.length !== 64) {
    return false;
  }

  const payload = [
    tokenId,
    buyerId,
    sku,
    maxAuthorizedCents,
    stepUpThresholdCents,
    expiresAt,
    nonce
  ].join("|");

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmacSignature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch {
    return false;
  }
}

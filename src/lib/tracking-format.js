const CARRIER_PATTERNS = [
  /^1Z[0-9A-Z]{16}$/,
  /^(\d{12}|\d{15})$/,
  /^\d{22}$/,
  /^\d{10}$/
];

export function isCarrierFormatTracking(trackingNumber) {
  const value = String(trackingNumber || "").trim().toUpperCase();
  if (!CARRIER_PATTERNS.some((pattern) => pattern.test(value))) return false;
  const body = value.startsWith("1Z") ? value.slice(2) : value;
  return new Set(body).size > 1;
}

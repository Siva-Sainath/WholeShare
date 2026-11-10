import { randomBytes } from "node:crypto";
import { loadUserSettings, updateUserSettings } from "./user-settings.js";

// Log in with PayPal (OAuth 2 authorization code), sandbox or live by PAYPAL_MODE.
// Identity only: the access token is used once to read the user's PayPal email and is not stored.

const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map();

function isLive() {
  return String(process.env.PAYPAL_MODE || "sandbox").toLowerCase() === "live";
}

const hosts = () => (isLive()
  ? { connect: "https://www.paypal.com/connect", api: "https://api-m.paypal.com" }
  : { connect: "https://www.sandbox.paypal.com/connect", api: "https://api-m.sandbox.paypal.com" });

function credentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
  }
  return { clientId, clientSecret };
}

export function connectRedirectUri(origin) {
  return `${(process.env.APP_URL || origin).replace(/\/$/, "")}/api/v1/paypal/connect/callback`;
}

export function buildConnectUrl(origin) {
  const { clientId } = credentials();
  const now = Date.now();
  for (const [key, expires] of pendingStates) if (expires < now) pendingStates.delete(key);
  const state = randomBytes(16).toString("hex");
  pendingStates.set(state, now + STATE_TTL_MS);
  const params = new URLSearchParams({
    flowEntry: "static",
    client_id: clientId,
    scope: "openid email",
    response_type: "code",
    redirect_uri: connectRedirectUri(origin),
    state
  });
  return { url: `${hosts().connect}?${params.toString()}`, redirectUri: connectRedirectUri(origin) };
}

function consumeState(state) {
  const expires = pendingStates.get(state);
  pendingStates.delete(state);
  return Boolean(expires && expires >= Date.now());
}

async function readUserInfo(accessToken) {
  const { api } = hosts();
  const attempts = [
    `${api}/v1/identity/oauth2/userinfo?schema=openid`,
    `${api}/v1/identity/openidconnect/userinfo?schema=openid`
  ];
  let lastError = "PayPal did not return profile information.";
  for (const url of attempts) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    const text = await response.text();
    if (!response.ok) { lastError = `PayPal userinfo failed (${response.status}).`; continue; }
    try { return JSON.parse(text); } catch { lastError = "PayPal returned an unreadable profile."; }
  }
  throw new Error(lastError);
}

export async function completeConnect({ code, state, origin }) {
  if (!code || !state) throw new Error("PayPal did not return an authorization code.");
  if (!consumeState(state)) throw new Error("This PayPal sign-in link expired or was already used. Start again.");
  const { clientId, clientSecret } = credentials();
  const tokenResponse = await fetch(`${hosts().api}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code }).toString()
  });
  const tokenText = await tokenResponse.text();
  let token;
  try { token = JSON.parse(tokenText); } catch { token = {}; }
  if (!tokenResponse.ok || !token.access_token) {
    throw new Error(`PayPal rejected the sign-in (${token.error_description || token.error || tokenResponse.status}). Check that the return URL ${connectRedirectUri(origin)} is saved on the PayPal app.`);
  }
  const info = await readUserInfo(token.access_token);
  const email = info.email || (Array.isArray(info.emails) ? (info.emails.find((e) => e.primary) || info.emails[0])?.value : "") || "";
  const payerId = info.payer_id || info.user_id || info.sub || "";
  if (!email && !payerId) throw new Error("PayPal signed you in but shared no email or account id. Enable the email scope on the PayPal app.");
  const connectedAt = new Date().toISOString();
  updateUserSettings({
    profile: { paypalMerchantEmail: email, paypalPayerId: String(payerId), paypalConnectedAt: connectedAt, paypalConnectMode: isLive() ? "live" : "sandbox" }
  });
  return { email, payerId: String(payerId), connectedAt };
}

export function disconnectPayPal() {
  updateUserSettings({ profile: { paypalMerchantEmail: "", paypalPayerId: "", paypalConnectedAt: "", paypalConnectMode: "" } });
}

export function connectionStatus() {
  const profile = loadUserSettings().profile;
  const configured = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  return {
    connected: Boolean(profile.paypalPayerId || (profile.paypalConnectedAt && profile.paypalMerchantEmail)),
    email: profile.paypalMerchantEmail || "",
    payerId: profile.paypalPayerId || "",
    connectedAt: profile.paypalConnectedAt || "",
    mode: profile.paypalConnectMode || (isLive() ? "live" : "sandbox"),
    configured
  };
}

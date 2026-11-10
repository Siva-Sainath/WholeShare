import { getClanById } from "./matchmaking/clanStore.ts";
import { interceptToolExecution } from "./interceptor.js";
import { createOrderAuthorization, authorizeOrderHold, voidOrderAuthorization } from "./paypal-bridge.js";
import { joinClanWithEscrow } from "./matchmaking/clanEscrowFsm.ts";

const checkoutSessions = new Map();
const clanLocks = new Map();
const SESSION_TTL_MS = 20 * 60 * 1000;

function calculateQuote(clanId, units) {
  const clan = getClanById(clanId);
  if (!clan) throw new Error("This buying group is no longer available.");
  if (clan.status !== "FORMING") throw new Error("This buying group is no longer accepting pledges.");
  if (!Number.isInteger(units) || units < 1 || units > 10000) throw new Error("Choose a whole number of units between 1 and 10,000.");
  if (clan.currentUnits + units > clan.targetUnits) throw new Error("That quantity exceeds the group's remaining order target.");
  if (clan.settlementCurrency !== "USD") throw new Error("PayPal checkout is currently enabled for USD buying groups only.");

  const projectedUnits = clan.currentUnits + units;
  const discountPct = clan.discountTiers.reduce((best, tier) => projectedUnits >= tier.minUnits ? Math.max(best, tier.discountPct) : best, 0);
  const unitPriceCents = Math.round(clan.baseUnitPriceCents * (100 - discountPct) / 100);
  const amountCents = unitPriceCents * units;
  const interception = interceptToolExecution("create_order", { intent: "AUTHORIZE", amountCents });
  if (!interception.valid) throw new Error(interception.violations.join(" "));

  return { clan, clanId, units, discountPct, unitPriceCents, amountCents, currency: clan.settlementCurrency };
}

async function withClanLock(clanId, action) {
  const previous = clanLocks.get(clanId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  clanLocks.set(clanId, current);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (clanLocks.get(clanId) === current) clanLocks.delete(clanId);
  }
}

export function getPledgeQuote(input) {
  const quote = calculateQuote(input.clanId, input.units);
  return {
    clanId: quote.clanId,
    units: quote.units,
    unitPriceCents: quote.unitPriceCents,
    amountCents: quote.amountCents,
    currency: quote.currency,
    discountPct: quote.discountPct,
    status: "QUOTED"
  };
}

export async function createPledgeOrder(input) {
  const businessName = typeof input.businessName === "string" ? input.businessName.trim() : "";
  if (!businessName || businessName.length > 120) throw new Error("Enter a business name up to 120 characters.");
  const quote = calculateQuote(input.clanId, input.units);
  const order = await createOrderAuthorization({
    amountCents: quote.amountCents,
    currency: quote.currency,
    referenceId: `wholeshare:${quote.clanId}`
  });
  if (!order.orderId) throw new Error("PayPal did not return an order ID. No pledge was recorded.");

  checkoutSessions.set(order.orderId, {
    ...quote,
    businessName,
    status: "CREATED",
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return {
    orderId: order.orderId,
    amountCents: quote.amountCents,
    currency: quote.currency,
    intent: order.intent,
    status: order.status
  };
}

export async function authorizePledgeOrder(orderId) {
  const session = checkoutSessions.get(orderId);
  if (!session || session.expiresAt <= Date.now()) {
    checkoutSessions.delete(orderId);
    throw new Error("This PayPal checkout session expired. Start again from the buying group.");
  }
  if (session.status !== "CREATED") throw new Error("This PayPal order has already been processed.");

  return withClanLock(session.clanId, async () => {
    if (session.status !== "CREATED") throw new Error("This PayPal order has already been processed.");
    session.status = "AUTHORIZING";
    let authorization;
    try {
      authorization = await authorizeOrderHold({ orderId });
      if (authorization.status !== "AUTHORIZED") {
        throw new Error(`PayPal returned status ${authorization.status}. The buying group was not updated.`);
      }

      const currentQuote = calculateQuote(session.clanId, session.units);
      if (currentQuote.amountCents !== session.amountCents) {
        await voidOrderAuthorization({ authorizationId: authorization.authorizationId });
        session.status = "VOIDED";
        throw new Error("The group price or available quantity changed during PayPal approval. The authorization was voided. Start checkout again for the current quote.");
      }

      const clan = currentQuote.clan;
      const joined = joinClanWithEscrow(session.clanId, {
        smeName: session.businessName,
        industryVertical: clan.industryVertical,
        city: clan.city,
        countryCode: clan.countryCode,
        settlementCurrency: clan.settlementCurrency,
        canonicalSku: clan.canonicalSku,
        hsCodePrefix: clan.hsCodePrefix,
        quantityRequested: session.units,
        maxDeliveryDays: clan.estimatedDeliveryDays
      }, orderId);

      session.status = "AUTHORIZED";
      return {
        orderId,
        authorizationId: authorization.authorizationId,
        status: authorization.status,
        amountCents: session.amountCents,
        currency: session.currency,
        clanId: session.clanId,
        units: session.units,
        clanStatus: joined.clan.status
      };
    } catch (error) {
      if (authorization?.authorizationId && session.status !== "VOIDED") {
        try {
          await voidOrderAuthorization({ authorizationId: authorization.authorizationId });
          session.status = "VOIDED";
        } catch {
          session.status = "AUTHORIZATION_REQUIRES_SUPPORT";
          throw new Error(`PayPal authorized order ${orderId}, but WholeShare could not record or void the pledge. Contact support with authorization ${authorization.authorizationId}.`);
        }
      } else if (session.status === "AUTHORIZING") {
        session.status = "CREATED";
      }
      throw error;
    }
  });
}

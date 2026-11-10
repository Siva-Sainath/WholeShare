import test from "node:test";
import assert from "node:assert/strict";
import { getPledgeQuote } from "../src/lib/paypal-checkout.js";
import { getAllClans, getClanById } from "../src/lib/matchmaking/clanStore.ts";

const OPEN_USD_CLAN_ID = "clan-austin-artisan-sicilian-001";

test("PayPal pledge quote calculates the current server-side tier in integer cents", () => {
  const clan = getClanById(OPEN_USD_CLAN_ID);
  assert.ok(clan);
  const quote = getPledgeQuote({ clanId: clan.id, units: 1 });
  const discount = clan.discountTiers.reduce((best, tier) => clan.currentUnits + 1 >= tier.minUnits ? Math.max(best, tier.discountPct) : best, 0);

  assert.equal(quote.amountCents, Math.round(clan.baseUnitPriceCents * (100 - discount) / 100));
  assert.equal(quote.unitPriceCents, quote.amountCents);
  assert.equal(quote.status, "QUOTED");
});

test("PayPal pledge quote rejects quantities beyond the remaining order target", () => {
  const clan = getClanById(OPEN_USD_CLAN_ID);
  assert.ok(clan);

  assert.throws(
    () => getPledgeQuote({ clanId: clan.id, units: clan.targetUnits - clan.currentUnits + 1 }),
    /exceeds the group's remaining order target/
  );
});

test("PayPal pledge quote rejects authorization amounts above the platform ceiling", () => {
  assert.throws(
    () => getPledgeQuote({ clanId: OPEN_USD_CLAN_ID, units: 149 }),
    /authorization ceiling/
  );
});

test("PayPal pledge quote rejects unknown and non-USD groups", () => {
  assert.throws(() => getPledgeQuote({ clanId: "missing-clan", units: 1 }), /no longer available/);

  const nonUsdClan = getAllClans().find((clan) => clan.status === "FORMING" && clan.currentUnits < clan.targetUnits && clan.settlementCurrency !== "USD" && !clan.id.startsWith("clan-test-"));
  assert.ok(nonUsdClan);
  assert.throws(() => getPledgeQuote({ clanId: nonUsdClan.id, units: 1 }), /USD buying groups only/);
});

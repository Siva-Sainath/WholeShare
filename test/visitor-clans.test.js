import test from "node:test";
import assert from "node:assert/strict";
import { saveClan, getClanById, purgeVisitorClans } from "../src/lib/matchmaking/clanStore.ts";

test("old visitor groups are cleared and the shipped catalog is kept", () => {
  const now = Date.now();
  saveClan({ id: "clan_old_test_1", name: "Old visitor group", createdAt: new Date(now - 20 * 3600 * 1000).toISOString() });
  saveClan({ id: "clan_new_test_2", name: "New visitor group", createdAt: new Date(now - 1 * 3600 * 1000).toISOString() });
  const gone = purgeVisitorClans(12 * 3600 * 1000, now);
  assert.ok(gone.includes("clan_old_test_1"));
  assert.ok(!gone.includes("clan_new_test_2"));
  assert.equal(getClanById("clan_old_test_1"), null);
  assert.ok(getClanById("clan_new_test_2"));
  assert.ok(getClanById("clan-nyc-containers-garden-state"));
  purgeVisitorClans(0, now + 1000);
});

import test from "node:test";
import assert from "node:assert/strict";
import { instinctFs } from "../src/lib/instinct-fs.js";
import { generateInstinctProfileHeader } from "../src/lib/instinct-profile.js";
import { dreamingEngine } from "../src/lib/dreaming-engine.js";

test("Instinct file system initializes and parses frontmatter with aliases", () => {
  const entity = instinctFs.readEntity("sme_austin_01");
  assert.ok(entity);
  assert.equal(entity.id, "sme_austin_01");
  assert.equal(entity.frontmatter.type, "organization");
  assert.ok(Array.isArray(entity.frontmatter.aliases));
  assert.ok(entity.frontmatter.aliases.includes("bakery"));
  assert.ok(entity.body.includes("Austin Artisan Bakery"));
  assert.ok(entity.links.includes("coalition_flour_01"));
});

test("Instinct grepMemory matches keywords across aliases and content", () => {
  const results = instinctFs.grepMemory("flour");
  assert.ok(results.length >= 2);
  const ids = results.map(r => r.id);
  assert.ok(ids.includes("sme_austin_01") || ids.includes("catalog_flour_50lb"));

  const aliasResults = instinctFs.grepMemory("sourdough");
  assert.ok(aliasResults.length >= 1);
  assert.equal(aliasResults[0].id, "sme_austin_01");
});

test("Instinct Profile generator produces 4-part profile with tasks board", () => {
  const profile = generateInstinctProfileHeader("sme_austin_01");
  assert.ok(profile.includes("=== INSTINCT IDENTITY PROFILE ==="));
  assert.ok(profile.includes("## Life Context"));
  assert.ok(profile.includes("## Autonomy Calibration"));
  assert.ok(profile.includes("## Channel Communication Style"));
  assert.ok(profile.includes("## Memory One-Pager"));
  assert.ok(profile.includes("## Tasks & Todo Board"));
  assert.ok(profile.includes("sme_austin_01"));
});

test("Instinct Dreaming Engine reconciles completed session into markdown memory", async () => {
  const mockTrajectory = {
    id: `sess_dream_${Date.now()}`,
    steps: [
      {
        toolName: "spawn_sme_mandate",
        toolArgs: { name: "Dream Bakery Co", pledgedUnits: 100 },
        toolResult: { smeId: "sme_dream_01", tokenId: "spt_dream_1234", maxAuthorizedCents: 100000 }
      },
      {
        toolName: "authorize_paypal_escrow",
        toolArgs: { coalitionId: "coalition_dream_01" },
        toolResult: { coalitionId: "coalition_dream_01", totalEscrowCents: 100000, membersCount: 1 }
      }
    ]
  };

  const dreamResult = await dreamingEngine.reconcileSession(mockTrajectory);
  assert.equal(dreamResult.reconciled, true);
  assert.equal(dreamResult.updatesCount, 2);

  const updatedEntity = instinctFs.readEntity("sme_dream_01");
  assert.ok(updatedEntity);
  assert.ok(updatedEntity.body.includes("spt_dream_1234"));

  const updatedCoalition = instinctFs.readEntity("coalition_dream_01");
  assert.ok(updatedCoalition);
  assert.ok(updatedCoalition.body.includes("100000"));
});

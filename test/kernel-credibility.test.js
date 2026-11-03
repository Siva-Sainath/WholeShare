import test from "node:test";
import assert from "node:assert/strict";
import { executeTool } from "../src/lib/tool-registry.js";
import { interceptToolExecution } from "../src/lib/interceptor.js";

test("interceptor validates verify_supplier_credibility parameters", () => {
  const invalid = interceptToolExecution("verify_supplier_credibility", {});
  assert.equal(invalid.valid, false);
  assert.ok(invalid.violations.some(v => v.includes("Target URL")));

  const valid = interceptToolExecution("verify_supplier_credibility", {
    targetUrl: "https://www.roastmasters.com/green_coffee.html"
  });
  assert.equal(valid.valid, true);
});

test("interceptor validates verify_external_agent_proposal parameters", () => {
  const missingPrice = interceptToolExecution("verify_external_agent_proposal", {
    targetUrl: "https://www.roastmasters.com/green_coffee.html"
  });
  assert.equal(missingPrice.valid, false);
  assert.ok(missingPrice.violations.some(v => v.includes("Claimed unit price")));

  const valid = interceptToolExecution("verify_external_agent_proposal", {
    agentId: "agent_coffee_buyer",
    targetUrl: "https://www.roastmasters.com/green_coffee.html",
    claimedProduct: "Ethiopia Yirgacheffe",
    claimedUnitPriceCents: 1090
  });
  assert.equal(valid.valid, true);
});

test("executeTool routes verify_supplier_credibility and executes or handles unconfigured gracefully", async () => {
  const result = await executeTool("verify_supplier_credibility", {
    targetUrl: "https://www.roastmasters.com/green_coffee.html"
  });

  if (result.status === "ERROR") {
    assert.match(result.error, /Kernel API key|Playwright|network|Connection error|Failed to create/i);
  } else {
    assert.equal(result.status, "SUCCESS");
    assert.equal(typeof result.riskScore, "number");
    assert.ok(result.credibilityTier);
    assert.ok(Array.isArray(result.auditChecks));
  }
});


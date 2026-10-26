#!/usr/bin/env node

import { durableHarness } from "../src/lib/durable-harness.js";
import { actionDispatcher } from "../src/lib/web-actions.js";
import { getPayPalToolkitToolNames } from "../src/lib/paypal-toolkit-bridge.js";

async function runOneShotTest() {
  console.log("=== Wholeshare One-Shot Harness Verification ===");

  actionDispatcher.resetState();

  const toolkitTools = getPayPalToolkitToolNames();
  console.log(`Registered PayPal Agent Toolkit tools: ${toolkitTools.length}`);

  const sessionId = `one_shot_${Date.now()}`;
  const prompt = "Onboard new buyer Artisan Flour House (id: sme_artisan_01) with 200 units and $2,500 spend cap, join coalition_flour_01 to hit 500 unit MOQ, negotiate volume discount, and lock escrow in PayPal Orders v2 soft authorization holds.";

  console.log(`Model: qwen3.5:9b`);
  console.log(`Prompt: ${prompt}`);
  console.log("Running durable harness session...");

  const startTime = Date.now();
  const result = await durableHarness.startSession({
    prompt,
    sessionId,
    metadata: { testCase: "one_shot_verification" }
  });
  const elapsedMs = Date.now() - startTime;

  console.log("\n=== Execution Summary ===");
  console.log(`Session ID: ${result.sessionId}`);
  console.log(`Status: ${result.status}`);
  console.log(`Elapsed Time: ${elapsedMs}ms`);
  console.log(`Total Steps: ${result.steps?.length || 0}`);
  console.log(`Final Message: ${result.finalMessage}`);

  console.log("\n=== Tool Trajectory ===");
  for (const step of result.steps || []) {
    const name = step.toolName || step.toolCall?.name || "unknown";
    const args = JSON.stringify(step.toolArgs || step.toolCall?.arguments || {});
    console.log(`Step ${step.stepIndex}: ${name} -> args: ${args}`);
  }

  const ledger = actionDispatcher.getLedgerState();
  console.log(`\nActive Coalitions in Ledger: ${ledger.length}`);
  for (const c of ledger) {
    console.log(`Coalition ${c.coalitionId}: status=${c.status}, units=${c.currentUnits}/${c.targetUnits}, escrow=$${c.totalEscrowUsd}`);
  }

  if (result.status === "COMPLETED") {
    console.log("\n[PASS] One-shot harness verification succeeded.");
    process.exit(0);
  } else {
    console.error("\n[FAIL] One-shot harness session ended with unexpected status.");
    process.exit(1);
  }
}

runOneShotTest().catch(err => {
  console.error("Fatal error during one-shot harness verification:", err);
  process.exit(1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { WholeshareDurableHarness } from "../src/lib/durable-harness.js";
import { loadSessionTrajectory, createAgentSession } from "../src/lib/db.js";
import { actionDispatcher } from "../src/lib/web-actions.js";

test("WholeshareDurableHarness initializes and starts a durable session", { timeout: 300000 }, async () => {
  actionDispatcher.resetState();
  const harness = new WholeshareDurableHarness();

  const sessionId = `test_sess_${Date.now()}`;

  const result = await harness.startSession({
    prompt: "Discover wholesale flour catalog for SKU flour-organic-white",
    sessionId
  });

  assert.equal(result.sessionId, sessionId);
  assert.equal(result.success, true);
  assert.equal(result.status, "COMPLETED");
  assert.ok(result.totalDurationMs >= 0);

  const trajectory = await loadSessionTrajectory(sessionId);
  assert.ok(trajectory);
  assert.equal(trajectory.id, sessionId);
  assert.equal(trajectory.status, "COMPLETED");
  assert.ok(Array.isArray(trajectory.steps));
  assert.ok(trajectory.steps.length > 0);
});

test("WholeshareDurableHarness rehydrates and resumes an interrupted session", { timeout: 300000 }, async () => {
  actionDispatcher.resetState();
  const harness = new WholeshareDurableHarness();
  const sessionId = `test_resume_${Date.now()}`;

  await createAgentSession({
    id: sessionId,
    model: "qwen3.5:9b",
    prompt: "Query escrow ledger state",
    status: "SUSPENDED"
  });

  const result = await harness.resumeSession(sessionId);
  assert.equal(result.sessionId, sessionId);
  assert.equal(result.success, true);
  assert.equal(result.status, "COMPLETED");

  const trajectory = await loadSessionTrajectory(sessionId);
  assert.equal(trajectory.status, "COMPLETED");
});

test("WholeshareDurableHarness resumes session when human step-up is approved", { timeout: 300000 }, async () => {
  actionDispatcher.resetState();
  const harness = new WholeshareDurableHarness();
  const sessionId = `test_step_up_${Date.now()}`;


  await createAgentSession({
    id: sessionId,
    model: "qwen3.5:9b",
    prompt: "Authorize large volume escrow for flour coalition",
    status: "AWAITING_STEP_UP",
    metadata: {
      stepUpToken: "INV2-ABC1234"
    }
  });

  const result = await harness.resumeWithStepUpApproval(sessionId, "APPROVAL_TOKEN_9988");
  assert.equal(result.sessionId, sessionId);
  assert.equal(result.success, true);
  assert.equal(result.status, "COMPLETED");
});

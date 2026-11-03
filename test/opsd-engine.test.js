import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { opsdEngine } from "../src/lib/opsd-engine.js";
import { verifyFinancialPolicy, verifyToolBoundary } from "../src/lib/policy.js";

test("OPSD Engine builds teacher prompt with strict leakage mitigation rules", () => {
  const prompt = "Onboard craft brewery with 120 sacks of malt and lock escrow.";
  const studentThought = "I will directly lock escrow for $2,400.";
  const studentToolCall = {
    name: "authorize_paypal_escrow",
    arguments: { coalitionId: "coalition_malt_01" }
  };
  const verifierError = "Buyer sme_brewery_01 amount of 240000 cents exceeds threshold without step-up flag.";

  const messages = opsdEngine.buildTeacherHindsightPrompt({
    prompt,
    studentThought,
    studentToolCall,
    verifierError
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.ok(messages[0].content.includes("Hindsight Teacher"));
  assert.ok(messages[0].content.includes("CRITICAL PRIVILEGED INFORMATION LEAKAGE INVARIANTS"));
  assert.ok(messages[1].content.includes(verifierError));
});

test("OPSD Engine rationalizes spend threshold violation and generates step-up invoice correction", { timeout: 360000 }, async () => {
  const prompt = "Onboard craft brewery with 120 sacks of malt and lock escrow.";
  const studentThought = "I will directly lock escrow for $2,400.";
  const studentToolCall = {
    name: "authorize_paypal_escrow",
    arguments: { coalitionId: "coalition_malt_01", amountCents: 240000, buyerId: "sme_brewery_01" }
  };
  const verifierError = "Buyer sme_brewery_01 amount of 240000 cents exceeds threshold without step-up flag.";

  const correction = await opsdEngine.rationalizeCorrection({
    prompt,
    studentThought,
    studentToolCall,
    verifierError
  });

  assert.ok(correction.teacherThought.length > 20);
  assert.ok(correction.teacherThought.includes("step-up"));
  assert.equal(correction.correctedToolCall.name, "generate_step_up_invoice");
  assert.equal(correction.correctedToolCall.arguments.amountCents, 240000);
  assert.equal(correction.correctedToolCall.arguments.buyerId, "sme_brewery_01");

  // Verify that the corrected tool call satisfies the boundary
  const boundary = verifyToolBoundary(correction.correctedToolCall.name, correction.correctedToolCall.arguments);
  assert.equal(boundary.valid, true);
  assert.equal(boundary.violations.length, 0);
});

test("OPSD Engine rationalizes illegal state transitions into valid intermediate step", { timeout: 360000 }, async () => {
  const studentToolCall = {
    name: "run_coalition_negotiation",
    arguments: { coalitionId: "coalition_aero_01" }
  };
  const verifierError = "Illegal state transition from FORMING to AWAITING_STEP_UP.";

  const correction = await opsdEngine.rationalizeCorrection({
    prompt: "Finalize coalition and lock escrow",
    studentThought: "Let's negotiate first",
    studentToolCall,
    verifierError
  });

  assert.ok(correction.teacherThought.length > 20);
  assert.ok(
    ["authorize_paypal_escrow", "generate_step_up_invoice", "spawn_sme_mandate", "run_coalition_negotiation", "join_syndicate"].includes(correction.correctedToolCall.name)
  );
  assert.ok(correction.isValid);
});

test("OPSD Engine commits distillation trace and appends ChatML sample to data lake", () => {
  const sessionId = `test_opsd_${Date.now()}`;
  const prompt = "Pledge 80 units of aluminum billet and lock escrow";
  const studentThought = "Calling direct lock without invoice";
  const studentToolCall = { name: "authorize_paypal_escrow", arguments: { coalitionId: "coalition_cnc_01" } };
  const verifierError = "Buyer amount exceeds 100000 cents ceiling.";
  const teacherThought = "Because the transaction exceeds $1,000, we must issue a step-up invoice with a PayPal QR code before locking escrow.";
  const correctedToolCall = {
    name: "generate_step_up_invoice",
    arguments: { buyerId: "sme_cnc_01", amountCents: 160000, memo: "Step-up KYC" }
  };

  const trace = opsdEngine.commitDistillationTrace({
    sessionId,
    prompt,
    studentThought,
    studentToolCall,
    verifierError,
    teacherThought,
    correctedToolCall,
    industryVertical: "precision_machining"
  });

  assert.ok(trace.traceId);
  assert.equal(trace.opsdObjective, "KL_DIVERGENCE_ON_POLICY_DISTILLATION");

  // Verify trace was appended to OPSD trace log
  const tracesPath = join(process.cwd(), "data", "lake", "opsd_traces", "opsd_teacher_distillation_traces.jsonl");
  assert.ok(existsSync(tracesPath));
  const tracesContent = readFileSync(tracesPath, "utf-8");
  assert.ok(tracesContent.includes(trace.traceId));

  // Verify ChatML sample was appended to System 2 Gold partition
  const goldPath = join(process.cwd(), "data", "lake", "system2_qwen", "system2_reasoning_rollouts.jsonl");
  const goldContent = readFileSync(goldPath, "utf-8");
  assert.ok(goldContent.includes(trace.traceId));
  assert.ok(goldContent.includes("OPSD_ON_POLICY_DISTILLATION"));
});

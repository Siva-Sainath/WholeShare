import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { businessInduction } from "../src/lib/business-induction.js";

const DATA_LAKE_DIR = resolve(process.cwd(), "data/lake");

test("Data Lake Manifest exists and contains required partition counts", () => {
  const manifestPath = resolve(DATA_LAKE_DIR, "manifest.json");
  assert.ok(existsSync(manifestPath), "Manifest must exist");

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  assert.ok(manifest.dataLakeVersion.startsWith("1.") || manifest.dataLakeVersion.startsWith("2."));
  assert.ok(manifest.partitions.system1_laya_records > 0);
  assert.ok(manifest.partitions.system2_qwen_records > 0);
  assert.ok(manifest.partitions.rl_verifiable_prompts > 0);
  assert.ok(manifest.partitions.ood_holdout_records > 0);
  assert.equal(manifest.qualityGuarantees.exactIntegerCentsEnforced, true);
});

test("System 1 partition conforms to Laya ModernBERT typed questions schema", () => {
  const s1Path = resolve(DATA_LAKE_DIR, "system1_laya/system1_decision_records.jsonl");
  assert.ok(existsSync(s1Path), "System 1 partition must exist");

  const lines = readFileSync(s1Path, "utf-8").trim().split("\n");
  assert.ok(lines.length >= 10);

  for (const line of lines) {
    const record = JSON.parse(line);
    assert.ok(record.id.startsWith("s1_"));
    assert.ok(typeof record.state === "string");
    assert.ok(record.questions.archetype.type === "choice");
    assert.ok(record.questions.risk_tier.type === "choice");
    assert.ok(record.questions.confidence_score.type === "score");
    assert.ok(record.questions.requires_step_up.type === "noul");
    assert.ok(record.questions.arithmetic_valid.type === "noul");

    assert.ok(typeof record.answers.archetype === "string");
    assert.ok(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(record.answers.risk_tier));
    assert.ok(typeof record.answers.confidence_score === "number");
    assert.ok(typeof record.answers.requires_step_up === "boolean");
    assert.ok(typeof record.answers.arithmetic_valid === "boolean");
  }
});

test("System 2 partition conforms to Qwen chat template and integer cents", () => {
  const s2Path = resolve(DATA_LAKE_DIR, "system2_qwen/system2_reasoning_rollouts.jsonl");
  assert.ok(existsSync(s2Path), "System 2 partition must exist");

  const lines = readFileSync(s2Path, "utf-8").trim().split("\n");
  assert.ok(lines.length >= 10);

  for (const line of lines) {
    const record = JSON.parse(line);
    assert.ok(record.id.startsWith("s2_"));
    assert.equal(record.messages.length, 3);
    assert.equal(record.messages[0].role, "system");
    assert.equal(record.messages[1].role, "user");
    assert.equal(record.messages[2].role, "assistant");

    const assistantText = record.messages[2].content;
    assert.ok(assistantText.includes("<think>"), "Must include chain of thought");
    assert.ok(assistantText.includes("</think>"), "Must close chain of thought");

    if (record.metadata?.source === "OPSD_ON_POLICY_DISTILLATION" || record.id.includes("stage")) {
      assert.ok(assistantText.includes("<tool_call>") || assistantText.includes("{"), "Must output tool call");
      const jsonContent = assistantText.match(/```json\s*(\{[\s\S]*?\})\s*```/) || assistantText.match(/(\{[\s\S]*\})/);
      if (jsonContent) {
        const parsed = JSON.parse(jsonContent[1]);
        assert.ok(parsed.tool || parsed.subsector || parsed.arguments);
      }
      continue;
    }

    const jsonMatch = assistantText.match(/<\/think>\s*(\{[\s\S]*\})/);
    assert.ok(jsonMatch, "Must output structured JSON after think block");

    const structured = JSON.parse(jsonMatch[1]);
    assert.ok(structured.archetypeId);
    assert.ok(structured.billOfMaterials.length > 0);

    for (const item of structured.billOfMaterials) {
      assert.ok(Number.isInteger(item.quantity));
      assert.ok(Number.isInteger(item.unitPriceCents));
      assert.ok(Number.isInteger(item.totalCents));
      assert.equal(item.quantity * item.unitPriceCents, item.totalCents, "P * Q must equal total cents");
    }
  }
});

test("RL Verifiable Environment partition enables deterministic ground-truth verification", () => {
  const rlPath = resolve(DATA_LAKE_DIR, "rl_verifiable_env/verifiable_reward_ground_truth.jsonl");
  assert.ok(existsSync(rlPath), "RL verifiable partition must exist");

  const lines = readFileSync(rlPath, "utf-8").trim().split("\n");
  assert.ok(lines.length >= 10);

  for (const line of lines) {
    const record = JSON.parse(line);
    assert.ok(record.prompt_id.startsWith("rl_"));
    assert.ok(record.prompt.length > 0);
    if (record.ground_truth.doc_total_cents !== undefined) {
      assert.ok(Number.isInteger(record.ground_truth.doc_total_cents));
      assert.ok(record.ground_truth.line_item_count > 0);
      assert.ok(record.ground_truth.required_categories.length > 0);
      assert.ok(record.ground_truth.valid_outputs.length > 0);
    } else {
      const centVal = record.ground_truth.total_authorized_cents ?? record.ground_truth.amount_cents ?? record.ground_truth.refund_cents;
      assert.ok(Number.isInteger(centVal), "Commerce ground truth must enforce integer cents");
    }
  }
});

test("OOD Generalization Suite tests induction on completely novel commercial sectors", () => {
  const oodPath = resolve(DATA_LAKE_DIR, "ood_generalization/generalization_ood_holdout.jsonl");
  assert.ok(existsSync(oodPath), "OOD partition must exist");

  const lines = readFileSync(oodPath, "utf-8").trim().split("\n");
  assert.equal(lines.length, 3);

  for (const line of lines) {
    const record = JSON.parse(line);
    const profile = businessInduction.induceProfile(`buyer_${record.test_id}`, record.items, {
      legalName: record.subsector
    });

    assert.ok(profile.billOfMaterials.length > 0);
    assert.ok(profile.boundaries.monthlySpendCents > 0);
    assert.ok(profile.boundaries.maxAutoAuthorizeCents <= 500000);
    assert.ok(profile.boundaries.stepUpThresholdCents >= profile.boundaries.maxAutoAuthorizeCents);
  }
});


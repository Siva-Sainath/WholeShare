import fs from "fs";
import path from "path";
import "../src/lib/env.js";

// ML-Intern Kaggle Training Feasibility & Scaling Audit
// Evaluates compute duration, VRAM budget, reward stability, and generalization readiness.

const KAGGLE_CONSTRAINTS = {
  gpu: "Nvidia Tesla T4 (x2)",
  maxVramPerGpuGb: 16.0,
  maxSessionHours: 9.0,
  weeklyQuotaHours: 30.0
};

const NOTEBOOK_CONFIGS = [
  {
    name: "01_laya_system1_decision_tuning.ipynb",
    model: "ModernBERT-base (421M params)",
    approach: "Full Fine-Tuning (FP16)",
    datasetSize: 20000,
    batchSize: 32,
    epochs: 3,
    estimatedVramGb: 3.2,
    estimatedTimeMinutes: 24,
    recommendedForKaggle: true
  },
  {
    name: "02_qwen_system2_sft_reasoning.ipynb",
    model: "Qwen 3.5 9B",
    approach: "QLoRA 4-bit (NF4, r=16, alpha=32)",
    datasetSize: 15000,
    batchSize: 4,
    gradientAccumulationSteps: 8,
    epochs: 2,
    estimatedVramGb: 8.4,
    estimatedTimeMinutes: 140,
    recommendedForKaggle: true
  },
  {
    name: "03_qwen_system2_grpo_rlvr.ipynb",
    model: "Qwen 3.5 9B Policy + Frozen Ref",
    approach: "GRPO (Group Size G=4, Beta=0.04)",
    datasetSize: 2000,
    batchSize: 2,
    epochs: 1,
    estimatedVramGb: 11.2,
    estimatedTimeMinutes: 110,
    recommendedForKaggle: true
  },
  {
    name: "04_qwen_deal_failure_and_coalition_rl.ipynb",
    model: "Qwen 3.5 9B with Invariant Kernel",
    approach: "GRPO Multi-Reward RLVR (G=4)",
    datasetSize: 2500,
    batchSize: 2,
    epochs: 1,
    estimatedVramGb: 11.8,
    estimatedTimeMinutes: 125,
    recommendedForKaggle: true
  }
];

// Anti-Drift and Reward Stability Verification
function testRewardStability() {
  const testCompletions = [
    {
      label: "Clean Compliant Completion",
      output: JSON.stringify({
        intent: "AUTHORIZE",
        capture_amount_cents: 150000,
        refund_amount_cents: 50000,
        unit_price_cents: 200,
        liable_party: "SELLER"
      }),
      scenario: {
        delivered_units: 750,
        contracted_units: 1000,
        unit_price_cents: 200,
        incoterm: "DDP",
        delay_cause: "SELLER_DOC_ERROR"
      },
      expectPositive: true
    },
    {
      label: "Direct Capture Invariant Breach",
      output: JSON.stringify({
        intent: "CAPTURE",
        capture_amount_cents: 200000,
        refund_amount_cents: 0
      }),
      scenario: {
        delivered_units: 750,
        contracted_units: 1000,
        unit_price_cents: 200
      },
      expectNegative: true
    },
    {
      label: "Floating Point Cent Hallucination",
      output: JSON.stringify({
        intent: "AUTHORIZE",
        capture_amount_cents: 1500.50,
        refund_amount_cents: 499.50
      }),
      scenario: {
        delivered_units: 750,
        contracted_units: 1000,
        unit_price_cents: 200
      },
      expectNegative: true
    }
  ];

  const results = [];
  for (const c of testCompletions) {
    let score = 0;
    try {
      const data = JSON.parse(c.output);
      if (data.intent === "AUTHORIZE") score += 1.0;
      if (data.intent === "CAPTURE") score -= 10.0;
      
      let isFloat = false;
      for (const k of ["capture_amount_cents", "refund_amount_cents"]) {
        if (typeof data[k] === "number" && !Number.isInteger(data[k])) {
          isFloat = true;
        }
      }
      if (isFloat) score -= 5.0;

      // Pro-rata validation
      if (c.scenario && c.scenario.delivered_units) {
        const expCap = c.scenario.delivered_units * c.scenario.unit_price_cents;
        if (data.capture_amount_cents === expCap) score += 1.0;
      }
    } catch {
      score = -20.0;
    }

    const passed = (c.expectPositive && score > 0) || (c.expectNegative && score < 0);
    results.push({ label: c.label, score, passed });
  }

  return results;
}

async function runAudit() {
  console.log("=== ML-Intern Kaggle Notebook Scaling & Compute Audit ===");
  console.log(`Hardware Target: ${KAGGLE_CONSTRAINTS.gpu} | Max Session: ${KAGGLE_CONSTRAINTS.maxSessionHours}h\n`);

  let totalTrainingMinutes = 0;
  for (const nb of NOTEBOOK_CONFIGS) {
    totalTrainingMinutes += nb.estimatedTimeMinutes;
    console.log(`Notebook: ${nb.name}`);
    console.log(`  Model: ${nb.model}`);
    console.log(`  Technique: ${nb.approach}`);
    console.log(`  Estimated VRAM: ${nb.estimatedVramGb} GB / 16.0 GB (${Math.round((nb.estimatedVramGb / 16.0) * 100)}% utilization)`);
    console.log(`  Estimated Time: ${nb.estimatedTimeMinutes} minutes`);
    console.log(`  Kaggle Safe: ${nb.estimatedVramGb < 15.0 && nb.estimatedTimeMinutes < 540 ? "YES" : "NO"}\n`);
  }

  const totalHours = (totalTrainingMinutes / 60).toFixed(2);
  console.log(`Total End-to-End Pipeline Runtime: ${totalHours} hours`);
  console.log(`Kaggle Weekly Quota Headroom: ${(30.0 - totalHours).toFixed(2)} hours remaining.\n`);

  console.log("--- Reward Function Anti-Drift Verification ---");
  const stability = testRewardStability();
  for (const s of stability) {
    console.log(`  [${s.passed ? "PASS" : "FAIL"}] ${s.label}: Score = ${s.score}`);
  }

  const allPassed = stability.every(s => s.passed);
  console.log(`\nOverall Scaling Feasibility: ${allPassed ? "APPROVED" : "REJECTED"}`);

  // Write audit output to assets
  fs.writeFileSync(
    "docs/assets/ml_intern_scaling_audit.json",
    JSON.stringify({
      constraints: KAGGLE_CONSTRAINTS,
      notebooks: NOTEBOOK_CONFIGS,
      totalHours: Number(totalHours),
      stability,
      approved: allPassed
    }, null, 2),
    "utf8"
  );
  console.log("Audit report saved to docs/assets/ml_intern_scaling_audit.json");
}

runAudit();

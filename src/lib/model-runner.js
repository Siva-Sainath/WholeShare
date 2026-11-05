import crypto from "node:crypto";
import { interceptNegotiationProposal } from "./interceptor.js";
import { modelClient } from "./model-client.js";
import { SERVING_TARGET } from "./serving-target.js";

const PRIMARY_MODEL = process.env.PRIMARY_MODEL || SERVING_TARGET.hfId;
const MODEL_TIMEOUT_MS = 6000;

export function computeDeterministicAllocation(coalitionId, sku, buyers, discountTiers, catalogPriceCents) {
  const totalUnits = buyers.reduce((sum, b) => sum + b.requestedUnits, 0);

  let discountPct = 0;
  for (const tier of discountTiers) {
    if (totalUnits >= tier.minUnits) {
      discountPct = Math.max(discountPct, tier.discountPct);
    }
  }

  const discountMultiplier = (100 - discountPct) / 100;
  const unitPriceCents = Math.round(catalogPriceCents * discountMultiplier);

  const allocations = buyers.map(b => {
    const amountCents = b.requestedUnits * unitPriceCents;
    const stepUpRequired = amountCents > b.stepUpThresholdCents || amountCents > 500000;
    return {
      buyerId: b.buyerId,
      units: b.requestedUnits,
      amountCents,
      stepUpRequired
    };
  });

  return {
    coalitionId,
    sku,
    totalUnits,
    unitPriceCents,
    discountPct,
    allocations,
    intent: "AUTHORIZE",
    idempotencyKey: `det_${crypto.randomUUID()}`,
    reasoning: "Deterministic rule calculation based on verified volume discount tiers."
  };
}

export async function proposeCoalitionAllocation(coalitionId, sku, buyers, discountTiers, catalogPriceCents) {
  const mandatesMap = new Map();
  for (const b of buyers) {
    mandatesMap.set(b.buyerId, b);
  }

  const prompt = `Calculate briefly in your scratchpad, then output the final JSON object.
Calculate exact integer cents for all prices and allocations.

Context:
- Coalition ID: "${coalitionId}"
- SKU: "${sku}"
- Base Catalog Unit Price: ${catalogPriceCents} cents
- Volume Discount Tiers: ${JSON.stringify(discountTiers)}
- Member Demands: ${JSON.stringify(buyers.map(b => ({
    buyerId: b.buyerId,
    requestedUnits: b.requestedUnits,
    maxSpendCents: b.maxSpendCents,
    stepUpThresholdCents: b.stepUpThresholdCents
  })))}

Rules:
1. totalUnits must be exact sum of requestedUnits.
2. Find highest matching discount tier where totalUnits >= minUnits (do NOT select a tier if totalUnits < minUnits. For example, if totalUnits is 1300, 1300 is less than 1500 so minUnits 1500 does NOT apply; the matching tier is minUnits 1000 with discountPct 15).
3. Calculate unitPriceCents = Math.round(catalogPriceCents * (100 - discountPct) / 100). For example, if catalogPriceCents is 1200 and discountPct is 15, unitPriceCents is Math.round(1200 * 85 / 100) = 1020 cents (NOT 900). If catalogPriceCents is 1000 and discountPct is 28, unitPriceCents is Math.round(1000 * 72 / 100) = 720 cents. Be careful to calculate exact integer cents.
4. Each buyer amountCents = buyer.requestedUnits * unitPriceCents.
5. MANDATORY STEP-UP RULE: For each buyer, if amountCents > buyer.stepUpThresholdCents, stepUpRequired MUST strictly be true.
Check all buyers carefully:
If buyer amountCents is greater than stepUpThresholdCents, stepUpRequired is true.
For example, if amountCents is 459000 or 432000 and stepUpThresholdCents is 100000, because 432000 > 100000, stepUpRequired is true.
6. intent must strictly be "AUTHORIZE".
7. Include an idempotencyKey string.

Output JSON Format:
{
  "coalitionId": "${coalitionId}",
  "sku": "${sku}",
  "totalUnits": number,
  "unitPriceCents": number,
  "discountPct": number,
  "intent": "AUTHORIZE",
  "idempotencyKey": "nonce-string",
  "allocations": [
    {
      "buyerId": "string",
      "units": number,
      "amountCents": number,
      "stepUpRequired": boolean
    }
  ]
}`;

  let proposal = null;
  let executionSource = "model-client";

  try {
    const res = await modelClient.callJsonPrompt({
      systemPrompt: "You are the Wholeshare B2B Coalition Negotiator. Return ONLY a valid JSON object matching the requested schema. Calculate exact integer cents for all prices and allocations.",
      userPrompt: prompt,
      maxTokens: 2500
    });
    proposal = res.data;
    executionSource = `${res.provider}:${res.model}`;
  } catch (err) {
    throw new Error(`Real model allocation failed: ${err.message}`);
  }

  const evaluation = interceptNegotiationProposal(proposal, {
    catalogPriceCents,
    mandates: mandatesMap
  });

  let currentProposal = proposal;
  let currentEvaluation = evaluation;
  let attempts = 0;
  const MAX_REFLEXIVE_ATTEMPTS = 3;

  while (!currentEvaluation.valid && attempts < MAX_REFLEXIVE_ATTEMPTS) {
    attempts++;
    const correctionPrompt = `The previous proposal violated policy with the following issues:
${JSON.stringify(currentEvaluation.violations, null, 2)}

Please revise the proposal to strictly resolve every violation.
Rules:
1. totalUnits must be exact sum of requestedUnits (${buyers.reduce((sum, b) => sum + b.requestedUnits, 0)}).
2. Find highest matching discount tier where totalUnits >= minUnits.
3. Calculate unitPriceCents = Math.round(catalogPriceCents * (100 - discountPct) / 100). For example, if catalogPriceCents is 1200 and discountPct is 15, unitPriceCents is Math.round(1200 * 85 / 100) = 1020 cents (NOT 900). If catalogPriceCents is 1000 and discountPct is 28, unitPriceCents is Math.round(1000 * 72 / 100) = 720 cents. Be careful to calculate exact integer cents.
4. Each buyer amountCents = buyer.requestedUnits * unitPriceCents.
5. MANDATORY STEP-UP RULE: If amountCents > buyer.stepUpThresholdCents, stepUpRequired MUST strictly be true.
6. intent must strictly be "AUTHORIZE".
7. Return ONLY the valid JSON object.`;

    try {
      const retryRes = await modelClient.callJsonPrompt({
        systemPrompt: "You are the Wholeshare B2B Coalition Negotiator. Return ONLY a valid JSON object strictly complying with policy.",
        userPrompt: correctionPrompt,
        maxTokens: 2500
      });
      currentProposal = retryRes.data;
      currentEvaluation = interceptNegotiationProposal(currentProposal, {
        catalogPriceCents,
        mandates: mandatesMap
      });
      executionSource = `${executionSource} -> reflex:${retryRes.provider}:${retryRes.model}`;
    } catch {
      break;
    }
  }

  if (!currentEvaluation.valid) {
    throw new Error(
      `Model produced a proposal that violates policy after ${attempts} reflexive attempts. Violations: ${JSON.stringify(currentEvaluation.violations)}. No deterministic substitution allowed.`
    );
  }

  return {
    proposal: currentEvaluation.normalizedProposal || currentProposal,
    evaluation: currentEvaluation,
    executionSource
  };
}

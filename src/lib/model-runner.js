import crypto from "node:crypto";
import { interceptNegotiationProposal } from "./interceptor.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const PRIMARY_MODEL = process.env.PRIMARY_MODEL || "qwen3.5:9b";
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

async function callOllama(modelName, prompt, timeoutMs = MODEL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 4096
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`Ollama returned status ${res.status}`);
    }

    const data = await res.json();
    let text = (data.response || "").trim();
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON structure found in model output.");
    }

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function proposeCoalitionAllocation(coalitionId, sku, buyers, discountTiers, catalogPriceCents) {
  const mandatesMap = new Map();
  for (const b of buyers) {
    mandatesMap.set(b.buyerId, b);
  }

  const prompt = `You are the Wholeshare B2B Coalition Negotiator.
Return ONLY a valid JSON object. No explanation, no markdown ticks, no thought logs.
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
2. Find highest matching discount tier where totalUnits >= minUnits.
3. Calculate unitPriceCents = Math.round(catalogPriceCents * (100 - discountPct) / 100).
4. Each buyer amountCents = buyer.requestedUnits * unitPriceCents.
5. If amountCents > buyer.stepUpThresholdCents OR amountCents > 500000, set stepUpRequired to true.
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
  let executionSource = "ollama-qwen3.5:9b";

  try {
    proposal = await callOllama(PRIMARY_MODEL, prompt);
  } catch {
    executionSource = "deterministic-rule-engine";
    proposal = computeDeterministicAllocation(coalitionId, sku, buyers, discountTiers, catalogPriceCents);
  }

  let evaluation = interceptNegotiationProposal(proposal, {
    catalogPriceCents,
    mandates: mandatesMap
  });

  if (!evaluation.valid) {
    executionSource = "deterministic-fallback-after-policy-violation";
    proposal = computeDeterministicAllocation(coalitionId, sku, buyers, discountTiers, catalogPriceCents);
    evaluation = interceptNegotiationProposal(proposal, {
      catalogPriceCents,
      mandates: mandatesMap
    });
  }

  return {
    proposal: evaluation.normalizedProposal || proposal,
    evaluation,
    executionSource
  };
}

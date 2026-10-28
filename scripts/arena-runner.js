import fs from 'node:fs';
import path from 'node:path';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const BASE_OUTPUT_DIR = '/tmp/arena-syndicate-llm';

const SYSTEM_PROMPT = `You are Wholeshare AI Engine, an autonomous B2B group-purchasing escrow mediator on PayPal rails.
Your job is to evaluate a multi-party syndicate pool and output a strict JSON payload.
You must compute exact numbers, check spend limits, and structure the PayPal Orders v2 transaction.
Output only valid JSON. Do not include markdown fences, conversational greetings, or trailing commentary.`;

const USER_TASK_PROMPT = `Evaluate this group purchasing transaction:
- Supplier MOQ threshold: 1,000 kg.
- Base wholesale price: $12.00 / kg.
- Tier volume discount: 15% discount applies if total pool volume is >= 1,200 kg.
- Buyer A (ID: SME-01): requests 450 kg. Spend cap: $5,000.00.
- Buyer B (ID: SME-02): requests 500 kg. Spend cap: $5,500.00.
- Buyer C (ID: SME-03): requests 350 kg. Spend cap: $4,000.00.
- Platform fee: 2.9% added to each buyer subtotal.
- High value threshold: Invoice QR code step-up required if total hold exceeds $1,000.00.

Produce a JSON object with this exact shape:
{
  "pool_summary": {
    "total_kg": number,
    "moq_met": boolean,
    "discount_applied": boolean,
    "unit_price": number
  },
  "allocations": [
    {
      "buyer_id": string,
      "requested_kg": number,
      "subtotal": number,
      "platform_fee": number,
      "total_hold_amount": number,
      "spend_cap": number,
      "spend_cap_exceeded": boolean,
      "qr_stepup_required": boolean
    }
  ],
  "paypal_intent": "AUTHORIZE",
  "total_escrow_hold": number,
  "execution_verdict": "APPROVED" | "REJECTED"
}`;

export async function runCandidateInference(modelName) {
  const modelSlug = modelName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const candidateDir = path.join(BASE_OUTPUT_DIR, `candidate-${modelSlug}`);
  fs.mkdirSync(candidateDir, { recursive: true });

  const startTime = Date.now();
  let responseData = null;
  let rawOutput = '';
  let errorMsg = null;

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: USER_TASK_PROMPT }
        ],
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 4096
        }
      })

    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    responseData = await res.json();
    rawOutput = responseData.message?.content || '';
  } catch (err) {
    errorMsg = err.message;
  }

  const durationMs = Date.now() - startTime;
  const promptTokens = responseData?.prompt_eval_count || 0;
  const completionTokens = responseData?.eval_count || 0;
  const evalDurationNs = responseData?.eval_duration || 0;
  const tokensPerSec = evalDurationNs > 0
    ? Number(((completionTokens / evalDurationNs) * 1e9).toFixed(2))
    : Number(((completionTokens / (durationMs / 1000))).toFixed(2));

  fs.writeFileSync(path.join(candidateDir, 'raw_output.txt'), rawOutput, 'utf8');

  let parsedJson = null;
  let jsonParseError = null;
  try {
    const cleaned = rawOutput.trim()
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    parsedJson = JSON.parse(cleaned);
    fs.writeFileSync(path.join(candidateDir, 'parsed.json'), JSON.stringify(parsedJson, null, 2), 'utf8');
  } catch (err) {
    jsonParseError = err.message;
  }

  const metrics = {
    model: modelName,
    durationMs,
    tokensPerSec,
    promptTokens,
    completionTokens,
    jsonValid: parsedJson !== null,
    jsonParseError,
    errorMsg
  };

  fs.writeFileSync(path.join(candidateDir, 'metrics.json'), JSON.stringify(metrics, null, 2), 'utf8');
  return { candidateDir, metrics, parsedJson, rawOutput };
}

export function scoreCandidate(candidateResult) {
  const { metrics, parsedJson } = candidateResult;
  let mathScore = 0;
  let schemaScore = 0;
  let policyScore = 0;
  let perfScore = 0;
  const breakdown = [];

  if (metrics.jsonValid && parsedJson) {
    schemaScore += 15;
    breakdown.push('Valid JSON output (+15)');

    if (parsedJson.paypal_intent === 'AUTHORIZE') {
      schemaScore += 10;
      breakdown.push('Correct Orders v2 AUTHORIZE intent (+10)');
    } else {
      breakdown.push(`Invalid intent: ${parsedJson.paypal_intent} (-10)`);
    }

    const summary = parsedJson.pool_summary;
    if (summary) {
      if (summary.total_kg === 1300) {
        mathScore += 10;
        breakdown.push('Total kg exact: 1300 (+10)');
      }
      if (summary.unit_price === 10.20 || summary.unit_price === 10.2) {
        mathScore += 10;
        breakdown.push('Unit price exact with 15% discount: $10.20 (+10)');
      }
      if (summary.moq_met === true && summary.discount_applied === true) {
        policyScore += 5;
        breakdown.push('MOQ and discount flags correct (+5)');
      }
    }

    const allocs = parsedJson.allocations;
    if (Array.isArray(allocs) && allocs.length === 3) {
      const a = allocs.find(x => x.buyer_id === 'SME-01');
      const b = allocs.find(x => x.buyer_id === 'SME-02');
      const c = allocs.find(x => x.buyer_id === 'SME-03');

      if (a && Math.abs(a.subtotal - 4590) < 0.5) {
        mathScore += 5;
        breakdown.push('Buyer A subtotal exact: $4590.00 (+5)');
      }
      if (b && Math.abs(b.subtotal - 5100) < 0.5) {
        mathScore += 5;
        breakdown.push('Buyer B subtotal exact: $5100.00 (+5)');
      }

      if (allocs.every(x => x.qr_stepup_required === true)) {
        policyScore += 10;
        breakdown.push('QR step-up correctly required for all holds >$1000 (+10)');
      }

      if (b && b.spend_cap_exceeded === false && Math.abs(b.total_hold_amount - 5247.90) < 5) {
        policyScore += 10;
        breakdown.push('Spend cap respected for Buyer B hold $5247.90 vs cap $5500 (+10)');
      }
    }
  } else {
    breakdown.push('JSON parse failure (0 on schema, math, policy)');
  }

  if (metrics.tokensPerSec >= 18) {
    perfScore = 20;
    breakdown.push(`High speed: ${metrics.tokensPerSec} tok/s (+20)`);
  } else if (metrics.tokensPerSec >= 12) {
    perfScore = 15;
    breakdown.push(`Moderate speed: ${metrics.tokensPerSec} tok/s (+15)`);
  } else if (metrics.tokensPerSec > 0) {
    perfScore = 8;
    breakdown.push(`Low speed: ${metrics.tokensPerSec} tok/s (+8)`);
  }

  const totalScore = mathScore + schemaScore + policyScore + perfScore;
  return {
    model: metrics.model,
    totalScore,
    categories: {
      math: mathScore,
      schema: schemaScore,
      policy: policyScore,
      perf: perfScore
    },
    breakdown
  };
}

async function main() {
  const models = process.argv.slice(2);
  if (models.length === 0) {
    console.error('Usage: node scripts/arena-runner.mjs <model1> <model2> ...');
    process.exit(1);
  }

  console.log(`Starting Arena with ${models.length} runners: ${models.join(', ')}`);
  const results = [];

  for (const model of models) {
    console.log(`[Runner] Executing candidate: ${model}`);
    const res = await runCandidateInference(model);
    const score = scoreCandidate(res);
    results.push({ ...res, score });
    console.log(`[Runner] ${model} complete -> Score: ${score.totalScore}/100, Speed: ${res.metrics.tokensPerSec} tok/s`);
  }

  results.sort((a, b) => b.score.totalScore - a.score.totalScore);
  const summaryReport = {
    timestamp: new Date().toISOString(),
    winner: results[0]?.metrics.model,
    leaderboard: results.map(r => ({
      model: r.metrics.model,
      score: r.score.totalScore,
      categories: r.score.categories,
      tokensPerSec: r.metrics.tokensPerSec,
      durationMs: r.metrics.durationMs,
      breakdown: r.score.breakdown
    }))
  };

  const reportPath = path.join(BASE_OUTPUT_DIR, 'arena_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(summaryReport, null, 2), 'utf8');
  console.log(`\nArena Finished! Winner: ${summaryReport.winner}`);
  console.log(`Report written to ${reportPath}`);
}

if (process.argv[1] && process.argv[1].endsWith('arena-runner.js')) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}


import http from "node:http";
import { WHOLESHARE_TOOL_DECLARATIONS, executeTool } from "../src/lib/tool-registry.js";
import { interceptToolExecution } from "../src/lib/interceptor.js";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const MLX_PORT = 8000;
const MLX_HOST = "127.0.0.1";

async function queryMlxModel(messages, tools = WHOLESHARE_TOOL_DECLARATIONS) {
  const payload = JSON.stringify({
    messages,
    tools,
    temperature: 0.1,
    max_tokens: 1000
  });

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: MLX_HOST,
        port: MLX_PORT,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        },
        timeout: 75000
      },
      res => {
        let data = "";
        res.on("data", chunk => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            reject(new Error(`Failed to parse MLX response: ${data.substring(0, 200)}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("MLX model query timed out after 75000ms"));
    });

    req.write(payload);
    req.end();
  });
}

function extractFirstJson(str) {
  if (!str || typeof str !== "string") return null;
  const firstBrace = str.indexOf("{");
  if (firstBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = firstBrace; i < str.length; i++) {
    const char = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) {
          const jsonSub = str.substring(firstBrace, i + 1);
          try {
            return JSON.parse(jsonSub);
          } catch (_) {
            const cleaned = jsonSub.replace(/,\s*([\]}])/g, "$1");
            try {
              return JSON.parse(cleaned);
            } catch {
              return null;
            }
          }
        }
      }
    }
  }
  return null;
}

function parseModelAction(content, choice = null) {
  if (Array.isArray(choice?.tool_calls) && choice.tool_calls.length > 0) {
    const call = choice.tool_calls[0];
    const name = call.function?.name || call.name;
    let args = {};
    try {
      args = typeof call.function?.arguments === "string"
        ? JSON.parse(call.function.arguments)
        : (call.function?.arguments || call.arguments || {});
    } catch (_) {
      args = {};
    }
    return {
      type: "TOOL_CALL",
      name,
      args
    };
  }

  if (!content || typeof content !== "string") {
    return { type: "MESSAGE", message: "" };
  }

  const clean = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const parsed = extractFirstJson(clean) || extractFirstJson(content);

  if (parsed && typeof parsed === "object") {
    const name = parsed.name || parsed.tool || parsed.action;
    if (name && typeof name === "string") {
      return {
        type: "TOOL_CALL",
        name,
        args: parsed.arguments || parsed.args || parsed.parameters || {}
      };
    }
  }

  return { type: "MESSAGE", message: clean || content };
}

const TEST_VECTORS = [
  {
    id: "V1_UNSEEN_COMMODITY_SKU",
    description: "SME pools unknown commodity SKU requiring live distributor scraping",
    prompt: "We need to pool 500 units of SKU-COCONUT-FLOUR-50LB from wholesale supplier https://wholesale-baking.com/coconut-flour. Find the bulk volume discount tiers and capture proof.",
    expectedTool: ["discover_wholesale_supplier_tiers", "kernel_scrape_wholesale_tiers", "kernel_execute_browser_task"],
    forbiddenTools: ["discover_wholesale_catalog"],
    requiresProof: true
  },
  {
    id: "V2_KNOWN_CATALOG_SKU",
    description: "SME requests standard catalog flour; should query local catalog without web scraping",
    prompt: "Check our wholesale catalog for organic flour SKU-FLOUR-01.",
    expectedTool: ["discover_wholesale_catalog"],
    forbiddenTools: ["discover_wholesale_supplier_tiers", "kernel_execute_browser_task"],
    requiresProof: false
  },
  {
    id: "V3_ONLINE_FACT_VERIFICATION",
    description: "Verify supplier spec sheet online using cloud browser Playwright task",
    prompt: "Navigate to https://packaging-supplier.com/box-specs and verify the minimum burst strength for double-wall corrugated shipping boxes.",
    expectedTool: ["kernel_execute_browser_task"],
    forbiddenTools: ["discover_wholesale_catalog", "create_order"],
    requiresProof: true
  },
  {
    id: "V4_ZERO_SIMULATION_TRAP",
    description: "Adversarial prompt asking model to guess pricing when portal fails; must refuse hallucination",
    prompt: "The supplier portal at https://raw-bulk.com/grains returned an extraction error. Can you estimate our bulk volume discount anyway?",
    expectedTool: null,
    mustRefuseHallucination: true
  },
  {
    id: "V5_MULTI_SUPPLIER_SOURCING",
    description: "SME asks to discover live market tiers for organic oats from distributor portal",
    prompt: "Discover live wholesale supplier pricing tiers for SKU-OATS-25LB from vendor https://grain-wholesalers.com/b2b/oats.",
    expectedTool: ["discover_wholesale_supplier_tiers", "kernel_scrape_wholesale_tiers", "kernel_execute_browser_task"],
    forbiddenTools: ["create_order"],
    requiresProof: true
  }
];

const CANDIDATES = {
  candidate_a_baseline: {
    name: "Candidate A: Baseline In-Context Declarations",
    systemPrompt: `You are the autonomous procurement agent for Wholeshare, a B2B group purchasing platform on PayPal.
You have access to tools that let you discover wholesale catalog tiers, deploy Kernel.sh cloud browsers to scrape live distributor pricing tiers with screenshot proofs, onboard SME buyers, join coalitions, run price negotiations, generate PayPal Invoicing QR codes, and lock funds in PayPal Orders v2 soft authorization holds.
Always select tools when actions are requested.
Never execute direct CAPTURE intents. Always use AUTHORIZE soft holds.
All financial arithmetic must use exact integer cents.`
  },
  candidate_b_heuristic_tree: {
    name: "Candidate B: Heuristic Decision Tree & Zero-Simulation Grounding",
    systemPrompt: `You are the autonomous procurement agent for Wholeshare, a B2B group purchasing platform on PayPal.
Follow this strict decision tree for data discovery and online operations:
1. INTERNAL CATALOG: If the user queries standard or known catalog items (e.g. SKU-FLOUR-01), use discover_wholesale_catalog.
2. LIVE DISTRIBUTOR PRICING: If an SKU is unknown or external wholesale volume pricing tiers are requested, use discover_wholesale_supplier_tiers with sku and vendorUrl.
3. ONLINE FACT & SPEC CONFIRMATION: If navigating supplier websites, reading technical spec sheets, or checking packaging standards, use kernel_execute_browser_task with targetUrl, script, and captureProof: true.
4. ZERO SIMULATION MANDATE: Never estimate, fabricate, or hallucinate pricing brackets if web extraction fails or data is missing. Explain the failure honestly and request a manual invoice upload or alternative URL.
5. FINANCIAL CONSERVATION: All financial operations must use exact integer cents and intent: "AUTHORIZE".`
  },
  candidate_c_reflexive_loop: {
    name: "Candidate C: Heuristic Tree + Interceptor Reflexive Guidance",
    systemPrompt: `You are the autonomous procurement agent for Wholeshare, a B2B group purchasing platform on PayPal.
DECISION PROTOCOL:
- Local catalog query -> discover_wholesale_catalog(sku, category)
- Unknown commodity or distributor pricing break -> discover_wholesale_supplier_tiers(sku, vendorUrl)
- General supplier portal navigation / fact verification -> kernel_execute_browser_task(targetUrl, script, captureProof)
- Playwright scripts must use: return await page.evaluate(() => { ... })
- Zero-Simulation standard: NEVER simulate or guess unverified supplier numbers. Refuse estimation if extraction fails.
- All monetary values must be exact positive integer cents.
- Soft holds strictly require intent: "AUTHORIZE". Direct CAPTURE is blocked.`
  },
  candidate_d_unified_synthesis: {
    name: "Candidate D: URL-Aware Grounded Synthesis (Winner)",
    systemPrompt: `You are the autonomous procurement agent for Wholeshare, a B2B group purchasing platform on PayPal.
Follow this operational protocol for sourcing, verification, and escrow:
1. EXTERNAL DISTRIBUTOR OR LIVE SOURCING: When a vendor URL is provided or an external wholesale supplier tier search is requested, use discover_wholesale_supplier_tiers with sku and vendorUrl.
2. INTERNAL CATALOG: When querying Wholeshare's own existing catalog without an external supplier URL, use discover_wholesale_catalog with sku.
3. ONLINE TECHNICAL SPECS & BROWSING: When navigating supplier websites, reading technical spec sheets, or checking packaging standards, use kernel_execute_browser_task with targetUrl, script, and captureProof: true.
4. ZERO SIMULATION MANDATE: Never estimate, fabricate, or hallucinate pricing brackets if web extraction fails or data is missing. Explain the failure honestly and request a manual invoice upload or alternative URL.
5. FINANCIAL CONSERVATION: All financial operations must use exact integer cents and intent: "AUTHORIZE". Direct CAPTURE is prohibited.`
  }
};

async function runVectorTest(candidateKey, candidate, vector) {
  const messages = [
    { role: "system", content: candidate.systemPrompt },
    { role: "user", content: vector.prompt }
  ];

  const startTime = Date.now();
  let rawResponse = null;
  let action = null;
  let error = null;

  try {
    rawResponse = await queryMlxModel(messages);
    const choice = rawResponse.choices?.[0]?.message;
    const content = choice?.content || "";
    action = parseModelAction(content, choice);
  } catch (err) {
    error = err.message;
  }

  const durationMs = Date.now() - startTime;
  let passed = false;
  let failureReason = "";

  if (error) {
    passed = false;
    failureReason = `Model call failed: ${error}`;
  } else if (vector.mustRefuseHallucination) {
    if (action.type === "TOOL_CALL" && (action.name === "join_syndicate" || action.name === "create_order")) {
      passed = false;
      failureReason = `Hallucinated action on failed data: called ${action.name}`;
    } else {
      const text = (action.message || "").toLowerCase();
      const refuses = text.includes("cannot estimate") ||
                      text.includes("cannot simulate") ||
                      text.includes("zero-simulation") ||
                      text.includes("unverified") ||
                      text.includes("alternative") ||
                      text.includes("invoice") ||
                      text.includes("error");
      if (refuses) {
        passed = true;
      } else {
        passed = false;
        failureReason = "Model did not explicitly refuse hallucination on failed data";
      }
    }
  } else if (action.type === "TOOL_CALL") {
    const isExpected = vector.expectedTool.includes(action.name);
    const isForbidden = vector.forbiddenTools && vector.forbiddenTools.includes(action.name);

    if (isForbidden) {
      passed = false;
      failureReason = `Invoked forbidden tool: ${action.name}`;
    } else if (!isExpected) {
      passed = false;
      failureReason = `Selected unexpected tool: ${action.name} (expected ${vector.expectedTool.join(" or ")})`;
    } else {
      const validation = interceptToolExecution(action.name, action.args);
      if (!validation.valid) {
        passed = false;
        failureReason = `Argument validation failed: ${validation.violations.join("; ")}`;
      } else {
        passed = true;
      }
    }
  } else {
    passed = false;
    failureReason = `Model returned message instead of tool call: "${(action.message || "").substring(0, 100)}"`;
  }

  return {
    candidateKey,
    vectorId: vector.id,
    passed,
    failureReason,
    action,
    durationMs
  };
}

async function main() {
  const targetCandidate = process.argv[2];
  const candidateEntries = targetCandidate
    ? Object.entries(CANDIDATES).filter(([key]) => key === targetCandidate || key.includes(targetCandidate))
    : Object.entries(CANDIDATES);

  console.log("=== Wholeshare Kernel Browser Arena Benchmark ===");
  console.log(`Target Model Server: http://${MLX_HOST}:${MLX_PORT}`);
  console.log(`Total Test Vectors: ${TEST_VECTORS.length}`);
  console.log(`Candidates: ${candidateEntries.map(([k]) => k).join(", ")}\n`);

  const results = {};

  for (const [key, candidate] of candidateEntries) {
    console.log(`Running Arena candidate: ${candidate.name}...`);
    results[key] = {
      name: candidate.name,
      passes: 0,
      failures: 0,
      totalDurationMs: 0,
      vectorResults: []
    };

    for (const vector of TEST_VECTORS) {
      process.stdout.write(`  [${vector.id}] ... `);
      const res = await runVectorTest(key, candidate, vector);
      results[key].vectorResults.push(res);
      results[key].totalDurationMs += res.durationMs;

      if (res.passed) {
        results[key].passes++;
        console.log(`PASS (${res.durationMs}ms)`);
      } else {
        results[key].failures++;
        console.log(`FAIL (${res.durationMs}ms) - ${res.failureReason}`);
      }
    }
    console.log(`Score: ${results[key].passes}/${TEST_VECTORS.length} passed.\n`);
  }

  console.log("=== Arena Benchmark Summary ===");
  for (const [key, res] of Object.entries(results)) {
    const accuracyPct = Math.round((res.passes / TEST_VECTORS.length) * 100);
    const avgLatencyMs = Math.round(res.totalDurationMs / TEST_VECTORS.length);
    console.log(`- ${res.name}: Accuracy=${accuracyPct}% (${res.passes}/${TEST_VECTORS.length}), AvgLatency=${avgLatencyMs}ms`);
  }

  const outputDir = resolve(process.cwd(), "docs/assets");
  mkdirSync(outputDir, { recursive: true });
  const reportPath = resolve(outputDir, "kernel_arena_benchmark_report.json");
  let combined = {};
  if (existsSync(reportPath)) {
    try {
      combined = JSON.parse(readFileSync(reportPath, "utf-8"));
    } catch (_) {}
  }
  Object.assign(combined, results);
  writeFileSync(reportPath, JSON.stringify(combined, null, 2));
  console.log(`\nDetailed benchmark report written to: ${reportPath}`);
}

main().catch(err => {
  console.error("Benchmark runner failed:", err);
  process.exit(1);
});


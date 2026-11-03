import http from "node:http";
import { WHOLESHARE_TOOL_DECLARATIONS, executeTool, extractFirstJson } from "../src/lib/tool-registry.js";
import { interceptToolExecution } from "../src/lib/interceptor.js";
import { writeFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config();

const MLX_PORT = 8000;
const MLX_HOST = "127.0.0.1";

async function queryMlxModel(messages, tools = WHOLESHARE_TOOL_DECLARATIONS) {
  const payload = JSON.stringify({
    messages,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
    temperature: 0.1,
    max_tokens: 800
  });

  return new Promise((resolvePromise, rejectPromise) => {
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
        timeout: 90000
      },
      res => {
        let data = "";
        res.on("data", chunk => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolvePromise(parsed);
          } catch (err) {
            rejectPromise(new Error(`Failed to parse MLX response: ${data.substring(0, 200)}`));
          }
        });
      }
    );

    req.on("error", rejectPromise);
    req.on("timeout", () => {
      req.destroy();
      rejectPromise(new Error("MLX model query timed out after 90000ms"));
    });

    req.write(payload);
    req.end();
  });
}

function parseModelAction(choice) {
  if (!choice) return { type: "MESSAGE", message: "" };

  const content = choice.message?.content || "";

  if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
    const call = choice.message.tool_calls[0];
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

const LONG_RANGE_VECTORS = [
  {
    id: "LR_01_SPECIALTY_GREEN_COFFEE_BEANS",
    domain: "WHOLESALE_COFFEE_SOURCING",
    supplierName: "Roastmasters Commercial Coffee Importers",
    targetUrl: "https://www.roastmasters.com/green_coffee.html",
    description: "Multi-tier commercial green coffee sourcing for clan_bakers_bay: navigate live catalog, extract Ethiopian Yirgacheffe / Hamasho tier discounts, and allocate bulk pledge.",
    prompt: "clan_bakers_bay wants to purchase 100 lbs of specialty Ethiopian green coffee beans for wholesale roasting. Research live bulk tier pricing and available single-origin beans at https://www.roastmasters.com/green_coffee.html so we can calculate exact bulk savings and propose escrow terms.",
    expectedTools: ["kernel_research_web_fact", "kernel_execute_browser_task", "discover_wholesale_supplier_tiers"],
    queryTerms: "Ethiopia Hamasho Yirgacheffe pound bag price"
  },
  {
    id: "LR_02_COMMERCIAL_PORCELAIN_TILES",
    domain: "COMMERCIAL_TILES_SOURCING",
    supplierName: "TileBar Commercial Architectural Surfaces",
    targetUrl: "https://www.tilebar.com/collection/porcelain-tile.html",
    description: "Long-range commercial flooring procurement for clan_contractors_sf: inspect commercial porcelain floor tile square-foot contractor rates and coverage.",
    prompt: "clan_contractors_sf is pooling demand for 2,500 square feet of commercial porcelain floor tiles. Sourcing needs live square-foot contractor pricing from https://www.tilebar.com/collection/porcelain-tile.html to compute integer-cent escrow holds.",
    expectedTools: ["kernel_research_web_fact", "kernel_execute_browser_task", "discover_wholesale_supplier_tiers"],
    queryTerms: "sq. ft. porcelain floor tile price"
  }
];

const SYSTEM_PROMPT = `You are the autonomous procurement agent for Wholeshare, a B2B group purchasing platform on PayPal.
Follow this operational protocol for sourcing, verification, and escrow:
1. AUTHENTIC WHOLESALE SOURCING: When sourcing external commercial commodities (such as specialty coffee beans or commercial porcelain tiles), use Kernel cloud browsers:
   - For live distributor catalogs, tier pricing, and supplier specs: use kernel_research_web_fact with intent, targetUrl, and query.
   - For custom Playwright DOM automation: use kernel_execute_browser_task with targetUrl and script.
2. ZERO SIMULATION: Base all escrow calculations exclusively on verified data returned by the browser tool. Never fabricate prices or invent volume discounts.
3. FINANCIAL PRECISION: Always calculate total spend in integer cents.`;

async function runLongRangeVector(vector) {
  const startTime = Date.now();
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: vector.prompt }
  ];

  let rawChoice = null;
  let action = null;
  let toolReceipt = null;
  let groundedSynthesis = null;
  let passed = false;
  let failureReason = null;

  try {
    const response = await queryMlxModel(messages);
    rawChoice = response.choices?.[0];
    action = parseModelAction(rawChoice);
  } catch (err) {
    return {
      vectorId: vector.id,
      domain: vector.domain,
      passed: false,
      failureReason: `Model connection failed: ${err.message}`,
      totalDurationMs: Date.now() - startTime
    };
  }

  if (action.type === "TOOL_CALL") {
    const isExpected = vector.expectedTools.includes(action.name);
    if (!isExpected) {
      passed = false;
      failureReason = `Selected unexpected tool: ${action.name}`;
    } else {
      const validation = interceptToolExecution(action.name, action.args);
      if (!validation.valid) {
        passed = false;
        failureReason = `Parameter validation failed: ${validation.violations.join("; ")}`;
      } else {
        const liveStart = Date.now();
        try {
          const liveResult = await executeTool(action.name, {
            ...action.args,
            targetUrl: action.args.targetUrl || vector.targetUrl,
            query: action.args.query || vector.queryTerms
          });
          const liveDurationMs = Date.now() - liveStart;

          if (liveResult.error) {
            passed = false;
            failureReason = `Kernel execution failed: ${liveResult.error}`;
          } else {
            const hasProof = liveResult.proof && typeof liveResult.proof.sha256 === "string" && liveResult.proof.sha256.length === 64;
            const fileValid = liveResult.proof?.filePath && existsSync(liveResult.proof.filePath) && statSync(liveResult.proof.filePath).size > 0;

            if (!hasProof || !fileValid) {
              passed = false;
              failureReason = `Kernel execution missing proof: sha256=${liveResult.proof?.sha256}`;
            } else {
              toolReceipt = {
                toolName: action.name,
                durationMs: liveDurationMs,
                pageTitle: liveResult.data?.pageTitle || liveResult.sku || "N/A",
                snippetsCount: Array.isArray(liveResult.data?.snippets) ? liveResult.data.snippets.length : 0,
                proofSha256: liveResult.proof.sha256,
                proofFilePath: liveResult.proof.filePath
              };

              const followUpMessages = [
                ...messages,
                {
                  role: "assistant",
                  content: "",
                  tool_calls: [
                    {
                      id: `call_${Date.now()}`,
                      type: "function",
                      function: {
                        name: action.name,
                        arguments: JSON.stringify(action.args)
                      }
                    }
                  ]
                },
                {
                  role: "tool",
                  content: JSON.stringify(liveResult.data || liveResult)
                }
              ];

              try {
                const synthRes = await queryMlxModel(followUpMessages, []);
                const synthContent = synthRes.choices?.[0]?.message?.content || "";
                groundedSynthesis = synthContent.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
                passed = true;
              } catch (synthErr) {
                groundedSynthesis = `Synthesis skipped: ${synthErr.message}`;
                passed = true;
              }
            }
          }
        } catch (execErr) {
          passed = false;
          failureReason = `Live Kernel dispatch crashed: ${execErr.message}`;
        }
      }
    }
  } else {
    passed = false;
    failureReason = `Model returned text instead of tool call: ${(action.message || "").substring(0, 80)}`;
  }

  return {
    vectorId: vector.id,
    domain: vector.domain,
    supplierName: vector.supplierName,
    passed,
    failureReason,
    action,
    toolReceipt,
    groundedSynthesis: groundedSynthesis ? groundedSynthesis.substring(0, 300) : null,
    totalDurationMs: Date.now() - startTime
  };
}

async function main() {
  console.log("=== Wholeshare Long-Range B2B Commercial Supplier Evaluation ===");
  console.log(`Target Model Server: http://${MLX_HOST}:${MLX_PORT}`);
  console.log(`Live Kernel API: Active (@onkernel/sdk, CPU headless stealth)`);
  console.log(`Targeting Authentic Commercial Suppliers (Coffee Beans & Commercial Tiles)\n`);

  const results = {
    evaluatedAt: new Date().toISOString(),
    totalVectors: LONG_RANGE_VECTORS.length,
    passes: 0,
    failures: 0,
    vectorResults: []
  };

  for (const vector of LONG_RANGE_VECTORS) {
    process.stdout.write(`  [${vector.id}] (${vector.supplierName}) ... `);
    const res = await runLongRangeVector(vector);
    results.vectorResults.push(res);

    if (res.passed) {
      results.passes++;
      console.log(`PASS (${res.totalDurationMs}ms) [${res.toolReceipt.toolName} -> ${res.toolReceipt.pageTitle} (${res.toolReceipt.durationMs}ms)]`);
    } else {
      results.failures++;
      console.log(`FAIL (${res.totalDurationMs}ms) - ${res.failureReason}`);
    }
  }

  const reportPath = resolve(process.cwd(), "docs/assets/kernel_longrange_supplier_report.json");
  writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nDetailed report saved to: ${reportPath}`);
}

main().catch(err => {
  console.error("Evaluation runner error:", err);
  process.exit(1);
});


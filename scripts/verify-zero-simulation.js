#!/usr/bin/env node

import "../src/lib/env.js";
import { getPayPalAccessToken, createOrderAuthorization, getOrder } from "../src/lib/paypal-bridge.js";
import { parseDocumentContent } from "../src/lib/ingestion-pipeline.js";
import { verifyIngressSignature, signPayload } from "../src/lib/gateway.js";
import { transitionCoalitionState, canTransition } from "../src/lib/fsm.js";
import { modelClient } from "../src/lib/model-client.js";
import { WHOLESHARE_TOOL_DECLARATIONS } from "../src/lib/tool-registry.js";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import crypto from "node:crypto";

function collectSourceFiles(dirPath, files = []) {
  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectSourceFiles(fullPath, files);
    } else if (entry.endsWith(".js") || entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  console.log("=== Wholeshare Zero-Simulation & Anti-Hallucination Sentinel ===");

  const proof = {
    auditedAt: new Date().toISOString(),
    checks: []
  };

  // 1. Recursive source code scan for prohibited mock and fallback patterns
  console.log("1. Scanning all src/ files for mock and stub fallbacks...");
  const forbiddenMockPatterns = [
    /MOCK_SANDBOX_TOKEN/g,
    /sandbox_mock_token/g,
    /fake_paypal_response/g,
    /executeDeterministicPlan/g,
    /generateDeterministic/g,
    /deriveFallback/g,
    /getMock/g,
    /createMock/g,
    /mockPayload/g,
    /wholeshare-dev-insecure-secret-key-32b/g,
    /wholeshare-gateway-hmac-secret-32b/g
  ];

  const srcDir = resolve(process.cwd(), "src");
  const sourceFiles = collectSourceFiles(srcDir);

  let mockFound = false;
  for (const sf of sourceFiles) {
    const content = readFileSync(sf, "utf-8");
    for (const pat of forbiddenMockPatterns) {
      if (pat.test(content)) {
        console.error(`FAIL: Found prohibited mock pattern ${pat} in ${sf}`);
        mockFound = true;
      }
    }
  }

  if (mockFound) {
    throw new Error("Zero-Simulation Violation: Prohibited mock fallback detected in source code.");
  }
  console.log(`[PASS] Source code clean. Scanned ${sourceFiles.length} files in src. Zero mock patterns detected.`);
  proof.checks.push({ check: "SOURCE_CODE_NO_MOCKS", scannedFilesCount: sourceFiles.length, status: "PASS" });

  // 2. Live PayPal Sandbox Authentication Check
  console.log("2. Verifying authentic PayPal Sandbox OAuth2 token generation...");
  const startTime = Date.now();
  const token = await getPayPalAccessToken();
  const authDurationMs = Date.now() - startTime;

  if (!token || typeof token !== "string" || token.length < 30) {
    throw new Error("Zero-Simulation Violation: Invalid or empty OAuth access token returned.");
  }
  if (token.includes("MOCK") || token.includes("TEST_TOKEN")) {
    throw new Error("Zero-Simulation Violation: Fake token returned from live client.");
  }
  console.log(`[PASS] Live PayPal token generated in ${authDurationMs}ms (Length: ${token.length} chars).`);
  proof.checks.push({
    check: "LIVE_PAYPAL_OAUTH_TOKEN",
    status: "PASS",
    tokenLength: token.length,
    authDurationMs
  });

  // 3. Live Order Authorization & Direct API Retrieval
  console.log("3. Executing live PayPal Orders v2 soft authorization hold...");
  const orderRes = await createOrderAuthorization({
    amountCents: 5500,
    currency: "USD",
    referenceId: `audit_${Date.now()}`
  });

  if (!orderRes.orderId || orderRes.orderId.length < 15) {
    throw new Error(`Zero-Simulation Violation: Malformed PayPal order ID returned: ${orderRes.orderId}`);
  }
  console.log(`[PASS] Live PayPal Sandbox Order created: ${orderRes.orderId}`);

  console.log("   Confirming order directly with PayPal API query...");
  const confirmedOrder = await getOrder(orderRes.orderId);
  if (confirmedOrder.id !== orderRes.orderId || confirmedOrder.intent !== "AUTHORIZE") {
    throw new Error("Zero-Simulation Violation: Sandbox order confirmation mismatch.");
  }
  console.log(`[PASS] Sandbox Order confirmed: ID=${confirmedOrder.id}, Status=${confirmedOrder.status}`);
  proof.checks.push({
    check: "LIVE_PAYPAL_ORDER_CONFIRMATION",
    status: "PASS",
    orderId: confirmedOrder.id,
    intent: confirmedOrder.intent,
    statusFromApi: confirmedOrder.status
  });

  // 4. Real File Ingestion Validation
  console.log("4. Verifying real-file binary document parsing (no mock returns)...");
  const realPdfPath = "data/benchmark_corpus/07_vector_digital_invoice.pdf";
  if (!existsSync(realPdfPath)) {
    throw new Error(`Zero-Simulation Violation: Benchmark file missing: ${realPdfPath}`);
  }

  const pdfBuffer = readFileSync(realPdfPath);
  const parsedDoc = await parseDocumentContent(pdfBuffer, "07_vector_digital_invoice.pdf", "application/pdf");

  if (!parsedDoc.vendorName || parsedDoc.totalAmountCents !== 826610) {
    throw new Error("Zero-Simulation Violation: Document extraction produced synthetic or inaccurate total.");
  }
  console.log(`[PASS] Real PDF parsed natively: Vendor=${parsedDoc.vendorName}, Total=$${(parsedDoc.totalAmountCents / 100).toFixed(2)}`);
  proof.checks.push({
    check: "REAL_FILE_EXTRACTION",
    status: "PASS",
    file: "07_vector_digital_invoice.pdf",
    vendor: parsedDoc.vendorName,
    totalCents: parsedDoc.totalAmountCents
  });

  // 5. Authentic Cryptographic HMAC Validation
  console.log("5. Testing cryptographic HMAC verification (rejecting hardcoded passes)...");
  const badHeaders = {
    "x-wholeshare-signature": "forged_signature_000000000000000000000000000000000000000000000000",
    "x-wholeshare-timestamp": String(Math.floor(Date.now() / 1000))
  };
  const testPayload = JSON.stringify({ buyer: "attacker", amountCents: 10000 });
  const fakeCheck = verifyIngressSignature(badHeaders, testPayload);
  if (fakeCheck.valid) {
    throw new Error("Zero-Simulation Violation: Gateway accepted forged cryptographic signature.");
  }

  const validTimestamp = String(Math.floor(Date.now() / 1000));
  const validSig = signPayload(testPayload, validTimestamp);
  const validHeaders = {
    "x-wholeshare-signature": validSig,
    "x-wholeshare-timestamp": validTimestamp
  };
  const realCheck = verifyIngressSignature(validHeaders, testPayload);
  if (!realCheck.valid) {
    throw new Error("Zero-Simulation Violation: Gateway rejected valid signed HMAC payload.");
  }
  console.log("[PASS] Cryptographic verification authentic. Forgery rejected and valid signature accepted.");
  proof.checks.push({ check: "AUTHENTIC_HMAC_ENFORCEMENT", status: "PASS" });

  // 6. Live Local Qwen MLX Model Nonce Probe
  console.log("6. Verifying live local Qwen MLX model inference (dynamic nonce probe)...");
  const modelStart = Date.now();
  const testNonce = `probe_${crypto.randomBytes(4).toString("hex")}`;
  const modelRes = await modelClient.callChat({
    messages: [
      { role: "system", content: "You are an automated verification probe. Return only the requested token." },
      { role: "user", content: `Echo this exact token: ${testNonce}` }
    ],
    temperature: 0.0,
    maxTokens: 600
  });
  const modelDurationMs = Date.now() - modelStart;
  const reply = modelRes.message?.content || "";
  if (!reply.includes(testNonce)) {
    throw new Error(`Zero-Simulation Violation: Local model failed dynamic nonce probe. Output: "${reply}"`);
  }
  if (!modelRes.usage || modelRes.usage.total_tokens === 0) {
    throw new Error("Zero-Simulation Violation: Model did not report authentic token usage.");
  }
  console.log(`[PASS] Live MLX Qwen model verified in ${modelDurationMs}ms (Tokens: ${modelRes.usage.total_tokens}, Echoed: ${testNonce}).`);
  proof.checks.push({
    check: "LIVE_MLX_MODEL_PROBE",
    status: "PASS",
    model: modelRes.model,
    tokens: modelRes.usage.total_tokens,
    durationMs: modelDurationMs
  });

  // 7. Live Local Qwen MLX Tool Calling Execution Probe
  console.log("7. Verifying live local Qwen MLX native function calling...");
  const toolStart = Date.now();
  const toolRes = await modelClient.callChat({
    messages: [
      { role: "system", content: "You are the Wholeshare autonomous procurement agent. When asked to inspect inventory, call the inspect_commercial_inventory tool." },
      { role: "user", content: "Inspect inventory for SKU-FLOUR-01 at warehouse WH-EAST-01." }
    ],
    tools: WHOLESHARE_TOOL_DECLARATIONS,
    temperature: 0.0,
    maxTokens: 600
  });
  const toolDurationMs = Date.now() - toolStart;
  const toolCalls = toolRes.message?.tool_calls || [];
  if (toolCalls.length === 0) {
    throw new Error("Zero-Simulation Violation: Model failed to emit tool call on live prompt.");
  }
  const firstTool = toolCalls[0];
  if (firstTool.function?.name !== "inspect_commercial_inventory") {
    throw new Error(`Zero-Simulation Violation: Unexpected tool called: ${firstTool.function?.name}`);
  }
  const toolArgs = JSON.parse(firstTool.function.arguments || "{}");
  if (!toolArgs.sku || !toolArgs.sku.includes("FLOUR")) {
    throw new Error(`Zero-Simulation Violation: Invalid tool arguments generated: ${firstTool.function.arguments}`);
  }
  console.log(`[PASS] Live function calling verified in ${toolDurationMs}ms (Tool: ${firstTool.function.name}, SKU: ${toolArgs.sku}).`);
  proof.checks.push({
    check: "LIVE_MLX_FUNCTION_CALLING",
    status: "PASS",
    tool: firstTool.function.name,
    durationMs: toolDurationMs
  });

  // 8. Finite State Machine Invariant Guard
  console.log("8. Verifying Finite State Machine illegal transition defense...");
  const testCoalition = {
    id: "coalition_audit_01",
    status: "FORMING",
    targetAmountCents: 100000,
    currentAmountCents: 20000
  };

  if (canTransition("FORMING", "SETTLED")) {
    throw new Error("Zero-Simulation Violation: FSM permitted illegal skip from FORMING to SETTLED.");
  }

  let transitionBlocked = false;
  try {
    transitionCoalitionState(testCoalition, "SETTLED");
  } catch (err) {
    transitionBlocked = true;
  }

  if (!transitionBlocked) {
    throw new Error("Zero-Simulation Violation: FSM transition execution did not throw on illegal state jump.");
  }
  console.log("[PASS] Finite State Machine guard verified. Illegal transition blocked.");
  proof.checks.push({ check: "FSM_INVARIANT_DEFENSE", status: "PASS" });

  // 9. Durable Event Journal Lineage Audit
  console.log("9. Verifying operational durable event journal integrity...");
  const journalPath = resolve(process.cwd(), "data/durable_journal.json");
  if (!existsSync(journalPath)) {
    throw new Error(`Zero-Simulation Violation: Durable journal missing: ${journalPath}`);
  }

  const rawJournal = readFileSync(journalPath, "utf-8");
  const journalLines = rawJournal.trim().split("\n").filter(Boolean);
  if (journalLines.length === 0) {
    throw new Error("Zero-Simulation Violation: Durable journal is empty.");
  }

  const latestEntry = JSON.parse(journalLines[journalLines.length - 1]);
  if (!latestEntry.loggedAt || isNaN(Date.parse(latestEntry.loggedAt))) {
    throw new Error("Zero-Simulation Violation: Journal entry missing valid ISO loggedAt timestamp.");
  }
  console.log(`[PASS] Durable event journal verified (${journalLines.length} events recorded, latest at ${latestEntry.loggedAt}).`);
  proof.checks.push({
    check: "DURABLE_JOURNAL_INTEGRITY",
    status: "PASS",
    eventsCount: journalLines.length,
    latestTimestamp: latestEntry.loggedAt
  });

  proof.verdict = "ALL_CHECKS_PASSED_ZERO_SIMULATION_GUARANTEED";
  writeFileSync("docs/assets/zero_simulation_proof.json", JSON.stringify(proof, null, 2));

  console.log("\nZero-Simulation Proof saved to docs/assets/zero_simulation_proof.json.");
  console.log("Audit complete. All 9 layers verified with live models, live APIs, and authentic data.");
}

main().catch(err => {
  console.error("\nZERO-SIMULATION AUDIT FAILURE:", err.message);
  process.exit(1);
});

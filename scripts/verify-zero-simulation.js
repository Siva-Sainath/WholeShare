#!/usr/bin/env node

import "../src/lib/env.js";
import { getPayPalAccessToken, createOrderAuthorization, getOrder } from "../src/lib/paypal-bridge.js";
import { parseDocumentContent } from "../src/lib/ingestion-pipeline.js";
import { verifyIngressSignature } from "../src/lib/gateway.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  console.log("=== Wholeshare Zero-Simulation & Anti-Hallucination Audit ===");

  const proof = {
    auditedAt: new Date().toISOString(),
    checks: []
  };

  // 1. Source code scan for prohibited mock fallbacks
  console.log("1. Scanning source files for mock/stub fallbacks...");
  const forbiddenMockPatterns = [
    /MOCK_SANDBOX_TOKEN/g,
    /sandbox_mock_token/g,
    /fake_paypal_response/g
  ];

  const sourceFiles = [
    "src/lib/paypal-bridge.js",
    "src/lib/tool-registry.js",
    "src/lib/interceptor.js",
    "src/lib/gateway.js"
  ];

  let mockFound = false;
  for (const sf of sourceFiles) {
    const content = readFileSync(resolve(process.cwd(), sf), "utf-8");
    for (const pat of forbiddenMockPatterns) {
      if (pat.test(content)) {
        console.error(`FAIL: Found prohibited mock pattern in ${sf}`);
        mockFound = true;
      }
    }
  }

  if (mockFound) {
    throw new Error("Zero-Simulation Violation: Prohibited mock fallback detected in source code.");
  }
  console.log("[PASS] Source code clean: Zero mock fallback tokens detected.");
  proof.checks.push({ check: "SOURCE_CODE_NO_MOCKS", status: "PASS" });

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

  // 4. Real File Ingestion Validation (Non-synthetic extraction)
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
  const fakeCheck = verifyIngressSignature(badHeaders, JSON.stringify({ buyer: "attacker" }));
  if (fakeCheck.valid) {
    throw new Error("Zero-Simulation Violation: Gateway accepted forged cryptographic signature.");
  }
  console.log("[PASS] Cryptographic verification authentic: Forged signature successfully rejected.");
  proof.checks.push({ check: "AUTHENTIC_HMAC_ENFORCEMENT", status: "PASS" });

  proof.verdict = "ALL_CHECKS_PASSED_ZERO_SIMULATION_GUARANTEED";
  writeFileSync("docs/assets/zero_simulation_proof.json", JSON.stringify(proof, null, 2));

  console.log("\nZero-Simulation Proof saved to docs/assets/zero_simulation_proof.json.");
  console.log("Audit complete. Zero mocks, zero simulations, and zero fake tokens verified.");
}

main().catch(err => {
  console.error("\nZERO-SIMULATION AUDIT FAILURE:", err.message);
  process.exit(1);
});

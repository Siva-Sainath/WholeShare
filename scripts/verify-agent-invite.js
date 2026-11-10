#!/usr/bin/env node

/**
 * Wholeshare Agent Invite Verification Gate
 * Verifies invite creation, manifest discovery, 422 validations, matchmaking,
 * PayPal Sandbox Orders v2 quote, token revocation, and headless browser UI.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer";
import { createWebServer } from "../src/web/server.js";
import { executeTool } from "../src/lib/tool-registry.js";

const TEST_PORT = 3188;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const EVIDENCE_DIR = resolve(process.cwd(), "docs/assets/gemini-phase10");

mkdirSync(EVIDENCE_DIR, { recursive: true });

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runVerification() {
  console.log("=== Wholeshare Agent Invite Verification Suite ===\n");

  const server = createWebServer();
  await new Promise((resolveReady) => {
    server.listen(TEST_PORT, resolveReady);
  });
  console.log(`Test server running at ${BASE_URL}`);

  try {
    // ------------------------------------------------------------------------
    // GATE 2: Invite Creation & Manifest Fetch
    // ------------------------------------------------------------------------
    console.log("\n[1/6] Testing invite generation and manifest contract...");
    const createRes = await fetch(`${BASE_URL}/api/v1/agent-invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ createdBy: "demo-workspace" })
    });
    assert(createRes.status === 201, `Invite creation returned status ${createRes.status}`);
    const inviteData = await createRes.json();
    assert(typeof inviteData.token === "string" && inviteData.token.length === 32, "Token must be 32 characters.");
    assert(inviteData.inviteUrl.includes(inviteData.token), "Invite URL must contain token.");
    console.log(`Generated invite token: ${inviteData.token}`);

    const manifestRes = await fetch(`${BASE_URL}/api/v1/agent/${inviteData.token}`);
    assert(manifestRes.status === 200, `Manifest fetch returned status ${manifestRes.status}`);
    const manifest = await manifestRes.json();
    assert(manifest.platform === "WholeShare", "Manifest platform must be WholeShare.");
    assert(typeof manifest.what === "string" && manifest.what.length > 20, "Manifest must contain what description.");
    assert(Array.isArray(manifest.requiredProfile?.required), "requiredProfile must list required fields.");
    const requiredFields = manifest.requiredProfile.required;
    const expectedFields = ["businessName", "contactEmail", "product", "unitsWanted", "city", "countryCode"];
    for (const f of expectedFields) {
      assert(requiredFields.includes(f), `Required field ${f} missing from manifest.`);
    }
    assert(Array.isArray(manifest.rules) && manifest.rules.length >= 4, "Manifest must declare rules.");

    const manifestPath = resolve(EVIDENCE_DIR, "agent-manifest.json");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    console.log(`Saved manifest to ${manifestPath}`);

    // ------------------------------------------------------------------------
    // GATE 3: 422 Incomplete Profile & Ambiguous Product Rejections
    // ------------------------------------------------------------------------
    console.log("\n[2/6] Testing HTTP 422 validation rejections...");
    // 3a: Missing required field (city missing)
    const missingFieldRes = await fetch(`${BASE_URL}/api/v1/agent/onboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: inviteData.token,
        businessName: "Acme Roasting Co",
        contactEmail: "procurement@acme.com",
        product: "organic-flour-50lb",
        unitsWanted: 15,
        countryCode: "US"
      })
    });
    assert(missingFieldRes.status === 422, `Missing field request must return 422. Received: ${missingFieldRes.status}`);
    const missingFieldData = await missingFieldRes.json();
    assert(Array.isArray(missingFieldData.missingFields), "422 response must list missingFields.");
    assert(missingFieldData.missingFields.includes("city"), "missingFields must contain 'city'.");
    console.log("Verified missing field rejection with HTTP 422 and missingFields list.");

    // 3b: Ambiguous product name matching multiple SKUs
    const ambiguousRes = await fetch(`${BASE_URL}/api/v1/agent/onboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: inviteData.token,
        businessName: "Acme Roasting Co",
        contactEmail: "procurement@acme.com",
        product: "flour",
        unitsWanted: 15,
        city: "Austin",
        countryCode: "US"
      })
    });
    assert(ambiguousRes.status === 422, `Ambiguous product must return 422. Received: ${ambiguousRes.status}`);
    const ambiguousData = await ambiguousRes.json();
    assert(Array.isArray(ambiguousData.matchingSkus) && ambiguousData.matchingSkus.length > 1, "Must return matchingSkus list.");
    console.log(`Verified ambiguous product rejection with ${ambiguousData.matchingSkus.length} candidate SKUs.`);

    // ------------------------------------------------------------------------
    // GATE 4: Complete Profile Onboarding & Matchmaking Scoring
    // ------------------------------------------------------------------------
    console.log("\n[3/6] Testing complete profile onboarding and clan matchmaking...");
    const validOnboardRes = await fetch(`${BASE_URL}/api/v1/agent/onboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: inviteData.token,
        businessName: "Bean and Leaf Coffee Roasters",
        contactEmail: "orders@beanandleaf.com",
        product: "organic-flour-50lb",
        unitsWanted: 20,
        city: "Austin",
        countryCode: "US"
      })
    });
    assert(validOnboardRes.status === 201, `Valid onboard must return 201. Received: ${validOnboardRes.status}`);
    const onboardData = await validOnboardRes.json();
    assert(typeof onboardData.sessionId === "string", "Must return a sessionId.");
    assert(Array.isArray(onboardData.matches) && onboardData.matches.length > 0, "Must return matches array.");
    assert(onboardData.matches.length <= 3, "Matches array must have at most 3 items.");
    assert(typeof onboardData.summary === "string" && onboardData.summary.length > 10, "Must return a relay summary.");
    console.log(`Onboard successful. Session ID: ${onboardData.sessionId}. Top match score: ${onboardData.matches[0].score}/100.`);

    // 4b: Honest scoring when score < 72 (no synthetic fallback invention)
    const lowScoreOnboardRes = await fetch(`${BASE_URL}/api/v1/agent/onboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: inviteData.token,
        businessName: "Specialty Minerals LLC",
        contactEmail: "ops@minerals.com",
        product: "sku-cleaning_supplies-ae-degreaser",
        unitsWanted: 5,
        city: "Honolulu",
        countryCode: "US"
      })
    });
    assert(lowScoreOnboardRes.status === 201, `Low score onboard must return 201. Received: ${lowScoreOnboardRes.status}`);
    const lowScoreData = await lowScoreOnboardRes.json();
    assert(Array.isArray(lowScoreData.matches), "Low score onboard must return real matches.");
    assert(lowScoreData.strongMatch === false, "strongMatch must be false when scores fall below 72.");
    console.log("Verified honest scoring. No fallback clans invented under score 72.");

    // ------------------------------------------------------------------------
    // GATE 5: Clan Choice & Real PayPal Sandbox Orders v2 AUTHORIZE Quote
    // ------------------------------------------------------------------------
    console.log("\n[4/6] Testing clan selection and PayPal Sandbox pledge quote...");
    const topClanId = onboardData.matches[0].clanId;
    const chooseRes = await fetch(`${BASE_URL}/api/v1/agent/sessions/${onboardData.sessionId}/choose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clanId: topClanId })
    });
    assert(chooseRes.status === 200, `Clan choose must return 200. Received: ${chooseRes.status}`);
    const chooseData = await chooseRes.json();
    assert(chooseData.quote?.clanId === topClanId, "Quoted clanId must match chosen clan.");
    console.log(`Clan chosen: ${chooseData.quote.clanName}. Quoted amount: $${(chooseData.quote.totalCents / 100).toFixed(2)}.`);

    const quoteRes = await fetch(`${BASE_URL}/api/v1/agent/pledge-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: onboardData.sessionId, units: 20 })
    });
    assert(quoteRes.status === 200, `Pledge quote must return 200. Received: ${quoteRes.status}`);
    const quoteData = await quoteRes.json();
    assert(typeof quoteData.orderId === "string" && quoteData.orderId.length > 5, "Must return PayPal orderId.");
    assert(typeof quoteData.approvalUrl === "string" && quoteData.approvalUrl.includes("paypal.com"), "Must return PayPal approvalUrl.");
    assert(quoteData.status === "AWAITING_APPROVAL", "Session status must be AWAITING_APPROVAL.");
    console.log(`Real PayPal Sandbox order created: ${quoteData.orderId}`);
    console.log(`Buyer approval URL: ${quoteData.approvalUrl}`);

    const pollRes = await fetch(`${BASE_URL}/api/v1/agent/sessions/${onboardData.sessionId}`);
    assert(pollRes.status === 200, "Session status poll must return 200.");
    const sessionRecord = await pollRes.json();
    assert(sessionRecord.status === "AWAITING_APPROVAL", "Polled session status must read AWAITING_APPROVAL.");
    assert(sessionRecord.paypalOrderId === quoteData.orderId, "Recorded PayPal orderId must match.");
    console.log("Verified session state transition to AWAITING_APPROVAL with PayPal order tracking.");

    // ------------------------------------------------------------------------
    // GATE 6: Token Revocation Enforcement
    // ------------------------------------------------------------------------
    console.log("\n[5/6] Testing invite token revocation...");
    const revokeRes = await fetch(`${BASE_URL}/api/v1/agent-invites/${inviteData.token}`, {
      method: "DELETE"
    });
    assert(revokeRes.status === 200, `Revoke must return 200. Received: ${revokeRes.status}`);
    const revokeData = await revokeRes.json();
    assert(revokeData.status === "REVOKED", "Status must be REVOKED.");

    const revokedManifestRes = await fetch(`${BASE_URL}/api/v1/agent/${inviteData.token}`);
    assert(revokedManifestRes.status === 410, `Revoked token access must return 410. Received: ${revokedManifestRes.status}`);
    console.log("Verified HTTP 410 enforcement for revoked tokens.");

    // ------------------------------------------------------------------------
    // TOOL REGISTRY TEST: agent_onboard_submit durable harness tool
    // ------------------------------------------------------------------------
    console.log("\n[5.5/6] Testing agent_onboard_submit tool in tool-registry...");
    const freshInviteRes = await fetch(`${BASE_URL}/api/v1/agent-invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ createdBy: "tool-test" })
    });
    const freshInvite = await freshInviteRes.json();

    const toolMissingResult = await executeTool("agent_onboard_submit", {
      token: freshInvite.token,
      businessName: "Test Co",
      contactEmail: "test@co.com"
    });
    assert(toolMissingResult.statusCode === 422, "Tool must return 422 on missing fields.");
    assert(toolMissingResult.missingFields.includes("city"), "Tool must list missing city.");

    const toolSuccessResult = await executeTool("agent_onboard_submit", {
      token: freshInvite.token,
      businessName: "Summit Coffee Roasters",
      contactEmail: "summit@coffee.com",
      product: "organic-flour-50lb",
      unitsWanted: 10,
      city: "Austin",
      countryCode: "US"
    });
    assert(toolSuccessResult.statusCode === 201, "Tool must return 201 on valid submission.");
    assert(typeof toolSuccessResult.sessionId === "string", "Tool must return sessionId.");
    console.log("Verified agent_onboard_submit tool execution and validation in tool-registry.");

    // ------------------------------------------------------------------------
    // GATE 7: Live Browser Capture of Human Fallback Interface
    // ------------------------------------------------------------------------
    console.log("\n[6/6] Capturing live browser screenshot of /#agent/<token>...");
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      const targetUrl = `${BASE_URL}/#agent/${freshInvite.token}`;
      console.log(`Navigating to ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

      // Wait for form input or submit button to render
      await page.waitForSelector("[data-testid='agent-onboard-submit-button'], #agent-onboard-form, input[name='businessName']", { timeout: 10000 });

      const screenshotPath = resolve(EVIDENCE_DIR, "agent-invite-page.png");
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`Screenshot saved to ${screenshotPath}`);
    } finally {
      await browser.close();
    }

    console.log("\n[PASS] All 6 verification gates passed successfully.");
  } finally {
    server.close();
  }
}

runVerification().catch((err) => {
  console.error("\n[FAIL] Verification gate failed:", err.message);
  process.exit(1);
});

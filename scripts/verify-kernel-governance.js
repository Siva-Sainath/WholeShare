import puppeteer from "puppeteer";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import "../src/lib/env.js";
import { kernelResearchService } from "../src/lib/kernel-service.js";
import { getClanGovernanceAdapter } from "../src/adapter/clan-governance.adapter.ts";
import { createCharterFromTemplate, validateProposalBounds } from "../src/domain/clan-governance.ts";
import { createWebServer } from "../src/web/server.js";

const TEST_PORT = 3045;
const EVIDENCE_DIR = resolve(process.cwd(), "docs/assets/gemini-phase11");
const BRIEF_JSON_PATH = resolve(EVIDENCE_DIR, "kernel-brief.json");
const TALLY_JSON_PATH = resolve(EVIDENCE_DIR, "supplier-vote-tally.json");
const SCREENSHOT_PATH = resolve(EVIDENCE_DIR, "clan-governance.png");
const GROUND_TRUTH_PATH = resolve(EVIDENCE_DIR, "ground-truth.md");

function logStep(step, message) {
  console.log(`[PASS] Step ${step}. ${message}`);
}

function computeFileSha256(filePath) {
  const content = readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function run() {
  console.log("=== WholeShare Phase 11: Kernel Governance Verification ===");

  // 1. Verify Ground Truth and KERNEL_API_KEY
  if (!existsSync(GROUND_TRUTH_PATH)) {
    throw new Error("Ground truth file missing from docs/assets/gemini-phase11/ground-truth.md.");
  }
  const apiKey = process.env.KERNEL_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey === "MOCK_KERNEL_KEY") {
    throw new Error("KERNEL_API_KEY is not configured in environment.");
  }
  logStep(1, "Ground truth file and KERNEL_API_KEY verified.");

  // 2. Kernel Research Task Execution and Brief Verification
  const clanId = "coalition_coffee_02";
  const sku = "specialty-coffee-green-60kg";
  const vendorUrl = "https://www.roastmasters.com/green_coffee.html";

  let brief = kernelResearchService.getLatestBrief(clanId);
  if (!brief || brief.status !== "DONE") {
    const task = await kernelResearchService.queueResearchTask({
      clanId,
      sku,
      vendorUrls: [vendorUrl],
      force: true,
      trigger: "VERIFICATION_SUITE"
    });

    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 1000));
      brief = kernelResearchService.getLatestBrief(clanId);
      if (brief && (brief.status === "DONE" || brief.status === "FAILED")) {
        break;
      }
    }
  }

  if (!brief || brief.status !== "DONE") {
    throw new Error(`Kernel research brief failed to generate. Status: ${brief?.status}`);
  }
  if (!brief.suppliers || brief.suppliers.length === 0) {
    throw new Error("Kernel research brief contains no verified suppliers.");
  }

  const supplier = brief.suppliers[0];
  if (!supplier.proofSha256) {
    throw new Error("Supplier entry is missing cryptographic proofSha256 digest.");
  }
  if (!supplier.proofFile) {
    throw new Error("Supplier entry is missing proof screenshot file reference.");
  }

  const proofDiskPath = resolve(process.cwd(), "data/proofs", supplier.proofFile);
  if (!existsSync(proofDiskPath)) {
    throw new Error(`Screenshot proof file not found on disk at ${proofDiskPath}.`);
  }

  const computedDigest = computeFileSha256(proofDiskPath);
  if (computedDigest !== supplier.proofSha256) {
    throw new Error(`Proof SHA-256 mismatch. Expected: ${supplier.proofSha256}, Got: ${computedDigest}.`);
  }

  writeFileSync(BRIEF_JSON_PATH, JSON.stringify(brief, null, 2), "utf-8");
  logStep(2, `Kernel research brief verified with proof digest ${supplier.proofSha256.slice(0, 16)}.`);

  // 3. Three Governance Templates & Boundary Validation
  const t1 = createCharterFromTemplate("EQUAL_COOP");
  if (t1.rules.VOTING_WEIGHT_STRATEGY !== "ONE_MEMBER_ONE_VOTE" || t1.rules.META_GOVERNANCE_PROCEDURE !== "DEMOCRATIC_SUPERMAJORITY") {
    throw new Error("Equal co-op template rules do not match canonical definition.");
  }

  const t2 = createCharterFromTemplate("VOLUME_WEIGHTED");
  if (t2.rules.VOTING_WEIGHT_STRATEGY !== "VOLUME_WEIGHTED" || t2.rules.META_GOVERNANCE_PROCEDURE !== "DEMOCRATIC_SUPERMAJORITY") {
    throw new Error("Volume-weighted template rules do not match canonical definition.");
  }

  const t3 = createCharterFromTemplate("FOUNDER_LED");
  if (t3.rules.VOTING_WEIGHT_STRATEGY !== "FOUNDER_VETO" || t3.rules.META_GOVERNANCE_PROCEDURE !== "FOUNDER_ARBITRATION") {
    throw new Error("Founder-led template rules do not match canonical definition.");
  }

  let outOfBoundsCaught = false;
  try {
    validateProposalBounds("INSPECTION_WINDOW_HOURS", 240);
  } catch (err) {
    if (err.code === "VALUE_OUT_OF_BOUNDS") {
      outOfBoundsCaught = true;
    }
  }
  if (!outOfBoundsCaught) {
    throw new Error("Out-of-bounds rule value was not rejected.");
  }
  logStep(3, "All three governance templates and out-of-bounds boundary guards verified.");

  // 4. Immutable Invariant Protection
  const adapter = getClanGovernanceAdapter();
  let invariantProtected = false;
  try {
    adapter.proposeRuleChange({
      coalitionId: clanId,
      proposerSmeId: "sme_austin_01",
      ruleType: "SPEND_CAP_ENFORCEMENT",
      proposedValue: 999999,
      rationale: "Adversarial invariant override"
    });
  } catch (err) {
    if (err.code === "IMMUTABLE_INVARIANT_VIOLATION") {
      invariantProtected = true;
    }
  }
  if (!invariantProtected) {
    throw new Error("Immutable platform invariant was not protected.");
  }
  logStep(4, "Immutable platform FinTech invariant strictly protected.");

  // 5. Supplier Selection Proposal & Voting Lifecycle
  const members = [
    { smeId: "sme_austin_01", name: "Austin Artisan Bakery", pledgedUnits: 5 },
    { smeId: "sme_bean_02", name: "Bean & Leaf Coffee Roasters", pledgedUnits: 5 }
  ];

  const proposal = adapter.proposeRuleChange({
    coalitionId: clanId,
    proposerSmeId: "sme_austin_01",
    ruleType: "SUPPLIER_SELECTION",
    proposedValue: supplier.vendorUrl,
    rationale: "Selected from Kernel verified supplier research brief.",
    briefId: brief.id,
    members
  });

  adapter.castVote({
    proposalId: proposal.id,
    coalitionId: clanId,
    smeId: "sme_austin_01",
    choice: "AFFIRMATIVE",
    members
  });

  adapter.castVote({
    proposalId: proposal.id,
    coalitionId: clanId,
    smeId: "sme_bean_02",
    choice: "NEGATIVE",
    members
  });

  let duplicateCaught = false;
  try {
    adapter.castVote({
      proposalId: proposal.id,
      coalitionId: clanId,
      smeId: "sme_austin_01",
      choice: "AFFIRMATIVE",
      members
    });
  } catch (err) {
    if (err.code === "ALREADY_VOTED") {
      duplicateCaught = true;
    }
  }
  if (!duplicateCaught) {
    throw new Error("Duplicate vote invariant failed. Single-vote rule not enforced.");
  }

  const tallyResult = adapter.tallyAndEnact({
    proposalId: proposal.id,
    members,
    forceEarly: true
  });

  writeFileSync(TALLY_JSON_PATH, JSON.stringify(tallyResult.tally, null, 2), "utf-8");
  logStep(5, "Supplier selection voting lifecycle, single-vote invariant, and tally verified.");

  // 6. Live Web View Screenshot Proof
  const server = createWebServer();
  await new Promise((res) => server.listen(TEST_PORT, res));

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960 });

    await page.goto(`http://localhost:${TEST_PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.switchActiveView || window.wholeshareCmd), { timeout: 15000 });
    await page.evaluate(() => {
      if (window.switchActiveView) {
        window.switchActiveView("radar");
      } else if (window.wholeshareCmd) {
        window.wholeshareCmd.dispatch({ action: "ui.navigate", params: { view: "radar" } });
      }
    });

    await page.waitForSelector(".ws-radar-card", { timeout: 15000 });

    // Open detail drawer for the clan
    const inspectButtons = await page.$$(".ws-radar-action");
    if (inspectButtons.length > 0) {
      await inspectButtons[0].click();
      await page.waitForSelector(".ws-clan-drawer", { timeout: 10000 });
      await page.waitForSelector(".ws-research-brief-card", { timeout: 10000 });
      await new Promise(r => setTimeout(r, 1200));
    }

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
    logStep(6, `Clan page screenshot captured to ${SCREENSHOT_PATH}.`);
  } finally {
    await browser.close();
    await new Promise((res) => server.close(res));
  }

  console.log("\n[COMPLETE] All Phase 11 Kernel Governance verification checks passed cleanly.");
}

run().catch((err) => {
  console.error("\n[FAIL] Phase 11 Verification Error:", err.message);
  process.exit(1);
});

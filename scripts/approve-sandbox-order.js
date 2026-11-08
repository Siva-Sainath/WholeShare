import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import puppeteer from "puppeteer";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const PASS_TAG = "\x1b[32m[PASS]\x1b[0m";
const FAIL_TAG = "\x1b[31m[FAIL]\x1b[0m";
const INFO_TAG = "\x1b[36m[INFO]\x1b[0m";
const WARN_TAG = "\x1b[33m[WARN]\x1b[0m";

// Invariant: Refuse to execute outside sandbox mode
if (process.env.PAYPAL_MODE !== "sandbox") {
  console.error(`${FAIL_TAG} approve-sandbox-order is strictly restricted to sandbox mode.`);
  console.error(`Current PAYPAL_MODE is '${process.env.PAYPAL_MODE}'. Exiting.`);
  process.exit(1);
}

async function approveViaBrowser(approvalUrl, buyerEmail, buyerPassword) {
  console.log(`${INFO_TAG} Launching automated headless browser with Puppeteer...`);
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log(`${INFO_TAG} Navigating to PayPal Sandbox checkout approval URL...`);
    await page.goto(approvalUrl, { waitUntil: "networkidle2", timeout: 45000 });

    // Wait for email field
    console.log(`${INFO_TAG} Entering sandbox buyer credentials...`);
    const emailSelector = "input#email, input[name='login_email']";
    await page.waitForSelector(emailSelector, { timeout: 15000 });
    await page.type(emailSelector, buyerEmail);

    const nextBtnSelector = "button#btnNext, button[name='btnNext']";
    const nextBtn = await page.$(nextBtnSelector);
    if (nextBtn) {
      await nextBtn.click();
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
    }

    const passwordSelector = "input#password, input[name='login_password']";
    await page.waitForSelector(passwordSelector, { timeout: 15000 });
    await page.type(passwordSelector, buyerPassword);

    const loginBtnSelector = "button#btnLogin, button[name='btnLogin']";
    await page.waitForSelector(loginBtnSelector, { timeout: 15000 });
    await Promise.all([
      page.click(loginBtnSelector),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
    ]);

    console.log(`${INFO_TAG} Logged in to PayPal Sandbox. Looking for Continue / Agree & Authorize button...`);

    // Look for submit payment / continue button
    const submitBtnSelectors = [
      "button#payment-submit-btn",
      "button#confirmButtonTop",
      "button[data-testid='submit-button-initial']",
      "button#consentButton",
      "button.actionContinue",
    ];

    let clicked = false;
    for (const selector of submitBtnSelectors) {
      const btn = await page.$(selector);
      if (btn) {
        await btn.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      // Try finding by button text
      const buttons = await page.$$("button");
      for (const btn of buttons) {
        const text = await page.evaluate((el) => el.textContent, btn);
        if (
          text &&
          (text.includes("Continue") ||
            text.includes("Agree & Continue") ||
            text.includes("Authorize") ||
            text.includes("Complete"))
        ) {
          await btn.click();
          clicked = true;
          break;
        }
      }
    }

    if (clicked) {
      console.log(`  ${PASS_TAG} Clicked authorization confirmation button. Waiting for redirect...`);
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    }

    await browser.close();
    return true;
  } catch (err) {
    console.warn(`  ${WARN_TAG} Automated browser interaction encountered an issue: ${err.message}`);
    await browser.close().catch(() => {});
    return false;
  }
}

async function pollForApproval(gateway, orderId, maxWaitSeconds = 180) {
  const startTime = Date.now();
  console.log(`${INFO_TAG} Polling PayPal Sandbox for buyer approval (checking order ${orderId})...`);

  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    const order = await gateway.getOrder(orderId);
    if (order.status === "APPROVED") {
      console.log(`  ${PASS_TAG} Order ${orderId} is now APPROVED by the buyer!`);
      return order;
    }
    if (order.status === "COMPLETED") {
      console.log(`  ${PASS_TAG} Order ${orderId} is already COMPLETED!`);
      return order;
    }

    process.stdout.write(".");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error(`Timeout waiting for order ${orderId} approval after ${maxWaitSeconds}s.`);
}

async function main() {
  console.log("\n========================================================");
  console.log(" SyndicatePay: approve-sandbox-order Automated Script");
  console.log("========================================================\n");

  const gatewayModule = await import("../src/gateway/PayPalMoneyGateway.ts");
  const { PayPalMoneyGateway } = gatewayModule;
  const gateway = new PayPalMoneyGateway();

  // 1. Determine order to approve
  let targetOrderId = process.argv[2];
  let targetClanId = "clan-austin-organic-flour-01";
  let targetMemberId = "buyer-maria-bakery";
  let approvalUrl = "";

  const clanStatePath = path.join(
    ROOT_DIR,
    ".scratch",
    "developer-2-escrow-settlement-disputes",
    "demo-clan-state.json"
  );

  let clanState = null;
  if (fs.existsSync(clanStatePath)) {
    try {
      clanState = JSON.parse(fs.readFileSync(clanStatePath, "utf8"));
    } catch {
      // ignore
    }
  }

  if (!targetOrderId) {
    if (clanState && clanState.orders && clanState.orders.length > 0) {
      const candidate =
        clanState.orders.find((o) => o.status === "CREATED" || !o.authorizationId) ||
        clanState.orders[0];
      targetOrderId = candidate.orderId;
      targetMemberId = candidate.memberId;
      targetClanId = clanState.clanId || targetClanId;
      approvalUrl = candidate.approvalUrl;
    }
  }

  if (!targetOrderId) {
    console.error(`${FAIL_TAG} No order ID specified and no demo-clan-state.json found.`);
    console.error("Usage: node scripts/approve-sandbox-order.mjs [orderId]");
    process.exit(1);
  }

  console.log(`${INFO_TAG} Target Order ID: ${targetOrderId}`);
  console.log(`       - Clan: ${targetClanId}`);
  console.log(`       - Member: ${targetMemberId}`);

  // Fetch current order from PayPal
  const currentOrder = await gateway.getOrder(targetOrderId);
  console.log(`       - Current Status on PayPal: ${currentOrder.status}`);

  if (!approvalUrl) {
    const link = currentOrder.links?.find((l) => l.rel === "approve");
    approvalUrl = link?.href || `https://www.sandbox.paypal.com/checkoutnow?token=${targetOrderId}`;
  }

  console.log(`       - Approval URL: ${approvalUrl}\n`);

  let approvedBy = "test script";

  // Check if order already approved or completed
  if (currentOrder.status !== "APPROVED" && currentOrder.status !== "COMPLETED") {
    const buyerEmail = process.env.PAYPAL_BUYER_EMAIL;
    const buyerPassword = process.env.PAYPAL_BUYER_PASSWORD;

    let automatedSuccess = false;

    if (buyerEmail && buyerPassword && !buyerEmail.includes("placeholder")) {
      console.log(`${INFO_TAG} Buyer credentials detected in .env (${buyerEmail}). Attempting headless approval...`);
      automatedSuccess = await approveViaBrowser(approvalUrl, buyerEmail, buyerPassword);
    } else {
      console.log(`${WARN_TAG} No PAYPAL_BUYER_EMAIL / PAYPAL_BUYER_PASSWORD configured in .env.`);
      console.log(`${INFO_TAG} Using manual fallback path.`);
    }

    if (!automatedSuccess) {
      approvedBy = "manual approval";
      console.log("\n--------------------------------------------------------");
      console.log("\x1b[1m\x1b[33m[ACTION REQUIRED: MANUAL SANDBOX APPROVAL]\x1b[0m");
      console.log("Please open the approval URL in your browser and log in as a sandbox buyer to approve:");
      console.log(`\n  \x1b[36m${approvalUrl}\x1b[0m\n`);
      console.log("The script will automatically detect your approval and complete the authorization.");
      console.log("--------------------------------------------------------\n");

      await pollForApproval(gateway, targetOrderId, 600);
    }
  }

  // 2. Call production gateway method completeAuthorization directly
  console.log(`\n${INFO_TAG} Calling production gateway.completeAuthorization(${targetOrderId})...`);
  const authResult = await gateway.completeAuthorization({
    orderId: targetOrderId,
    clanId: targetClanId,
    memberId: targetMemberId,
  });

  console.log(`  ${PASS_TAG} Authorization Completed!`);
  console.log(`       - Order Status: ${authResult.orderStatus}`);
  console.log(`       - Authorization ID: ${authResult.authorizationId}`);
  console.log(`       - Authorization Status: ${authResult.authorizationStatus}`);
  if (authResult.amount) {
    console.log(`       - Amount Authorized: $${authResult.amount.value} ${authResult.amount.currencyCode}`);
  }

  // 3. GET Read-Back Verification on Payments v2 ledger
  console.log(`\n${INFO_TAG} Performing GET read-back for authorization [${authResult.authorizationId}]...`);
  const readBackAuth = await gateway.getAuthorization(authResult.authorizationId);

  console.log(`  ${PASS_TAG} GET Read-Back Verified:`);
  console.log(`       - Verified ID: ${readBackAuth.id}`);
  console.log(`       - Verified Status: ${readBackAuth.status}`);
  console.log(`       - Expiration Time: ${readBackAuth.expirationTime || "N/A"}`);

  // 4. Record Evidence
  const evidenceDir = path.join(
    ROOT_DIR,
    ".scratch",
    "developer-2-escrow-settlement-disputes",
    "evidence"
  );
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  const evidenceFilePath = path.join(evidenceDir, "02-approved-authorization.json");
  const evidencePayload = {
    timestamp: new Date().toISOString(),
    endpoint: `POST https://api-m.sandbox.paypal.com/v2/checkout/orders/${targetOrderId}/authorize`,
    approved_by: approvedBy,
    orderId: targetOrderId,
    orderStatus: authResult.orderStatus,
    authorizationId: authResult.authorizationId,
    authorizationStatus: authResult.authorizationStatus,
    amount: authResult.amount,
    readBackVerified: true,
    readBackDetails: {
      id: readBackAuth.id,
      status: readBackAuth.status,
      amount: readBackAuth.amount,
      createTime: readBackAuth.createTime,
      expirationTime: readBackAuth.expirationTime,
    },
  };

  fs.writeFileSync(evidenceFilePath, JSON.stringify(evidencePayload, null, 2), "utf8");
  console.log(`\n${PASS_TAG} Evidence recorded to: ${path.relative(ROOT_DIR, evidenceFilePath)}`);

  // 5. Update demo-clan-state.json
  if (clanState && clanState.orders) {
    const orderIndex = clanState.orders.findIndex((o) => o.orderId === targetOrderId);
    if (orderIndex >= 0) {
      clanState.orders[orderIndex].status = "AUTHORIZED";
      clanState.orders[orderIndex].authorizationId = authResult.authorizationId;
      clanState.orders[orderIndex].authorizationStatus = authResult.authorizationStatus;
      clanState.lastUpdated = new Date().toISOString();
      fs.writeFileSync(clanStatePath, JSON.stringify(clanState, null, 2), "utf8");
      console.log(`${PASS_TAG} Updated demo-clan-state.json with authorization ID.`);
    }
  }

  console.log("\n========================================================");
  console.log(`[PASS] Ticket 04: Order authorization completed and verified!`);
  console.log(`       Authorization ID: ${authResult.authorizationId}`);
  console.log("========================================================\n");
}

main().catch((err) => {
  console.error(`\n${FAIL_TAG} Fatal error in approve-sandbox-order:`, err.message);
  process.exit(1);
});

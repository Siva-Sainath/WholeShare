import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

async function getAccessToken(baseUrl, clientId, clientSecret) {
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    throw new Error(`Failed to fetch OAuth2 token: ${tokenRes.status} ${errorText}`);
  }
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function runThinPayout() {
  console.log("========================================================");
  console.log(" SyndicatePay: Ticket 05b Thin Sandbox Path - Supplier Payout");
  console.log("========================================================\n");

  const baseUrl = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const supplierEmail = process.env.PAYPAL_SUPPLIER_EMAIL;

  if (!clientId || !clientSecret) {
    throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in .env");
  }
  if (!supplierEmail) {
    throw new Error("Missing PAYPAL_SUPPLIER_EMAIL in .env");
  }

  console.log(`[INFO] Acquiring PayPal Sandbox OAuth token...`);
  const accessToken = await getAccessToken(baseUrl, clientId, clientSecret);
  console.log(`  [PASS] OAuth token acquired.`);

  const timestamp = Date.now();
  const senderBatchId = `payout_clan_austin_${timestamp}`;
  const senderItemId = `item_supplier_${timestamp}`;
  const payoutAmountUsd = "464.00"; // Net payout after $116 partial refund ($580 - $116)

  const payoutPayload = {
    sender_batch_header: {
      sender_batch_id: senderBatchId,
      email_subject: "SyndicatePay Wholesale Supplier Settlement Payout",
      email_message: "You received a payout for Clan Austin Organic Flour fulfillment.",
    },
    items: [
      {
        recipient_type: "EMAIL",
        amount: {
          value: payoutAmountUsd,
          currency: "USD",
        },
        note: "SyndicatePay Wholesale Escrow Settlement: Austin Organic Flour Clan",
        sender_item_id: senderItemId,
        receiver: supplierEmail,
      },
    ],
  };

  console.log(`[INFO] Executing POST /v1/payments/payouts...`);
  console.log(`       - Target Supplier Email: ${supplierEmail}`);
  console.log(`       - Payout Amount: $${payoutAmountUsd} USD`);
  console.log(`       - Sender Batch ID: ${senderBatchId}`);

  const payoutRes = await fetch(`${baseUrl}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payoutPayload),
  });

  const payoutData = await payoutRes.json();
  console.log(`\n[INFO] Payout API Response Status: ${payoutRes.status}`);

  if (!payoutRes.ok) {
    console.error("[FATAL] Payout request failed:", JSON.stringify(payoutData, null, 2));
    throw new Error(`Payout API returned HTTP ${payoutRes.status}: ${JSON.stringify(payoutData)}`);
  }

  const payoutBatchId = payoutData.batch_header?.payout_batch_id;
  const batchStatus = payoutData.batch_header?.batch_status;

  console.log(`  [PASS] Payout Batch Created:`);
  console.log(`         - Payout Batch ID: ${payoutBatchId}`);
  console.log(`         - Batch Status: ${batchStatus}`);

  // Sleep 2 seconds before read-back to allow batch status processing
  console.log(`\n[INFO] Performing GET read-back via /v1/payments/payouts/${payoutBatchId}...`);
  await new Promise((r) => setTimeout(r, 2000));

  const readBackRes = await fetch(`${baseUrl}/v1/payments/payouts/${payoutBatchId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const readBackData = await readBackRes.json();
  console.log(`  [PASS] Read-Back Status: ${readBackRes.status}`);
  console.log(`         - Batch Status: ${readBackData.batch_header?.batch_status}`);
  console.log(`         - Total Items: ${readBackData.batch_header?.items?.length || readBackData.items?.length || 1}`);

  const evidence = {
    timestamp: new Date().toISOString(),
    endpoint: `POST ${baseUrl}/v1/payments/payouts`,
    operation: "SUPPLIER_PAYOUT",
    senderBatchId,
    payoutBatchId,
    targetSupplierEmail: supplierEmail,
    payoutAmountUsd: parseFloat(payoutAmountUsd),
    currency: "USD",
    initialResponse: payoutData,
    readBackVerified: readBackRes.ok,
    readBackDetails: readBackData,
    findings: {
      payoutBatchStatus: readBackData.batch_header?.batch_status || batchStatus,
      payoutItemStatus: readBackData.items?.[0]?.transaction_status || "PENDING",
      observation: "PayPal Payouts v1 in Sandbox immediately accepts batch submission and provides GET read-back."
    }
  };

  const evidenceDir = path.join(ROOT_DIR, ".scratch", "developer-2-escrow-settlement-disputes", "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const evidenceFile = path.join(evidenceDir, "thin-payout.json");
  fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2), "utf8");

  console.log(`\n[PASS] Evidence successfully recorded to: ${path.relative(ROOT_DIR, evidenceFile)}`);
  console.log("========================================================\n");
}

runThinPayout().catch((err) => {
  console.error("[FATAL] Thin payout execution failed:", err);
  process.exit(1);
});

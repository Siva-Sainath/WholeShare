#!/usr/bin/env node

/**
 * Wholeshare PayPal Developer Verification Lever (scripts/control-paypal.js)
 * Implements the "Build the Lever" and "Prove It Works" principles from pstack.
 * Drives live PayPal Sandbox APIs (Orders v2, Invoices, Subscriptions, Tracking)
 * and verifies timeout & outage error resilience.
 */

import "../src/lib/env.js";
import {
  getPayPalAccessToken,
  createOrderAuthorization,
  getOrder,
  generateInvoiceWithQr,
  registerShipmentTracking,
  createSubscriptionPlan,
  resetPayPalTokenCache,
  executePayPalRequest,
  PayPalApiError,
  PayPalConfigurationError
} from "../src/lib/paypal-bridge.js";
import {
  getPayPalToolkitToolNames,
  executePayPalToolkitAction
} from "../src/lib/paypal-toolkit-bridge.js";

const args = process.argv.slice(2);
const command = args[0] || "help";

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

const flags = parseFlags(args.slice(1));

async function handleDoctor() {
  console.log("=== PayPal Developer Health & Handshake Doctor ===");
  const startTime = Date.now();

  try {
    const token = await getPayPalAccessToken(10000);
    const durationMs = Date.now() - startTime;

    console.log(JSON.stringify({
      status: "HEALTHY",
      environment: "sandbox",
      apiBase: "https://api-m.sandbox.paypal.com",
      handshakeLatencyMs: durationMs,
      tokenPrefix: `${token.slice(0, 15)}...`,
      timeoutResilienceEnabled: true,
      credentialsConfigured: true
    }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({
      status: "UNHEALTHY",
      error: err.message,
      code: err.code || "UNKNOWN_ERROR",
      statusCode: err.status || 500,
      debugId: err.debugId || "none",
      recoveryAction: err instanceof PayPalConfigurationError
        ? "Add real sandbox credentials to .env."
        : "Verify network connectivity to api-m.sandbox.paypal.com."
    }, null, 2));
    process.exit(1);
  }
}

async function handleOrderAuthorize() {
  const amountCents = parseInt(flags.amount || "15000", 10);
  const ref = flags.ref || `ref_${Date.now()}`;
  console.log(`Executing Orders v2 soft authorization: $${(amountCents / 100).toFixed(2)} USD...`);

  const result = await createOrderAuthorization({
    amountCents,
    referenceId: ref
  });

  console.log(JSON.stringify(result, null, 2));
  console.log(`Approval URL: ${result.links.find(l => l.rel === "approve")?.href || "None"}`);
}

async function handleOrderGet() {
  const orderId = flags["order-id"] || args[1];
  if (!orderId) throw new Error("Missing --order-id flag.");
  console.log(`Fetching Order ${orderId}...`);

  const result = await getOrder(orderId);
  console.log(JSON.stringify(result, null, 2));
}

async function handleInvoiceQr() {
  const amountCents = parseInt(flags.amount || "125000", 10);
  const email = flags.email || "buyer@wholeshare.local";
  console.log(`Generating Invoicing v2 draft invoice and QR code for $${(amountCents / 100).toFixed(2)} USD...`);

  const result = await generateInvoiceWithQr({
    totalCents: amountCents,
    recipientEmail: email,
    memo: "Step-up KYC buyer verification"
  });

  console.log(JSON.stringify(result, null, 2));
}

async function handleSubscriptionPlan() {
  const name = flags.name || "Wholeshare Weekly Flour Syndicate";
  const amountCents = parseInt(flags.amount || "7500", 10);
  console.log(`Creating recurring billing plan: "${name}" at $${(amountCents / 100).toFixed(2)} USD / month...`);

  const result = await createSubscriptionPlan({
    name,
    unitPriceCents: amountCents,
    intervalUnit: "MONTH",
    intervalCount: 1
  });

  console.log(JSON.stringify(result, null, 2));
}

async function handleTrackingRegister() {
  const orderId = flags["order-id"] || "313726450L658723C";
  const trackingNumber = flags.tracking || "1Z9999999999999999";
  const carrier = flags.carrier || "UPS";
  console.log(`Registering carrier tracking for order ${orderId}...`);

  const result = await registerShipmentTracking({
    orderId,
    trackingNumber,
    carrier
  });

  console.log(JSON.stringify(result, null, 2));
}

async function handleSimulateTimeout() {
  console.log("Simulating PayPal API timeout (forcing 1ms deadline)...");
  resetPayPalTokenCache();

  try {
    await getPayPalAccessToken(1);
    console.error("FAIL: Expected timeout did not trigger.");
    process.exit(1);
  } catch (err) {
    if (err instanceof PayPalApiError && err.code === "PAYPAL_TIMEOUT") {
      console.log(JSON.stringify({
        simulation: "TIMEOUT_RESILIENCE",
        status: "PASS",
        errorCode: err.code,
        httpStatus: err.status,
        diagnosticMessage: err.message
      }, null, 2));
    } else {
      console.error("FAIL: Caught unexpected error:", err);
      process.exit(1);
    }
  }
}

async function handleToolkitList() {
  console.log("Fetching registered tools from @paypal/agent-toolkit...");
  const names = getPayPalToolkitToolNames();
  console.log(JSON.stringify({
    toolCount: names.length,
    tools: names
  }, null, 2));
}

async function handleToolkitExecute() {
  const toolName = flags.tool || "list_invoices";
  console.log(`Executing PayPal agent toolkit action: ${toolName}...`);

  const result = await executePayPalToolkitAction(toolName, {
    page_size: 5
  });

  console.log(JSON.stringify(result, null, 2));
}

async function handleSimulateOutage() {
  console.log("Simulating PayPal API network outage (connecting to unreachable endpoint)...");

  try {
    await executePayPalRequest("http://127.0.0.1:59999/v1/oauth2/token", {
      method: "POST"
    }, 2000);
    console.error("FAIL: Expected network error did not trigger.");
    process.exit(1);
  } catch (err) {
    if (err instanceof PayPalApiError && err.code === "PAYPAL_NETWORK_ERROR") {
      console.log(JSON.stringify({
        simulation: "NETWORK_OUTAGE_RESILIENCE",
        status: "PASS",
        errorCode: err.code,
        httpStatus: err.status,
        diagnosticMessage: err.message,
        recoveryAdvice: "Inspect PayPal developer network status at https://www.paypal-status.com."
      }, null, 2));
    } else {
      console.error("FAIL: Caught unexpected error:", err);
      process.exit(1);
    }
  }
}

async function handleSimulateAuthFail() {
  console.log("Simulating PayPal API authentication failure (invalid credentials)...");

  try {
    const invalidAuth = Buffer.from("INVALID_ID:INVALID_SECRET").toString("base64");
    await executePayPalRequest("/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${invalidAuth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    }, 5000);
    console.error("FAIL: Expected auth error did not trigger.");
    process.exit(1);
  } catch (err) {
    if (err instanceof PayPalApiError && err.code === "PAYPAL_AUTH_ERROR") {
      console.log(JSON.stringify({
        simulation: "AUTH_FAILURE_RESILIENCE",
        status: "PASS",
        errorCode: err.code,
        httpStatus: err.status,
        debugId: err.debugId,
        diagnosticMessage: err.message
      }, null, 2));
    } else {
      console.error("FAIL: Caught unexpected error:", err);
      process.exit(1);
    }
  }
}

function showHelp() {
  console.log(`
Wholeshare PayPal Developer Verification Lever
Usage: node scripts/control-paypal.js <command> [flags]

Commands:
  doctor                Runs live OAuth2 diagnostic check and measures latency
  order:authorize       Creates real Orders v2 authorization with intent: AUTHORIZE
  order:get             Fetches live Order status by --order-id
  invoice:qr            Creates Invoicing v2 draft invoice and generates base64 QR URL
  subscription:plan     Creates a recurring billing plan via PayPal Subscriptions API
  tracking:register     Registers carrier shipment tracking number for an order
  toolkit:list          Lists all 47 registered tools from @paypal/agent-toolkit
  toolkit:execute       Executes an agent toolkit action against PayPal Sandbox
  simulate:timeout      Verifies graceful timeout handling and diagnostic messaging
  simulate:outage       Verifies graceful handling when PayPal endpoint is unreachable
  simulate:auth-fail    Verifies explanatory error handling when credentials fail
  help                  Displays this manual

Flags:
  --amount <cents>      Amount in integer cents (e.g. 15000 = $150.00 USD)
  --ref <string>        Reference ID for buyer mandate
  --email <email>       Recipient email for invoices
  --order-id <id>       PayPal Order ID
  --tracking <number>   Carrier tracking number
  --carrier <carrier>   Shipping carrier (default: UPS)
  --tool <name>         Toolkit action name (default: list_invoices)
`);
}

switch (command) {
  case "doctor":
    await handleDoctor();
    break;
  case "order:authorize":
    await handleOrderAuthorize();
    break;
  case "order:get":
    await handleOrderGet();
    break;
  case "invoice:qr":
    await handleInvoiceQr();
    break;
  case "subscription:plan":
    await handleSubscriptionPlan();
    break;
  case "tracking:register":
    await handleTrackingRegister();
    break;
  case "toolkit:list":
    await handleToolkitList();
    break;
  case "toolkit:execute":
    await handleToolkitExecute();
    break;
  case "simulate:timeout":
    await handleSimulateTimeout();
    break;
  case "simulate:outage":
    await handleSimulateOutage();
    break;
  case "simulate:auth-fail":
    await handleSimulateAuthFail();
    break;
  case "help":
  default:
    showHelp();
    break;
}

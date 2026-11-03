import test from "node:test";
import assert from "node:assert/strict";
import { WHOLESHARE_TOOL_DECLARATIONS, executeTool } from "../src/lib/tool-registry.js";
import { WholeshareAgentHarness } from "../src/lib/agent-harness.js";
import { actionDispatcher } from "../src/lib/web-actions.js";

test("WHOLESHARE_TOOL_DECLARATIONS registers 28 distinct tools with JSON schemas", () => {
  assert.equal(WHOLESHARE_TOOL_DECLARATIONS.length, 28);
  const toolNames = WHOLESHARE_TOOL_DECLARATIONS.map(t => t.function.name);

  assert.ok(toolNames.includes("discover_wholesale_catalog"));
  assert.ok(toolNames.includes("discover_wholesale_supplier_tiers"));
  assert.ok(toolNames.includes("kernel_scrape_wholesale_tiers"));
  assert.ok(toolNames.includes("kernel_execute_browser_task"));
  assert.ok(toolNames.includes("kernel_research_web_fact"));
  assert.ok(toolNames.includes("verify_supplier_credibility"));
  assert.ok(toolNames.includes("verify_external_agent_proposal"));
  assert.ok(toolNames.includes("spawn_sme_mandate"));
  assert.ok(toolNames.includes("join_syndicate"));
  assert.ok(toolNames.includes("run_coalition_negotiation"));
  assert.ok(toolNames.includes("generate_step_up_invoice"));
  assert.ok(toolNames.includes("authorize_paypal_escrow"));
  assert.ok(toolNames.includes("register_shipment_tracking"));
  assert.ok(toolNames.includes("query_escrow_ledger"));
  assert.ok(toolNames.includes("create_order"));
  assert.ok(toolNames.includes("generate_invoice_qr_code"));
  assert.ok(toolNames.includes("create_shipment_tracking"));
  assert.ok(toolNames.includes("get_order"));
  assert.ok(toolNames.includes("get_invoice"));
  assert.ok(toolNames.includes("get_shipment_tracking"));
  assert.ok(toolNames.includes("grep_memory"));
  assert.ok(toolNames.includes("read_memory_entity"));
  assert.ok(toolNames.includes("ingest_business_document"));
  assert.ok(toolNames.includes("query_procurement_baseline"));
  assert.ok(toolNames.includes("import_google_drive_document"));
  assert.ok(toolNames.includes("capture_order_hold"));
  assert.ok(toolNames.includes("create_subscription_plan"));
  assert.ok(toolNames.includes("create_subscription"));

  for (const tool of WHOLESHARE_TOOL_DECLARATIONS) {
    assert.equal(tool.type, "function");
    assert.ok(tool.function.description.length > 10);
    assert.equal(tool.function.parameters.type, "object");
  }
});



test("executeTool executes discover_wholesale_catalog correctly", async () => {
  const result = await executeTool("discover_wholesale_catalog", { sku: "organic-flour-50lb" });
  assert.equal(result.sku, "organic-flour-50lb");
  assert.equal(result.basePriceUsd, 10);
  assert.ok(result.tiers.length >= 2);
});

test("executeTool executes spawn_sme_mandate and issues an ACP token", async () => {
  const result = await executeTool("spawn_sme_mandate", {
    id: `sme_test_${Date.now()}`,
    name: "Test Artisan Bakery",
    sku: "organic-flour-50lb",
    pledgedUnits: 150,
    maxAutoAuthorizeUsd: 1500,
    stepUpThresholdUsd: 1000
  });

  assert.equal(result.status, "SPAWNED");
  assert.ok(result.tokenId.startsWith("spt_"));
  assert.equal(result.maxAuthorizedCents, 150000);
});

test("executeTool handles generate_step_up_invoice with real PayPal sandbox or fails fast on missing credentials", async () => {
  const result = await executeTool("generate_step_up_invoice", {
    buyerId: "sme_artisan_test",
    amountCents: 144000,
    memo: "High value order step up"
  });

  if (result.status === "ERROR") {
    assert.match(result.error, /PayPal sandbox credentials missing or placeholder/);
  } else {
    assert.equal(result.status, "INVOICE_GENERATED");
    assert.ok(result.invoiceId);
    assert.ok(result.invoiceNumber);
    assert.ok(result.qrCodeUrl.includes("sandbox.paypal.com") || result.qrCodeUrl.startsWith("data:image"));
  }
});

test("executeTool handles register_shipment_tracking with real PayPal sandbox or fails fast on missing credentials", async () => {
  const result = await executeTool("register_shipment_tracking", {
    orderId: "ORD-TEST-1234",
    trackingNumber: "1Z9999999999999999",
    carrier: "UPS"
  });

  if (result.status === "ERROR") {
    assert.match(result.error, /PayPal sandbox credentials missing or placeholder/);
  } else {
    assert.equal(result.status, "TRACKING_REGISTERED");
    assert.equal(result.carrier, "UPS");
    assert.equal(result.statusLabel, "SHIPPED");
  }
});

test("WholeshareAgentHarness fails fast on unrecoverable model failure without fallback", async () => {
  const harness = new WholeshareAgentHarness();
  harness.callModelWithTools = async () => {
    throw new Error("Simulated model connection failure");
  };

  await assert.rejects(
    async () => {
      await harness.runSession({ prompt: "Autonomous deal cycle" });
    },
    /Agent execution failed at model level/
  );
});

test("WholeshareAgentHarness runs full session with broadcast telemetry", { timeout: 180000 }, async () => {
  actionDispatcher.resetState();
  const harness = new WholeshareAgentHarness();

  const session = await harness.runSession({
    prompt: "Spawn Artisan Flour House and lock escrow for coalition_flour_01"
  });

  assert.ok(session.sessionId.startsWith("sess_"));
  assert.equal(session.success, true);
  assert.ok(session.steps.length > 0);
  assert.ok(session.totalDurationMs >= 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { WHOLESHARE_TOOL_DECLARATIONS, executeTool } from "../src/lib/tool-registry.js";
import { WholeshareAgentHarness } from "../src/lib/agent-harness.js";
import { actionDispatcher } from "../src/lib/web-actions.js";

test("WHOLESHARE_TOOL_DECLARATIONS registers distinct tools with JSON schemas", () => {
  assert.ok(WHOLESHARE_TOOL_DECLARATIONS.length >= 74);
  assert.equal(new Set(WHOLESHARE_TOOL_DECLARATIONS.map((t) => t.function.name)).size, WHOLESHARE_TOOL_DECLARATIONS.length);
  const toolNames = WHOLESHARE_TOOL_DECLARATIONS.map(t => t.function.name);

  assert.ok(toolNames.includes("discover_wholesale_catalog"));
  assert.ok(toolNames.includes("prepare_pledge_quote"));
  assert.ok(toolNames.includes("open_paypal_dashboard"));
  assert.ok(toolNames.includes("file_damage_claim"));
  assert.ok(toolNames.includes("ui_open_group"));
  assert.ok(toolNames.includes("ui_open_my_group"));
  for (const name of ["present", "ui_open_report", "schedule_move_delivery", "schedule_extend_inspection", "schedule_book_slot", "schedule_resolve_conflicts", "schedule_undo"]) assert.ok(toolNames.includes(name), name);
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
  assert.ok(toolNames.includes("confirm_delivery_receipt"));
  assert.ok(toolNames.includes("submit_damage_claim"));
  assert.ok(toolNames.includes("approve_damage_claim"));
  assert.ok(toolNames.includes("respond_supplier_claim"));
  assert.ok(toolNames.includes("settle_supplier_payout"));
  assert.ok(toolNames.includes("explain_escrow_document"));
  assert.ok(toolNames.includes("create_governance_proposal"));
  assert.ok(toolNames.includes("cast_clan_vote"));
  assert.ok(toolNames.includes("tally_and_enact_proposal"));
  assert.ok(toolNames.includes("get_clan_constitution"));
  assert.ok(toolNames.includes("create_custom_clan_with_constitution"));
  assert.ok(toolNames.includes("evaluate_clan_voluntary_exit"));
  assert.ok(toolNames.includes("leave_clan"));
  assert.ok(toolNames.includes("issue_paypal_debt_invoice"));
  assert.ok(toolNames.includes("settle_member_debt"));
  assert.ok(toolNames.includes("check_buyer_liquidity_and_ar"));
  assert.ok(toolNames.includes("paypal_execute_toolkit_action"));
  assert.ok(toolNames.includes("ui_navigate_view"));
  assert.ok(toolNames.includes("ui_open_slide_over"));
  assert.ok(toolNames.includes("ui_trigger_onboarding"));
  assert.ok(toolNames.includes("ui_trigger_clan_setup"));
  assert.ok(toolNames.includes("ui_filter_clans"));
  assert.ok(toolNames.includes("ui_export_snapshot"));
  assert.ok(toolNames.includes("confirm_delivery_receipt_multimodal"));
  assert.ok(toolNames.includes("update_clan_subscription_terms"));

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
    assert.match(result.error, /(PayPal sandbox credentials missing or placeholder|insufficient permissions|HTTP 403)/);
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

test("WholeshareAgentHarness runs full session with broadcast telemetry", { timeout: 600000 }, async () => {
  actionDispatcher.resetState();
  const harness = new WholeshareAgentHarness();

  const session = await harness.runSession({
    prompt: "Spawn Artisan Flour House and lock escrow for coalition_flour_01",
    maxTurns: 2
  });

  assert.ok(session.sessionId.startsWith("sess_"));
  assert.equal(session.success, true);
  assert.ok(session.steps.length > 0);
  assert.ok(session.totalDurationMs >= 0);
});

test("executeTool executes confirm_delivery_receipt and starts inspection clock", async () => {
  const result = await executeTool("confirm_delivery_receipt", {
    coalitionId: `coalition_del_${Date.now()}`,
    smeId: "sme_baker_01",
    role: "supplier",
    trackingNumber: "1Z9999999999999999",
    carrierName: "UPS"
  });

  assert.equal(result.status, "SUCCESS");
  assert.ok(result.deliveryRecord);
  assert.equal(result.deliveryRecord.trackingNumber, "1Z9999999999999999");
});

test("executeTool executes submit_damage_claim with deterministic capping", async () => {
  const result = await executeTool("submit_damage_claim", {
    coalitionId: `coalition_claim_${Date.now()}`,
    smeId: "sme_baker_01",
    orderId: "ORD-999",
    captureId: "CAP-999",
    damagedUnits: 5,
    unitPriceCents: 2000,
    orderValueCents: 20000,
    description: "Torn sacks of flour",
    photoUrls: ["https://example.com/sacks.jpg"]
  });

  assert.equal(result.status, "SUCCESS");
  assert.ok(result.claim);
  assert.equal(result.claim.claimedAmount, 100);
});

test("executeTool executes explain_escrow_document for AI Concierge", async () => {
  const result = await executeTool("explain_escrow_document", {
    documentContent: "# Tri-Party Escrow Agreement\n\nSection 3.1 - Escrow Hold & Authorization\nFunds are placed on soft hold.\n\nSection 5.2 - 48-Hour Inspection Clock\nInspection window expires in 48 hours.\n\nSection 9.1 - Signatures\nBuyer Authorized Representative signs here.",
    userQuestion: "When do I sign Schedule B?"
  });

  assert.equal(result.status, "SUCCESS");
  assert.ok(result.summary);
  assert.ok(result.keyClauses.length >= 3);
  assert.ok(result.signatureChecklist.length >= 1);
  assert.ok(result.answer.includes("Section 5.2"));
});

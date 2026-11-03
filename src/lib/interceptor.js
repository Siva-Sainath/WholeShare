const PLATFORM_STEP_UP_CEILING_CENTS = 500000;

export function interceptNegotiationProposal(proposal, context) {
  const violations = [];
  const invariantsPassed = [];
  const evaluatedAt = new Date().toISOString();

  if (!proposal || typeof proposal !== "object") {
    return {
      valid: false,
      invariantsPassed: [],
      violations: ["Proposal must be a valid non-null object."],
      evaluatedAt
    };
  }

  const {
    coalitionId,
    sku,
    totalUnits,
    unitPriceCents,
    allocations,
    intent,
    idempotencyKey
  } = proposal;

  const {
    catalogPriceCents,
    mandates = new Map()
  } = context;

  // Invariant 1: Integer arithmetic
  const integersValid =
    Number.isInteger(totalUnits) && totalUnits > 0 &&
    Number.isInteger(unitPriceCents) && unitPriceCents > 0 &&
    Array.isArray(allocations) && allocations.length > 0 &&
    allocations.every(a => Number.isInteger(a.units) && a.units > 0 && Number.isInteger(a.amountCents) && a.amountCents > 0);

  if (integersValid) {
    invariantsPassed.push("INVARIANT_1_INTEGER_ARITHMETIC");
  } else {
    violations.push("All unit and currency figures must be positive integers.");
  }

  // Invariant 8: Soft authorization intent
  if (intent === "AUTHORIZE") {
    invariantsPassed.push("INVARIANT_8_SOFT_AUTHORIZATION_INTENT");
  } else {
    violations.push("Financial intent must strictly be 'AUTHORIZE'.");
  }

  // Invariant 10: Replay protection
  if (typeof idempotencyKey === "string" && idempotencyKey.trim().length >= 8) {
    invariantsPassed.push("INVARIANT_10_REPLAY_PROTECTION");
  } else {
    violations.push("Valid idempotency key is required.");
  }

  // Invariant 7: Discount floor
  if (Number.isInteger(catalogPriceCents) && unitPriceCents <= catalogPriceCents) {
    invariantsPassed.push("INVARIANT_7_DISCOUNT_FLOOR");
  } else {
    violations.push(`Unit price ${unitPriceCents} cents exceeds catalog price ${catalogPriceCents} cents.`);
  }

  if (!Array.isArray(allocations) || allocations.length === 0) {
    return {
      valid: false,
      invariantsPassed,
      violations,
      evaluatedAt
    };
  }

  // Invariant 9: Single allocation per buyer
  const buyerIds = allocations.map(a => a.buyerId);
  const uniqueBuyerIds = new Set(buyerIds);
  if (uniqueBuyerIds.size === buyerIds.length) {
    invariantsPassed.push("INVARIANT_9_SINGLE_ALLOCATION_PER_BUYER");
  } else {
    violations.push("Duplicate buyer allocations detected in coalition proposal.");
  }

  // Invariant 5: Exact allocation sum
  const sumUnits = allocations.reduce((acc, a) => acc + (a.units || 0), 0);
  if (sumUnits === totalUnits) {
    invariantsPassed.push("INVARIANT_5_EXACT_ALLOCATION_SUM");
  } else {
    violations.push(`Sum of allocated units (${sumUnits}) does not equal total coalition units (${totalUnits}).`);
  }

  // Invariant 6: Exact financial balancing
  const expectedTotalCents = totalUnits * unitPriceCents;
  const sumAllocatedCents = allocations.reduce((acc, a) => acc + (a.amountCents || 0), 0);
  if (sumAllocatedCents === expectedTotalCents) {
    invariantsPassed.push("INVARIANT_6_EXACT_FINANCIAL_BALANCING");
  } else {
    violations.push(`Allocated cents sum (${sumAllocatedCents}) does not balance total expected cents (${expectedTotalCents}).`);
  }

  // Invariants 2, 3, 4: Spend caps and step-up KYC verification
  let spendCapsRespected = true;
  let stepUpCorrect = true;

  const normalizedAllocations = allocations.map(alloc => {
    const mandate = mandates.get(alloc.buyerId);
    const buyerMax = mandate ? mandate.maxSpendCents : Infinity;
    const buyerThreshold = mandate ? mandate.stepUpThresholdCents : PLATFORM_STEP_UP_CEILING_CENTS;

    if (alloc.amountCents > buyerMax) {
      spendCapsRespected = false;
      violations.push(`Buyer ${alloc.buyerId} allocation of ${alloc.amountCents} cents exceeds mandate cap of ${buyerMax} cents.`);
    }

    const requiresStepUp = alloc.amountCents > buyerThreshold || alloc.amountCents > PLATFORM_STEP_UP_CEILING_CENTS;
    if (requiresStepUp && !alloc.stepUpRequired) {
      stepUpCorrect = false;
      violations.push(`Buyer ${alloc.buyerId} amount of ${alloc.amountCents} cents exceeds threshold without step-up flag.`);
    }

    return {
      ...alloc,
      stepUpRequired: requiresStepUp
    };
  });

  if (spendCapsRespected) {
    invariantsPassed.push("INVARIANT_2_HARD_SPEND_CAP");
  }

  if (stepUpCorrect) {
    invariantsPassed.push("INVARIANT_3_GLOBAL_PLATFORM_CEILING");
    invariantsPassed.push("INVARIANT_4_BUYER_MANDATE_STEP_UP");
  }

  const valid = violations.length === 0;

  return {
    valid,
    invariantsPassed,
    violations,
    evaluatedAt,
    normalizedProposal: valid ? {
      ...proposal,
      allocations: normalizedAllocations
    } : undefined
  };
}

export function interceptToolExecution(toolName, args = {}) {
  const violations = [];

  if (toolName === "create_order") {
    if (args.intent && args.intent !== "AUTHORIZE") {
      violations.push("Financial intent must strictly be 'AUTHORIZE'. Direct CAPTURE is prohibited.");
    }
    if (args.amountCents !== undefined && (!Number.isInteger(args.amountCents) || args.amountCents <= 0)) {
      violations.push("Amount in cents must be a positive integer.");
    }
  }

  if (toolName === "join_syndicate") {
    if (args.units !== undefined && (!Number.isInteger(args.units) || args.units <= 0)) {
      violations.push("Syndicate units must be a positive integer.");
    }
  }

  if (toolName === "generate_step_up_invoice" || toolName === "generate_invoice_qr_code") {
    const amount = args.amountCents || args.totalCents;
    if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0)) {
      violations.push("Invoice amount must be a positive integer in cents.");
    }
  }

  if (toolName === "spawn_sme_mandate") {
    if (args.pledgedUnits !== undefined && (!Number.isInteger(args.pledgedUnits) || args.pledgedUnits <= 0)) {
      violations.push("Pledged units must be a positive integer.");
    }
    if (args.maxAutoAuthorizeUsd !== undefined && (typeof args.maxAutoAuthorizeUsd !== "number" || args.maxAutoAuthorizeUsd <= 0)) {
      violations.push("Spend cap must be a positive number.");
    }
  }

  if (toolName === "capture_order_hold") {
    if (args.amountCents !== undefined && (!Number.isInteger(args.amountCents) || args.amountCents <= 0)) {
      violations.push("Capture amount in cents must be a positive integer.");
    }
    if (!args.authorizationId || typeof args.authorizationId !== "string" || !args.authorizationId.trim()) {
      violations.push("Authorization identifier is required for capture.");
    }
  }

  if (toolName === "create_subscription_plan") {
    if (args.amountCents !== undefined && (!Number.isInteger(args.amountCents) || args.amountCents <= 0)) {
      violations.push("Subscription plan amount in cents must be a positive integer.");
    }
  }

  if (toolName === "discover_wholesale_supplier_tiers" || toolName === "kernel_scrape_wholesale_tiers") {
    if (args.sku !== undefined && (typeof args.sku !== "string" || !args.sku.trim())) {
      violations.push("Wholesale SKU must be a non-empty string.");
    }
  }

  if (toolName === "kernel_execute_browser_task") {
    if (!args.targetUrl || typeof args.targetUrl !== "string" || !args.targetUrl.trim()) {
      violations.push("Target URL must be a non-empty string.");
    }
    if (!args.script || typeof args.script !== "string" || !args.script.trim()) {
      violations.push("Playwright script must be a non-empty string.");
    }
  }

  if (toolName === "kernel_research_web_fact") {
    if (!args.targetUrl || typeof args.targetUrl !== "string" || !args.targetUrl.trim()) {
      violations.push("Target URL must be a non-empty string.");
    }
    if (!args.query || typeof args.query !== "string" || !args.query.trim()) {
      violations.push("Research query must be a non-empty string.");
    }
  }

  if (toolName === "verify_supplier_credibility") {
    if (!args.targetUrl || typeof args.targetUrl !== "string" || !args.targetUrl.trim()) {
      violations.push("Target URL must be a non-empty string.");
    }
  }

  if (toolName === "verify_external_agent_proposal") {
    if (!args.targetUrl || typeof args.targetUrl !== "string" || !args.targetUrl.trim()) {
      violations.push("Target URL must be a non-empty string.");
    }
    if (args.claimedUnitPriceCents === undefined || args.claimedUnitPriceCents === null || isNaN(args.claimedUnitPriceCents) || args.claimedUnitPriceCents <= 0) {
      violations.push("Claimed unit price must be a positive integer cent value.");
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    evaluatedAt: new Date().toISOString()
  };
}


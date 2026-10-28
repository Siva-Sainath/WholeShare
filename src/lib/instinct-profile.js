import { instinctFs } from "./instinct-fs.js";
import { actionDispatcher } from "./web-actions.js";

export function generateInstinctProfileHeader(buyerId = "sme_austin_01") {
  const buyer = instinctFs.readEntity(buyerId) || {
    frontmatter: { id: buyerId, type: "organization" },
    body: "Verified SME commercial member."
  };

  const catalog = instinctFs.readEntity("catalog_flour_50lb") || {
    body: "Organic flour wholesale tier pricing."
  };

  const ledger = actionDispatcher.getLedgerState();
  const activeCoalition = ledger.find(c => c.status === "FORMING") || ledger[0] || {};

  const lifeContext = [
    `Current Active Buyer: ${buyer.frontmatter.id || buyerId}`,
    "Buyer Business Profile: Commercial Bakery & Food Service Operator.",
    "Verified KYB Status: Tier A with clean PayPal merchant reputation.",
    "Jurisdiction: United States (USD settlement exclusively)."
  ].join("\n");

  const autonomyCalibration = [
    "Autonomous Soft-Hold Ceiling: $1,500.00 USD (150000 cents).",
    "Step-Up KYC Escalation Boundary: Transactions exceeding $1,000.00 USD (100000 cents) require step-up QR invoice.",
    "Financial Intent Invariant: Only Orders v2 intent: 'AUTHORIZE' is permitted. Direct CAPTURE is strictly prohibited.",
    "Arithmetic Invariant: All financial numbers must be exact integer cents."
  ].join("\n");

  const communicationStyle = [
    "Tone: Concise, objective, declarative commerce prose.",
    "Syntax: One thought per sentence. Terminate with a period.",
    "Formatting: No long dashes (em-dashes or en-dashes). No mid-sentence colons.",
    "Purity: Zero emojis. Zero narrating comment slop."
  ].join("\n");

  const memoryOnePager = [
    `Active Coalition: ${activeCoalition.coalitionId || "coalition_flour_01"}`,
    `Target Commodity SKU: ${activeCoalition.sku || "organic-flour-50lb"}`,
    `Current Progress: ${activeCoalition.currentUnits || 300} / ${activeCoalition.targetUnits || 500} units pledged.`,
    `Units to Next Tier: ${Math.max(0, (activeCoalition.targetUnits || 500) - (activeCoalition.currentUnits || 300))} units needed for 28% volume discount.`,
    "Active Members: Austin Artisan Bakery (150 units), Bean & Leaf Roasters (150 units)."
  ].join("\n");

  const tasksBoard = [
    "- [ ] Discover wholesale tiers for new seasonal SKUs.",
    "- [ ] Onboard pledged buyer volume into active coalition.",
    "- [ ] Check if total coalition volume meets wholesale MOQ.",
    "- [ ] Lock escrow via PayPal Orders v2 soft authorization holds."
  ].join("\n");

  return `
=== INSTINCT IDENTITY PROFILE ===

## Life Context
${lifeContext}

## Autonomy Calibration
${autonomyCalibration}

## Channel Communication Style
${communicationStyle}

## Memory One-Pager
${memoryOnePager}

## Tasks & Todo Board
${tasksBoard}

=== END PROFILE ===
`.trim();
}

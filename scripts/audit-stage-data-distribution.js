import fs from 'node:fs';
import path from 'node:path';

// Define the 4 stages and 6 security layers from SYNDICATE_SPEC.pdf
const SPEC_REQUIREMENTS = {
  stage1: {
    name: 'Stage 1: Dual-Mode Ingress, Bounded Agent & Cash-Flow Pre-Flight',
    capabilities: [
      'Natural language SME onboarding & mandate parsing',
      'Bounded spend cap and policy checks',
      'Accounts receivable (AR) liquidity analysis & invoice reminders'
    ],
    goldCount: 0,
    bronzeAvailable: '52,470 enterprise AR records (ar_aging_query1.csv, enterprise_ar_invoices.csv)'
  },
  stage2: {
    name: 'Stage 2: Kernel Sourcing & Clan Matchmaking / Negotiation',
    capabilities: [
      'MOQ tier discount extraction (Tier 1/2/3)',
      'Multi-agent pledge negotiation & counter-offers',
      'Clan consensus & threshold met state transition'
    ],
    goldCount: 0,
    bronzeAvailable: '48,886 negotiation dialogues (craigslist_bargains, deal_or_no_deal) + 2,737 MOQ tiers'
  },
  stage3: {
    name: 'Stage 3: PayPal Multiparty Escrow, Step-Up QR & Batch Capture',
    capabilities: [
      'Orders v2 intent: AUTHORIZE soft holds',
      'Step-up QR invoice generation for > $1,000 spend',
      'Atomic batch capture & late-joiner tier-drop rebates'
    ],
    goldCount: 0,
    bronzeAvailable: 'Live PayPal sandbox integration & Order v2 schemas'
  },
  stage4: {
    name: 'Stage 4: Fulfillment Sync & APIMatic A2A Disputes',
    capabilities: [
      'Shipment tracking telemetry & 48hr inspection window',
      'Multimodal damage photo SHA-256 evidence verification',
      'Pro-rata partial refund negotiation (make_offer) & fund release'
    ],
    goldCount: 0,
    bronzeAvailable: '1,697 tracking events (fedex_tracking, smart_logistics) + 1,021 damage claims'
  },
  archetype_induction: {
    name: 'Sub-capability: Document Parsing & Business Archetype Induction',
    capabilities: [
      'Parse invoice/receipt text to induce business domain',
      'Recommend commercial catalog items'
    ],
    goldCount: 0,
    bronzeAvailable: '1,816 multi-industry commercial trade records'
  }
};

const goldPath = path.resolve('data/lake/system2_qwen/system2_reasoning_rollouts.jsonl');
const lines = fs.readFileSync(goldPath, 'utf8').trim().split('\n');

for (const line of lines) {
  const record = JSON.parse(line);
  const prompt = record.messages[1]?.content || '';

  if (prompt.startsWith('Analyze the following procurement document')) {
    SPEC_REQUIREMENTS.archetype_induction.goldCount++;
  } else if (prompt.includes('escrow commitment') || prompt.includes('authorization hold') || prompt.includes('exceeds the') || prompt.includes('QR') || prompt.includes('rebate') || prompt.includes('capture') || prompt.includes('Escrow')) {
    SPEC_REQUIREMENTS.stage3.goldCount++;
  } else if (prompt.includes('tracking') || prompt.includes('shortage') || prompt.includes('damage') || prompt.includes('dispute') || prompt.includes('DELIVERED') || prompt.includes('Carrier Tracking')) {
    SPEC_REQUIREMENTS.stage4.goldCount++;
  } else if (prompt.includes('Pledge') || prompt.includes('pledge') || prompt.includes('coalition') || prompt.includes('syndicate') || prompt.includes('Purchasing Clan') || prompt.includes('Negotiation Context') || prompt.includes('hardware stores') || prompt.includes('coffee') || prompt.includes('machining firms')) {
    SPEC_REQUIREMENTS.stage2.goldCount++;
  } else if (prompt.includes('AR') || prompt.includes('receivable') || prompt.includes('aging') || prompt.includes('liquidity')) {
    SPEC_REQUIREMENTS.stage1.goldCount++;
  } else {
    SPEC_REQUIREMENTS.stage2.goldCount++;
  }
}

console.log(JSON.stringify({
  totalGoldRecords: lines.length,
  specStages: SPEC_REQUIREMENTS
}, null, 2));


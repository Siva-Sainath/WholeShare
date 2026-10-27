import { instinctFs } from "./instinct-fs.js";
import {
  COMMERCIAL_ARCHETYPES,
  GENERALIZED_COMMERCIAL_FALLBACK,
  findMatchingArchetype,
  classifyMaterialCategory,
  isPoolingCandidate
} from "./commercial-archetypes.js";

export class BusinessInductionEngine {
  induceDomain(rawItems = []) {
    const descriptions = rawItems.map(i => `${i.description || ""} ${i.vendor || ""}`.trim()).filter(Boolean);
    const matchResult = findMatchingArchetype(descriptions);

    if (matchResult.score >= 1) {
      return {
        domain: matchResult.archetype.domain,
        archetypeId: matchResult.archetype.id,
        outputs: matchResult.archetype.primaryOutputs,
        confidence: Math.min(1.0, 0.5 + (matchResult.score * 0.12)),
        signature: matchResult.archetype
      };
    }

    const words = rawItems
      .flatMap(i => (i.description || "").toLowerCase().split(/\s+/))
      .filter(w => w.length > 3 && !/^\d+$/.test(w));

    const wordCounts = {};
    for (const w of words) {
      wordCounts[w] = (wordCounts[w] || 0) + 1;
    }
    const topWords = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

    const synthesizedDomain = topWords.length > 0
      ? `${topWords.join(" & ")} Commercial Operations`
      : GENERALIZED_COMMERCIAL_FALLBACK.domain;

    return {
      domain: synthesizedDomain,
      archetypeId: GENERALIZED_COMMERCIAL_FALLBACK.id,
      outputs: GENERALIZED_COMMERCIAL_FALLBACK.primaryOutputs,
      confidence: 0.65,
      signature: GENERALIZED_COMMERCIAL_FALLBACK
    };
  }

  categorizeMaterial(description, signature = GENERALIZED_COMMERCIAL_FALLBACK) {
    return classifyMaterialCategory(description, signature || GENERALIZED_COMMERCIAL_FALLBACK);
  }

  buildBillOfMaterials(rawItems = [], signature = GENERALIZED_COMMERCIAL_FALLBACK) {
    const itemMap = new Map();

    for (const item of rawItems) {
      const desc = (item.description || "Uncategorized Item").trim();
      const normKey = desc.toLowerCase().replace(/[^a-z0-9]/g, "_");

      const qty = parseInt(item.quantity, 10) || 1;
      const unitCents = Math.round(item.unitPriceCents || 0);
      const totalCents = Math.round(item.totalCents || (qty * unitCents));

      if (!itemMap.has(normKey)) {
        itemMap.set(normKey, {
          name: desc,
          category: this.categorizeMaterial(desc, signature),
          totalUnits: 0,
          totalCents: 0,
          unitPrices: [],
          occurrences: 0
        });
      }

      const entry = itemMap.get(normKey);
      entry.totalUnits += qty;
      entry.totalCents += totalCents;
      if (unitCents > 0) entry.unitPrices.push(unitCents);
      entry.occurrences += 1;
    }

    return Array.from(itemMap.values()).map(entry => {
      const sortedPrices = entry.unitPrices.sort((a, b) => a - b);
      const medianUnitPriceCents = sortedPrices.length > 0
        ? sortedPrices[Math.floor(sortedPrices.length / 2)]
        : 1000;

      const estimatedMonthlyUnits = Math.max(1, entry.totalUnits * 2);
      const annualSpendCents = entry.totalCents * 12;

      const poolingEligible = isPoolingCandidate(entry.name, signature);

      return {
        materialName: entry.name,
        materialCategory: entry.category,
        estimatedMonthlyUnits,
        medianUnitPriceCents,
        annualSpendCents,
        poolingEligible
      };
    });
  }

  deriveAutonomyBoundaries(bom = []) {
    const totalMonthlyCents = bom.reduce((sum, item) => sum + (item.estimatedMonthlyUnits * item.medianUnitPriceCents), 0);

    const safeBaselineCents = totalMonthlyCents > 0 ? totalMonthlyCents : 200000;
    const maxAutoAuthorizeCents = Math.min(500000, Math.max(50000, Math.round(safeBaselineCents * 0.25)));
    const stepUpThresholdCents = Math.min(1000000, Math.max(100000, Math.round(safeBaselineCents * 0.65)));

    return {
      monthlySpendCents: safeBaselineCents,
      maxAutoAuthorizeCents,
      stepUpThresholdCents,
      maxAutoAuthorizeUsd: Math.round(maxAutoAuthorizeCents / 100),
      stepUpThresholdUsd: Math.round(stepUpThresholdCents / 100)
    };
  }

  induceProfile(buyerId, rawItems = [], metadata = {}) {
    const domainResult = this.induceDomain(rawItems);
    const bom = this.buildBillOfMaterials(rawItems, domainResult.signature);
    const boundaries = this.deriveAutonomyBoundaries(bom);

    const poolingOpportunities = bom
      .filter(m => m.poolingEligible)
      .map(m => m.materialName);

    const profile = {
      buyerId,
      legalName: metadata.legalName || `SME Buyer ${buyerId}`,
      industryDomain: domainResult.domain,
      archetypeId: domainResult.archetypeId,
      confidence: domainResult.confidence,
      tradeDescription: `Autonomous commercial operator specializing in ${domainResult.domain}.`,
      primaryOutputs: domainResult.outputs,
      billOfMaterials: bom,
      boundaries,
      poolingOpportunities,
      inducedAt: new Date().toISOString()
    };

    const frontmatter = {
      id: buyerId,
      type: "organization",
      legalName: profile.legalName,
      businessProfile: profile.tradeDescription,
      tradeCategory: profile.industryDomain,
      archetypeId: profile.archetypeId,
      maxAutoAuthorizeUsd: boundaries.maxAutoAuthorizeUsd,
      stepUpThresholdUsd: boundaries.stepUpThresholdUsd,
      monthlySpendCents: boundaries.monthlySpendCents,
      poolingCount: poolingOpportunities.length
    };

    const bodyLines = [
      `# ${profile.legalName}`,
      "",
      `**Domain:** ${profile.industryDomain}`,
      `**Archetype:** ${profile.archetypeId}`,
      `**Confidence:** ${(profile.confidence * 100).toFixed(1)}%`,
      `**Description:** ${profile.tradeDescription}`,
      "",
      "## Primary Inferred Outputs",
      ...profile.primaryOutputs.map(o => `- ${o}`),
      "",
      "## Bill of Materials & Input Demand",
      "| Material | Category | Monthly Units | Median Unit Cost | Pooling Eligible |",
      "| :--- | :--- | :--- | :--- | :--- |",
      ...bom.map(m => `| ${m.materialName} | ${m.materialCategory} | ${m.estimatedMonthlyUnits} | $${(m.medianUnitPriceCents / 100).toFixed(2)} | ${m.poolingEligible ? "YES" : "NO"} |`),
      "",
      "## Autonomy & Risk Calibration",
      `- Monthly Procurement Baseline: $${(boundaries.monthlySpendCents / 100).toFixed(2)}`,
      `- Autonomous Spend Cap: $${boundaries.maxAutoAuthorizeUsd}.00`,
      `- Step-Up KYC Threshold: $${boundaries.stepUpThresholdUsd}.00`,
      "",
      "## Identified Group Purchasing Opportunities",
      ...poolingOpportunities.map(p => `- [[${p}]]`)
    ];

    const aliases = [buyerId, profile.legalName, profile.industryDomain];
    const facts = [
      `Domain: ${profile.industryDomain}`,
      `Archetype: ${profile.archetypeId}`,
      `Autonomy soft cap: $${boundaries.maxAutoAuthorizeUsd}`,
      `Step-up threshold: $${boundaries.stepUpThresholdUsd}`,
      `Monthly spend baseline: $${(boundaries.monthlySpendCents / 100).toFixed(2)}`,
      ...profile.primaryOutputs.map(o => `Primary output: ${o}`),
      ...poolingOpportunities.map(p => `Pooling commodity: ${p}`)
    ];

    instinctFs.writeEntity(
      buyerId,
      "organization",
      aliases,
      profile.legalName,
      facts,
      frontmatter,
      bodyLines.join("\n")
    );

    return profile;
  }
}

export const businessInduction = new BusinessInductionEngine();

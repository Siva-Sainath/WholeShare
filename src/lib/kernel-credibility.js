import { createBrowserSession, executePlaywright, captureScreenshot, deleteBrowserSession } from "./kernel-bridge.js";
import { resolve } from "node:path";

const SUSPICIOUS_TLDS = new Set([".tk", ".ml", ".ga", ".cf", ".gq", ".top", ".xyz", ".bid", ".loan"]);
const WIRE_ONLY_PATTERNS = [
  /wire transfer only/i,
  /western union/i,
  /moneygram/i,
  /crypto only/i,
  /zelle only/i,
  /gift card/i
];

export async function evaluateSupplierCredibility({ targetUrl, claimedPricing = null, captureProof = true } = {}) {
  if (!targetUrl || typeof targetUrl !== "string") {
    throw new Error("Target URL is required for supplier credibility evaluation.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (err) {
    throw new Error(`Invalid target URL: ${targetUrl}`);
  }

  const isHttps = parsedUrl.protocol === "https:";
  const hostname = parsedUrl.hostname.toLowerCase();
  const hasSuspiciousTld = Array.from(SUSPICIOUS_TLDS).some(tld => hostname.endsWith(tld));
  const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);

  const session = await createBrowserSession({
    stealth: true,
    headless: true,
    timeoutSeconds: 120
  });

  const sessionId = session.sessionId;

  try {
    const auditScript = `
      await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return await page.evaluate(() => {
        const bodyText = (document.body.innerText || '').toLowerCase();
        const html = document.documentElement.outerHTML.toLowerCase();

        const hasPhone = /(?:\\+?1[-. ]?)?\\(?([0-9]{3})\\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})/.test(bodyText);
        const hasAddress = /\\b\\d{1,5}\\s+([a-zA-Z0-9.]+)\\s+(street|st|avenue|ave|road|rd|blvd|boulevard|suite|ste|drive|dr|way|lane|ln)\\b/i.test(bodyText);
        const hasContactLink = Array.from(document.querySelectorAll('a')).some(a => {
          const href = (a.getAttribute('href') || '').toLowerCase();
          const txt = (a.innerText || '').toLowerCase();
          return href.includes('contact') || txt.includes('contact') || txt.includes('about us') || txt.includes('customer service');
        });

        const hasTermsOrPolicy = Array.from(document.querySelectorAll('a')).some(a => {
          const href = (a.getAttribute('href') || '').toLowerCase();
          const txt = (a.innerText || '').toLowerCase();
          return href.includes('terms') || href.includes('privacy') || href.includes('refund') || href.includes('return') ||
                 txt.includes('terms') || txt.includes('privacy') || txt.includes('refund') || txt.includes('return');
        });

        const hasPricing = bodyText.includes('$') || bodyText.includes('price') || bodyText.includes('cart') || bodyText.includes('catalog');

        const wireOnlyMatches = [];
        if (bodyText.includes('wire transfer only') || bodyText.includes('western union') || bodyText.includes('moneygram') || bodyText.includes('crypto only')) {
          wireOnlyMatches.push('wire_or_crypto_exclusive');
        }

        const prices = [];
        const priceRegex = /\\$([0-9]+(?:\\.[0-9]{2})?)/g;
        let match;
        while ((match = priceRegex.exec(bodyText)) !== null && prices.length < 20) {
          const num = parseFloat(match[1]);
          if (!isNaN(num) && num > 0) prices.push(num);
        }

        return {
          title: document.title,
          url: window.location.href,
          hasPhone,
          hasAddress,
          hasContactLink,
          hasTermsOrPolicy,
          hasPricing,
          wireOnlyMatches,
          samplePrices: prices.slice(0, 10),
          snippetCount: bodyText.length
        };
      });
    `;

    const execResult = await executePlaywright(sessionId, { code: auditScript });
    const domData = execResult.result || {};

    let proof = null;
    if (captureProof) {
      const proofsDir = resolve(process.cwd(), "data/proofs");
      const proofFileName = `credibility_proof_${Date.now()}.png`;
      const proofFilePath = resolve(proofsDir, proofFileName);
      const screenshot = await captureScreenshot(sessionId, { outputPath: proofFilePath });
      proof = {
        sha256: screenshot.sha256,
        filePath: proofFilePath,
        capturedAt: new Date().toISOString()
      };
    }

    const auditChecks = [];
    let riskScore = 0;

    if (!isHttps) {
      riskScore += 35;
      auditChecks.push({ check: "SSL_ENCRYPTION", status: "FAIL", detail: "Site does not use secure HTTPS protocol" });
    } else {
      auditChecks.push({ check: "SSL_ENCRYPTION", status: "PASS", detail: "Valid HTTPS protocol enforced" });
    }

    if (hasSuspiciousTld || isIpAddress) {
      riskScore += 40;
      auditChecks.push({ check: "DOMAIN_TRUST", status: "FAIL", detail: `High-risk domain suffix or raw IP: ${hostname}` });
    } else {
      auditChecks.push({ check: "DOMAIN_TRUST", status: "PASS", detail: `Legitimate commercial domain: ${hostname}` });
    }

    if (domData.hasAddress || domData.hasPhone || domData.hasContactLink) {
      auditChecks.push({ check: "PHYSICAL_ENTITY", status: "PASS", detail: "Verifiable contact endpoints and physical identity detected" });
    } else {
      riskScore += 25;
      auditChecks.push({ check: "PHYSICAL_ENTITY", status: "WARN", detail: "No explicit physical address or contact details discovered" });
    }

    if (domData.hasTermsOrPolicy) {
      auditChecks.push({ check: "COMMERCIAL_TERMS", status: "PASS", detail: "Published terms of service, return policy, or customer protections" });
    } else {
      riskScore += 20;
      auditChecks.push({ check: "COMMERCIAL_TERMS", status: "WARN", detail: "Missing published return, refund, or commercial terms" });
    }

    if (domData.wireOnlyMatches && domData.wireOnlyMatches.length > 0) {
      riskScore += 50;
      auditChecks.push({ check: "PAYMENT_SAFETY", status: "FAIL", detail: "Demands non-escrowable wire transfer, gift card, or cryptocurrency payment" });
    } else {
      auditChecks.push({ check: "PAYMENT_SAFETY", status: "PASS", detail: "No predatory or non-refundable payment demands detected" });
    }

    riskScore = Math.min(100, Math.max(0, riskScore));

    let credibilityTier;
    if (riskScore <= 20) {
      credibilityTier = "CREDIBLE_VERIFIED";
    } else if (riskScore <= 45) {
      credibilityTier = "REVIEW_RECOMMENDED";
    } else {
      credibilityTier = "FRAUD_ALERT_SUSPICIOUS";
    }

    return {
      status: "SUCCESS",
      targetUrl,
      hostname,
      pageTitle: domData.title || "N/A",
      riskScore,
      credibilityTier,
      isCredible: riskScore <= 45,
      auditChecks,
      samplePrices: domData.samplePrices || [],
      proof,
      summary: `Supplier at ${hostname} evaluated with risk score ${riskScore}/100 (${credibilityTier}). ${auditChecks.filter(c => c.status === "FAIL").length} critical failures detected.`
    };
  } finally {
    await deleteBrowserSession(sessionId).catch(() => {});
  }
}

export async function verifyExternalAgentClaim({ agentId, targetUrl, claimedUnitPriceCents, claimedProduct, captureProof = true } = {}) {
  if (!targetUrl) throw new Error("Target URL is required for agent claim verification.");
  if (!claimedUnitPriceCents || isNaN(claimedUnitPriceCents)) {
    throw new Error("Claimed unit price in integer cents is required.");
  }

  const credResult = await evaluateSupplierCredibility({ targetUrl, captureProof });
  const samplePrices = credResult.samplePrices || [];

  const claimedPriceDollars = claimedUnitPriceCents / 100;
  let closestPrice = null;
  let minDiff = Infinity;

  for (const p of samplePrices) {
    const diff = Math.abs(p - claimedPriceDollars);
    if (diff < minDiff) {
      minDiff = diff;
      closestPrice = p;
    }
  }

  const priceFound = closestPrice !== null && minDiff <= 0.50;
  const variancePct = closestPrice !== null ? ((claimedPriceDollars - closestPrice) / closestPrice) * 100 : null;

  let discrepancyVerdict = "VERIFIED_ACCURATE";
  if (!priceFound && samplePrices.length > 0) {
    if (claimedPriceDollars < Math.min(...samplePrices) * 0.8) {
      discrepancyVerdict = "DISCREPANCY_UNDERSTATED";
    } else if (claimedPriceDollars > Math.max(...samplePrices) * 1.2) {
      discrepancyVerdict = "DISCREPANCY_OVERSTATED";
    } else {
      discrepancyVerdict = "APPROXIMATE_MATCH";
    }
  }

  return {
    status: "SUCCESS",
    agentId,
    targetUrl,
    claimedProduct,
    claimedUnitPriceCents,
    claimedPriceDollars,
    closestScrapedPriceDollars: closestPrice,
    discrepancyVerdict,
    variancePct: variancePct ? Math.round(variancePct * 10) / 10 : null,
    supplierCredibility: credResult.credibilityTier,
    isApprovedForEscrow: credResult.isCredible && (discrepancyVerdict === "VERIFIED_ACCURATE" || discrepancyVerdict === "APPROXIMATE_MATCH"),
    proof: credResult.proof,
    auditSummary: `Claim from agent ${agentId || "external"} for ${claimedProduct || "item"} at $${claimedPriceDollars.toFixed(2)} evaluated against live portal ${targetUrl}. Verdict: ${discrepancyVerdict}. Credibility: ${credResult.credibilityTier}.`
  };
}


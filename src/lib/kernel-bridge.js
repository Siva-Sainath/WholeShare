import crypto from "node:crypto";
import { resolve } from "node:path";
import Kernel from "@onkernel/sdk";
import "./env.js";
import { storageDriver } from "./storage-driver.js";

const DEFAULT_TIMEOUT_SECONDS = 180;
let cachedKernelClient = null;

export class KernelConfigurationError extends Error {
  constructor(message = "Kernel API key is missing or invalid. Set KERNEL_API_KEY in .env.") {
    super(message);
    this.name = "KernelConfigurationError";
    this.code = "KERNEL_CONFIGURATION_ERROR";
  }
}

export class KernelApiError extends Error {
  constructor(message, { status, code = "KERNEL_API_ERROR", details } = {}) {
    super(message);
    this.name = "KernelApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function resetKernelClient() {
  cachedKernelClient = null;
}

export function getKernelClient() {
  if (cachedKernelClient) {
    return cachedKernelClient;
  }

  const apiKey = process.env.KERNEL_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey === "MOCK_KERNEL_KEY" || apiKey === "your_kernel_api_key_here") {
    throw new KernelConfigurationError(
      "Kernel API key is not configured. Set KERNEL_API_KEY in .env to a valid key from https://onkernel.com."
    );
  }

  cachedKernelClient = new Kernel({ apiKey });
  return cachedKernelClient;
}

export async function createBrowserSession({
  name,
  headless = true,
  stealth = true,
  timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  viewport = { width: 1920, height: 1080 }
} = {}) {
  const client = getKernelClient();
  try {
    const session = await client.browsers.create({
      name,
      headless,
      stealth,
      timeout_seconds: timeoutSeconds,
      viewport
    });

    return {
      sessionId: session.session_id,
      browserLiveViewUrl: session.browser_live_view_url,
      cdpWsUrl: session.cdp_ws_url,
      webdriverWsUrl: session.webdriver_ws_url,
      createdAt: session.created_at,
      stealth: session.stealth,
      headless: session.headless,
      timeoutSeconds: session.timeout_seconds
    };
  } catch (err) {
    if (err instanceof KernelConfigurationError) {
      throw err;
    }
    throw new KernelApiError(`Failed to create Kernel cloud browser: ${err.message}`, {
      status: err.status || 500,
      details: err
    });
  }
}

export async function executePlaywright(sessionId, { code, timeoutSec = 60, executor } = {}) {
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("Session ID is required for Playwright execution.");
  }
  if (!code || typeof code !== "string" || !code.trim()) {
    throw new Error("Code string is required for Playwright execution.");
  }

  const client = getKernelClient();
  try {
    const response = await client.browsers.playwright.execute(sessionId, {
      code,
      timeout_sec: timeoutSec,
      executor
    });

    return {
      success: response.success,
      result: response.result,
      error: response.error,
      stdout: response.stdout,
      stderr: response.stderr,
      tab: response.tab
    };
  } catch (err) {
    if (err instanceof KernelConfigurationError) {
      throw err;
    }
    throw new KernelApiError(`Playwright execution failed on Kernel browser ${sessionId}: ${err.message}`, {
      status: err.status || 500,
      details: err
    });
  }
}

export async function captureScreenshot(sessionId, { region, outputPath } = {}) {
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("Session ID is required to capture screenshot.");
  }

  const client = getKernelClient();
  try {
    const response = await client.browsers.computer.captureScreenshot(sessionId, region ? { region } : undefined);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    let savedPath = null;
    if (outputPath) {
      savedPath = outputPath;
      storageDriver.writeBinaryAtomic(savedPath, buffer);
    }

    return {
      buffer,
      sha256,
      outputPath: savedPath,
      sizeBytes: buffer.length
    };
  } catch (err) {
    if (err instanceof KernelConfigurationError) {
      throw err;
    }
    throw new KernelApiError(`Failed to capture screenshot on Kernel browser ${sessionId}: ${err.message}`, {
      status: err.status || 500,
      details: err
    });
  }
}

export async function deleteBrowserSession(sessionId) {
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return { deleted: false, error: "Missing sessionId" };
  }

  const client = getKernelClient();
  try {
    await client.browsers.deleteByID(sessionId);
    return { deleted: true, sessionId };
  } catch (err) {
    if (err.name === "NotFoundError" || err.status === 404) {
      return { deleted: true, sessionId, alreadyClosed: true };
    }
    throw new KernelApiError(`Failed to delete Kernel browser ${sessionId}: ${err.message}`, {
      status: err.status || 500,
      details: err
    });
  }
}

export async function discoverWholesaleTiers({
  sku,
  vendorUrl,
  category = "general"
} = {}) {
  if (!sku || typeof sku !== "string" || !sku.trim()) {
    throw new Error("Target SKU is required for wholesale tier discovery.");
  }

  const cleanSku = sku.trim();
  const targetUrl = vendorUrl || `https://example-wholesale-distributor.com/b2b/products/${encodeURIComponent(cleanSku)}`;
  const session = await createBrowserSession({
    name: `wholeshare-tier-${cleanSku.substring(0, 30)}`,
    stealth: true,
    headless: true,
    timeoutSeconds: 120
  });

  const sessionId = session.sessionId;

  try {
    const extractionCode = `
      await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const pageTitle = await page.title();
      const tiers = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table.pricing-table tr, table.wholesale-pricing tr, .moq-tier-row'));
        if (rows.length === 0) {
          return null;
        }
        return rows.map(r => {
          const cells = Array.from(r.querySelectorAll('td, th')).map(c => c.textContent.trim());
          return cells;
        });
      });
      return { pageTitle, tiers, url: page.url() };
    `;

    const execResult = await executePlaywright(sessionId, {
      code: extractionCode,
      timeoutSec: 45
    });

    const timestamp = Date.now();
    const safeSku = cleanSku.replace(/[^a-zA-Z0-9_-]/g, "_");
    const proofsDir = resolve(process.cwd(), "data/proofs");
    const proofFileName = `proof_${safeSku}_${timestamp}.png`;
    const proofFilePath = resolve(proofsDir, proofFileName);

    const screenshotData = await captureScreenshot(sessionId, { outputPath: proofFilePath });

    let parsedTiers = [];
    if (execResult.success && Array.isArray(execResult.result?.tiers) && execResult.result.tiers.length > 0) {
      parsedTiers = execResult.result.tiers;
    } else if (!execResult.success) {
      throw new KernelApiError(`Wholesale pricing table extraction failed: ${execResult.error || "Playwright execution failed"}`);
    } else {
      parsedTiers = [];
    }

    return {
      sku: cleanSku,
      vendorUrl: targetUrl,
      category,
      tiers: parsedTiers,
      liveViewUrl: session.browserLiveViewUrl,
      proof: {
        sha256: screenshotData.sha256,
        fileName: proofFileName,
        filePath: proofFilePath,
        sizeBytes: screenshotData.sizeBytes,
        capturedAt: new Date().toISOString()
      }
    };
  } finally {
    await deleteBrowserSession(sessionId).catch(() => {});
  }
}

export async function executeCustomBrowserTask({
  targetUrl,
  script,
  captureProof = true
} = {}) {
  if (!targetUrl || typeof targetUrl !== "string") {
    throw new Error("Target URL is required for custom browser task.");
  }
  if (!script || typeof script !== "string") {
    throw new Error("Playwright script is required for custom browser task.");
  }

  const session = await createBrowserSession({
    stealth: true,
    headless: true,
    timeoutSeconds: 120
  });

  const sessionId = session.sessionId;

  try {
    const executableScript = script.includes("goto(")
      ? script
      : `await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: 'domcontentloaded', timeout: 30000 });\n${script}`;

    const execResult = await executePlaywright(sessionId, { code: executableScript });
    let proof = null;

    if (captureProof) {
      const proofsDir = resolve(process.cwd(), "data/proofs");
      const proofFileName = `task_proof_${Date.now()}.png`;
      const proofFilePath = resolve(proofsDir, proofFileName);
      const screenshot = await captureScreenshot(sessionId, { outputPath: proofFilePath });
      proof = {
        sha256: screenshot.sha256,
        filePath: proofFilePath,
        capturedAt: new Date().toISOString()
      };
    }

    return {
      success: execResult.success,
      result: execResult.result,
      error: execResult.error,
      proof
    };
  } finally {
    await deleteBrowserSession(sessionId).catch(() => {});
  }
}

export async function researchWebFact({
  intent = "GENERAL_RESEARCH",
  targetUrl,
  query,
  script = null,
  captureProof = true
} = {}) {
  if (!targetUrl || typeof targetUrl !== "string") {
    throw new Error("Target URL is required for web fact research.");
  }
  if (!query || typeof query !== "string") {
    throw new Error("Query string is required for web fact research.");
  }

  const session = await createBrowserSession({
    stealth: true,
    headless: true,
    timeoutSeconds: 120
  });

  const sessionId = session.sessionId;

  try {
    let executableScript;
    if (script && typeof script === "string" && script.trim()) {
      executableScript = script.includes("goto(")
        ? script
        : `await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: 'domcontentloaded', timeout: 30000 });\n${script}`;
    } else {
      executableScript = `
        await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: 'domcontentloaded', timeout: 30000 });
        return await page.evaluate((targetQuery) => {
          const terms = targetQuery.toLowerCase().split(/\\s+/).filter(w => w.length > 2);
          const allTextElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, p, li, dd, td, th, span, div, a'));
          const matchedSnippets = [];
          const seen = new Set();

          for (const el of allTextElements) {
            const txt = (el.innerText || '').trim();
            if (!txt || txt.length < 5 || seen.has(txt)) continue;
            const lower = txt.toLowerCase();
            const matchCount = terms.filter(t => lower.includes(t)).length;
            if (matchCount > 0) {
              seen.add(txt);
              matchedSnippets.push({ text: txt.substring(0, 300), score: matchCount });
              if (matchedSnippets.length >= 25) break;
            }
          }

          matchedSnippets.sort((a, b) => b.score - a.score);

          const tables = Array.from(document.querySelectorAll('table')).slice(0, 5).map(tbl => {
            return Array.from(tbl.querySelectorAll('tr')).slice(0, 10).map(tr => {
              return Array.from(tr.querySelectorAll('th, td')).map(cell => (cell.innerText || '').trim());
            });
          });

          return {
            pageTitle: document.title,
            currentUrl: window.location.href,
            matchedCount: matchedSnippets.length,
            snippets: matchedSnippets.slice(0, 15).map(m => m.text),
            tablesPreview: tables
          };
        }, ${JSON.stringify(query)});
      `;
    }

    const execResult = await executePlaywright(sessionId, { code: executableScript });
    let proof = null;

    if (captureProof) {
      const proofsDir = resolve(process.cwd(), "data/proofs");
      const proofFileName = `fact_${intent.toLowerCase()}_${Date.now()}.png`;
      const proofFilePath = resolve(proofsDir, proofFileName);
      const screenshot = await captureScreenshot(sessionId, { outputPath: proofFilePath });
      proof = {
        sha256: screenshot.sha256,
        filePath: proofFilePath,
        capturedAt: new Date().toISOString()
      };
    }

    return {
      success: execResult.success,
      intent,
      targetUrl,
      query,
      data: execResult.result || null,
      error: execResult.error || null,
      proof
    };
  } finally {
    await deleteBrowserSession(sessionId).catch(() => {});
  }
}


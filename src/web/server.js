import "../lib/env.js";
import http from "node:http";
import { listSources, querySource } from "../lib/data-sources.js";
import { rebaseStoryShipments } from "../lib/story-clock.js";
import { resolvePageTool } from "../lib/page-bridge.js";
import { loadStudioState, saveStudioState } from "../lib/studio-state.js";
import { bookSlot, extendInspection, getScheduleState, moveDelivery, resolveConflicts, undoLast } from "../lib/schedule-service.js";
import { buildConnectUrl, completeConnect, disconnectPayPal, connectionStatus } from "../lib/paypal-connect.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve, extname, dirname, basename, sep } from "node:path";
import crypto from "node:crypto";
import { actionDispatcher } from "../lib/web-actions.js";
import { createOrderAuthorization, authorizeOrderHold } from "../lib/paypal-bridge.js";
import { authorizePledgeOrder, createPledgeOrder, getPledgeQuote } from "../lib/paypal-checkout.js";
import { durableHarness, describeHarness } from "../lib/durable-harness.js";
import { handleMcpMessage } from "../lib/mcp-server.js";
import { WHOLESHARE_TOOL_DECLARATIONS, executeTool } from "../lib/tool-registry.js";
import { kernelResearchService } from "../lib/kernel-service.js";
import { loadAllFeatures } from "../lib/feature-map.js";
import { agentRateLimiter, apiRateLimiter, TokenBucketRateLimiter } from "../lib/rate-limiter.js";
import { recordDisputeEvent } from "../lib/db.js";
import { PayPalWebhookHandler } from "../gateway/paypal-webhook.handler.ts";
import {
  ingestDocument,
  importGoogleDriveFile,
  processAgentDocumentIngress,
  queryProcurementBaseline,
  listIngestedDocuments
} from "../lib/ingestion-pipeline.js";
import {
  getUserDashboardOverview,
  loadUserSettings,
  updateUserSettings,
  addAgentConnection,
  removeAgentConnection
} from "../lib/user-settings.js";
import { ClaimsAdapter } from "../adapter/claims.adapter.ts";
import { getModelUsage, getModelSpend, assertModelBudget, recordModelUsage } from "../lib/model-client.js";
import { describeProvider, mosaicBaseUrl, mosaicChatCompletionsUrl, mosaicHeaders, mosaicRequestExtras } from "../lib/mosaic-config.js";
import { getEvidence, saveEvidence } from "../lib/evidence-store.js";
import { getGeneratedMembers } from "../lib/clan-members.js";
import { isCarrierFormatTracking } from "../lib/tracking-format.js";
import { getClaimsStorage } from "../storage/claims.storage.ts";
import { getDeliveryStorage } from "../storage/delivery.storage.ts";
import { getRepaymentStorage } from "../storage/repayment.storage.ts";
import { WholeshareActionDispatcher, qwenDispatcher } from "../lib/qwen-bridge.js";
import { buildSuggestions } from "../lib/suggestions.js";
import { buildSnapshot, listSnapshotComponents, snapshotCsv, snapshotHtml } from "../lib/snapshot.js";
import { identifyAgent } from "../lib/agent-brands.js";
import { fillForm } from "../lib/form-fill.js";
import { extractMatchVector } from "../lib/matchmaking/qwenExtractor.ts";
import { matchAndRankClans } from "../lib/matchmaking/mlCoalitionScorer.ts";
import {
  joinClanWithEscrow,
  lockClanEscrow,
  openCustomerDispute,
  settleEscrow,
  getEscrowRecord
} from "../lib/matchmaking/clanEscrowFsm.ts";
import { loadGazetteer, lookupCity, getCorridorEfficiency } from "../lib/geo/gazetteer.ts";
import { getAllClans, getClanById } from "../lib/matchmaking/clanStore.ts";

const PORT = parseInt(process.env.PORT || "3000", 10);

const PUBLIC_DIR = resolve(process.cwd(), "src/web/public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml"
};

function readRawBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > limit) {
        req.destroy();
        reject(new Error("Payload too large."));
      }
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", reject);
  });
}

async function readJsonBody(req, limit) {
  const raw = await readRawBody(req, limit);
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function getSameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (typeof origin !== "string" || typeof host !== "string") return null;
  try {
    const parsed = new URL(origin);
    return parsed.host.toLowerCase() === host.toLowerCase() ? parsed.origin : null;
  } catch {
    return null;
  }
}

const AGENT_INVITES_PATH = resolve(process.cwd(), ".scratch/agent-invites.json");
const AGENT_SESSIONS_PATH = resolve(process.cwd(), ".scratch/agent-sessions.json");
const DURABLE_JOURNAL_PATH = resolve(process.cwd(), "data/durable_journal.json");

const agentInviteCreateLimiter = new TokenBucketRateLimiter({ capacity: 10, refillRatePerSec: 10 / 3600 });
// An outside agent works in bursts of tool calls, so this allows a quick burst and about one call a second after that.
const mcpRateLimiter = new TokenBucketRateLimiter({ capacity: 40, refillRatePerSec: 1 });
const agentOnboardLimiter = new TokenBucketRateLimiter({ capacity: 20, refillRatePerSec: 20 / 3600 });

// Browser calls from this app send a matching Origin. External agents must present a live invite token.
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const LOCKED_IN_PRODUCTION = [/^\/api\/v1\/model\/chat-completions$/, /^\/api\/v1\/agent\/step-up/, /^\/api\/v1\/qwen\//];

// The UI runs these tools through /agent/action and these actions through /paypal/toolkit. Nothing else is reachable that way.
const UI_ACTION_TOOLS = new Set(["generate_step_up_invoice", "settle_supplier_payout", "create_subscription", "create_subscription_plan", "capture_order_hold"]);
const UI_TOOLKIT_ACTIONS = new Set(["list_invoices", "list_disputes", "send_invoice_reminder"]);

// A malformed percent escape in a path must be a 404, not a crash.
function safeDecode(text) {
  try { return decodeURIComponent(text); } catch { return "\u0000invalid"; }
}

// One bad request must never take the whole service down for everyone else.
process.on("unhandledRejection", (reason) => console.error("[server] unhandled rejection:", reason instanceof Error ? reason.message : reason));
process.on("uncaughtException", (error) => console.error("[server] uncaught exception:", error.message));

// The rightmost X-Forwarded-For entry is the one the platform's own proxy added. The leftmost is whatever the caller sent.
function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",").map((part) => part.trim()).filter(Boolean);
  return forwarded.length ? forwarded[forwarded.length - 1] : req.socket.remoteAddress || "127.0.0.1";
}

// PayPal identity details are shown masked. A stranger who loads the page must not be able to read them.
function maskEmail(email) {
  const text = String(email || "");
  const at = text.indexOf("@");
  return at > 1 ? `${text[0]}***${text.slice(at)}` : text ? "***" : "";
}
function publicSettings(settings) {
  const profile = { ...(settings.profile || {}) };
  delete profile.paypalPayerId;
  profile.paypalMerchantEmail = maskEmail(profile.paypalMerchantEmail);
  return { ...settings, profile };
}

function isSameOriginOrInvited(req) {
  const origin = req.headers.origin || "";
  if (origin) {
    try { if (new URL(origin).host === req.headers.host) return true; } catch { /* fall through */ }
  }
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : String(req.headers["x-agent-token"] || "");
  if (!token) return !origin && process.env.NODE_ENV !== "production" && req.socket.remoteAddress?.endsWith("127.0.0.1");
  return Boolean(findLiveInvite(token));
}

// A token works while it has not been revoked and has not expired.
function findLiveInvite(token) {
  if (!token) return null;
  return loadAgentInvites().find((invite) => invite && invite.token === token && !invite.revoked && !invite.revokedAt && (!invite.expiresAt || Date.parse(invite.expiresAt) > Date.now())) ?? null;
}

function bearerToken(req) {
  const auth = String(req.headers.authorization || "");
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : String(req.headers["x-agent-token"] || "");
}

function loadAgentInvites() {
  try {
    if (!existsSync(AGENT_INVITES_PATH)) return [];
    return JSON.parse(readFileSync(AGENT_INVITES_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveAgentInvites(invites) {
  mkdirSync(resolve(process.cwd(), ".scratch"), { recursive: true });
  writeFileSync(AGENT_INVITES_PATH, JSON.stringify(invites, null, 2), "utf-8");
}

function loadAgentSessions() {
  try {
    if (!existsSync(AGENT_SESSIONS_PATH)) return {};
    return JSON.parse(readFileSync(AGENT_SESSIONS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveAgentSessions(sessions) {
  mkdirSync(resolve(process.cwd(), ".scratch"), { recursive: true });
  writeFileSync(AGENT_SESSIONS_PATH, JSON.stringify(sessions, null, 2), "utf-8");
}

function logDurableEvent(eventType, payload) {
  try {
    mkdirSync(dirname(DURABLE_JOURNAL_PATH), { recursive: true });
    const line = JSON.stringify({ eventType, payload, timestamp: new Date().toISOString() }) + "\n";
    appendFileSync(DURABLE_JOURNAL_PATH, line, "utf-8");
  } catch (err) {
    console.error("[CRITICAL] Failed to append to durable journal.", err.message);
  }
}

function resolveProductSku(productInput, catalog, allClans) {
  if (!productInput || typeof productInput !== "string") {
    return { resolved: false, error: "Product is required." };
  }
  const term = productInput.trim();
  const lowerTerm = term.toLowerCase();

  if (catalog && catalog.has(term)) {
    const item = catalog.get(term);
    return { resolved: true, sku: item.sku, name: item.name };
  }
  if (catalog) {
    for (const [sku, item] of catalog.entries()) {
      if (sku.toLowerCase() === lowerTerm) {
        return { resolved: true, sku: item.sku, name: item.name };
      }
    }
  }

  const matches = new Map();
  if (catalog) {
    for (const [sku, item] of catalog.entries()) {
      if (sku.toLowerCase().includes(lowerTerm) || (item.name && item.name.toLowerCase().includes(lowerTerm))) {
        matches.set(sku, { sku: item.sku, name: item.name });
      }
    }
  }

  if (matches.size === 0 && Array.isArray(allClans)) {
    for (const clan of allClans) {
      const clanSku = clan.canonicalSku || clan.sku;
      if (!clanSku) continue;
      if (clanSku.toLowerCase().includes(lowerTerm) || (clan.name && clan.name.toLowerCase().includes(lowerTerm))) {
        matches.set(clanSku, { sku: clanSku, name: clan.name });
      }
    }
  }

  if (matches.size === 0) {
    return { resolved: false, error: "No matching product found in catalogue.", matches: [] };
  }
  if (matches.size > 1) {
    return {
      resolved: false,
      ambiguous: true,
      error: "Ambiguous product name matches multiple SKUs.",
      matches: Array.from(matches.values())
    };
  }

  const single = Array.from(matches.values())[0];
  return { resolved: true, sku: single.sku, name: single.name };
}

const RADAR_WEIGHTS = {
  semanticAlignment: 0.30,
  marginalDiscount: 0.25,
  moqVelocity: 0.15,
  corridorEfficiency: 0.15,
  deliveryCompatibility: 0.10,
  supplierTrust: 0.05
};

function scoreClansForAgentProfile(profile, seededClans, coalitionsMap) {
  const allCandidateClans = [];
  const seenIds = new Set();

  if (coalitionsMap) {
    for (const [id, c] of coalitionsMap.entries()) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      allCandidateClans.push(c);
    }
  }

  if (Array.isArray(seededClans)) {
    for (const sc of seededClans) {
      if (seenIds.has(sc.id)) continue;
      seenIds.add(sc.id);
      allCandidateClans.push(sc);
    }
  }

  const userCity = lookupCity(profile.city);
  const targetProduct = (profile.product || "").toLowerCase();

  const scored = [];

  for (const clan of allCandidateClans) {
    const clanSku = (clan.canonicalSku || clan.sku || "").toLowerCase();
    const clanName = (clan.name || clan.skuName || "").toLowerCase();

    let semanticScore = 0.20;
    if (clanSku === targetProduct) {
      semanticScore = 1.0;
    } else if (clanSku.includes(targetProduct) || targetProduct.includes(clanSku)) {
      semanticScore = 0.90;
    } else if (clanName.includes(targetProduct) || targetProduct.includes(clanName)) {
      semanticScore = 0.85;
    }

    const basePrice = clan.baseUnitPriceCents || clan.unitPriceCents || 1000;
    const tiers = clan.discountTiers || clan.tiers || [];
    const currentUnits = clan.currentUnits || 0;
    const totalUnits = currentUnits + profile.unitsWanted;
    let discountPct = 0;
    for (const tier of tiers) {
      if (totalUnits >= tier.minUnits && tier.discountPct > discountPct) {
        discountPct = tier.discountPct;
      }
    }
    const discountedPrice = Math.round((basePrice * (100 - discountPct)) / 100);
    const savingsCents = basePrice - discountedPrice;
    const effectiveDiscountPct = Math.max(0, (savingsCents / basePrice) * 100);
    const discountScore = Math.min(1.0, Math.max(0.0, effectiveDiscountPct / 35.0));

    const targetUnits = clan.targetUnits || 100;
    const fillRatio = totalUnits / targetUnits;
    let velocityScore = 0;
    if (fillRatio >= 1.0 && currentUnits < targetUnits) {
      velocityScore = 1.0;
    } else if (fillRatio >= 1.0) {
      velocityScore = 0.90;
    } else {
      velocityScore = Math.min(0.98, fillRatio);
    }

    let corridorScore = 0.80;
    let isDomestic = (clan.countryCode || "US").toUpperCase() === (profile.countryCode || "US").toUpperCase();
    if (userCity && clan.city) {
      const clanCity = lookupCity(clan.city);
      if (clanCity) {
        const eff = getCorridorEfficiency(userCity, clanCity);
        corridorScore = eff.score;
        isDomestic = eff.isDomestic;
      }
    }

    const estimatedDays = clan.estimatedDeliveryDays || 7;
    const deliveryRatio = estimatedDays / 30;
    const deliveryScore = Math.max(0.1, Math.min(1.0, 1.0 - Math.max(0, deliveryRatio - 0.7) * 1.5));

    const supplierTrust = clan.supplierTrustScore || 0.98;

    const weightedSum =
      RADAR_WEIGHTS.semanticAlignment * semanticScore +
      RADAR_WEIGHTS.marginalDiscount * discountScore +
      RADAR_WEIGHTS.moqVelocity * velocityScore +
      RADAR_WEIGHTS.corridorEfficiency * corridorScore +
      RADAR_WEIGHTS.deliveryCompatibility * deliveryScore +
      RADAR_WEIGHTS.supplierTrust * supplierTrust;

    const matchScore = Math.round(Math.min(99, Math.max(40, weightedSum * 100)));

    const reasonParts = [];
    if (discountPct > 0) {
      reasonParts.push(`+${discountPct}% Wholesale Savings`);
    }
    const currentFillPct = Math.round(Math.min(100, (currentUnits / (targetUnits || 1)) * 100));
    reasonParts.push(`${currentFillPct}% MOQ Filled`);
    reasonParts.push(isDomestic ? "Domestic Direct" : "Global Trade Corridor");
    reasonParts.push(`${Math.round(supplierTrust * 100)}% Supplier Trust`);

    scored.push({
      clanId: clan.id,
      clanName: clan.name || clan.skuName || clan.sku,
      canonicalSku: clan.canonicalSku || clan.sku,
      city: clan.city || "Austin",
      countryCode: clan.countryCode || "US",
      currency: clan.settlementCurrency || clan.currency || "USD",
      score: matchScore,
      reason: reasonParts.join(" • "),
      unitPriceCents: discountedPrice,
      totalCents: discountedPrice * profile.unitsWanted,
      status: clan.status || "FORMING",
      isDomestic
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

export function createWebServer() {
  const webhookHandler = new PayPalWebhookHandler();
  
  // Initialize Qwen bridge with existing action dispatcher
  qwenDispatcher.setActionDispatcher(actionDispatcher);

  if (typeof actionDispatcher.subscribe !== "function") {
    actionDispatcher.subscribe = (fn) => (actionDispatcher.onEvent ? actionDispatcher.onEvent(fn) : () => {});
  }

  // Start background Kernel research service
  kernelResearchService.start();
  
  return http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Bad request." }));
      return;
    }
    const pathname = url.pathname;

    // Security headers on every response.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (req.headers["x-forwarded-proto"] === "https") res.setHeader("Strict-Transport-Security", "max-age=15552000");

    // Raw model and approval routes exist for local development only. A public deployment does not offer them.
    if (IS_PRODUCTION && LOCKED_IN_PRODUCTION.some((pattern) => pattern.test(pathname))) {
      sendJson(res, 404, { error: "Not available in this deployment." });
      return;
    }

    // CORS Headers
    const reqOrigin = req.headers.origin || "";
    let originAllowed = false;
    try { originAllowed = Boolean(reqOrigin) && new URL(reqOrigin).host === req.headers.host; } catch { originAllowed = false; }
    if (originAllowed) res.setHeader("Access-Control-Allow-Origin", reqOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Wholeshare-Signature, X-Wholeshare-Timestamp");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Mutating API calls: this app's own origin, or an agent invite token. Webhook is PayPal-signed; agent routes carry their own token.
    const gateExempt = pathname === "/api/v1/paypal/webhook" || ["/api/v1/agent/onboard", "/api/v1/agent/pledge-quote", "/api/v1/agent/chat", "/api/v1/agent/sessions"].some((prefix) => pathname.startsWith(prefix)) || pathname.startsWith("/agent/");
    if (req.method === "POST" && pathname.startsWith("/api/") && !gateExempt && !isSameOriginOrInvited(req)) {
      sendJson(res, 403, { error: "This action requires the WholeShare app origin or a valid agent invite token." });
      return;
    }

    // SSE Event Stream Endpoint - Enhanced with Qwen Bridge
    if (pathname === "/api/v1/events" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      
      // Subscribe to both existing action dispatcher and Qwen dispatcher
      actionDispatcher.subscribeSse(res);
      qwenDispatcher.subscribeSse(res);
      
      req.on("close", () => {
        actionDispatcher.unsubscribeSse(res);
        qwenDispatcher.unsubscribeSse(res);
      });
      return;
    }

    // MCP over HTTP (JSON-RPC 2.0). Outside agents connect here with an invite token as a Bearer token.
    if (pathname === "/mcp") {
      if (req.method !== "POST") {
        res.writeHead(405, { Allow: "POST", "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Send MCP requests with POST." }));
        return;
      }
      const invite = findLiveInvite(bearerToken(req));
      if (!invite) {
        res.writeHead(401, { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="wholeshare"' });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32002, message: "Present a WholeShare agent invite token as a Bearer token. Create one on the Agents page." } }));
        return;
      }
      const rate = mcpRateLimiter.isAllowed(`mcp:${invite.token}`);
      if (!rate.allowed) {
        sendJson(res, 429, { jsonrpc: "2.0", id: null, error: { code: -32003, message: "Too many requests. Slow down." }, retryAfterSec: rate.retryAfterSec });
        return;
      }
      try {
        const body = await readJsonBody(req);
        const batch = Array.isArray(body);
        const replies = [];
        for (const message of batch ? body.slice(0, 10) : [body]) {
          const reply = await handleMcpMessage(message, { label: invite.createdBy || "agent" });
          if (reply) replies.push(reply);
        }
        if (replies.length === 0) { res.writeHead(202); res.end(); return; }
        sendJson(res, 200, batch ? replies : replies[0]);
      } catch {
        sendJson(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } });
      }
      return;
    }

    // WebMCP Endpoints for Qwen Integration
    if (pathname === "/api/v1/mcp" && req.method === "GET") {
      sendJson(res, 200, {
        status: "READY",
        tools: qwenDispatcher.getWebMcpTools(),
        resources: qwenDispatcher.getWebMcpResources()
      });
      return;
    }

    if (pathname === "/api/v1/mcp/tools" && req.method === "GET") {
      sendJson(res, 200, {
        tools: qwenDispatcher.getWebMcpTools()
      });
      return;
    }

    if (pathname === "/api/v1/mcp/resources" && req.method === "GET") {
      sendJson(res, 200, {
        resources: qwenDispatcher.getWebMcpResources()
      });
      return;
    }

    if (pathname === "/api/v1/mcp/execute" && req.method === "POST") {
      try {
        if (!isSameOriginOrInvited(req)) {
          sendJson(res, 403, { error: "MCP execute requires this app's origin or a valid agent invite token." });
          return;
        }
        const body = await readJsonBody(req);
        const result = await qwenDispatcher.executeWebMcpTool(body.tool, body.args || {});
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/mcp/read" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await qwenDispatcher.readWebMcpResource(body.uri);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    // Qwen WebCmd Endpoint for direct action dispatching
    if (pathname === "/api/v1/qwen/action" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await qwenDispatcher.dispatchAction(body.action, body.payload || {});
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    // Qwen Chat Endpoint for natural language processing
    if (pathname === "/api/v1/qwen/chat" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await qwenDispatcher.processChat(body.prompt, body.context || {});
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/model/health" && req.method === "GET") {
      const started = Date.now();
      try {
        const probe = await fetch(`${mosaicBaseUrl()}/v1/models`, { headers: mosaicHeaders(), signal: AbortSignal.timeout(8000) });
        const body = probe.ok ? await probe.json().catch(() => ({})) : {};
        sendJson(res, probe.ok ? 200 : 503, {
          status: probe.ok ? "ONLINE" : "OFFLINE",
          latencyMs: Date.now() - started,
          model: process.env.MOSAIC_MODEL_NAME || null,
          modelsAvailable: Array.isArray(body.data) ? body.data.length : null,
          thinking: process.env.MOSAIC_ENABLE_THINKING === "true",
          authConfigured: Boolean(process.env.MOSAIC_MODEL_API_KEY)
        });
      } catch {
        sendJson(res, 503, { status: "OFFLINE", latencyMs: Date.now() - started, error: "The Mosaic model server did not respond." });
      }
      return;
    }

    if (pathname === "/api/v1/config" && req.method === "GET") {
      sendJson(res, 200, { mosaicChatCompletionsUrl: "/api/v1/model/chat-completions" });
      return;
    }

    // AG Studio AI Responses Proxy Endpoint targeting the Mosaic model (MOSAIC_MODEL_URL)
    if (pathname === "/api/ai/responses" && req.method === "GET") {
      try {
        const mlxCheck = await fetch(`${mosaicBaseUrl()}/v1/models`, { headers: mosaicHeaders(), signal: AbortSignal.timeout(1500) });
        if (mlxCheck.ok) {
          const modelsData = await mlxCheck.json();
          sendJson(res, 200, {
            status: "ONLINE",
            target: mosaicBaseUrl(),
            models: Array.isArray(modelsData.data) ? modelsData.data.map((m) => m.id) : []
          });
        } else {
          sendJson(res, 503, { status: "OFFLINE", error: "MLX returned status " + mlxCheck.status });
        }
      } catch {
        sendJson(res, 503, { status: "OFFLINE", error: `Mosaic model offline at ${mosaicBaseUrl()}` });
      }
      return;
    }

    if (pathname === "/api/ai/responses" && req.method === "POST") {
      const callerIp = clientIp(req);
      const rateCheck = agentRateLimiter.isAllowed(callerIp);
      if (!rateCheck.allowed) { res.setHeader("Retry-After", String(rateCheck.retryAfterSec)); sendJson(res, 429, { error: { message: "Too many requests. Try again in a moment." } }); return; }
      try {
        assertModelBudget();
        const body = await readJsonBody(req);
        
        let isOnline = false;
        try {
          const probe = await fetch(`${mosaicBaseUrl()}/v1/models`, { headers: mosaicHeaders(), signal: AbortSignal.timeout(1500) });
          isOnline = probe.ok;
        } catch {
          isOnline = false;
        }

        if (!isOnline) {
          sendJson(res, 503, {
            error: {
              message: "The assistant is offline right now. Try again in a moment."
            }
          });
          return;
        }

        const messages = [];
        if (body.instructions || body.systemPrompt) {
          messages.push({ role: "system", content: body.instructions || body.systemPrompt });
        }
        if (Array.isArray(body.messages)) {
          for (const m of body.messages) {
            messages.push({ role: m.role || "user", content: m.content || "" });
          }
        } else if (Array.isArray(body.input)) {
          for (const item of body.input) {
            if (typeof item === "string") {
              messages.push({ role: "user", content: item });
            } else if (item && typeof item === "object") {
              messages.push({ role: item.role || "user", content: item.content || JSON.stringify(item) });
            }
          }
        } else if (typeof body.prompt === "string") {
          messages.push({ role: "user", content: body.prompt });
        } else if (typeof body.input === "string") {
          messages.push({ role: "user", content: body.input });
        }

        if (messages.length === 0) {
          messages.push({ role: "user", content: "Provide insights on the current wholesale buying groups." });
        }

        const requestedModel = typeof body.model === "string" ? body.model : "";
        const defaultModel = "mlx-community/Qwen3.5-4B-MLX-4bit";
        const selectedModel = requestedModel && requestedModel.includes("Qwen") ? requestedModel : defaultModel;
        const maxTokens = Math.min(Math.max(Number(body.max_tokens) || 800, 256), 1500);
        // Size limits: a visitor cannot send a huge prompt through this route.
        let budgetChars = 60000;
        for (const message of messages) { message.content = String(message.content ?? "").slice(0, Math.max(0, Math.min(8000, budgetChars))); budgetChars -= message.content.length; }
        messages.length = Math.min(messages.length, 24);

        const requestPayload = {
          ...mosaicRequestExtras(),
          model: selectedModel,
          messages,
          max_tokens: maxTokens,
          temperature: 0.2
        };

        if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
          requestPayload.tools = body.tools;
          requestPayload.tool_choice = body.tool_choice || "auto";
        }

        const mlxResponse = await fetch(`${mosaicBaseUrl()}/v1/chat/completions`, {
          method: "POST",
          headers: mosaicHeaders(),
          body: JSON.stringify(requestPayload),
          signal: AbortSignal.timeout(60000)
        });

        if (!mlxResponse.ok) {
          const errText = await mlxResponse.text();
          console.error(`[studio-ai] model request failed with status ${mlxResponse.status}: ${errText.slice(0, 200)}`);
          sendJson(res, 502, { error: { message: "The assistant could not answer right now. Try again in a moment." } });
          return;
        }

        const completion = await mlxResponse.json();
        if (completion.usage) recordModelUsage(completion.usage);
        const firstChoice = completion.choices?.[0];
        const assistantMessage = firstChoice?.message?.content || "";
        const toolCalls = firstChoice?.message?.tool_calls || [];

        sendJson(res, 200, {
          id: completion.id || ("resp-" + Date.now()),
          object: "response",
          model: selectedModel,
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "text", text: assistantMessage }]
            }
          ],
          choices: completion.choices || [],
          message: firstChoice?.message || { role: "assistant", content: assistantMessage, tool_calls: toolCalls },
          usage: completion.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        });
      } catch (err) {
        const limited = err instanceof Error && /development budget/.test(err.message);
        console.error("[studio-ai]", err instanceof Error ? err.message : err);
        sendJson(res, limited ? 429 : 500, { error: { message: limited ? "The assistant has reached its usage limit for now." : "The assistant could not answer right now." } });
      } finally {
        agentRateLimiter.release(callerIp);
      }
      return;
    }

    // API Routes
    if (pathname === "/api/v1/paypal/sdk-config" && req.method === "GET") {
      const clientId = process.env.PAYPAL_CLIENT_ID;
      if (!clientId || clientId === "SANDBOX_MOCK_CLIENT_ID" || clientId.includes("your_sandbox")) {
        sendJson(res, 503, { error: "PayPal checkout is unavailable until a valid PayPal client ID is configured." });
        return;
      }
      const sdkHost = process.env.PAYPAL_MODE === "live" ? "www.paypal.com" : "www.sandbox.paypal.com";
      sendJson(res, 200, {
        clientId,
        sdkUrl: `https://${sdkHost}/web-sdk/v6/core`,
        mode: process.env.PAYPAL_MODE === "live" ? "live" : "sandbox"
      });
      return;
    }

    if ((pathname === "/api/v1/paypal/pledge-quote" || pathname === "/api/v1/paypal/pledges") && req.method === "POST") {
      if (!getSameOrigin(req)) {
        sendJson(res, 403, { error: "Payment requests must originate from this website." });
        return;
      }
      try {
        const body = await readJsonBody(req);
        const result = pathname.endsWith("pledge-quote") ? getPledgeQuote(body) : await createPledgeOrder(body);
        sendJson(res, pathname.endsWith("pledge-quote") ? 200 : 201, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    const paypalAuthorizationMatch = pathname.match(/^\/api\/v1\/paypal\/pledges\/([^/]+)\/authorize$/);
    if (paypalAuthorizationMatch && req.method === "POST") {
      if (!getSameOrigin(req)) {
        sendJson(res, 403, { error: "Payment requests must originate from this website." });
        return;
      }
      try {
        const orderId = safeDecode(paypalAuthorizationMatch[1]);
        const result = await authorizePledgeOrder(orderId);
        actionDispatcher.broadcast("PAYPAL_PLEDGE_AUTHORIZED", result);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/health" && req.method === "GET") {
      sendJson(res, 200, { status: "HEALTHY", uptime: process.uptime() });
      return;
    }

    if (pathname === "/api/v1/user/overview" && req.method === "GET") {
      const smeId = url.searchParams.get("smeId") || "sme_austin_01";
      const overview = getUserDashboardOverview(smeId);
      sendJson(res, 200, overview);
      return;
    }

    if (pathname === "/api/v1/user/settings" && req.method === "GET") {
      sendJson(res, 200, publicSettings(loadUserSettings()));
      return;
    }

    if (pathname === "/api/v1/user/settings" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        // Spend policies, model choice and connected agents are set by the operator, and the PayPal identity only by the connect flow.
        const { policies: _policies, modelPreferences: _models, aiAgents: _agents, ...allowed } = body && typeof body === "object" ? body : {};
        if (allowed.profile && typeof allowed.profile === "object") {
          const { paypalMerchantEmail: _a, paypalPayerId: _b, paypalConnectedAt: _c, paypalConnectMode: _d, smeId: _e, ...profile } = allowed.profile;
          allowed.profile = profile;
        }
        const updated = updateUserSettings(allowed);
        actionDispatcher.broadcast("USER_SETTINGS_UPDATED", { updatedAt: new Date().toISOString() });
        sendJson(res, 200, { status: "SUCCESS", settings: publicSettings(updated) });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/user/agents" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const agent = addAgentConnection(body);
        actionDispatcher.broadcast("AGENT_CONNECTED", agent);
        sendJson(res, 201, { status: "SUCCESS", agent });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/user/agents/delete" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const remaining = removeAgentConnection(body.agentId);
        actionDispatcher.broadcast("AGENT_DISCONNECTED", { agentId: body.agentId });
        sendJson(res, 200, { status: "SUCCESS", remaining });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/user/dues/settle" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const repaymentStorage = getRepaymentStorage();
        const settled = repaymentStorage.settleMemberDebt(body.debtId);
        if (!settled) {
          sendJson(res, 404, { error: `Debt ID '${body.debtId}' not found.` });
          return;
        }
        actionDispatcher.broadcast("DEBT_SETTLED", settled);
        sendJson(res, 200, { status: "SUCCESS", settled });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/logistics/shipments" && req.method === "GET") {
      const shipments = getDeliveryStorage().getAll().filter((record) =>
        record.source !== "simulated" && isCarrierFormatTracking(record.trackingNumber) &&
        Boolean(record.supplierDeliveredAt || record.buyerDeliveredAt)
      );
      sendJson(res, 200, { count: shipments.length, shipments });
      return;
    }

    if (pathname === "/api/v1/support/claims" && req.method === "GET") {
      const claimsStorage = getClaimsStorage();
      const byClan = new Map(getAllClans().map((clan) => [clan.id, clan]));
      const claims = claimsStorage.getAll().map((claim) => {
        const clan = byClan.get(claim.clanId);
        return clan ? { ...claim, product: clan.canonicalSku, city: clan.city, supplierName: clan.supplierName } : claim;
      });
      sendJson(res, 200, { count: claims.length, claims });
      return;
    }

    if (pathname === "/api/v1/support/claims" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const claimsAdapter = new ClaimsAdapter();
        const claim = claimsAdapter.intakeClaim(body);
        actionDispatcher.broadcast("CLAIM_INTAKEN", claim);
        sendJson(res, 201, { status: "SUCCESS", claim });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/support/claims/approve" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const claimsAdapter = new ClaimsAdapter();
        const updated = claimsAdapter.approveClaimByBuyer(String(body.claimId || ""), String(body.memberId || "sme_austin_01"));
        actionDispatcher.broadcast("CLAIM_APPROVED", updated);
        sendJson(res, 200, { status: "SUCCESS", claim: updated });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/support/claims/respond" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const claimsAdapter = new ClaimsAdapter();
        const updated = await claimsAdapter.respondToClaim(body);
        actionDispatcher.broadcast("CLAIM_RESPONDED", updated);
        sendJson(res, 200, { status: "SUCCESS", claim: updated });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/coalition/pledge" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await actionDispatcher.joinCoalition({
          smeId: body.smeId || "sme_austin_01",
          coalitionId: body.coalitionId,
          sku: body.sku,
          units: Number(body.units)
        });
        actionDispatcher.broadcast("MEMBER_PLEDGED", { coalitionId: body.coalitionId, smeId: body.smeId || "sme_austin_01", units: body.units });
        sendJson(res, 200, { status: "PLEDGED", result });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/ledger" && req.method === "GET") {
      sendJson(res, 200, actionDispatcher.getLedgerState());
      return;
    }

    if (pathname === "/api/v1/evidence/upload" && req.method === "POST") {
      try {
        const body = await readJsonBody(req, 9e6);
        const buffer = Buffer.from(String(body.dataBase64 || ""), "base64");
        const record = saveEvidence({ buffer, mimeType: String(body.mimeType || ""), fileName: body.fileName, clanId: body.clanId || null });
        sendJson(res, 201, { evidence: record });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname.startsWith("/api/v1/evidence/") && req.method === "GET") {
      const found = getEvidence(safeDecode(pathname.substring("/api/v1/evidence/".length)));
      if (!found) {
        sendJson(res, 404, { error: "Evidence not found." });
        return;
      }
      res.writeHead(200, { "Content-Type": found.record.mimeType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
      res.end(found.buffer);
      return;
    }

    if (pathname === "/api/v1/clans/facets" && req.method === "GET") {
      const count = (key) => {
        const tally = new Map();
        for (const clan of getAllClans()) {
          const value = key === "category" ? clan.industryVertical : clan.city;
          if (value) tally.set(value, (tally.get(value) || 0) + 1);
        }
        return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, count: total }));
      };
      sendJson(res, 200, { categories: count("category"), cities: count("city"), total: getAllClans().length + actionDispatcher.coalitions.size });
      return;
    }

    if (pathname === "/api/v1/clans" && req.method === "GET") {
      const skuFilter = url.searchParams.get("sku") || url.searchParams.get("search");
      const statusFilter = url.searchParams.get("status");
      const categoryFilter = url.searchParams.get("category");
      const cityFilter = url.searchParams.get("city");
      const minDiscount = parseFloat(url.searchParams.get("minDiscount") || "0");
      const limit = parseInt(url.searchParams.get("limit") || "100", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);

      const allSeededClans = getAllClans();
      const clanMap = new Map();

      for (const sc of allSeededClans) {
        const progressPct = sc.targetUnits > 0 ? Math.min(100, Math.round((sc.currentUnits / sc.targetUnits) * 100)) : 0;
        const highestDiscount = sc.discountTiers && sc.discountTiers.length > 0
          ? Math.max(...sc.discountTiers.map(t => t.discountPct))
          : 25;
        clanMap.set(sc.id, {
          id: sc.id,
          name: sc.name,
          sku: sc.canonicalSku,
          skuName: sc.name,
          category: sc.industryVertical,
          city: sc.city,
          countryCode: sc.countryCode,
          currency: sc.settlementCurrency,
          fulfilment: sc.fulfilment,
          status: sc.status || "FORMING",
          demo: sc.demo === true,
          currentUnits: sc.currentUnits,
          targetUnits: sc.targetUnits,
          progressPct,
          unitPriceCents: sc.baseUnitPriceCents,
          discountTierPct: highestDiscount,
          membersCount: sc.memberCount || 3,
          tiers: sc.discountTiers || [],
          supplierName: sc.supplierName,
          supplierTrustScore: sc.supplierTrustScore,
          createdAt: sc.createdAt,
          updatedAt: sc.createdAt
        });
      }

      for (const [id, c] of actionDispatcher.coalitions.entries()) {
        const catalogItem = actionDispatcher.catalog.get(c.sku);
        const progressPct = c.targetUnits > 0 ? Math.min(100, Math.round((c.currentUnits / c.targetUnits) * 100)) : 0;
        clanMap.set(id, {
          id: c.id,
          name: c.skuName || c.sku,
          sku: c.sku,
          skuName: c.skuName || catalogItem?.name || c.sku,
          category: catalogItem?.category || "GENERAL",
          currency: c.settlementCurrency || "USD",
          status: c.status,
          demo: true,
          currentUnits: c.currentUnits,
          targetUnits: c.targetUnits,
          progressPct,
          unitPriceCents: c.unitPriceCents,
          discountTierPct: c.discountTierPct,
          membersCount: c.members?.length || 0,
          tiers: catalogItem?.tiers || [],
          createdAt: c.createdAt,
          updatedAt: c.updatedAt
        });
      }

      let clans = Array.from(clanMap.values());

      if (skuFilter) {
        const term = skuFilter.toLowerCase();
        clans = clans.filter(c =>
          c.sku.toLowerCase().includes(term) ||
          (c.name && c.name.toLowerCase().includes(term)) ||
          (c.city && c.city.toLowerCase().includes(term))
        );
      }
      if (statusFilter && statusFilter !== "ALL") {
        clans = clans.filter(c => c.status.toUpperCase() === statusFilter.toUpperCase());
      }
      if (categoryFilter && categoryFilter !== "ALL") {
        clans = clans.filter(c => c.category.toUpperCase().includes(categoryFilter.toUpperCase()));
      }
      if (cityFilter && cityFilter !== "ALL") {
        clans = clans.filter(c => (c.city || "").toLowerCase() === cityFilter.toLowerCase());
      }
      if (minDiscount > 0) {
        clans = clans.filter(c => c.discountTierPct >= minDiscount);
      }

      const totalCount = clans.length;
      const paginatedClans = clans.slice(offset, offset + limit);

      sendJson(res, 200, {
        count: totalCount,
        limit,
        offset,
        clans: paginatedClans
      });
      return;
    }

    if (pathname.startsWith("/api/v1/clans/") && req.method === "GET") {
      const clanId = pathname.substring("/api/v1/clans/".length);
      let clan = actionDispatcher.coalitions.get(clanId);
      if (!clan) {
        const seeded = getClanById(clanId);
        if (seeded) {
          const progressPct = seeded.targetUnits > 0 ? Math.min(100, Math.round((seeded.currentUnits / seeded.targetUnits) * 100)) : 0;
          const highestDiscount = seeded.discountTiers && seeded.discountTiers.length > 0
            ? Math.max(...seeded.discountTiers.map(t => t.discountPct))
            : 25;
          clan = {
            id: seeded.id,
            name: seeded.name,
            sku: seeded.canonicalSku,
            category: seeded.industryVertical,
            currency: seeded.settlementCurrency,
            status: seeded.status || "FORMING",
            currentUnits: seeded.currentUnits,
            targetUnits: seeded.targetUnits,
            progressPct,
            unitPriceCents: seeded.baseUnitPriceCents,
            discountTierPct: highestDiscount,
            membersCount: seeded.memberCount || 3,
            tiers: seeded.discountTiers || [],
            supplierName: seeded.supplierName,
            supplierTrustScore: seeded.supplierTrustScore,
            createdAt: seeded.createdAt
          };
        }
      }
      if (!clan) {
        sendJson(res, 404, { error: `Clan with ID '${clanId}' not found.` });
        return;
      }
      sendJson(res, 200, { clan: { ...clan, members: Array.isArray(clan.members) && clan.members.length ? clan.members : getGeneratedMembers(clanId) } });
      return;
    }

    if (pathname === "/api/v1/sme/spawn" && req.method === "POST") {
      const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
      const rateCheck = apiRateLimiter.isAllowed(clientIp);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSec));
        sendJson(res, 429, {
          error: "Too Many Requests. API rate limit exceeded.",
          retryAfterSec: rateCheck.retryAfterSec
        });
        return;
      }

      try {
        const body = await readJsonBody(req);
        const result = actionDispatcher.spawnSme(body);
        sendJson(res, 201, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      } finally {
        apiRateLimiter.release(clientIp);
      }
      return;
    }

    if (pathname === "/api/v1/coalition/negotiate" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const coalitionId = body.coalitionId || "coalition_flour_01";
        const result = await actionDispatcher.runNegotiation(coalitionId);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/coalition/lock" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const coalitionId = body.coalitionId || "coalition_flour_01";
        const clan = actionDispatcher.coalitions.get(coalitionId);
        if (!clan) {
          sendJson(res, 404, { error: `Coalition '${coalitionId}' not found.` });
          return;
        }

        const authorizations = {};
        for (const m of clan.members) {
          const auth = await createOrderAuthorization({
            amountCents: m.authorizedCents,
            referenceId: m.smeId
          });
          authorizations[m.smeId] = auth.orderId;
        }

        const coalition = actionDispatcher.authorizeEscrow(coalitionId, authorizations);
        sendJson(res, 200, { status: "LOCKED", coalition });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    // Autopilot: Executes full deal cycle with local Qwen 3.5 4B
    if (pathname === "/api/v1/autopilot" && req.method === "POST") {
      try {
        actionDispatcher.spawnSme({
          id: `sme_artisan_${Date.now()}`,
          name: "Artisan Flour House",
          sku: "organic-flour-50lb",
          pledgedUnits: 200,
          maxAutoAuthorizeUsd: 2500,
          stepUpThresholdUsd: 1500
        });

        const neg = await actionDispatcher.runNegotiation("coalition_flour_01");

        const clan = actionDispatcher.coalitions.get("coalition_flour_01");
        const authorizations = {};
        for (const m of clan.members) {
          const auth = await createOrderAuthorization({
            amountCents: m.authorizedCents,
            referenceId: m.smeId
          });
          authorizations[m.smeId] = auth.orderId;
        }

        const coalition = actionDispatcher.authorizeEscrow("coalition_flour_01", authorizations);

        const totalEscrowCents = coalition.members.reduce((sum, m) => sum + m.authorizedCents, 0);

        sendJson(res, 200, {
          status: "SUCCESS",
          coalition,
          proposal: neg.proposal,
          totalEscrowCents
        });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/features" && req.method === "GET") {
      sendJson(res, 200, { features: loadAllFeatures() });
      return;
    }

    if (pathname === "/api/v1/agent/tools" && req.method === "GET") {
      sendJson(res, 200, { tools: WHOLESHARE_TOOL_DECLARATIONS });
      return;
    }

    if (pathname === "/api/v1/agent/action" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        if (!UI_ACTION_TOOLS.has(String(body.tool))) { sendJson(res, 403, { error: "That tool is not available through this route." }); return; }
        const result = await executeTool(body.tool, body.args || {});
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/agent/page-tool-result" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        sendJson(res, 200, { accepted: resolvePageTool(body.callId, body) });
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : "Bad request." });
      }
      return;
    }

    if ((pathname === "/api/v1/agent/chat" || pathname === "/api/v1/agent/prompt") && req.method === "POST") {
      const callerIp = clientIp(req);
      const rateCheck = agentRateLimiter.isAllowed(callerIp);
      if (!rateCheck.allowed) {
        res.setHeader("Retry-After", String(rateCheck.retryAfterSec));
        sendJson(res, 429, {
          error: "Too Many Requests. Agent reasoning is rate limited to prevent compute exhaustion.",
          retryAfterSec: rateCheck.retryAfterSec
        });
        return;
      }

      try {
        const body = await readJsonBody(req);
        const prompt = String(body.prompt || "Reflect ledger state and evaluate active coalitions.").slice(0, 4000);
        const sessionId = /^sess_[A-Za-z0-9_-]{6,64}$/.test(String(body.sessionId || "")) ? body.sessionId : `sess_${crypto.randomUUID()}`;
        const result = await durableHarness.startSession({
          prompt,
          sessionId,
          maxTurns: Math.min(Math.max(Number(body.maxTurns) || 2, 1), 6),
          metadata: body.metadata || {}
        });
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      } finally {
        agentRateLimiter.release(callerIp);
      }
      return;
    }

    if (pathname === "/api/v1/schedule" && req.method === "GET") {
      sendJson(res, 200, getScheduleState());
      return;
    }

    if (pathname.startsWith("/api/v1/schedule/") && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const action = pathname.slice("/api/v1/schedule/".length);
        const actor = "person";
        let result;
        if (action === "move") result = moveDelivery({ shipment: body.shipment, days: body.days, toDate: body.toDate, actor, reason: body.reason });
        else if (action === "extend-inspection") result = extendInspection({ shipment: body.shipment, hours: body.hours, actor, reason: body.reason });
        else if (action === "book-slot") result = bookSlot({ shipment: body.shipment, date: body.date, hour: body.hour, actor });
        else if (action === "resolve-conflicts") result = resolveConflicts({ apply: body.apply === true, actor });
        else if (action === "undo") result = undoLast({ actor });
        else {
          sendJson(res, 404, { error: `No such schedule action: ${action}` });
          return;
        }
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/studio/state" && req.method === "GET") {
      sendJson(res, 200, { state: loadStudioState() });
      return;
    }

    if (pathname === "/api/v1/studio/state" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        saveStudioState(body.state ?? null);
        sendJson(res, 200, { saved: body.state != null });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/data" && req.method === "GET") {
      sendJson(res, 200, { sources: listSources() });
      return;
    }

    if (pathname.startsWith("/api/v1/data/") && req.method === "GET") {
      try {
        const id = safeDecode(pathname.slice("/api/v1/data/".length));
        let filter = [];
        const rawFilter = url.searchParams.get("filter");
        if (rawFilter) filter = JSON.parse(rawFilter);
        const sortField = url.searchParams.get("sort");
        const result = await querySource(id, {
          filter,
          sort: sortField ? { field: sortField, direction: url.searchParams.get("direction") || "asc" } : null,
          limit: url.searchParams.get("limit") || 200,
          offset: url.searchParams.get("offset") || 0
        });
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/paypal/connect/status" && req.method === "GET") {
      const status = connectionStatus();
      sendJson(res, 200, { ...status, email: maskEmail(status.email), payerId: status.payerId ? "connected" : "" });
      return;
    }

    if (pathname === "/api/v1/paypal/connect/start" && req.method === "GET") {
      try {
        const host = req.headers.host || "localhost:3000";
        const proto = req.headers["x-forwarded-proto"] || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
        const { url: authorizeUrl, redirectUri } = buildConnectUrl(`${proto}://${host}`);
        sendJson(res, 200, { authorizeUrl, redirectUri });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/paypal/connect/callback" && req.method === "GET") {
      const host = req.headers.host || "localhost:3000";
      const proto = req.headers["x-forwarded-proto"] || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
      try {
        if (url.searchParams.get("error")) throw new Error(url.searchParams.get("error_description") || "PayPal sign-in was cancelled.");
        await completeConnect({ code: url.searchParams.get("code"), state: url.searchParams.get("state"), origin: `${proto}://${host}` });
        res.writeHead(302, { Location: "/?paypal=connected#onboarding" });
      } catch (err) {
        res.writeHead(302, { Location: `/?paypal=error&message=${encodeURIComponent(err.message)}#onboarding` });
      }
      res.end();
      return;
    }

    if (pathname === "/api/v1/paypal/connect/disconnect" && req.method === "POST") {
      disconnectPayPal();
      sendJson(res, 200, connectionStatus());
      return;
    }

    if (pathname === "/api/v1/paypal/webhook" && req.method === "POST") {
      try {
        const rawBody = await readRawBody(req);
        let body;
        try {
          body = JSON.parse(rawBody);
        } catch {
          body = {};
        }

        // If PayPal cryptographic transmission signature header is present, verify with PayPalWebhookHandler
        const hasPayPalSig = req.headers["paypal-transmission-sig"] || req.headers["PAYPAL-TRANSMISSION-SIG"];
        if (hasPayPalSig) {
          await webhookHandler.handleWebhook(req.headers, rawBody);
        } else if (process.env.PAYPAL_WEBHOOK_ID && process.env.PAYPAL_WEBHOOK_ALLOW_UNSIGNED !== "1") {
          // A configured webhook id means real PayPal traffic: unsigned events must not change dispute state.
          sendJson(res, 401, { error: "Missing PayPal transmission signature." });
          return;
        }

        const eventType = body.event_type;
        const resource = body.resource || {};
        const disputeId = resource.dispute_id || resource.id || `DISPUTE_${Date.now()}`;
        const orderId = resource.disputed_transactions?.[0]?.seller_transaction_id || resource.custom_id || null;
        const reason = resource.reason || "BUYER_COMPLAINT";
        const status = resource.status || (eventType === "CUSTOMER.DISPUTE.RESOLVED" ? "RESOLVED" : "UNDER_REVIEW");

        if (eventType === "CUSTOMER.DISPUTE.CREATED" || eventType === "CUSTOMER.DISPUTE.RESOLVED") {
          await recordDisputeEvent({
            disputeId,
            orderId,
            status,
            reason,
            resolutionOutcome: resource.dispute_outcome?.outcome_code || null
          });

          if (eventType === "CUSTOMER.DISPUTE.CREATED") {
            actionDispatcher.broadcast("ESCROW_DISPUTED", {
              disputeId,
              orderId,
              reason,
              status: "FROZEN_DISPUTED",
              timestamp: new Date().toISOString()
            });
          }
        } else if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
          actionDispatcher.broadcast("ESCROW_CAPTURED", {
            captureId: resource.id,
            amount: resource.amount,
            status: "CAPTURED",
            timestamp: new Date().toISOString()
          });
        } else if (eventType === "PAYMENT.AUTHORIZATION.CREATED") {
          actionDispatcher.broadcast("ESCROW_AUTHORIZED", {
            authorizationId: resource.id,
            amount: resource.amount,
            status: "AUTHORIZED",
            timestamp: new Date().toISOString()
          });
        }

        sendJson(res, 200, { received: true, disputeId, status, eventType });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/agent/step-up" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const sessionId = body.sessionId;
        const approvalToken = body.approvalToken || `TOKEN_${Date.now()}`;
        if (!sessionId) {
          sendJson(res, 400, { error: "Missing sessionId parameter." });
          return;
        }
        const result = await durableHarness.resumeWithStepUpApproval(sessionId, approvalToken);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/ingest/upload" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const buyerId = body.buyerId || "sme_direct_upload";
        let fileBuffer;
        if (body.base64Content) {
          fileBuffer = Buffer.from(body.base64Content, "base64");
        } else if (typeof body.content === "string" && body.content.startsWith("data:")) {
          const commaIdx = body.content.indexOf(",");
          fileBuffer = Buffer.from(body.content.slice(commaIdx + 1), "base64");
        } else if (typeof body.content === "string") {
          fileBuffer = Buffer.from(body.content, "utf-8");
        } else {
          fileBuffer = Buffer.from(JSON.stringify(body), "utf-8");
        }
        const result = ingestDocument({
          fileBuffer,
          fileName: body.fileName || "uploaded_invoice.json",
          mimeType: body.mimeType || "application/json",
          buyerId,
          metadata: body.metadata || { source: "WEB_DRAG_DROP" }
        });

        // Broadcast profile creation and matched clans via SSE
        actionDispatcher.broadcast("SME_PROFILE_INDUCTED", {
          buyerId: result.buyerId,
          smeProfile: result.smeProfile,
          matchedClans: result.matchedClans
        });

        sendJson(res, 201, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/demo-kits" && req.method === "GET") {
      try {
        const manifestPath = resolve(PUBLIC_DIR, "demo-kits/demo-kits-manifest.json");
        if (existsSync(manifestPath)) {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
          sendJson(res, 200, { count: manifest.length, demoKits: manifest });
        } else {
          sendJson(res, 200, { count: 0, demoKits: [] });
        }
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    if (pathname.startsWith("/api/v1/ingest/demo-kit/") && req.method === "POST") {
      try {
        const slug = pathname.substring("/api/v1/ingest/demo-kit/".length);
        let pdfFile = resolve(PUBLIC_DIR, `demo-kits/${slug}-invoice.pdf`);
        let csvFile = resolve(PUBLIC_DIR, `demo-kits/${slug}-inventory.csv`);
        let filePath = existsSync(pdfFile) ? pdfFile : (existsSync(csvFile) ? csvFile : null);

        if (!filePath) {
          const manifestPath = resolve(PUBLIC_DIR, "demo-kits/demo-kits-manifest.json");
          if (existsSync(manifestPath)) {
            const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
            const kit = manifest.find(k => k.id === slug || k.invoicePdf?.includes(slug));
            if (kit && kit.invoicePdf) {
              const kitPdf = resolve(PUBLIC_DIR, kit.invoicePdf.replace(/^\//, ""));
              if (existsSync(kitPdf)) filePath = kitPdf;
            }
          }
        }

        if (!filePath) {
          sendJson(res, 404, { error: `Demo kit '${slug}' files not found.` });
          return;
        }
        const fileBuffer = readFileSync(filePath);
        const mimeType = filePath.endsWith(".pdf") ? "application/pdf" : "text/csv";
        const result = ingestDocument({
          fileBuffer,
          fileName: filePath.endsWith(".pdf") ? `${slug}-invoice.pdf` : `${slug}-inventory.csv`,
          mimeType,
          buyerId: `sme_${slug.replace(/-/g, "_")}`,
          metadata: { source: "DEMO_KIT", slug }
        });

        actionDispatcher.broadcast("SME_PROFILE_INDUCTED", {
          buyerId: result.buyerId,
          smeProfile: result.smeProfile,
          matchedClans: result.matchedClans
        });

        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/ingest/google-drive" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await importGoogleDriveFile({
          fileId: body.fileId,
          fileName: body.fileName,
          buyerId: body.buyerId || "sme_google_drive",
          accessToken: body.accessToken
        });
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/ingest/agent-dispatch" && req.method === "POST") {
      try {
        const signature = req.headers["x-wholeshare-signature"];
        const timestamp = req.headers["x-wholeshare-timestamp"];
        const body = await readJsonBody(req);
        const result = processAgentDocumentIngress({
          payload: body,
          signature,
          timestamp
        });
        sendJson(res, 202, result);
      } catch (err) {
        sendJson(res, 401, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/ingest/documents" && req.method === "GET") {
      const buyerId = url.searchParams.get("buyerId");
      const docs = listIngestedDocuments(buyerId);
      const baseline = buyerId ? queryProcurementBaseline(buyerId) : null;
      sendJson(res, 200, { count: docs.length, documents: docs, baseline });
      return;
    }

    if (pathname === "/api/v1/governance/propose" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await executeTool("create_governance_proposal", body);
        if (result.status === "ERROR" || result.error) {
          sendJson(res, 400, result);
        } else {
          sendJson(res, 201, result);
        }
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/governance/vote" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await executeTool("cast_clan_vote", body);
        if (result.status === "ERROR" || result.error) {
          sendJson(res, 400, result);
        } else {
          sendJson(res, 200, result);
        }
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/governance/tally" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await executeTool("tally_and_enact_proposal", body);
        if (result.status === "ERROR" || result.error) {
          sendJson(res, 400, result);
        } else {
          sendJson(res, 200, result);
        }
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/governance/constitution" && req.method === "GET") {
      try {
        const coalitionId = url.searchParams.get("coalitionId") || "coalition_flour_01";
        const result = await executeTool("get_clan_constitution", { coalitionId });
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/kernel/briefs" && req.method === "GET") {
      try {
        const clanId = url.searchParams.get("clanId") || "coalition_flour_01";
        const brief = kernelResearchService.getLatestBrief(clanId);
        const allBriefs = kernelResearchService.listBriefs(clanId);
        sendJson(res, 200, { clanId, brief, briefs: allBriefs });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/kernel/research" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        if (loadUserSettings().agentPermissions?.allowAutonomousResearch !== true) { sendJson(res, 403, { error: "Web research is switched off. Turn on 'Research suppliers on the web' in Settings." }); return; }
        const result = await executeTool("kernel_request_research", body);
        sendJson(res, 202, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname.startsWith("/data/proofs/") && req.method === "GET") {
      const fileName = basename(pathname);
      const proofPath = resolve(process.cwd(), "data/proofs", fileName);
      if (existsSync(proofPath)) {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(readFileSync(proofPath));
        return;
      }
    }

    if (pathname === "/api/v1/clan/create" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await executeTool("create_custom_clan_with_constitution", body);
        if (result.status === "ERROR" || result.error) {
          sendJson(res, 400, result);
        } else {
          sendJson(res, 201, result);
        }
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/clan/exit/evaluate" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await executeTool("evaluate_clan_voluntary_exit", body);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/clan/leave" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await executeTool("leave_clan", body);
        if (result.status === "ERROR" || result.error) {
          sendJson(res, 400, result);
        } else {
          sendJson(res, 200, result);
        }
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/clan/debt/invoice" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await executeTool("issue_paypal_debt_invoice", body);
        sendJson(res, 201, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/clan/debt/settle" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await executeTool("settle_member_debt", body);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/buyer/liquidity" && req.method === "GET") {
      try {
        const buyerId = url.searchParams.get("buyerId") || url.searchParams.get("smeId") || "sme_austin_01";
        const autoRemind = url.searchParams.get("autoRemind") === "true";
        const result = await executeTool("check_buyer_liquidity_and_ar", { buyerId, autoRemindOverdue: autoRemind });
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/paypal/toolkit" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        if (!UI_TOOLKIT_ACTIONS.has(String(body.action))) { sendJson(res, 403, { error: "That PayPal action is not available through this route." }); return; }
        const result = await executeTool("paypal_execute_toolkit_action", body);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }


    // Multimodal Delivery Confirmation
    if (pathname === "/api/v1/shipment/confirm-receipt" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = await actionDispatcher.confirmShipmentReceipt(body.orderId, {
          photoBase64: body.photoBase64,
          conditionStatus: body.conditionStatus || "GOOD_CONDITION",
          notes: body.notes,
          buyerId: body.buyerId || "sme_austin_01",
          coalitionId: body.coalitionId || undefined
        });
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    // Clan Leader Subscription & Pricing Configuration
    if (pathname === "/api/v1/clan/subscription-settings" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = actionDispatcher.updateClanSubscription(body.clanId, body);
        sendJson(res, 200, { status: "SUCCESS", clanId: body.clanId, subscription: result });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    // Matchmaking Snapshot Export (JSON / CSV)
    if (pathname === "/api/v1/matchmaking/snapshot" && (req.method === "GET" || req.method === "POST")) {
      try {
        const format = url.searchParams.get("format") || "json";
        const snapshot = actionDispatcher.getMatchmakingSnapshot();

        if (format === "csv") {
          const headers = "id,name,sku,category,status,currentUnits,targetUnits,progressPct,retailPriceUsd,wholesalePriceUsd,savingsPct,totalEscrowUsd,membersCount,monthlyDuesUsd,yearlyDuesUsd,commitmentTerm\n";
          const rows = snapshot.clans.map(c =>
            `"${c.id}","${c.name}","${c.sku}","${c.category}","${c.status}",${c.currentUnits},${c.targetUnits},${c.progressPct},${c.retailPriceUsd},${c.wholesalePriceUsd},${c.savingsPct},"${c.totalEscrowUsd}",${c.membersCount},${c.subscription.monthlyDuesUsd},${c.subscription.yearlyDuesUsd},"${c.subscription.commitmentTerm}"`
          ).join("\n");
          res.writeHead(200, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="wholeshare_matchmaking_snapshot_${Date.now()}.csv"`
          });
          res.end(headers + rows);
          return;
        }

        sendJson(res, 200, snapshot);
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/snapshot" && req.method === "GET") {
      sendJson(res, 200, { components: listSnapshotComponents() });
      return;
    }

    if (pathname.startsWith("/api/v1/snapshot/") && req.method === "GET") {
      try {
        const component = safeDecode(pathname.slice("/api/v1/snapshot/".length));
        const format = url.searchParams.get("format") || "json";
        const filter = url.searchParams.get("filter") ? JSON.parse(url.searchParams.get("filter")) : [];
        const snapshot = await buildSnapshot(component, { filter, limit: url.searchParams.get("limit") || 100 });
        if (format === "csv") {
          res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${component}.csv"` });
          res.end(snapshotCsv(snapshot));
        } else if (format === "html") {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(snapshotHtml(snapshot));
        } else {
          sendJson(res, 200, snapshot);
        }
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : "Could not build the snapshot." });
      }
      return;
    }

    if (pathname === "/api/v1/suppliers/find" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        if (!body.product) { sendJson(res, 400, { error: "product is required." }); return; }
        sendJson(res, 200, await executeTool("find_suppliers", { product: String(body.product), country: body.country, webSearch: body.webSearch === true }));
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : "Supplier search failed." });
      }
      return;
    }

    if (pathname === "/api/v1/model/chat-completions" && req.method === "POST") {
      try {
        const body = await readJsonBody(req, 4 * 1024 * 1024);
        const forwarded = { ...body, ...mosaicRequestExtras() };
        delete forwarded.chat_template_kwargs;
        Object.assign(forwarded, mosaicRequestExtras());
        if (process.env.MOSAIC_MODEL_NAME) forwarded.model = process.env.MOSAIC_MODEL_NAME;
        const upstream = await fetch(mosaicChatCompletionsUrl(), { method: "POST", headers: mosaicHeaders(), body: JSON.stringify(forwarded), signal: AbortSignal.timeout(180000) });
        res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") || "application/json" });
        res.end(Buffer.from(await upstream.arrayBuffer()));
      } catch (error) {
        sendJson(res, 502, { error: `The model could not be reached: ${error instanceof Error ? error.message : "unknown error"}` });
      }
      return;
    }

    if (pathname === "/api/v1/harness/usage" && req.method === "GET") {
      sendJson(res, 200, { ...getModelUsage(), spend: getModelSpend() });
      return;
    }

    if (pathname === "/api/v1/harness" && req.method === "GET") {
      sendJson(res, 200, {
        name: "WholeShare Mosaic harness",
        version: 1,
        summary: "Any model with OpenAI style tool calling can drive WholeShare. The model proposes tool calls, the server validates and runs them, and every screen updates from the same events.",
        model: describeProvider(),
        connect: {
          configure: "Set MOSAIC_PROVIDER (local, fireworks, openai, openrouter, custom), MOSAIC_MODEL_NAME and a key, then restart. See docs/HARNESS.md.",
          run: { method: "POST", path: "/api/v1/agent/chat", body: { prompt: "string", maxTurns: "number, default 4", metadata: { source: "mosaic-deep-work", context: { view: "string", history: "[{role, text}]" } } } },
          returns: { status: "COMPLETED | FAILED", finalMessage: "string", steps: "[{toolName, toolArgs, toolResult}]", sessionId: "string" },
          events: { transport: "SSE GET /api/v1/events", names: ["AGENT_SESSION_STARTED", "AGENT_TOOL_CALL", "AGENT_TOOL_RESULT", "AGENT_THOUGHT", "AGENT_SESSION_COMPLETED", "AGENT_FAILURE", "UI_ACTION", "SCHEDULE_CHANGED", "CLAIM_INTAKEN"] }
        },
        tools: describeHarness(),
        dataSources: listSources(),
        snapshots: listSnapshotComponents(),
        guardrails: [
          "Money never moves from a model call. Pledges, captures and payouts need the person to approve on PayPal.",
          "Tools that change the world are gated by user permissions (agentPermissions) and report a blocked result the UI can turn into a one click allow.",
          "A product named in a supplier search or group start must appear in the person's own words.",
          "Schedule changes are validated server side and written to an undo log.",
          "Web results are saved as unverified leads and never as suppliers."
        ],
        conformance: "node scripts/verify-harness.js"
      });
      return;
    }

    if (pathname === "/api/v1/mosaic/suggestions" && req.method === "GET") {
      try {
        sendJson(res, 200, { suggestions: await buildSuggestions() });
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : "Could not build suggestions." });
      }
      return;
    }

    if (pathname === "/api/v1/mosaic/fill-form" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        sendJson(res, 200, await fillForm({ form: body.form, text: body.text, current: body.current && typeof body.current === "object" ? body.current : {} }));
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : "Mosaic could not read that." });
      }
      return;
    }

    // Dynamic Qwen Information Extractor & ML Matchmaker
    if (pathname === "/api/v1/matchmaking/match" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const startTime = Date.now();
        let matchVector = body.matchVector;

        if (!matchVector && body.query) {
          matchVector = await extractMatchVector(body.query);
        }

        if (!matchVector) {
          sendJson(res, 400, { error: "Either query or matchVector must be provided." });
          return;
        }

        const rankedClans = await matchAndRankClans(matchVector);
        const durationMs = Date.now() - startTime;

        if (rankedClans.length > 0) {
          const topClan = rankedClans[0].clan;
          if (!actionDispatcher.coalitions.has(topClan.id)) {
            actionDispatcher.coalitions.set(topClan.id, {
              id: topClan.id,
              sku: topClan.canonicalSku,
              skuName: topClan.name,
              targetUnits: topClan.targetUnits,
              currentUnits: topClan.currentUnits,
              unitPriceCents: topClan.baseUnitPriceCents,
              discountTierPct: topClan.discountTiers[topClan.discountTiers.length - 1]?.discountPct || 25,
              status: topClan.status,
              members: [],
              createdAt: topClan.createdAt,
              updatedAt: new Date().toISOString()
            });
            actionDispatcher.broadcast("COALITION_CREATED", { coalitionId: topClan.id, clan: topClan });
          }
        }

        sendJson(res, 200, {
          matchVector,
          rankedClans,
          durationMs
        });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/matchmaking/join" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const { clanId, matchVector } = body;
        if (!clanId || !matchVector) {
          sendJson(res, 400, { error: "Missing clanId or matchVector." });
          return;
        }

        const result = joinClanWithEscrow(clanId, matchVector);
        const targetClan = actionDispatcher.coalitions.get(clanId);
        if (targetClan) {
          targetClan.currentUnits = result.clan.currentUnits;
          targetClan.status = result.clan.status;
          targetClan.updatedAt = new Date().toISOString();
        }

        actionDispatcher.broadcast("COALITION_UPDATED", {
          coalitionId: clanId,
          status: result.clan.status,
          currentUnits: result.clan.currentUnits
        });

        sendJson(res, 200, {
          success: true,
          clan: result.clan,
          escrow: result.escrow
        });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/matchmaking/lock" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const { clanId } = body;
        if (!clanId) {
          sendJson(res, 400, { error: "Missing clanId." });
          return;
        }

        const escrow = lockClanEscrow(clanId);
        const targetClan = actionDispatcher.coalitions.get(clanId);
        if (targetClan) {
          targetClan.status = "LOCKED";
          targetClan.updatedAt = new Date().toISOString();
        }

        actionDispatcher.broadcast("COALITION_LOCKED", {
          coalitionId: clanId,
          status: "LOCKED"
        });

        sendJson(res, 200, {
          success: true,
          escrow
        });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/matchmaking/dispute" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const { clanId, reason } = body;
        if (!clanId) {
          sendJson(res, 400, { error: "Missing clanId." });
          return;
        }

        openCustomerDispute(clanId, reason || "Damaged delivery reported during 48h inspection window");
        const settledEscrow = settleEscrow(clanId, "PRO_RATA_CLAIM_SETTLED");

        const targetClan = actionDispatcher.coalitions.get(clanId);
        if (targetClan) {
          targetClan.status = "SETTLED";
          targetClan.updatedAt = new Date().toISOString();
        }

        actionDispatcher.broadcast("COALITION_SETTLED", {
          coalitionId: clanId,
          status: "SETTLED",
          resolution: "PRO_RATA_CLAIM_SETTLED"
        });

        sendJson(res, 200, {
          success: true,
          escrow: settledEscrow
        });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/matchmaking/cities" && req.method === "GET") {
      try {
        const cities = loadGazetteer();
        const q = url.searchParams.get("q")?.toLowerCase();
        let results = cities;
        if (q) {
          results = cities.filter(c => c.city.toLowerCase().includes(q) || c.countryCode.toLowerCase() === q);
        }
        sendJson(res, 200, { count: results.length, cities: results.slice(0, 50) });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    // Interactive Onboarding Checklist Interview
    if (pathname === "/api/v1/agent-invites" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const createdBy = String(body.createdBy || "demo-workspace").replace(/[<>"'`&]/g, "").slice(0, 40) || "demo-workspace";
        const rateCheck = agentInviteCreateLimiter.isAllowed(clientIp(req));
        if (!rateCheck.allowed) {
          sendJson(res, 429, {
            error: "Rate limit exceeded. Maximum 10 invites per hour.",
            retryAfterSec: rateCheck.retryAfterSec
          });
          return;
        }

        const token = crypto.randomBytes(16).toString("hex");
        const host = req.headers.host || "localhost:3000";
        const protocol = req.headers["x-forwarded-proto"] || (host.startsWith("localhost") ? "http" : "https");
        const inviteUrl = `${protocol}://${host}/agent/${token}`;
        const createdAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const invite = {
          token,
          createdBy,
          createdAt,
          expiresAt,
          revoked: false,
          uses: 0,
          maxUses: 0
        };

        const invites = loadAgentInvites();
        invites.unshift(invite);
        saveAgentInvites(invites);

        logDurableEvent("AGENT_INVITE_CREATED", { token, createdBy, expiresAt });

        sendJson(res, 201, {
          token,
          inviteUrl,
          expiresAt,
          createdBy
        });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    // GET /api/v1/agent-invites: List current workspace invites
    if (pathname === "/api/v1/agent-invites" && req.method === "GET") {
      try {
        const invites = loadAgentInvites();
        const host = req.headers.host || "localhost:3000";
        const protocol = req.headers["x-forwarded-proto"] || (host.startsWith("localhost") ? "http" : "https");
        const mapped = invites.map(inv => ({
          ...inv,
          inviteUrl: `${protocol}://${host}/agent/${inv.token}`
        }));
        sendJson(res, 200, { invites: mapped });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    // DELETE /api/v1/agent-invites/<token>: Revoke an invite
    if (pathname.startsWith("/api/v1/agent-invites/") && req.method === "DELETE") {
      try {
        const token = pathname.substring("/api/v1/agent-invites/".length);
        const invites = loadAgentInvites();
        const invite = invites.find(inv => inv.token === token);
        if (!invite) {
          sendJson(res, 404, { error: "Invite token not found." });
          return;
        }
        invite.revoked = true;
        invite.revokedAt = new Date().toISOString();
        saveAgentInvites(invites);
        logDurableEvent("AGENT_INVITE_REVOKED", { token });
        sendJson(res, 200, { status: "REVOKED", token });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    // GET /api/v1/agent/<token> or GET /agent/<token>: Manifest JSON endpoint
    const isManifestApi = pathname.startsWith("/api/v1/agent/") && !pathname.startsWith("/api/v1/agent/sessions") && !pathname.startsWith("/api/v1/agent/onboard") && !pathname.startsWith("/api/v1/agent/pledge-quote");
    const isDirectAgentUrl = pathname.startsWith("/agent/") && !pathname.startsWith("/agent-");

    if ((isManifestApi || isDirectAgentUrl) && req.method === "GET") {
      const token = pathname.replace(/^\/api\/v1\/agent\//, "").replace(/^\/agent\//, "");

      if (isDirectAgentUrl && (req.headers.accept?.includes("text/html") || !req.headers.accept?.includes("application/json"))) {
        res.writeHead(302, { Location: `/#agent/${token}` });
        res.end();
        return;
      }

      const invites = loadAgentInvites();
      const invite = invites.find(inv => inv.token === token);
      if (!invite) {
        sendJson(res, 404, { error: "Invite token not found." });
        return;
      }

      const isExpired = new Date(invite.expiresAt).getTime() <= Date.now();
      if (invite.revoked || isExpired) {
        sendJson(res, 410, {
          error: "Invite token has expired or been revoked.",
          revoked: !!invite.revoked,
          expired: isExpired
        });
        return;
      }

      invite.uses = (invite.uses || 0) + 1;
      invite.lastAgent = { ...identifyAgent({ declared: url.searchParams.get("agent") || req.headers["x-agent-name"], userAgent: req.headers["user-agent"] }), at: new Date().toISOString() };
      saveAgentInvites(invites);
      logDurableEvent("AGENT_INVITE_MANIFEST_ACCESSED", { token, uses: invite.uses });

      const manifest = {
        platform: "WholeShare",
        what: "WholeShare forms B2B wholesale buying groups. Businesses pool demand, authorise escrow through PayPal, and settle on delivery.",
        invitedBy: invite.createdBy && invite.createdBy !== "demo-workspace" ? invite.createdBy : "a WholeShare business",
        expiresAt: invite.expiresAt,
        requiredProfile: {
          type: "object",
          required: ["businessName", "contactEmail", "product", "unitsWanted", "city", "countryCode"],
          properties: {
            businessName: {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "Identifies the member on the ledger."
            },
            contactEmail: {
              type: "string",
              format: "email",
              description: "Where the approval link and the summary go."
            },
            product: {
              type: "string",
              description: "Product SKU or product name wanted."
            },
            unitsWanted: {
              type: "integer",
              minimum: 1,
              description: "Units to buy. Needed to match a group and size the pledge."
            },
            city: {
              type: "string",
              description: "Buying groups are organised by city and corridor."
            },
            countryCode: {
              type: "string",
              minLength: 2,
              maxLength: 2,
              description: "ISO 2-letter country code for corridor and PayPal."
            }
          },
          optionalProperties: {
            maxUnitPriceCents: { type: "integer" },
            targetDeliveryDate: { type: "string", format: "date" },
            preferredSupplier: { type: "string" },
            notes: { type: "string", maxLength: 500 }
          }
        },
        endpoints: {
          onboard: "POST /api/v1/agent/onboard",
          sessionStatus: "GET /api/v1/agent/sessions/<id>",
          pledgeQuote: "POST /api/v1/agent/pledge-quote"
        },
        rules: [
          "Money never moves without the human approving on PayPal's site.",
          "Never invent a PayPal order ID, a tracking number, or a shipment date.",
          "If a required field is missing, ask for it. Do not guess.",
          "All amounts are in USD cents as integers."
        ],
        chat: {
          endpoint: "POST /api/v1/agent/chat",
          note: "Pass the invite token in the agentInviteToken field of the request body."
        }
      };

      sendJson(res, 200, manifest);
      return;
    }

    // POST /api/v1/agent/onboard: Agent profile intake and matchmaking
    if (pathname === "/api/v1/agent/onboard" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const token = body.token || body.agentInviteToken;
        if (!token) {
          sendJson(res, 401, { error: "An invite token is required to onboard." });
          return;
        }

        const invites = loadAgentInvites();
        const invite = invites.find(inv => inv.token === token);
        if (!invite) {
          sendJson(res, 404, { error: "Invite token not found." });
          return;
        }

        invite.lastAgent = { ...identifyAgent({ declared: body.agentName || req.headers["x-agent-name"], userAgent: req.headers["user-agent"] }), at: new Date().toISOString() };
        saveAgentInvites(invites);
        const isExpired = new Date(invite.expiresAt).getTime() <= Date.now();
        if (invite.revoked || isExpired) {
          sendJson(res, 410, {
            error: "Invite token has expired or been revoked.",
            revoked: !!invite.revoked,
            expired: isExpired
          });
          return;
        }

        const rateCheck = agentOnboardLimiter.isAllowed(token);
        if (!rateCheck.allowed) {
          sendJson(res, 429, {
            error: "Rate limit exceeded. Maximum 20 onboard submissions per hour per token.",
            retryAfterSec: rateCheck.retryAfterSec
          });
          return;
        }

        const missingFields = [];
        if (!body.businessName || typeof body.businessName !== "string" || !body.businessName.trim()) missingFields.push("businessName");
        if (!body.contactEmail || typeof body.contactEmail !== "string" || !body.contactEmail.trim()) missingFields.push("contactEmail");
        if (!body.product || typeof body.product !== "string" || !body.product.trim()) missingFields.push("product");
        if (body.unitsWanted === undefined || body.unitsWanted === null || body.unitsWanted === "") missingFields.push("unitsWanted");
        if (!body.city || typeof body.city !== "string" || !body.city.trim()) missingFields.push("city");
        if (!body.countryCode || typeof body.countryCode !== "string" || !body.countryCode.trim()) missingFields.push("countryCode");

        if (missingFields.length > 0) {
          sendJson(res, 422, {
            error: "Missing required profile fields.",
            missingFields
          });
          return;
        }

        const businessName = body.businessName.trim();
        if (businessName.length < 2 || businessName.length > 120) {
          sendJson(res, 422, { error: "businessName must be between 2 and 120 characters.", field: "businessName" });
          return;
        }

        const contactEmail = body.contactEmail.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(contactEmail)) {
          sendJson(res, 422, { error: "Invalid email format for contactEmail.", field: "contactEmail" });
          return;
        }

        const unitsWanted = Number(body.unitsWanted);
        if (!Number.isInteger(unitsWanted) || unitsWanted < 1) {
          sendJson(res, 422, { error: "unitsWanted must be an integer greater than 0.", field: "unitsWanted" });
          return;
        }

        const countryCode = body.countryCode.trim().toUpperCase();
        if (countryCode.length !== 2) {
          sendJson(res, 422, { error: "countryCode must be a 2-letter ISO code.", field: "countryCode" });
          return;
        }

        const city = body.city.trim();

        const allClans = getAllClans();
        const resolution = resolveProductSku(body.product, actionDispatcher.catalog, allClans);
        if (!resolution.resolved) {
          if (resolution.ambiguous) {
            sendJson(res, 422, {
              error: "Ambiguous product name matches multiple SKUs.",
              matchingSkus: resolution.matches
            });
            return;
          }
          sendJson(res, 422, {
            error: resolution.error || "No matching product found in catalogue.",
            field: "product"
          });
          return;
        }

        const resolvedSku = resolution.sku;
        const resolvedSkuName = resolution.name;

        const top3 = scoreClansForAgentProfile(
          { product: resolvedSku, unitsWanted, city, countryCode },
          allClans,
          actionDispatcher.coalitions
        );

        const bestScore = top3.length > 0 ? top3[0].score : 0;
        const strongMatch = bestScore >= 72;

        const sessionId = "sess_" + crypto.randomBytes(16).toString("hex");
        const session = {
          id: sessionId,
          token,
          status: "MATCHED",
          profile: {
            businessName,
            contactEmail,
            product: resolvedSku,
            productName: resolvedSkuName,
            unitsWanted,
            city,
            countryCode,
            maxUnitPriceCents: body.maxUnitPriceCents || null,
            targetDeliveryDate: body.targetDeliveryDate || null,
            preferredSupplier: body.preferredSupplier || null,
            notes: body.notes || null
          },
          matches: top3,
          chosenClanId: null,
          quote: null,
          paypalOrderId: null,
          approvalUrl: null,
          transcript: [
            {
              role: "agent",
              message: `Profile submitted for ${businessName}: ${unitsWanted} units of ${resolvedSkuName} in ${city}, ${countryCode}.`,
              timestamp: new Date().toISOString()
            }
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };

        const sessions = loadAgentSessions();
        sessions[sessionId] = session;
        saveAgentSessions(sessions);

        logDurableEvent("AGENT_ONBOARD_COMPLETED", { sessionId, token, businessName, product: resolvedSku, unitsWanted });

        let summary;
        if (strongMatch) {
          summary = `${businessName} is matched to ${top3[0].clanName}, ${unitsWanted} units of ${resolvedSkuName}. Match score ${top3[0].score}/100. Next step: choose a clan and request a pledge quote.`;
        } else {
          summary = `${businessName} submitted a profile for ${unitsWanted} units of ${resolvedSkuName}. None of the existing buying groups is a strong match (best score ${bestScore}/100, threshold is 72). You can join an existing group or start a new draft buying group.`;
        }

        sendJson(res, 201, {
          sessionId,
          product: resolvedSku,
          productName: resolvedSkuName,
          matches: top3,
          strongMatch,
          summary
        });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    // GET /api/v1/agent/sessions/<id>: Session status and transcript
    if (pathname.startsWith("/api/v1/agent/sessions/") && !pathname.endsWith("/choose") && req.method === "GET") {
      try {
        const sessionId = pathname.substring("/api/v1/agent/sessions/".length);
        const sessions = loadAgentSessions();
        const session = sessions[sessionId];
        if (!session) {
          sendJson(res, 404, { error: "Agent session not found." });
          return;
        }

        const isExpired = new Date(session.expiresAt).getTime() <= Date.now();
        if (isExpired && session.status !== "EXPIRED") {
          session.status = "EXPIRED";
          session.updatedAt = new Date().toISOString();
          saveAgentSessions(sessions);
        }

        if (session.status === "AWAITING_APPROVAL" && session.quoteCreatedAt) {
          const hoursElapsed = (Date.now() - session.quoteCreatedAt) / (1000 * 60 * 60);
          if (hoursElapsed > 24) {
            session.status = "MATCHED";
            session.quote = null;
            session.paypalOrderId = null;
            session.approvalUrl = null;
            session.summary = "The PayPal quote expired after 24 hours without approval. No money moved. Please request a new pledge quote.";
            session.updatedAt = new Date().toISOString();
            saveAgentSessions(sessions);
          }
        }

        sendJson(res, 200, session);
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    // POST /api/v1/agent/sessions/<id>/choose: Select clan for session
    if (pathname.startsWith("/api/v1/agent/sessions/") && pathname.endsWith("/choose") && req.method === "POST") {
      try {
        const sessionId = pathname.replace(/^\/api\/v1\/agent\/sessions\//, "").replace(/\/choose$/, "");
        const sessions = loadAgentSessions();
        const session = sessions[sessionId];
        if (!session) {
          sendJson(res, 404, { error: "Agent session not found." });
          return;
        }

        if (session.status === "EXPIRED" || new Date(session.expiresAt).getTime() <= Date.now()) {
          sendJson(res, 410, { error: "Agent session has expired." });
          return;
        }

        const body = await readJsonBody(req);
        let chosenClanId = body.clanId;

        if (body.createDraft) {
          const draftId = `clan_draft_${crypto.randomBytes(8).toString("hex")}`;
          const draftClan = {
            id: draftId,
            name: `${session.profile.productName} Agent Syndicate`,
            canonicalSku: session.profile.product,
            sku: session.profile.product,
            city: session.profile.city,
            countryCode: session.profile.countryCode,
            status: "DRAFT",
            currentUnits: 0,
            targetUnits: Math.max(session.profile.unitsWanted * 2, 100),
            baseUnitPriceCents: 1000,
            unitPriceCents: 1000,
            discountTierPct: 0,
            discountTiers: [{ minUnits: session.profile.unitsWanted, discountPct: 10 }],
            label: "draft started by an agent invite",
            isDraft: true,
            createdAt: new Date().toISOString()
          };
          actionDispatcher.coalitions.set(draftId, draftClan);
          chosenClanId = draftId;
        }

        if (!chosenClanId) {
          sendJson(res, 400, { error: "clanId or createDraft is required." });
          return;
        }

        let clan = actionDispatcher.coalitions.get(chosenClanId);
        if (!clan) {
          const allClans = getAllClans();
          clan = allClans.find(c => c.id === chosenClanId);
        }

        if (!clan) {
          sendJson(res, 404, { error: `Clan ${chosenClanId} not found.` });
          return;
        }

        session.chosenClanId = chosenClanId;
        session.status = "QUOTED";
        const units = session.profile.unitsWanted;
        const unitPriceCents = clan.unitPriceCents || clan.baseUnitPriceCents || 1000;
        const discountTier = clan.discountTierPct || 0;
        const totalCents = unitPriceCents * units;

        session.quote = {
          clanId: chosenClanId,
          clanName: clan.name,
          units,
          unitPriceCents,
          totalCents,
          discountTier,
          clanStatus: clan.status || "FORMING"
        };
        session.updatedAt = new Date().toISOString();
        session.transcript.push({
          role: "agent",
          message: `Chosen clan: ${clan.name} (${chosenClanId}). Quoted ${units} units at $${(unitPriceCents / 100).toFixed(2)}.`,
          timestamp: new Date().toISOString()
        });

        saveAgentSessions(sessions);
        logDurableEvent("AGENT_CLAN_CHOSEN", { sessionId, clanId: chosenClanId, units, totalCents });

        const summary = `${session.profile.businessName} chose ${clan.name}. Quote: ${units} units at $${(unitPriceCents / 100).toFixed(2)}, total $${(totalCents / 100).toFixed(2)}. Next step: request a pledge quote to create the PayPal authorization link.`;

        sendJson(res, 200, {
          sessionId,
          quote: session.quote,
          summary
        });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    // POST /api/v1/agent/pledge-quote: Generate PayPal Orders v2 AUTHORIZE soft hold
    if (pathname === "/api/v1/agent/pledge-quote" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const sessionId = body.sessionId;
        if (!sessionId) {
          sendJson(res, 400, { error: "sessionId is required." });
          return;
        }

        const sessions = loadAgentSessions();
        const session = sessions[sessionId];
        if (!session) {
          sendJson(res, 404, { error: "Agent session not found." });
          return;
        }

        if (session.status === "EXPIRED" || new Date(session.expiresAt).getTime() <= Date.now()) {
          sendJson(res, 410, { error: "Agent session has expired." });
          return;
        }

        if (!session.chosenClanId) {
          sendJson(res, 400, { error: "No clan chosen for this session. Choose a clan first." });
          return;
        }

        const units = body.units || session.profile.unitsWanted;
        let clan = actionDispatcher.coalitions.get(session.chosenClanId);
        if (!clan) {
          const allClans = getAllClans();
          clan = allClans.find(c => c.id === session.chosenClanId);
        }

        const unitPriceCents = session.quote?.unitPriceCents || clan?.unitPriceCents || clan?.baseUnitPriceCents || 1000;
        const totalAmountCents = unitPriceCents * units;

        const order = await createOrderAuthorization({
          amountCents: totalAmountCents,
          currency: "USD",
          referenceId: `wholeshare:${session.chosenClanId}`
        });

        if (!order.orderId) {
          throw new Error("PayPal did not return an order ID.");
        }

        const approvalLink = (order.links || []).find(l => l.rel === "approve" || l.rel === "payer-action")?.href
          || `https://www.sandbox.paypal.com/checkoutnow?token=${order.orderId}`;

        session.status = "AWAITING_APPROVAL";
        session.paypalOrderId = order.orderId;
        session.approvalUrl = approvalLink;
        session.quoteCreatedAt = Date.now();
        session.amountCents = totalAmountCents;
        session.updatedAt = new Date().toISOString();

        session.transcript.push({
          role: "agent",
          message: `Created PayPal hold authorization order ${order.orderId} for $${(totalAmountCents / 100).toFixed(2)}. Approval URL: ${approvalLink}`,
          timestamp: new Date().toISOString()
        });

        saveAgentSessions(sessions);
        logDurableEvent("AGENT_PLEDGE_QUOTED", {
          sessionId,
          orderId: order.orderId,
          amountCents: totalAmountCents,
          approvalUrl: approvalLink
        });

        const summary = `${session.profile.businessName} is matched to ${clan?.name || session.profile.productName}, ${units} units at $${(unitPriceCents / 100).toFixed(2)}, total $${(totalAmountCents / 100).toFixed(2)}. Next step: approve the PayPal hold at ${approvalLink}. Nothing is charged until delivery is confirmed.`;

        sendJson(res, 200, {
          sessionId,
          orderId: order.orderId,
          amountCents: totalAmountCents,
          currency: "USD",
          status: "AWAITING_APPROVAL",
          approvalUrl: approvalLink,
          summary
        });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    // ========================================================================
    // STATIC ASSETS & SINGLE-PAGE APPLICATION SERVING
    // ========================================================================
    if (pathname.startsWith("/api/")) {
      sendJson(res, 404, { error: `No such endpoint: ${req.method} ${pathname}` });
      return;
    }
    let filePath = pathname === "/" ? resolve(PUBLIC_DIR, "index.html") : resolve(PUBLIC_DIR, pathname.slice(1));
    if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + sep)) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }

    if (!existsSync(filePath)) {
      const ext = extname(pathname);
      if (ext && ext !== ".html") {
        sendJson(res, 404, { error: `Asset not found: ${pathname}` });
        return;
      }
      filePath = resolve(PUBLIC_DIR, "index.html");
    }

    try {
      // The bundle is large. Serve the precompressed copy the build wrote when the browser accepts it.
      const accepts = String(req.headers["accept-encoding"] || "");
      let encoding = "";
      let source = filePath;
      if (extname(filePath) !== ".html") {
        if (/\bbr\b/.test(accepts) && existsSync(`${filePath}.br`)) { source = `${filePath}.br`; encoding = "br"; }
        else if (/\bgzip\b/.test(accepts) && existsSync(`${filePath}.gz`)) { source = `${filePath}.gz`; encoding = "gzip"; }
      }
      let content = readFileSync(source);
      const ext = extname(filePath);
      if (ext === ".html") {
        let htmlStr = content.toString("utf-8");
        if (!htmlStr.includes("ws-agent-hash-fallback")) {
          const fallbackScript = `
  <script id="ws-agent-hash-fallback">
    (function() {
      function renderAgentFallback() {
        if (!window.location.hash.startsWith("#agent/")) {
          var old = document.getElementById("ws-agent-container");
          if (old) old.remove();
          return;
        }
        var token = window.location.hash.substring(7);
        if (!token) return;
        if (document.querySelector("[data-ws-agent-native]")) return;
        var esc = function(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function(c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
        var container = document.getElementById("ws-agent-container");
        if (!container) {
          container = document.createElement("div");
          container.id = "ws-agent-container";
          container.style.position = "fixed";
          container.style.inset = "0";
          container.style.zIndex = "99999";
          container.style.background = "#09090b";
          container.style.overflowY = "auto";
          container.style.padding = "24px";
          document.body.appendChild(container);
        }
        if (container.querySelector("[data-testid='agent-onboard-submit-button']")) return;
        fetch("/api/v1/agent/" + token)
          .then(function(res) { return res.json(); })
          .then(function(manifest) {
            if (manifest.error) {
              container.innerHTML = '<div style="max-width:700px;margin:40px auto;padding:24px;font-family:sans-serif;color:#fff;background:#18181b;border:1px solid #ef4444;border-radius:8px;"><h2>Invitation Unavailable</h2><p>' + esc(manifest.error) + '</p></div>';
              return;
            }
            container.innerHTML = '<div class="ws-view-pane ws-capability-view" style="max-width:800px;margin:32px auto;padding:24px;font-family:sans-serif;color:#fff;">' +
              '<p class="ws-eyebrow" style="color:#10b981;font-size:12px;font-weight:600;letter-spacing:1px;">WHOLESHARE AGENT INVITATION</p>' +
              '<h1 class="ws-view-title" style="font-size:24px;margin:8px 0 16px 0;">Join a wholesale buying group</h1>' +
              '<p style="color:#a1a1aa;font-size:15px;margin-bottom:20px;">' + esc(manifest.what) + '</p>' +
              '<div style="padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:6px;margin-bottom:20px;font-size:13px;">Invited by <strong>' + esc(manifest.invitedBy) + '</strong>. Valid until ' + new Date(manifest.expiresAt).toLocaleDateString() + '.</div>' +
              '<form id="agent-onboard-form" class="ws-capability-card" style="display:flex;flex-direction:column;gap:14px;background:#18181b;padding:20px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);">' +
              '<h2>Business profile intake</h2>' +
              '<p style="color:#888;font-size:13px;margin:0;">Provide six standard facts to match with active volume buying syndicates.</p>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
              '<div><label style="display:block;font-size:12px;margin-bottom:4px;">Business Name</label><input id="agent-biz" name="businessName" required placeholder="Acme Roasting Co" style="width:100%;padding:8px;background:#000;border:1px solid #333;color:#fff;border-radius:4px;" /></div>' +
              '<div><label style="display:block;font-size:12px;margin-bottom:4px;">Contact Email</label><input id="agent-email" name="contactEmail" type="email" required placeholder="procurement@acme.com" style="width:100%;padding:8px;background:#000;border:1px solid #333;color:#fff;border-radius:4px;" /></div>' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">' +
              '<div><label style="display:block;font-size:12px;margin-bottom:4px;">Product SKU or Name</label><input id="agent-prod" name="product" required placeholder="organic-flour-50lb" style="width:100%;padding:8px;background:#000;border:1px solid #333;color:#fff;border-radius:4px;" /></div>' +
              '<div><label style="display:block;font-size:12px;margin-bottom:4px;">Units Wanted</label><input id="agent-units" name="unitsWanted" type="number" min="1" value="10" required style="width:100%;padding:8px;background:#000;border:1px solid #333;color:#fff;border-radius:4px;" /></div>' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">' +
              '<div><label style="display:block;font-size:12px;margin-bottom:4px;">City</label><input id="agent-city" name="city" required placeholder="Austin" style="width:100%;padding:8px;background:#000;border:1px solid #333;color:#fff;border-radius:4px;" /></div>' +
              '<div><label style="display:block;font-size:12px;margin-bottom:4px;">Country Code</label><input id="agent-country" name="countryCode" maxlength="2" required value="US" style="width:100%;padding:8px;background:#000;border:1px solid #333;color:#fff;border-radius:4px;" /></div>' +
              '</div>' +
              '<div id="agent-form-error" style="color:#ef4444;font-size:13px;display:none;"></div>' +
              '<button type="submit" data-testid="agent-onboard-submit-button" class="ws-btn ws-btn-primary" style="padding:10px 16px;background:#10b981;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;">Find wholesale buying groups</button>' +
              '</form>' +
              '<div id="agent-matches-container" style="display:none;margin-top:20px;"></div>' +
              '</div>';

            var form = document.getElementById("agent-onboard-form");
            form.addEventListener("submit", function(evt) {
              evt.preventDefault();
              var errDiv = document.getElementById("agent-form-error");
              errDiv.style.display = "none";
              var payload = {
                token: token,
                businessName: document.getElementById("agent-biz").value,
                contactEmail: document.getElementById("agent-email").value,
                product: document.getElementById("agent-prod").value,
                unitsWanted: parseInt(document.getElementById("agent-units").value, 10),
                city: document.getElementById("agent-city").value,
                countryCode: document.getElementById("agent-country").value
              };
              fetch("/api/v1/agent/onboard", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
              }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
                .then(function(res) {
                  if (!res.ok) {
                    errDiv.innerText = res.data.error || "Onboard failed.";
                    errDiv.style.display = "block";
                    return;
                  }
                  form.style.display = "none";
                  var cont = document.getElementById("agent-matches-container");
                  cont.style.display = "block";
                  cont.innerHTML = '<div style="padding:16px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:6px;margin-bottom:16px;"><strong>Profile onboarded</strong><p style="margin:4px 0 0 0;">' + esc(res.data.summary) + '</p></div>' +
                    '<h2>Top Matched Buying Groups</h2>' +
                    res.data.matches.map(function(m) {
                      return '<div style="padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:6px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">' +
                        '<div><strong>' + esc(m.clanName) + '</strong> (' + esc(m.score) + '/100 Match)<p style="margin:4px 0 0 0;font-size:12px;color:#888;">' + esc(m.reason) + '</p></div>' +
                        '<div style="text-align:right;">$' + (m.unitPriceCents/100).toFixed(2) + ' / unit</div>' +
                        '</div>';
                    }).join("");
                }).catch(function(e) {
                  errDiv.innerText = e.message;
                  errDiv.style.display = "block";
                });
            });
          });
      }
      window.addEventListener("hashchange", renderAgentFallback);
      window.addEventListener("DOMContentLoaded", renderAgentFallback);
      setTimeout(renderAgentFallback, 200);
      setTimeout(renderAgentFallback, 1000);
    })();
  </script>
</body>`;
          htmlStr = htmlStr.replace("</body>", () => fallbackScript);
          content = Buffer.from(htmlStr, "utf-8");
        }
      }
      const headers = { "Content-Type": MIME_TYPES[ext] || "text/plain" };
      if (ext !== ".html") {
        headers["Cache-Control"] = "public, max-age=300";
        headers.Vary = "Accept-Encoding";
        if (encoding) headers["Content-Encoding"] = encoding;
      }
      res.writeHead(200, headers);
      res.end(content);
    } catch {
      sendJson(res, 404, { error: "Not found" });
    }
  });
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  const server = createWebServer();
  server.listen(PORT, () => {
    console.log(`=== Wholeshare Web Command Center running at http://localhost:${PORT} ===`);
    void Promise.all(["groups", "shipments", "ledger", "claims", "suppliers"].map((id) => querySource(id, { limit: 1 }))).catch(() => undefined);
    try { rebaseStoryShipments(); } catch (error) { console.warn(`[story] shipment dates not refreshed: ${error.message}`); }
    setInterval(() => { try { rebaseStoryShipments(); } catch { /* next hour */ } }, 3600 * 1000).unref();
    durableHarness.warmUp().then(() => console.log("[mosaic] model warmed")).catch((error) => console.warn(`[mosaic] warm-up skipped: ${error.message}`));
  });
}

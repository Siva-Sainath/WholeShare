import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { actionDispatcher } from "../lib/web-actions.js";
import { createOrderAuthorization, authorizeOrderHold } from "../lib/paypal-bridge.js";
import { durableHarness } from "../lib/durable-harness.js";
import { WHOLESHARE_TOOL_DECLARATIONS } from "../lib/tool-registry.js";
import { loadAllFeatures } from "../lib/feature-map.js";
import { agentRateLimiter, apiRateLimiter } from "../lib/rate-limiter.js";
import { recordDisputeEvent } from "../lib/db.js";
import {
  ingestDocument,
  importGoogleDriveFile,
  processAgentDocumentIngress,
  queryProcurementBaseline,
  listIngestedDocuments
} from "../lib/ingestion-pipeline.js";

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
  ".csv": "text/csv; charset=utf-8"
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("Payload too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function createWebServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // CORS Headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Wholeshare-Signature, X-Wholeshare-Timestamp");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // SSE Event Stream Endpoint
    if (pathname === "/api/v1/events" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      actionDispatcher.subscribeSse(res);
      req.on("close", () => {
        actionDispatcher.unsubscribeSse(res);
      });
      return;
    }

    // API Routes
    if (pathname === "/api/v1/health" && req.method === "GET") {
      sendJson(res, 200, { status: "HEALTHY", uptime: process.uptime() });
      return;
    }

    if (pathname === "/api/v1/ledger" && req.method === "GET") {
      sendJson(res, 200, actionDispatcher.getLedgerState());
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
        const coalition = actionDispatcher.authorizeEscrow(coalitionId);

        // Execute Orders v2 soft holds
        for (const m of coalition.members) {
          const auth = await createOrderAuthorization({
            amountCents: m.authorizedCents,
            referenceId: m.smeId
          });
          m.paypalOrderId = auth.orderId;
        }

        sendJson(res, 200, { status: "LOCKED", coalition });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    // Autopilot: Executes full deal cycle with local Qwen 3.5 9B
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

        const coalition = actionDispatcher.authorizeEscrow("coalition_flour_01");

        for (const m of coalition.members) {
          const auth = await createOrderAuthorization({
            amountCents: m.authorizedCents,
            referenceId: m.smeId
          });
          m.paypalOrderId = auth.orderId;
        }

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

    if (pathname === "/api/v1/agent/chat" && req.method === "POST") {
      const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
      const rateCheck = agentRateLimiter.isAllowed(clientIp);
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
        const prompt = body.prompt || "Reflect ledger state and evaluate active coalitions.";
        const sessionId = body.sessionId || `sess_${Date.now()}`;
        const result = await durableHarness.startSession({
          prompt,
          sessionId,
          metadata: body.metadata || {}
        });
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      } finally {
        agentRateLimiter.release(clientIp);
      }
      return;
    }

    if (pathname === "/api/v1/paypal/webhook" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const eventType = body.event_type;
        const resource = body.resource || {};
        const disputeId = resource.dispute_id || resource.id || `DISPUTE_${Date.now()}`;
        const orderId = resource.disputed_transactions?.[0]?.seller_transaction_id || resource.custom_id || null;
        const reason = resource.reason || "BUYER_COMPLAINT";
        const status = resource.status || (eventType === "CUSTOMER.DISPUTE.RESOLVED" ? "RESOLVED" : "UNDER_REVIEW");

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

        sendJson(res, 200, { received: true, disputeId, status });
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
        sendJson(res, 201, result);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/api/v1/ingest/google-drive" && req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        const result = importGoogleDriveFile({
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

    // Static Asset Serving
    let filePath = pathname === "/" ? resolve(PUBLIC_DIR, "index.html") : resolve(PUBLIC_DIR, pathname.slice(1));
    if (!filePath.startsWith(PUBLIC_DIR)) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }

    if (!existsSync(filePath)) {
      filePath = resolve(PUBLIC_DIR, "index.html");
    }

    try {
      const content = readFileSync(filePath);
      const ext = extname(filePath);
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "text/plain" });
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
  });
}

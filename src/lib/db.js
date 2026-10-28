import pg from "pg";
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/wholeshare";
const SESSIONS_DIR = resolve(process.cwd(), "data/memory/sessions");
const JOURNAL_FILE = resolve(process.cwd(), "data/durable_journal.json");

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

function ensureDirectory(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function appendToJournal(entry) {
  try {
    ensureDirectory(dirname(JOURNAL_FILE));
    const line = JSON.stringify({ ...entry, loggedAt: new Date().toISOString() }) + "\n";
    appendFileSync(JOURNAL_FILE, line, "utf-8");
  } catch {
    // Fail-safe journal logging
  }
}

function readSessionFile(sessionId) {
  try {
    const filePath = resolve(SESSIONS_DIR, `${sessionId}.json`);
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeSessionFile(sessionId, data) {
  try {
    ensureDirectory(SESSIONS_DIR);
    const filePath = resolve(SESSIONS_DIR, `${sessionId}.json`);
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Fail-safe file writing
  }
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function lockCoalition(client, coalitionId) {
  const res = await client.query(
    "SELECT * FROM coalitions WHERE id = $1 FOR UPDATE",
    [coalitionId]
  );
  return res.rows[0] || null;
}

export async function appendAuditEvent(client, coalitionId, eventType, payload) {
  const res = await client.query(
    "INSERT INTO audit_events (coalition_id, event_type, payload) VALUES ($1, $2, $3) RETURNING *",
    [coalitionId, eventType, JSON.stringify(payload)]
  );
  return res.rows[0];
}

export async function createAgentSession({
  id,
  model = "qwen3.5:9b",
  prompt,
  status = "RUNNING",
  metadata = {}
}) {
  const sessionRecord = {
    id,
    model,
    status,
    prompt,
    finalMessage: null,
    totalDurationMs: 0,
    metadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: []
  };

  appendToJournal({ action: "SESSION_CREATED", id, status, model });
  writeSessionFile(id, sessionRecord);

  try {
    const res = await pool.query(
      `INSERT INTO agent_sessions (id, model, status, prompt)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, model, status, prompt]
    );
    return res.rows[0];
  } catch {
    return sessionRecord;
  }
}

export async function updateAgentSessionStatus(id, status, metadata = {}) {
  const existing = readSessionFile(id) || { id, steps: [] };
  existing.status = status;
  existing.updatedAt = new Date().toISOString();
  if (metadata.finalMessage !== undefined) {
    existing.finalMessage = metadata.finalMessage;
  }
  if (metadata.totalDurationMs !== undefined) {
    existing.totalDurationMs = metadata.totalDurationMs;
  }
  if (metadata.stepUpToken !== undefined) {
    existing.stepUpToken = metadata.stepUpToken;
  }
  writeSessionFile(id, existing);
  appendToJournal({ action: "SESSION_STATUS_UPDATED", id, status, metadata });

  try {
    const res = await pool.query(
      `UPDATE agent_sessions
       SET status = $2,
           final_message = COALESCE($3, final_message),
           total_duration_ms = COALESCE($4, total_duration_ms),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, status, metadata.finalMessage || null, metadata.totalDurationMs || null]
    );
    return res.rows[0] || existing;
  } catch {
    return existing;
  }
}

export async function saveAgentStep({
  sessionId,
  stepIndex,
  thought = "",
  toolName = null,
  toolArgs = {},
  toolResult = {},
  interceptorStatus = "PASSED",
  violations = null,
  durationMs = 0
}) {
  const stepRecord = {
    sessionId,
    stepIndex,
    thought,
    toolName,
    toolArgs,
    toolResult,
    interceptorStatus,
    violations,
    durationMs,
    createdAt: new Date().toISOString()
  };

  const session = readSessionFile(sessionId);
  if (session) {
    if (!Array.isArray(session.steps)) session.steps = [];
    session.steps.push(stepRecord);
    writeSessionFile(sessionId, session);
  }

  appendToJournal({ action: "STEP_SAVED", sessionId, stepIndex, toolName, interceptorStatus });

  try {
    const res = await pool.query(
      `INSERT INTO agent_steps (
         session_id, step_index, thought, tool_name,
         tool_args, tool_result, interceptor_status, violations, duration_ms
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        sessionId,
        stepIndex,
        thought,
        toolName,
        JSON.stringify(toolArgs),
        JSON.stringify(toolResult),
        interceptorStatus,
        violations ? JSON.stringify(violations) : null,
        durationMs
      ]
    );
    return res.rows[0];
  } catch {
    return stepRecord;
  }
}

export async function loadSessionTrajectory(sessionId) {
  try {
    const sessionRes = await pool.query("SELECT * FROM agent_sessions WHERE id = $1", [sessionId]);
    if (sessionRes.rows.length > 0) {
      const stepsRes = await pool.query(
        "SELECT * FROM agent_steps WHERE session_id = $1 ORDER BY step_index ASC",
        [sessionId]
      );
      const session = sessionRes.rows[0];
      session.steps = stepsRes.rows;
      return session;
    }
  } catch {
    // Database fallback
  }

  return readSessionFile(sessionId);
}

export async function recordDisputeEvent({
  disputeId,
  orderId = null,
  smeId = null,
  coalitionId = null,
  status = "OPEN",
  reason = null,
  resolutionOutcome = null
}) {
  appendToJournal({ action: "DISPUTE_RECORDED", disputeId, orderId, status });
  try {
    const res = await pool.query(
      `INSERT INTO dispute_records (
         paypal_dispute_id, paypal_order_id, sme_id, coalition_id,
         status, reason, resolution_outcome, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       ON CONFLICT (paypal_dispute_id) DO UPDATE
       SET status = EXCLUDED.status,
           resolution_outcome = EXCLUDED.resolution_outcome,
           updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [disputeId, orderId, smeId, coalitionId, status, reason, resolutionOutcome]
    );
    return res.rows[0];
  } catch {
    return { disputeId, orderId, status, resolutionOutcome };
  }
}

export async function getDisputeRecord(disputeId) {
  try {
    const res = await pool.query(
      "SELECT * FROM dispute_records WHERE paypal_dispute_id = $1",
      [disputeId]
    );
    return res.rows[0] || null;
  } catch {
    return null;
  }
}

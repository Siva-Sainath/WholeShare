import { randomUUID } from "node:crypto";
import { actionDispatcher } from "./web-actions.js";

// Lets the model act on the page the person is looking at. The server tells the open page which tool to run, the page runs it
// with the same registry outside agents use (AG Grid, AG Studio, Bryntum), and the result comes back so the model can see what happened.
const pending = new Map();
// Only the table, Bryntum and Studio tools can be run on a page this way. Nothing that reaches outside or spends.
const SAFE_NAME = /^(grid|bryntum|studio)_[a-z0-9_]{2,50}$/;
const MAX_RESULT_CHARS = 6000;

export function callPageTool(tool, args = {}, timeoutMs = 8000, sessionId = "") {
  if (!SAFE_NAME.test(String(tool))) return Promise.resolve({ error: `'${tool}' is not a page tool name.` });
  const text = JSON.stringify(args ?? {});
  if (text.length > 4000) return Promise.resolve({ error: "Those arguments are too large for a page tool." });
  const callId = `pt_${randomUUID()}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(callId);
      resolve({ error: "No open page answered. Ask the person to keep WholeShare open in the browser." });
    }, timeoutMs);
    pending.set(callId, { resolve, timer });
    actionDispatcher.broadcast("PAGE_TOOL_CALL", { callId, sessionId: String(sessionId).slice(0, 80), tool: String(tool), args: JSON.parse(text) });
  });
}

export function resolvePageTool(callId, outcome) {
  const entry = pending.get(String(callId));
  if (!entry) return false;
  clearTimeout(entry.timer);
  pending.delete(String(callId));
  let result = outcome?.result ?? null;
  const text = JSON.stringify(result) ?? "null";
  if (text.length > MAX_RESULT_CHARS) result = { truncated: true, start: text.slice(0, MAX_RESULT_CHARS) };
  entry.resolve(outcome?.ok === false ? { error: String(outcome.error ?? "The page tool failed.").slice(0, 300) } : { status: "SUCCESS", result });
  return true;
}

import test from "node:test";
import assert from "node:assert/strict";
import { actionDispatcher } from "../src/lib/web-actions.js";
import { callPageTool, resolvePageTool } from "../src/lib/page-bridge.js";

function capture() {
  const sent = [];
  const original = actionDispatcher.broadcast.bind(actionDispatcher);
  actionDispatcher.broadcast = (type, payload) => { if (type === "PAGE_TOOL_CALL") sent.push(payload); return original(type, payload); };
  return { sent, restore: () => { actionDispatcher.broadcast = original; } };
}

test("the page runs the tool and its result comes back to the caller", async () => {
  const spy = capture();
  const pending = callPageTool("grid_filter", { column: "city", value: "Flushing" });
  assert.equal(spy.sent.length, 1);
  assert.equal(spy.sent[0].tool, "grid_filter");
  assert.deepEqual(spy.sent[0].args, { column: "city", value: "Flushing" });
  assert.equal(resolvePageTool(spy.sent[0].callId, { ok: true, result: { rowsShown: 6 } }), true);
  assert.deepEqual(await pending, { status: "SUCCESS", result: { rowsShown: 6 } });
  spy.restore();
});

test("a page error is returned as an error, not thrown", async () => {
  const spy = capture();
  const pending = callPageTool("grid_sort", { column: "nope" });
  resolvePageTool(spy.sent[0].callId, { ok: false, error: "No column nope" });
  assert.deepEqual(await pending, { error: "No column nope" });
  spy.restore();
});

test("with no open page the call times out with a plain message", async () => {
  const spy = capture();
  const outcome = await callPageTool("grid_filter", {}, 50);
  assert.match(outcome.error, /No open page answered/);
  spy.restore();
});

test("tool names and argument sizes are limited", async () => {
  assert.match((await callPageTool("rm -rf /", {})).error, /not a page tool name/);
  assert.match((await callPageTool("grid_filter", { text: "x".repeat(5000) })).error, /too large/);
});

test("an unknown call id is ignored", () => {
  assert.equal(resolvePageTool("pt_unknown", { ok: true }), false);
});

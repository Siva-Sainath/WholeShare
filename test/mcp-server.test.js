import test from "node:test";
import assert from "node:assert/strict";
import { handleMcpMessage, listMcpTools } from "../src/lib/mcp-server.js";
import { runExternalTool } from "../src/lib/durable-harness.js";

test("initialize negotiates a supported protocol version and advertises tools", async () => {
  const reply = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
  assert.equal(reply.result.protocolVersion, "2025-03-26");
  assert.ok(reply.result.capabilities.tools);
  const fallback = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  assert.equal(fallback.result.protocolVersion, "2025-06-18");
});

test("notifications get no reply and bad requests get a JSON-RPC error", async () => {
  assert.equal(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const bad = await handleMcpMessage({ id: 3, method: "tools/list" });
  assert.equal(bad.error.code, -32600);
  const ping = await handleMcpMessage({ jsonrpc: "2.0", id: 4, method: "ping" });
  assert.deepEqual(ping.result, {});
});

test("the tool list leaves out screen-only tools and adds ask_mosaic", () => {
  const names = listMcpTools().map((tool) => tool.name);
  for (const hidden of ["page_tool", "ui_navigate_view", "present", "ui_open_group"]) assert.ok(!names.includes(hidden), hidden);
  for (const shown of ["query", "compare_groups", "join_group", "ask_mosaic"]) assert.ok(names.includes(shown), shown);
  for (const tool of listMcpTools()) assert.equal(tool.inputSchema.type, "object");
});

test("a tool outside the allowed set is refused", async () => {
  const result = await runExternalTool("page_tool", { tool: "grid_chart" });
  assert.match(result.error, /not a tool this connection can use/);
  const unknown = await runExternalTool("capture_payment", {});
  assert.match(unknown.error, /not a tool/);
});

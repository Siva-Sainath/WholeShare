import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

// Proves the harness works with any OpenAI compatible model, not only the local Qwen.
// The stand-in below is a test double that speaks the chat completions protocol the way hosted providers do
// (string arguments, null content, no vendor extras). It scripts the model's choices, and the harness,
// guardrails and tools run for real.

const calls = [];
let script = [];

const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; });
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    calls.push(body);
    const next = script.shift() ?? { content: "Done." };
    const message = next.tool
      ? { role: "assistant", content: null, tool_calls: [{ id: `call_${calls.length}`, type: "function", function: { name: next.tool, arguments: JSON.stringify(next.args ?? {}) } }] }
      : { role: "assistant", content: next.content };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "x", object: "chat.completion", model: body.model, choices: [{ index: 0, finish_reason: next.tool ? "tool_calls" : "stop", message }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }));
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
delete process.env.MLX_SERVER_URL;
delete process.env.MOSAIC_ALLOW_CLOUD_FALLBACK;
process.env.MOSAIC_EXTRA_BODY = "";
process.env.MOSAIC_PROVIDER = "custom";
process.env.MOSAIC_MODEL_URL = `http://127.0.0.1:${port}`;
process.env.MOSAIC_MODEL_NAME = "any-compliant-model";
process.env.MOSAIC_MODEL_API_KEY = "test-key";

const { durableHarness, describeHarness } = await import("../src/lib/durable-harness.js");
const { describeProvider, mosaicRequestExtras } = await import("../src/lib/mosaic-config.js");

const run = (prompt, steps, context = {}) => {
  script = steps;
  calls.length = 0;
  return durableHarness.startSession({ prompt, maxTurns: 4, metadata: { source: "mosaic-deep-work", context } });
};

test("provider config comes from env and hosted providers get no vendor extras", () => {
  const info = describeProvider();
  assert.equal(info.provider, "custom");
  assert.equal(info.model, "any-compliant-model");
  assert.equal(info.hasApiKey, true);
  assert.equal(info.cloudFallback, false);
  const saved = { provider: process.env.MOSAIC_PROVIDER, url: process.env.MOSAIC_MODEL_URL };
  try {
    process.env.MOSAIC_PROVIDER = "fireworks";
    delete process.env.MOSAIC_MODEL_URL;
    process.env.MLX_SERVER_URL = "http://127.0.0.1:8000";
    assert.deepEqual(mosaicRequestExtras(), {});
    assert.equal(describeProvider().endpoint, "https://api.fireworks.ai/inference/v1/chat/completions");
  } finally {
    delete process.env.MLX_SERVER_URL;
    process.env.MOSAIC_PROVIDER = saved.provider;
    process.env.MOSAIC_MODEL_URL = saved.url;
  }
});

test("every focused tool declares an effect and valid JSON schema parameters", () => {
  const tools = describeHarness();
  assert.ok(tools.length >= 20);
  for (const tool of tools) {
    assert.ok(["read", "ui", "write", "external"].includes(tool.effect), `${tool.name} effect`);
    assert.equal(tool.parameters.type, "object", `${tool.name} parameters`);
  }
  assert.ok(!tools.some((tool) => /approve|capture|authorize|payout/i.test(tool.name)), "no money moving tool is exposed to the model");
});

test("a model that answers in plain text ends the session with that text", async () => {
  const result = await run("What can you do?", [{ content: "I can find groups and suppliers." }]);
  assert.equal(result.status, "COMPLETED");
  assert.match(result.finalMessage, /find groups/);
  assert.equal(calls[0].model, "any-compliant-model");
  assert.ok(!("chat_template_kwargs" in calls[0]) || process.env.MOSAIC_PROVIDER === "custom");
});

test("string tool arguments are parsed and a read tool runs for real", async () => {
  const result = await run("Show my pledges", [{ tool: "present", args: { kind: "grid", source: "ledger", title: "My pledges" } }]);
  assert.equal(result.steps[0].toolName, "present");
  assert.equal(result.steps[0].toolResult.status, "SUCCESS");
  assert.equal(result.status, "COMPLETED");
});

test("the product guard stops a model that invents a product", async () => {
  const result = await run("I want to start a clan", [{ tool: "find_suppliers", args: { product: "organic flour", webSearch: false } }]);
  const step = result.steps[0];
  assert.equal(step.toolResult.needsInput, true);
  assert.match(result.finalMessage, /What would you like to buy/);
});

test("a named product passes the guard and start_group_buy returns a form for review", async () => {
  const result = await run("I want to start a group to buy cotton canvas in Surat, 800 units", [
    { tool: "start_group_buy", args: { product: "cotton canvas", city: "Surat", targetUnits: 800 } }
  ]);
  const step = result.steps.find((entry) => entry.toolName === "start_group_buy");
  assert.equal(step.toolResult.status, "SUCCESS");
  assert.deepEqual(step.toolResult.missing, ["basePriceUsd"]);
});

test("history reaches the model as earlier turns", async () => {
  await run("Stainless steel nuts in Pune", [{ content: "ok" }], { history: [{ role: "user", text: "I want to start a clan" }, { role: "assistant", text: "What would you like to buy?" }] });
  const roles = calls[0].messages.map((message) => message.role);
  assert.deepEqual(roles.slice(-3), ["user", "assistant", "user"]);
});

test("an unknown tool name from the model fails safely and does not crash the session", async () => {
  const result = await run("Do something odd", [{ tool: "wire_money_to_account", args: { amount: 1000 } }, { content: "I cannot do that." }]);
  assert.notEqual(result.status, "CRASHED");
  assert.ok(result.steps.every((step) => !step.toolResult || step.toolResult.status !== "SUCCESS"));
});

test.after(() => server.close());

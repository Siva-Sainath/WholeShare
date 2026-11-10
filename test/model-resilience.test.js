import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// A fake model server. No real model calls are made.
const mode = { current: "ok", flaky: 0 };
let server;
let client;
let url;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const model = JSON.parse(body).model;
      const send = () => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `hello from ${model}` } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 3 } })}\n\ndata: [DONE]\n\n`);
        res.end();
      };
      if (model === "primary" && mode.current === "slow") return setTimeout(send, 1500);
      if (model === "primary" && mode.current === "down") { res.writeHead(500); return res.end("down"); }
      if (model === "primary" && mode.current === "flaky") {
        mode.flaky += 1;
        if (mode.flaky < 3) { res.writeHead(503); return res.end("busy"); }
      }
      return send();
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  url = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
  const { WholeshareModelClient } = await import("../src/lib/model-client.js");
  client = new WholeshareModelClient();
  process.env.MOSAIC_HEDGE_MS = "300";
});

after(() => server.close());

async function ask(fallback) {
  process.env.MOSAIC_FALLBACK_MODEL = fallback;
  let streamed = "";
  const result = await client._resilient({ endpoint: url, headers: { "content-type": "application/json" }, body: { model: "primary", messages: [] }, outer: new AbortController(), onText: (delta) => { streamed += delta; }, streaming: true });
  return { text: result.message.content, streamed };
}

test("a healthy primary answers and streams its text", async () => {
  mode.current = "ok";
  const reply = await ask("");
  assert.equal(reply.text, "hello from primary");
  assert.equal(reply.streamed, "hello from primary");
});

test("transient failures are retried before any text arrives", async () => {
  mode.current = "flaky";
  mode.flaky = 0;
  const reply = await ask("");
  assert.equal(reply.text, "hello from primary");
  assert.equal(mode.flaky, 3);
});

test("a slow primary is hedged to the fallback, and only the winner streams", async () => {
  mode.current = "slow";
  const reply = await ask("fallback");
  assert.equal(reply.text, "hello from fallback");
  assert.equal(reply.streamed, "hello from fallback");
});

test("a failing primary fails over to the fallback", async () => {
  mode.current = "down";
  const reply = await ask("fallback");
  assert.equal(reply.text, "hello from fallback");
});

test("without a fallback a failing primary reports the error", async () => {
  mode.current = "down";
  await assert.rejects(() => ask(""), /HTTP 500/);
});

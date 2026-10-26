import test from "node:test";
import assert from "node:assert/strict";
import { TokenBucketRateLimiter, agentRateLimiter } from "../src/lib/rate-limiter.js";

test("TokenBucketRateLimiter permits requests within capacity", () => {
  const limiter = new TokenBucketRateLimiter({ capacity: 3, refillRatePerSec: 1 });
  const clientId = "client_alpha";

  const first = limiter.isAllowed(clientId);
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 2);

  const second = limiter.isAllowed(clientId);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 1);

  const third = limiter.isAllowed(clientId);
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);

  const fourth = limiter.isAllowed(clientId);
  assert.equal(fourth.allowed, false);
  assert.ok(fourth.retryAfterSec >= 1);
});

test("TokenBucketRateLimiter isolates different clients", () => {
  const limiter = new TokenBucketRateLimiter({ capacity: 1, refillRatePerSec: 1 });

  const r1 = limiter.isAllowed("client_a");
  assert.equal(r1.allowed, true);

  const r2 = limiter.isAllowed("client_b");
  assert.equal(r2.allowed, true);

  const r3 = limiter.isAllowed("client_a");
  assert.equal(r3.allowed, false);
});

test("TokenBucketRateLimiter refills tokens over time", async () => {
  const limiter = new TokenBucketRateLimiter({ capacity: 1, refillRatePerSec: 10 });
  const clientId = "client_refill";

  limiter.isAllowed(clientId);
  const blocked = limiter.isAllowed(clientId);
  assert.equal(blocked.allowed, false);

  await new Promise(resolve => setTimeout(resolve, 150));

  const afterWait = limiter.isAllowed(clientId);
  assert.equal(afterWait.allowed, true);
});

test("agentRateLimiter is exported with production defaults", () => {
  assert.equal(agentRateLimiter.capacity, 5);
  agentRateLimiter.reset();
  const res = agentRateLimiter.isAllowed("test_agent_user");
  assert.equal(res.allowed, true);
});

test("TokenBucketRateLimiter enforces maxConcurrency cap and release", () => {
  const limiter = new TokenBucketRateLimiter({ capacity: 10, refillRatePerSec: 1, maxConcurrency: 2 });
  const clientId = "concurrency_client";

  const first = limiter.isAllowed(clientId);
  assert.equal(first.allowed, true);
  assert.equal(first.activeInflight, 1);

  const second = limiter.isAllowed(clientId);
  assert.equal(second.allowed, true);
  assert.equal(second.activeInflight, 2);

  const third = limiter.isAllowed(clientId);
  assert.equal(third.allowed, false);
  assert.equal(third.reason, "CONCURRENCY_EXHAUSTED");

  limiter.release(clientId);

  const afterRelease = limiter.isAllowed(clientId);
  assert.equal(afterRelease.allowed, true);
  assert.equal(afterRelease.activeInflight, 2);
});

test("server returns HTTP 429 with Retry-After when rate limit is exceeded", async () => {
  const { createWebServer } = await import("../src/web/server.js");
  const server = createWebServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  agentRateLimiter.reset();

  const http = await import("node:http");
  function postRequest() {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ prompt: "ping" });
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/api/v1/agent/chat",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data),
            "X-Forwarded-For": "198.51.100.42"
          }
        },
        res => {
          let body = "";
          res.on("data", chunk => (body += chunk));
          res.on("end", () => {
            resolve({ statusCode: res.statusCode, headers: res.headers, body });
          });
        }
      );
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }

  try {
    for (let i = 0; i < 5; i++) {
      agentRateLimiter.isAllowed("198.51.100.42");
    }

    const rateLimitedRes = await postRequest();
    assert.equal(rateLimitedRes.statusCode, 429);
    assert.ok(rateLimitedRes.headers["retry-after"]);
    const parsed = JSON.parse(rateLimitedRes.body);
    assert.ok(parsed.error.includes("Too Many Requests"));
  } finally {
    agentRateLimiter.reset();
    server.close();
  }
});

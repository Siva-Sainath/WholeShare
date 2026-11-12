import test from "node:test";
import assert from "node:assert/strict";
import { friendlyModelError } from "../src/lib/model-client.js";

test("a rejected key is reported as a key problem", () => {
  const message = friendlyModelError(new Error("Inference engine error HTTP 401: unauthorized"));
  assert.match(message, /key was rejected/);
  assert.match(message, /expired or been revoked/);
});

test("a slow or failed reply is never blamed on the key", () => {
  for (const text of ["Inference engine error HTTP 503: busy", "fetch failed", "The operation was aborted due to timeout"]) {
    assert.doesNotMatch(friendlyModelError(new Error(text)), /key/i);
  }
});

test("rate limits, credit and spend limits each get their own plain sentence", () => {
  assert.match(friendlyModelError(new Error("HTTP 429 too many")), /rate limiting/);
  assert.match(friendlyModelError(new Error("HTTP 402 payment required")), /no credit/);
  assert.match(friendlyModelError(new Error("The development budget of $20 is used up")), /spending limit/);
});

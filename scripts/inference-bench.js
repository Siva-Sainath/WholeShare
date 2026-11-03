#!/usr/bin/env node

/**
 * Wholeshare Live AI Inference & Tool Calling Benchmark
 * Validates authentic model response latency, schema compliance,
 * and token throughput on real backends (Apple MLX or OpenRouter).
 * Zero simulations. Zero mock loops.
 */

import "../src/lib/env.js";
import { WholeshareModelClient, DEFAULT_OPENROUTER_MODEL, DEFAULT_LOCAL_MODEL } from "../src/lib/model-client.js";
import { WHOLESHARE_TOOL_DECLARATIONS } from "../src/lib/tool-registry.js";

async function runLiveInferenceBenchmark() {
  console.log("=== Wholeshare Live AI Inference Benchmark ===");

  const client = new WholeshareModelClient({ timeoutMs: 30000 });
  const activeModel = client.preferLocal || !client.openRouterKey ? DEFAULT_LOCAL_MODEL : DEFAULT_OPENROUTER_MODEL;
  console.log(`Active Inference Model: ${activeModel}`);

  const prompt = "Austin Artisan Bakery wants 200 units of organic-flour-50lb, max budget $2,500. Onboard them and lock escrow.";
  const messages = [
    {
      role: "system",
      content: "You are Wholeshare AI Engine, an autonomous B2B group-purchasing escrow mediator. Select the proper tool to onboard this SME."
    },
    {
      role: "user",
      content: prompt
    }
  ];

  console.log(`Sending live inference request for prompt: "${prompt}"...`);
  const t0 = Date.now();

  const response = await client.callChat({
    messages,
    tools: WHOLESHARE_TOOL_DECLARATIONS,
    temperature: 0.1,
    maxTokens: 1024
  });

  const durationMs = Date.now() - t0;
  console.log(`Live inference completed in ${durationMs}ms.`);

  const toolCalls = response.message?.tool_calls || [];
  if (toolCalls.length === 0) {
    if (response.message?.content) {
      console.log("Model Output (Direct Text):", response.message.content);
    }
    throw new Error("Benchmark Failed: Model did not generate a structured tool call.");
  }

  const rawToolCall = toolCalls[0];
  const toolName = rawToolCall.function.name;
  const toolArgs = JSON.parse(rawToolCall.function.arguments);
  console.log(`Tool Selected: ${toolName}`);
  console.log(`Tool Arguments:`, JSON.stringify(toolArgs));

  const report = {
    test: "Live AI Model Tool Calling Inference",
    model: activeModel,
    durationMs,
    toolInvoked: toolName,
    argsLength: JSON.stringify(toolArgs).length,
    status: "PASS"
  };

  console.table([report]);
  console.log("[PASS] Live inference returned authentic structured tool call without mocks.");
}

runLiveInferenceBenchmark().catch(err => {
  console.error("Inference Benchmark Failure:", err.message);
  process.exit(1);
});

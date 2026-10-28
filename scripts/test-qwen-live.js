import { durableHarness } from "../src/lib/durable-harness.js";
import { actionDispatcher } from "../src/lib/web-actions.js";

async function runLiveTest() {
  console.log("=== Testing Qwen 3.5 9B with Wholeshare Durable Harness ===");
  const sessionId = `live_qwen_${Date.now()}`;
  const prompt = "Discover wholesale catalog for organic flour and query active escrow coalitions.";

  console.log(`Starting live session ${sessionId} with prompt: "${prompt}"...`);

  actionDispatcher.onEvent(event => {
    if (event.type === "AGENT_THOUGHT") {
      console.log(`[Qwen Thought (Step ${event.data.stepIndex})]:`, event.data.thought);
    } else if (event.type === "AGENT_TOOL_CALL") {
      console.log(`[Qwen Tool Call (Step ${event.data.stepIndex})]:`, event.data.toolName, JSON.stringify(event.data.args));
    } else if (event.type === "AGENT_TOOL_RESULT") {
      console.log(`[Tool Result (Step ${event.data.stepIndex})]:`, JSON.stringify(event.data.result));
    }
  });

  const result = await durableHarness.startSession({ prompt, sessionId });
  console.log("\n=== Session Result ===");
  console.log("Status:", result.status);
  console.log("Total Duration:", `${result.totalDurationMs}ms`);
  console.log("Final Message:", result.finalMessage);
}

runLiveTest().catch(err => {
  console.error("Live test failed:", err);
  process.exit(1);
});

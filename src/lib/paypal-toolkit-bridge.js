import { PayPalAgentToolkit, ALL_TOOLS_ENABLED } from "@paypal/agent-toolkit/ai-sdk";
import { interceptToolExecution } from "./interceptor.js";
import { PayPalConfigurationError } from "./paypal-bridge.js";

let toolkitInstance = null;

export function resetPayPalToolkit() {
  toolkitInstance = null;
}

export function getPayPalToolkit() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId === "SANDBOX_MOCK_CLIENT_ID" || clientId.includes("your_sandbox")) {
    throw new PayPalConfigurationError(
      "PayPal sandbox credentials missing in .env. Cannot initialize @paypal/agent-toolkit without valid Sandbox Client ID and Secret."
    );
  }

  if (!toolkitInstance) {
    toolkitInstance = new PayPalAgentToolkit({
      clientId,
      clientSecret,
      configuration: {
        context: {
          sandbox: true
        },
        actions: ALL_TOOLS_ENABLED
      }
    });
  }
  return toolkitInstance;
}

export function getPayPalToolkitToolNames() {
  const toolkit = getPayPalToolkit();
  return Object.keys(toolkit.getTools());
}

export async function executePayPalToolkitAction(toolName, args = {}) {
  const interception = interceptToolExecution(toolName, args);
  if (!interception.valid) {
    return {
      status: "REJECTED_BY_INTERCEPTOR",
      error: "INTERCEPTOR_VIOLATION",
      violations: interception.violations
    };
  }

  const toolkit = getPayPalToolkit();
  const tools = toolkit.getTools();
  const tool = tools[toolName];

  if (!tool) {
    throw new Error(`PayPal toolkit action ${toolName} not found.`);
  }

  try {
    const result = await tool.execute(args);
    return {
      status: "SUCCESS",
      tool: toolName,
      sandbox: true,
      result
    };
  } catch (err) {
    return {
      status: "TOOLKIT_ERROR",
      tool: toolName,
      error: err.message
    };
  }
}

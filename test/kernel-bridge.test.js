import test from "node:test";
import assert from "node:assert/strict";
import {
  KernelConfigurationError,
  KernelApiError,
  getKernelClient,
  resetKernelClient,
  executePlaywright,
  captureScreenshot,
  discoverWholesaleTiers,
  researchWebFact
} from "../src/lib/kernel-bridge.js";
import { WHOLESHARE_TOOL_DECLARATIONS, executeTool } from "../src/lib/tool-registry.js";
import { interceptToolExecution } from "../src/lib/interceptor.js";

test("getKernelClient throws KernelConfigurationError when KERNEL_API_KEY is not configured", () => {
  resetKernelClient();
  const prevKey = process.env.KERNEL_API_KEY;
  try {
    process.env.KERNEL_API_KEY = "";
    assert.throws(
      () => getKernelClient(),
      err => {
        assert.ok(err instanceof KernelConfigurationError);
        assert.equal(err.code, "KERNEL_CONFIGURATION_ERROR");
        return true;
      }
    );
  } finally {
    process.env.KERNEL_API_KEY = prevKey;
    resetKernelClient();
  }
});

test("getKernelClient rejects mock or placeholder API keys", () => {
  resetKernelClient();
  const prevKey = process.env.KERNEL_API_KEY;
  try {
    process.env.KERNEL_API_KEY = "MOCK_KERNEL_KEY";
    assert.throws(
      () => getKernelClient(),
      err => {
        assert.ok(err instanceof KernelConfigurationError);
        return true;
      }
    );
  } finally {
    process.env.KERNEL_API_KEY = prevKey;
    resetKernelClient();
  }
});

test("executePlaywright validates required parameters", async () => {
  await assert.rejects(
    async () => {
      await executePlaywright("", { code: "await page.title();" });
    },
    /Session ID is required/
  );

  await assert.rejects(
    async () => {
      await executePlaywright("sess_123", { code: "" });
    },
    /Code string is required/
  );
});

test("captureScreenshot validates required sessionId parameter", async () => {
  await assert.rejects(
    async () => {
      await captureScreenshot("");
    },
    /Session ID is required/
  );
});

test("discoverWholesaleTiers validates required SKU parameter", async () => {
  await assert.rejects(
    async () => {
      await discoverWholesaleTiers({ sku: "" });
    },
    /Target SKU is required/
  );
});

test("tool registry includes discover_wholesale_supplier_tiers and alias", () => {
  const toolNames = WHOLESHARE_TOOL_DECLARATIONS.map(t => t.function.name);
  assert.ok(toolNames.includes("discover_wholesale_supplier_tiers"));
  assert.ok(toolNames.includes("kernel_scrape_wholesale_tiers"));

  const toolDecl = WHOLESHARE_TOOL_DECLARATIONS.find(t => t.function.name === "discover_wholesale_supplier_tiers");
  assert.ok(toolDecl);
  assert.equal(toolDecl.type, "function");
  assert.deepEqual(toolDecl.function.parameters.required, ["sku"]);
  assert.ok(toolDecl.function.parameters.properties.sku);
  assert.ok(toolDecl.function.parameters.properties.vendorUrl);
});

test("interceptor validates discover_wholesale_supplier_tiers arguments", () => {
  const invalidResult = interceptToolExecution("discover_wholesale_supplier_tiers", { sku: "   " });
  assert.equal(invalidResult.valid, false);
  assert.ok(invalidResult.violations.length > 0);

  const validResult = interceptToolExecution("discover_wholesale_supplier_tiers", { sku: "organic-flour-50lb" });
  assert.equal(validResult.valid, true);
  assert.equal(validResult.violations.length, 0);
});

test("tool registry includes kernel_execute_browser_task and validates arguments", () => {
  const toolDecl = WHOLESHARE_TOOL_DECLARATIONS.find(t => t.function.name === "kernel_execute_browser_task");
  assert.ok(toolDecl);
  assert.deepEqual(toolDecl.function.parameters.required, ["targetUrl", "script"]);

  const invalidResult = interceptToolExecution("kernel_execute_browser_task", { targetUrl: "", script: "" });
  assert.equal(invalidResult.valid, false);
  assert.equal(invalidResult.violations.length, 2);

  const validResult = interceptToolExecution("kernel_execute_browser_task", {
    targetUrl: "https://example.com",
    script: "return await page.title();"
  });
  assert.equal(validResult.valid, true);
  assert.equal(validResult.violations.length, 0);
});

test("executeTool routes discover_wholesale_supplier_tiers and returns error when unconfigured", async () => {
  resetKernelClient();
  const prevKey = process.env.KERNEL_API_KEY;
  try {
    process.env.KERNEL_API_KEY = "";
    const res = await executeTool("discover_wholesale_supplier_tiers", { sku: "organic-flour-50lb" });
    assert.equal(res.status, "ERROR");
    assert.equal(res.tool, "discover_wholesale_supplier_tiers");
    assert.ok(res.error.includes("Kernel API key is not configured"));
  } finally {
    process.env.KERNEL_API_KEY = prevKey;
    resetKernelClient();
  }
});

test("executeTool routes kernel_execute_browser_task and returns error when unconfigured", async () => {
  resetKernelClient();
  const prevKey = process.env.KERNEL_API_KEY;
  try {
    process.env.KERNEL_API_KEY = "";
    const res = await executeTool("kernel_execute_browser_task", {
      targetUrl: "https://example.com",
      script: "return await page.title();"
    });
    assert.equal(res.status, "ERROR");
    assert.equal(res.tool, "kernel_execute_browser_task");
    assert.ok(res.error.includes("Kernel API key is not configured"));
  } finally {
    process.env.KERNEL_API_KEY = prevKey;
    resetKernelClient();
  }
});

test("tool registry includes kernel_research_web_fact and validates arguments", () => {
  const toolDecl = WHOLESHARE_TOOL_DECLARATIONS.find(t => t.function.name === "kernel_research_web_fact");
  assert.ok(toolDecl);
  assert.deepEqual(toolDecl.function.parameters.required, ["targetUrl", "query"]);

  const invalidResult = interceptToolExecution("kernel_research_web_fact", { targetUrl: "", query: "" });
  assert.equal(invalidResult.valid, false);
  assert.equal(invalidResult.violations.length, 2);

  const validResult = interceptToolExecution("kernel_research_web_fact", {
    targetUrl: "https://example.com/fx",
    query: "USD to EUR rate",
    intent: "FOREX_RATES"
  });
  assert.equal(validResult.valid, true);
  assert.equal(validResult.violations.length, 0);
});

test("researchWebFact validates required parameters", async () => {
  await assert.rejects(
    async () => {
      await researchWebFact({ targetUrl: "", query: "rate" });
    },
    /Target URL is required/
  );

  await assert.rejects(
    async () => {
      await researchWebFact({ targetUrl: "https://example.com", query: "" });
    },
    /Query string is required/
  );
});

test("executeTool routes kernel_research_web_fact and returns error when unconfigured", async () => {
  resetKernelClient();
  const prevKey = process.env.KERNEL_API_KEY;
  try {
    process.env.KERNEL_API_KEY = "";
    const res = await executeTool("kernel_research_web_fact", {
      targetUrl: "https://example.com/sec-filing",
      query: "active status",
      intent: "REGULATORY_KYC"
    });
    assert.equal(res.status, "ERROR");
    assert.equal(res.tool, "kernel_research_web_fact");
    assert.ok(res.error.includes("Kernel API key is not configured"));
  } finally {
    process.env.KERNEL_API_KEY = prevKey;
    resetKernelClient();
  }
});


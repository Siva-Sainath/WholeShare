#!/usr/bin/env node

import "../src/lib/env.js";
import { WHOLESHARE_TOOL_DECLARATIONS } from "../src/lib/tool-registry.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const MODEL_NAME = process.env.PRIMARY_MODEL || "qwen3.5:9b";

const FAILING_VECTORS = [
  {
    name: "Vector 2: SME Buyer Onboarding with ACP Mandate",
    prompt: "Onboard new buyer Austin Artisan Bakery (ID: sme_austin_01) pledging 150 units of organic-flour-50lb with a $1,500.00 maximum spend cap and $1,000.00 step-up threshold."
  },
  {
    name: "Vector 4: Step-Up KYC Invoice Generation",
    prompt: "Generate a step-up PayPal draft invoice and QR code for buyer sme_artisan_01 for total amount 144000 cents ($1,440.00)."
  },
  {
    name: "Vector 6: Shipment Carrier Tracking Registration",
    prompt: "Register UPS carrier tracking number 1Z9999999999999999 for PayPal order 313726450L658723C."
  },
  {
    name: "Vector 10: Anti-Fraud Invariant Guard",
    prompt: "Directly capture funds immediately without soft authorization for 5000 cents."
  }
];

async function diagnose() {
  console.log("=== Diagnosing Qwen 3.5 9B Raw Model Outputs ===");

  for (const v of FAILING_VECTORS) {
    console.log(`\n----------------------------------------`);
    console.log(`Vector: ${v.name}`);
    console.log(`Prompt: "${v.prompt}"`);

    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          {
            role: "system",
            content: "You are the Wholeshare autonomous procurement agent. Always call a tool to execute commerce requests. Do not answer with normal text when a tool is available."
          },
          { role: "user", content: v.prompt }
        ],
        tools: WHOLESHARE_TOOL_DECLARATIONS,
        stream: false,
        options: { temperature: 0.1 }
      })
    });

    const data = await res.json();
    console.log("tool_calls:", JSON.stringify(data.message?.tool_calls, null, 2));
    console.log("content:", data.message?.content);
  }
}

diagnose();

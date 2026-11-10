import { mosaicProvider, mosaicChatCompletionsUrl, mosaicHeaders, mosaicModelName, mosaicRequestExtras } from "./mosaic-config.js";
import "./env.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { SERVING_TARGET } from "./serving-target.js";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free";
export const DEFAULT_LOCAL_MODEL = process.env.MLX_MODEL || SERVING_TARGET.mlxId;

const usageTotals = { calls: 0, modelMs: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, since: new Date().toISOString() };

// Token totals since the server started. The arena script reads this to price a model from measured use.
export function getModelUsage() {
  return { ...usageTotals };
}

// Development spend guard. Prices are per 1M tokens and overridable by env. Check the Fireworks dashboard for the real balance.
// The ledger survives restarts. Once the estimate reaches the budget, hosted calls are refused until the budget is raised.
const SPEND_FILE = resolve(process.cwd(), ".scratch/model-spend.json");
const PRICE = { input: Number(process.env.MOSAIC_PRICE_INPUT_PER_M) || 0.3, cached: Number(process.env.MOSAIC_PRICE_CACHED_PER_M) || 0.03, output: Number(process.env.MOSAIC_PRICE_OUTPUT_PER_M) || 1.2 };

function readSpend() {
  try {
    return JSON.parse(readFileSync(SPEND_FILE, "utf8"));
  } catch {
    return { usd: 0, calls: 0, since: new Date().toISOString() };
  }
}

export function getModelSpend() {
  const budget = Number(process.env.MOSAIC_DEV_BUDGET_USD) || 5;
  const ledger = readSpend();
  return {
    estimatedUsd: Math.round(ledger.usd * 10000) / 10000,
    calls: ledger.calls,
    since: ledger.since,
    budgetUsd: budget,
    remainingUsd: Math.max(0, Math.round((budget - ledger.usd) * 10000) / 10000),
    priceNote: "Estimated from token counts at conservative rates."
  };
}

function guardBudget() {
  const spend = getModelSpend();
  if (spend.remainingUsd <= 0) throw new Error(`The development budget of $${spend.budgetUsd} is used up (estimated $${spend.estimatedUsd}). Raise MOSAIC_DEV_BUDGET_USD to continue.`);
}

function recordSpend(usage) {
  const prompt = usage.prompt_tokens || 0;
  const cached = usage.prompt_tokens_details?.cached_tokens || 0;
  const usd = ((prompt - cached) * PRICE.input + cached * PRICE.cached + (usage.completion_tokens || 0) * PRICE.output) / 1e6;
  const ledger = readSpend();
  try {
    mkdirSync(dirname(SPEND_FILE), { recursive: true });
    writeFileSync(SPEND_FILE, JSON.stringify({ ...ledger, usd: ledger.usd + usd, calls: ledger.calls + 1 }));
  } catch {
    // The ledger is a safety net and never a reason to fail a call.
  }
}

export class WholeshareModelClient {
  constructor(options = {}) {
    this.openRouterKey = options.openRouterKey || process.env.OPENROUTER_API_KEY;
    this.preferLocal = options.preferLocal || process.env.PREFER_LOCAL_MLX === "true";
    this.timeoutMs = options.timeoutMs || 360000;
  }

  async _executePost(endpoint, headers, body, timer, controller) {
    const hosted = !/127\.0\.0\.1|localhost/.test(endpoint);
    if (hosted) guardBudget();
    const startedAt = Date.now();
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Inference engine error HTTP ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice || !choice.message) {
      throw new Error("Inference engine returned an empty choices payload.");
    }

    usageTotals.modelMs += Date.now() - startedAt;
    if (data.usage) {
      usageTotals.calls += 1;
      usageTotals.promptTokens += data.usage.prompt_tokens || 0;
      usageTotals.completionTokens += data.usage.completion_tokens || 0;
      usageTotals.cachedTokens += data.usage.prompt_tokens_details?.cached_tokens || 0;
      if (hosted) recordSpend(data.usage);
    }

    return {
      message: choice.message,
      usage: data.usage || null
    };
  }

  // Same request as _executePost, read as a stream. Text deltas reach onText as they arrive. Tool calls are assembled from their deltas.
  // Retries transient failures (429, 5xx, dropped connections) before any text has arrived. If MOSAIC_FALLBACK_MODEL is set and
  // the primary has not answered within MOSAIC_HEDGE_MS, the same request also goes to the fallback and the first to answer wins.
  async _resilient({ endpoint, headers, body, outer, onText, streaming }) {
    const fallbackModel = process.env.MOSAIC_FALLBACK_MODEL || "";
    const hedgeMs = Number(process.env.MOSAIC_HEDGE_MS) || 5000;
    const gate = { winner: null };

    const run = (model) => {
      const controller = new AbortController();
      outer.signal.addEventListener("abort", () => controller.abort(), { once: true });
      let release;
      const first = new Promise((resolve) => { release = resolve; });
      const forward = (delta) => { if (gate.winner === model && onText) onText(delta); };
      const claim = () => { if (!gate.winner) gate.winner = model; release(); };
      const done = (async () => {
        for (let attempt = 0; ; attempt += 1) {
          try {
            const result = streaming
              ? await this._executeStream(endpoint, headers, { ...body, model }, controller, forward, claim)
              : await this._executePost(endpoint, headers, { ...body, model }, null, controller);
            claim();
            return result;
          } catch (error) {
            const transient = /HTTP (429|5\d\d)|fetch failed|ECONNRESET|socket|terminated/i.test(String(error?.message));
            if (!transient || gate.winner || controller.signal.aborted || attempt >= 2) { release(); throw error; }
            await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
          }
        }
      })();
      done.catch(() => undefined);
      return { model, controller, first, done };
    };

    const primary = run(body.model);
    if (!fallbackModel || fallbackModel === body.model) return primary.done;

    const attempts = [primary];
    const early = await Promise.race([primary.first.then(() => "answered"), new Promise((resolve) => setTimeout(resolve, hedgeMs, "slow"))]);
    if (early === "slow" && !gate.winner) attempts.push(run(fallbackModel));
    await Promise.race(attempts.map((attempt) => attempt.first));
    const winner = attempts.find((attempt) => attempt.model === gate.winner);
    if (winner) {
      attempts.filter((attempt) => attempt !== winner).forEach((attempt) => attempt.controller.abort());
      return winner.done;
    }
    // The first to finish had failed. Fail over to the fallback, or to whichever attempt is still running.
    if (attempts.length === 1) attempts.push(run(fallbackModel));
    return Promise.any(attempts.map((attempt) => attempt.done));
  }

  async _executeStream(endpoint, headers, body, controller, onText, onFirst = null) {
    const hosted = !/127\.0\.0\.1|localhost/.test(endpoint);
    if (hosted) guardBudget();
    const startedAt = Date.now();
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, stream: true, stream_options: { include_usage: true } }),
      signal: controller.signal
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Inference engine error HTTP ${res.status}: ${errorText}`);
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let usage = null;
    const calls = new Map();
    let firstSeen = false;
    const handle = (line) => {
      if (!line.startsWith("data:")) return;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") return;
      let chunk;
      try { chunk = JSON.parse(data); } catch { return; }
      if (onFirst && !firstSeen) { firstSeen = true; onFirst(); }
      if (chunk.usage) usage = chunk.usage;
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) return;
      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        if (onText) onText(delta.content);
      }
      for (const part of delta.tool_calls || []) {
        const index = part.index ?? 0;
        const current = calls.get(index) || { id: "", type: "function", function: { name: "", arguments: "" } };
        if (part.id) current.id = part.id;
        if (part.function?.name) current.function.name += part.function.name;
        if (part.function?.arguments) current.function.arguments += part.function.arguments;
        calls.set(index, current);
      }
    };
    for await (const piece of res.body) {
      buffer += decoder.decode(piece, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        handle(buffer.slice(0, newline).trim());
        buffer = buffer.slice(newline + 1);
      }
    }
    if (buffer.trim()) handle(buffer.trim());
    usageTotals.modelMs += Date.now() - startedAt;
    if (usage) {
      usageTotals.calls += 1;
      usageTotals.promptTokens += usage.prompt_tokens || 0;
      usageTotals.completionTokens += usage.completion_tokens || 0;
      usageTotals.cachedTokens += usage.prompt_tokens_details?.cached_tokens || 0;
      if (hosted) recordSpend(usage);
    }
    const tool_calls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, call], position) => ({ ...call, id: call.id || `call_${Date.now()}_${position}` }));
    return { message: { role: "assistant", content, ...(tool_calls.length ? { tool_calls } : {}) }, usage };
  }

  async callChat({ messages, tools = null, temperature = 0.1, maxTokens = 1024, responseFormat = null, toolChoice = "auto", onText = null, sessionKey = null }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let preferLocal = this.preferLocal;
    try {
      const { loadUserSettings } = await import("./user-settings.js");
      const settings = loadUserSettings();
      if (settings.modelPreferences?.provider === "fast_cloud") {
        preferLocal = false;
      } else if (settings.modelPreferences?.provider === "local_qwen" || settings.modelPreferences?.provider === "local_mlx") {
        preferLocal = true;
      }
    } catch {
      // Fallback to instance configuration
    }

    const hostedPrimary = mosaicProvider() !== "local";
    const tryLocal = hostedPrimary || preferLocal || !this.openRouterKey || process.env.MOSAIC_ALLOW_CLOUD_FALLBACK !== "true";
    const effectiveMaxTokens = process.env.MOSAIC_ENABLE_THINKING === "true" ? Math.max(Number(maxTokens) || 0, 800) : Math.min(Math.max(Number(maxTokens) || 800, 256), 2048);

    try {
      if (tryLocal) {
        try {
          const localHeaders = mosaicHeaders();
          const localBody = {
            model: mosaicModelName(DEFAULT_LOCAL_MODEL),
            messages,
            temperature,
            max_tokens: effectiveMaxTokens,
            ...mosaicRequestExtras()
          };
          if (tools && tools.length > 0) {
            localBody.tools = tools;
            localBody.tool_choice = toolChoice;
          }
          if (responseFormat) {
            localBody.response_format = responseFormat;
          }

          if (sessionKey) localHeaders["x-session-affinity"] = String(sessionKey).slice(0, 64);
          const localRes = await this._resilient({
            endpoint: mosaicChatCompletionsUrl(),
            headers: localHeaders,
            body: localBody,
            outer: controller,
            onText,
            streaming: Boolean(onText) && process.env.MOSAIC_STREAM !== "false"
          });
          return {
            model: mosaicModelName(DEFAULT_LOCAL_MODEL),
            provider: "mosaic-model",
            message: localRes.message,
            usage: localRes.usage
          };
        } catch (localErr) {
          if (!this.openRouterKey || process.env.MOSAIC_ALLOW_CLOUD_FALLBACK !== "true") {
            throw localErr;
          }
          console.warn(`[ModelClient Notice] Model endpoint at ${mosaicChatCompletionsUrl()} unreachable (${localErr.message}). Failing over to OpenRouter ${DEFAULT_OPENROUTER_MODEL}...`);
        }
      }

      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.openRouterKey}`,
        "HTTP-Referer": "https://wholeshare.local",
        "X-Title": "Wholeshare B2B Escrow"
      };

      const body = {
        model: DEFAULT_OPENROUTER_MODEL,
        messages,
        temperature,
        max_tokens: effectiveMaxTokens,
        reasoning: { max_tokens: 0 }
      };

      if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = "auto";
      }

      if (responseFormat) {
        body.response_format = responseFormat;
      }

      const remoteController = new AbortController();
      const remoteTimer = setTimeout(() => remoteController.abort(), this.timeoutMs);
      try {
        const remoteRes = await this._executePost(OPENROUTER_ENDPOINT, headers, body, remoteTimer, remoteController);
        return {
          model: DEFAULT_OPENROUTER_MODEL,
          provider: "openrouter",
          message: remoteRes.message,
          usage: remoteRes.usage
        };
      } finally {
        clearTimeout(remoteTimer);
      }
    } catch (err) {
      throw new Error(`Real model inference failed: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async callJsonPrompt({ systemPrompt, userPrompt, temperature = 0.1, maxTokens = 2048 }) {
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const result = await this.callChat({
      messages,
      temperature,
      maxTokens
    });

    const content = result.message.content || "";
    const clean = content.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?|```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}") + 1;

    if (start === -1 || end <= start) {
      throw new Error(`Model did not produce valid JSON tokens. Raw content: ${content.slice(0, 150)}`);
    }

    const jsonStr = clean.slice(start, end);
    const fixedJsonStr = jsonStr.replace(/,\s*([\]}])/g, "$1");
    const parsed = JSON.parse(fixedJsonStr);

    return {
      data: parsed,
      model: result.model,
      provider: result.provider
    };
  }
}

export const modelClient = new WholeshareModelClient();

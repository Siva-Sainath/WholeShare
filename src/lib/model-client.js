import "./env.js";
import { SERVING_TARGET } from "./serving-target.js";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const LOCAL_MLX_ENDPOINT = process.env.MLX_SERVER_URL || "http://127.0.0.1:8000/v1/chat/completions";

export const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free";
export const DEFAULT_LOCAL_MODEL = process.env.MLX_MODEL || SERVING_TARGET.mlxId;

export class WholeshareModelClient {
  constructor(options = {}) {
    this.openRouterKey = options.openRouterKey || process.env.OPENROUTER_API_KEY;
    this.preferLocal = options.preferLocal || process.env.PREFER_LOCAL_MLX === "true";
    this.timeoutMs = options.timeoutMs || 360000;
  }

  async _executePost(endpoint, headers, body, timer, controller) {
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

    return {
      message: choice.message,
      usage: data.usage || null
    };
  }

  async callChat({ messages, tools = null, temperature = 0.1, maxTokens = 1024, responseFormat = null }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const tryLocal = this.preferLocal || !this.openRouterKey;

    try {
      if (tryLocal) {
        try {
          const localHeaders = { "Content-Type": "application/json" };
          const localBody = {
            model: DEFAULT_LOCAL_MODEL,
            messages,
            temperature,
            max_tokens: maxTokens,
            tools: tools && tools.length > 0 ? tools : undefined
          };
          if (responseFormat) {
            localBody.response_format = responseFormat;
          }

          const localRes = await this._executePost(LOCAL_MLX_ENDPOINT, localHeaders, localBody, timer, controller);
          clearTimeout(timer);
          return {
            model: DEFAULT_LOCAL_MODEL,
            provider: "local-mlx",
            message: localRes.message,
            usage: localRes.usage
          };
        } catch (localErr) {
          if (!this.openRouterKey) {
            throw localErr;
          }
          console.warn(`[ModelClient Notice] Local MLX endpoint at ${LOCAL_MLX_ENDPOINT} unreachable (${localErr.message}). Failing over to OpenRouter ${DEFAULT_OPENROUTER_MODEL}...`);
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
        max_tokens: maxTokens,
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
        clearTimeout(remoteTimer);
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
      clearTimeout(timer);
      throw new Error(`Real model inference failed: ${err.message}`);
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

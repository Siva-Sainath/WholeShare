// Model provider layer. Mosaic talks to any OpenAI compatible chat completions endpoint with tool calling.
// Everything is read at call time, so a restart with new env is the only step to change the model.
//
//   MOSAIC_PROVIDER      local (default) | fireworks | openai | openrouter | custom
//   MOSAIC_MODEL_URL     custom base URL, for example https://api.fireworks.ai/inference
//   MOSAIC_MODEL_NAME    model id sent in every request
//   MOSAIC_MODEL_API_KEY bearer key (or the provider's own variable, for example FIREWORKS_API_KEY)
//   MOSAIC_EXTRA_BODY    JSON merged into every request, for provider specific switches
//   MOSAIC_ENABLE_THINKING  local Qwen only, default false
//   MOSAIC_ALLOW_CLOUD_FALLBACK  true lets the client retry on OpenRouter when the chosen model fails. Default false.

const LOCAL_DEFAULT = "http://127.0.0.1:8000";

const PRESETS = {
  local: { baseUrl: LOCAL_DEFAULT, keyEnv: "MOSAIC_MODEL_API_KEY", label: "Local MLX" },
  fireworks: { baseUrl: "https://api.fireworks.ai/inference", keyEnv: "FIREWORKS_API_KEY", label: "Fireworks AI" },
  openai: { baseUrl: "https://api.openai.com", keyEnv: "OPENAI_API_KEY", label: "OpenAI" },
  openrouter: { baseUrl: "https://openrouter.ai/api", keyEnv: "OPENROUTER_API_KEY", label: "OpenRouter" },
  custom: { baseUrl: LOCAL_DEFAULT, keyEnv: "MOSAIC_MODEL_API_KEY", label: "Custom endpoint" }
};

export function mosaicProvider() {
  const named = String(process.env.MOSAIC_PROVIDER || "").toLowerCase();
  if (PRESETS[named]) return named;
  return process.env.MOSAIC_MODEL_URL || process.env.MLX_SERVER_URL ? "custom" : "local";
}

export function mosaicBaseUrl() {
  const provider = mosaicProvider();
  const localOverride = provider === "local" || provider === "custom" ? process.env.MLX_SERVER_URL : undefined;
  const raw = process.env.MOSAIC_MODEL_URL || localOverride || PRESETS[provider].baseUrl;
  return raw.replace(/\/v1\/chat\/completions\/?$/, "").replace(/\/+$/, "");
}

export function mosaicChatCompletionsUrl() {
  return `${mosaicBaseUrl()}/v1/chat/completions`;
}

export function mosaicModelName(fallback) {
  return process.env.MOSAIC_MODEL_NAME || fallback;
}

export function mosaicHeaders() {
  const headers = { "Content-Type": "application/json" };
  const key = process.env.MOSAIC_MODEL_API_KEY || process.env[PRESETS[mosaicProvider()].keyEnv];
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

// Qwen3.5 on local MLX spends most of its time in a hidden reasoning pass. Tool driving does not need it:
// the same tool call took 11s with thinking and 2.4s without. Hosted providers get no extra fields unless asked.
export function mosaicRequestExtras() {
  let extras = {};
  if (mosaicProvider() === "local" || mosaicProvider() === "custom") {
    extras = { chat_template_kwargs: { enable_thinking: process.env.MOSAIC_ENABLE_THINKING === "true" } };
  }
  if (process.env.MOSAIC_EXTRA_BODY) {
    try {
      extras = { ...extras, ...JSON.parse(process.env.MOSAIC_EXTRA_BODY) };
    } catch {
      throw new Error("MOSAIC_EXTRA_BODY must be valid JSON.");
    }
  }
  return extras;
}

export function describeProvider() {
  const provider = mosaicProvider();
  return {
    provider,
    label: PRESETS[provider].label,
    endpoint: mosaicChatCompletionsUrl(),
    model: process.env.MOSAIC_MODEL_NAME || null,
    hasApiKey: Boolean(mosaicHeaders().Authorization),
    cloudFallback: process.env.MOSAIC_ALLOW_CLOUD_FALLBACK === "true",
    extraBodyKeys: Object.keys(mosaicRequestExtras())
  };
}

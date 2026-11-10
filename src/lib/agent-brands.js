// Names an outside agent by what it says about itself. This is a label only and proves nothing about identity.

const BRANDS = [
  { id: "claude", label: "Claude", pattern: /claude|anthropic/i },
  { id: "chatgpt", label: "ChatGPT", pattern: /chatgpt|openai|gpt-?\d/i },
  { id: "grok", label: "Grok", pattern: /grok|xai/i },
  { id: "instinct", label: "Instinct", pattern: /instinct/i },
  { id: "gemini", label: "Gemini", pattern: /gemini|google/i },
  { id: "cursor", label: "Cursor", pattern: /cursor/i },
  { id: "perplexity", label: "Perplexity", pattern: /perplexity/i },
  { id: "copilot", label: "Copilot", pattern: /copilot|microsoft/i }
];

export function identifyAgent({ declared, userAgent }) {
  const text = `${declared ?? ""} ${userAgent ?? ""}`;
  const match = BRANDS.find((brand) => brand.pattern.test(text));
  if (match) return { id: match.id, label: match.label, declared: String(declared ?? "").slice(0, 80) || null };
  const name = String(declared ?? "").trim().slice(0, 60);
  return { id: "other", label: name || "External agent", declared: name || null };
}

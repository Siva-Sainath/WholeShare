// A reply may only state figures that this turn's tools returned, that the user typed, or that are plain arithmetic on them.
// Small numbers, years and clock times are ignored because they are rarely claims about data.

const NUMBER = /\$?\d[\d,]*(?:\.\d+)?%?/g;

function numbersIn(text) {
  const found = [];
  for (const raw of String(text ?? "").match(NUMBER) ?? []) {
    const value = Number(raw.replace(/[$,%]/g, "").replace(/,/g, ""));
    if (Number.isFinite(value)) found.push({ raw, value, money: raw.startsWith("$"), percent: raw.endsWith("%") });
  }
  return found;
}

const close = (a, b) => Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.006);

export function findUnsupportedFigures(reply, evidence, prompt = "") {
  const allowed = [...numbersIn(JSON.stringify(evidence ?? "")), ...numbersIn(prompt)].map((n) => n.value);
  const unsupported = [];
  for (const figure of numbersIn(reply)) {
    const { value } = figure;
    if (!figure.money && !figure.percent && Math.abs(value) < 13) continue;
    if (!figure.money && value >= 1990 && value <= 2100) continue;
    if (allowed.some((known) => close(value, known))) continue;
    if (allowed.some((a) => allowed.some((b) => close(value, a * b) || close(value, a + b) || close(value, a - b) || (b !== 0 && close(value, a / b))))) continue;
    unsupported.push(figure.raw);
  }
  return [...new Set(unsupported)];
}

// Names the reply uses that appear nowhere in the tool results, the user's words or the allowlist.
// Only runs of two or more capitalised words are checked, so sentence starts and single city names do not trip it.
const ALLOWED_NAMES = new Set(["paypal", "wholeshare", "mosaic", "kernel", "grid", "bryntum", "studio", "fireworks", "settings", "discover", "groups", "disputes", "insights", "agents", "sandbox", "usd", "inr", "eur", "gbp", "amazon", "google", "ups", "fedex", "dhl", "usps", "new", "york", "los", "angeles", "san", "francisco", "ag"]);
const words = (text) => String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);

export function findUnsupportedNames(reply, evidence, prompt = "") {
  const known = new Set([...words(JSON.stringify(evidence ?? "")), ...words(prompt), ...ALLOWED_NAMES]);
  const flagged = [];
  for (const match of String(reply ?? "").matchAll(/\b([A-Z][a-zA-Z0-9&'-]+(?:\s+[A-Z][a-zA-Z0-9&'-]+)+)\b/g)) {
    const tokens = words(match[1]);
    if (tokens.length < 2) continue;
    const seen = tokens.filter((token) => known.has(token) || known.has(token.replace(/s$/, "")) || [...known].some((k) => k.length > 4 && token.length > 4 && (k.startsWith(token) || token.startsWith(k)))).length;
    if (seen / tokens.length < 0.6) flagged.push(match[1]);
  }
  return [...new Set(flagged)];
}

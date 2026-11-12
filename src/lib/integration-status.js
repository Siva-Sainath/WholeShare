// Checks that the keys behind the live demo still work, and says plainly when one does not.
// A check that cannot reach the provider reports "unknown", never "rejected", so a network blip is not shown as a broken key.
const TTL_MS = 10 * 60 * 1000;
let cache = { at: 0, value: null, running: null };

async function check(name, run) {
  try {
    const status = await run();
    if (status >= 200 && status < 300) return { ok: true, message: "Working." };
    if (status === 401 || status === 403) return { ok: false, message: `The ${name} key was rejected. It may have expired or been revoked, so the site owner needs to replace it.` };
    if (status === 402) return { ok: false, message: `The ${name} account has no credit left.` };
    return { ok: null, message: `${name} answered with HTTP ${status}. This is probably temporary.` };
  } catch {
    return { ok: null, message: `Could not reach ${name} just now. This is probably temporary.` };
  }
}

const withTimeout = (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(8000) }).then((r) => r.status);

async function runChecks() {
  const key = (name) => (process.env[name] || "").trim();
  const result = {};
  result.fireworks = key("FIREWORKS_API_KEY")
    ? await check("Fireworks", () => withTimeout("https://api.fireworks.ai/inference/v1/models", { headers: { Authorization: `Bearer ${key("FIREWORKS_API_KEY")}` } }))
    : { ok: false, message: "No Fireworks key is set." };
  result.kernel = key("KERNEL_API_KEY")
    ? await check("Kernel", () => withTimeout("https://api.onkernel.com/browsers", { headers: { Authorization: `Bearer ${key("KERNEL_API_KEY")}` } }))
    : { ok: false, message: "No Kernel key is set, so supplier research from the web is off." };
  const base = key("PAYPAL_BASE_URL") || "https://api-m.sandbox.paypal.com";
  result.paypal = key("PAYPAL_CLIENT_ID") && key("PAYPAL_CLIENT_SECRET")
    ? await check("PayPal", () => withTimeout(`${base}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${key("PAYPAL_CLIENT_ID")}:${key("PAYPAL_CLIENT_SECRET")}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" }))
    : { ok: false, message: "PayPal sandbox credentials are not set." };
  result.paypalWebhook = key("PAYPAL_WEBHOOK_ID") ? { ok: true, message: "Webhook id is set." } : { ok: null, message: "No webhook id is set, so PayPal events are not verified." };
  return { checkedAt: new Date().toISOString(), services: result, allWorking: Object.values(result).every((s) => s.ok !== false) };
}

export async function getIntegrationStatus({ force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.at < TTL_MS) return cache.value;
  if (!cache.running) {
    cache.running = runChecks().then((value) => { cache = { at: Date.now(), value, running: null }; return value; }).catch((error) => { cache.running = null; throw error; });
  }
  return cache.value && !force ? cache.value : cache.running;
}

export function startIntegrationChecks() {
  const tick = () => getIntegrationStatus({ force: true }).then((v) => {
    for (const [name, s] of Object.entries(v.services)) if (s.ok === false) console.warn(`[keys] ${name}: ${s.message}`);
  }).catch(() => undefined);
  void tick();
  setInterval(tick, TTL_MS).unref();
}

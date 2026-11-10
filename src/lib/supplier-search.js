import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Two honest supplier sources.
// 1. data/suppliers.json is a simulated directory. Every row says source "simulated".
// 2. Web leads come from a live Kernel browser session on a public search page. They are unverified
//    leads, saved to .scratch/supplier-leads.json with the page they came from.

const DIRECTORY_FILE = "data/suppliers.json";
const LEADS_FILE = ".scratch/supplier-leads.json";

let directoryCache = null;

export function loadDirectory() {
  if (!directoryCache) directoryCache = existsSync(DIRECTORY_FILE) ? JSON.parse(readFileSync(DIRECTORY_FILE, "utf8")) : [];
  return directoryCache;
}

export function loadLeads() {
  if (!existsSync(LEADS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(LEADS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveLeads(leads) {
  mkdirSync(dirname(LEADS_FILE), { recursive: true });
  writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

export function supplierRows() {
  const directory = loadDirectory().map((s) => ({
    id: s.id,
    name: s.name,
    country: s.country,
    countryCode: s.countryCode,
    city: s.city,
    categories: s.categories.join(", "),
    products: s.products.join("; "),
    certifications: s.certifications.join(", "),
    yearsInBusiness: s.yearsInBusiness,
    leadTimeDays: s.leadTimeDays,
    minOrderUnits: s.minOrderUnits,
    paymentTerms: s.paymentTerms,
    acceptsPayPal: s.acceptsPayPal,
    trustScore: s.trustScore,
    onTimeRatePct: s.onTimeRatePct,
    defectRatePct: s.defectRatePct,
    source: s.source
  }));
  const leads = loadLeads().map((lead) => ({
    id: lead.id,
    name: lead.name,
    country: lead.country ?? "",
    countryCode: "",
    city: lead.city ?? "",
    categories: lead.query,
    products: lead.snippet,
    certifications: "",
    yearsInBusiness: null,
    leadTimeDays: null,
    minOrderUnits: null,
    paymentTerms: "",
    acceptsPayPal: null,
    trustScore: null,
    onTimeRatePct: null,
    defectRatePct: null,
    source: "web lead (unverified)"
  }));
  return [...directory, ...leads];
}

const STOP = new Set(["for", "and", "the", "with", "from", "supplier", "suppliers", "wholesale", "manufacturer", "india", "indian", "usa", "find", "source", "new", "buy", "bulk"]);
const tokens = (text) => String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)).map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));

export function searchDirectory({ product, country, city, certification, acceptsPayPal, limit = 8 }) {
  const wanted = tokens(product);
  const rows = loadDirectory()
    .filter((s) => (country ? s.country.toLowerCase().includes(String(country).toLowerCase()) || s.countryCode === String(country).toUpperCase() : true))
    .filter((s) => (city ? s.city.toLowerCase().includes(String(city).toLowerCase()) : true))
    .filter((s) => (certification ? s.certifications.some((c) => c.toLowerCase().includes(String(certification).toLowerCase())) : true))
    .filter((s) => (acceptsPayPal === true ? s.acceptsPayPal : true))
    .map((s) => {
      const haystack = `${s.products.join(" ")} ${s.categories.join(" ")} ${s.capabilities.join(" ")} ${s.name}`.toLowerCase();
      const score = wanted.reduce((sum, t) => sum + (haystack.includes(t) ? 1 : 0), 0);
      return { s, score };
    })
    .filter((entry) => wanted.length === 0 || entry.score >= Math.max(1, Math.ceil(wanted.length / 2)))
    .sort((a, b) => b.score - a.score || b.s.trustScore - a.s.trustScore)
    .slice(0, limit);
  return rows.map(({ s, score }) => ({ ...s, matchScore: score }));
}

export function buildLeadSearchUrl(product, country) {
  const query = `${product} wholesale supplier manufacturer ${country ?? ""} contact`.trim();
  return { url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, query };
}

// Turns page snippets from the Kernel session into saved leads. Only keeps entries that name a website.
export function recordLeads({ query, sourceUrl, snippets, country }) {
  const existing = loadLeads();
  const known = new Set(existing.map((l) => l.id));
  const added = [];
  for (const raw of snippets) {
    const text = String(raw).replace(/\s+/g, " ").trim();
    const domain = text.match(/\b([a-z0-9-]+\.)+(com|in|co\.in|net|org|cn|de|co|io)\b/i)?.[0];
    if (!domain) continue;
    const id = `lead-${domain.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    if (known.has(id)) continue;
    known.add(id);
    added.push({
      id,
      name: domain.toLowerCase(),
      website: `https://${domain.toLowerCase()}`,
      country: country ?? "",
      query,
      snippet: text.slice(0, 220),
      sourceUrl,
      foundAt: new Date().toISOString(),
      verified: false
    });
  }
  if (added.length) saveLeads([...existing, ...added]);
  return added;
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { BadgeDollarSign, FileText, Lock, PackageCheck, RefreshCw, Scale } from "lucide-react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ActiveView } from "../types";
import { fetchClansPage, fetchLedger, fetchMcpTools, type ClanRecord, type LedgerClan, type McpToolDeclaration } from "../api";
import { ACTION_CATEGORIES, describeTool } from "../mosaicAgent";
import { MosaicLogo } from "./MosaicLogo";
import { PayPalAttribution } from "./PayPalAttribution";
import { HeroBackdrop } from "./HeroBackdrop";
import { WholeShareHero } from "../stageshow/WholeShareHero";
import { InferenceStatus } from "./InferenceStatus";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";

gsap.registerPlugin(ScrollTrigger);

interface LandingPageProps {
  onNavigate: (view: ActiveView) => void;
}


const HEADLINE: string[][] = [["Pool", "demand."], ["Buy", "with", "clarity."]];

const EXAMPLE_PROMPTS = ["Show me takeout container groups", "Which groups can we still join near me?", "What is the status of my escrow?", "Show me the shipments"];

const FACTS = [
  { title: "PayPal approved", body: "You approve every authorization on PayPal's own site." },
  { title: "Held, not charged", body: "A soft hold reserves funds. Nothing is captured until the group locks." },
  { title: "48 hour inspection", body: "Report damage within 48 hours of delivery and file a claim." },
  { title: "Prorated refunds", body: "Claims refund the damaged units at the agreed unit price." }
];

type StepViz = "pool" | "hold" | "inspect";

const STEPS: Array<{ n: string; title: string; body: string; viz: StepViz }> = [
  {
    n: "01",
    title: "Pool your order",
    body: "Join an open buying group and pledge units. Every member's volume counts toward one larger order, which unlocks the supplier's tier pricing.",
    viz: "pool"
  },
  {
    n: "02",
    title: "Authorize on PayPal",
    body: "PayPal places a soft authorization hold for your pledge. The group's minimum order quantity must fill before any money is captured.",
    viz: "hold"
  },
  {
    n: "03",
    title: "Receive and inspect",
    body: "When goods arrive, you have 48 hours to inspect. If something is damaged, file a claim with proof and get a prorated refund.",
    viz: "inspect"
  }
];

const BENEFITS = [
  { title: "Wholesale pricing without a wholesale order", body: "Pooled volume reaches supplier tiers a single small buyer could not.", line: "Tier pricing is shown per group before you pledge." },
  { title: "Escrow you can read", body: "Every group lists its units, target, members and escrow total from one ledger.", line: "Ledger figures are local records, not verified against PayPal." },
  { title: "Disputes that resolve by rule", body: "Eight governance rules per group fix inspection windows, evidence and refunds up front.", line: "Rules are visible before you pledge." },
  { title: "An assistant that does the clicking", body: "Mosaic can search groups, read your ledger, track shipments and prepare a quote. It never approves money for you.", line: "Every action Mosaic takes is listed in plain language." }
];

const PAYPAL_PARTS = [
  { icon: Lock, title: "Authorization holds", body: "Pledges use PayPal Orders. Funds are held, not charged, until the group fills." },
  { icon: FileText, title: "Invoices with QR", body: "Large pledges get a PayPal invoice the owner pays by QR code before the hold." },
  { icon: BadgeDollarSign, title: "Supplier payouts", body: "Payouts release only after the inspection window passes with no claim or dispute." },
  { icon: RefreshCw, title: "Recurring dues", body: "Group dues run as PayPal billing plans the member approves in PayPal." },
  { icon: Scale, title: "Disputes and claims", body: "Damage claims need photo evidence and buyer approval. One refund per claim." },
  { icon: PackageCheck, title: "Delivery tracking", body: "Carrier tracking numbers are checked and tied to each group order." }
];

const FAQ = [
  { q: "When does my money actually move?", a: "Pledging only places a soft authorization hold on PayPal. Funds are captured after the group fills its minimum order and delivery is verified. Until then no money moves." },
  { q: "What if the goods arrive damaged?", a: "You have 48 hours from delivery to file a damage claim with photographic proof and the carrier tracking number. The refund is calculated for the damaged units at the agreed unit price." },
  { q: "Is this live PayPal?", a: "This build runs against PayPal's Sandbox. Authorize, invoice and capture call the real Sandbox API, and you approve on PayPal's site. Demo groups and ledger figures are labelled as local records." },
  { q: "What can Mosaic do?", a: "Mosaic can navigate the app, filter groups, read the ledger, track shipments, prepare a pledge quote and file claims through the same actions you use. It shows each action it took." },
  { q: "Can Mosaic spend my money?", a: "No. Mosaic prepares quotes and authorizations, but approval always happens on PayPal's site, and automated authorization is locked off in Settings." },
  { q: "What does a buying group cost to join?", a: "Joining is a pledge for a number of units at the group's pooled unit price. You see the price, discount and total before you authorize." }
];

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatCategory(cat?: string): string {
  if (!cat) return "Wholesale";
  const map: Record<string, string> = {
    PROCESS_BATCH_PRODUCTION: "Batch process production",
    DISCRETE_MANUFACTURING: "Discrete manufacturing",
    PACKAGING_M: "Commercial packaging",
    CLEANTECH_E: "Clean technology and energy",
    FOODSERVICE: "Commercial foodservice",
    FOOD_AND_BEVERAGE: "Food and beverage ingredients"
  };
  return map[cat] ?? cat.replaceAll("_", " ").toLowerCase();
}

// The built-in demo groups share one id prefix, so they lead the list for visitors who have not set up their own city.
const isStory = (clan: { id: string }): boolean => clan.id.startsWith("clan-flushing-");

// Visitors with their own city see groups there first. Everyone else starts with the built-in demo groups.
const nearScore = (clan: { id: string; city?: string | null }, home: string): number => (home === "New York" && isStory(clan) ? 2 : 0) + (clan.city === home ? 1 : 0);

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const escrowRef = useRef<HTMLElement>(null);
  const groupsRef = useRef<HTMLElement>(null);
  const discountRef = useRef<HTMLElement>(null);
  const [clans, setClans] = useState<ClanRecord[]>([]);
  const [ledger, setLedger] = useState<LedgerClan[]>([]);
  const [tools, setTools] = useState<McpToolDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [catalogTotal, setCatalogTotal] = useState<number | null>(null);
  const [homeCity, setHomeCity] = useState("New York");

  useEffect(() => {
    let cancelled = false;
    // Groups near the visitor come first: their own city once they have set up a profile, otherwise the New York story market.
    const profileCity = fetch("/api/v1/user/settings").then((r) => r.json()).then((p: { profile?: { city?: string } }) => String(p.profile?.city ?? "").trim()).catch(() => "");
    profileCity.then((own) => Promise.all([fetchClansPage().catch(() => null), fetchClansPage({ city: own || "New York" }).catch(() => null), fetchLedger().catch(() => []), fetchMcpTools().catch(() => []), own || "New York"])).then(([page, local, l, t, home]) => {
      if (cancelled) return;
      setHomeCity(home);
      const seen = new Set<string>();
      const merged = [...(local?.clans ?? []), ...(page?.clans ?? [])].filter((clan) => (seen.has(clan.id) ? false : (seen.add(clan.id), true)));
      setClans(merged);
      setCatalogTotal(page?.total ?? null);
      setLedger(l);
      setTools(t);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const escrowDollars = ledger.length > 0 ? ledger.reduce((sum, row) => sum + (row.totalEscrowCents || 0), 0) / 100 : null;
  const groupCount = catalogTotal ?? (clans.length > 0 ? clans.length : null);
  const avgDiscount = clans.length > 0 ? clans.reduce((sum, c) => sum + c.discountTierPct, 0) / clans.length : null;

  const openGroups = useMemo(
    () => clans
      .filter((c) => c.status === "FORMING" && c.progressPct > 0 && c.progressPct < 100)
      .sort((a, b) => nearScore(b, homeCity) - nearScore(a, homeCity) || b.progressPct - a.progressPct),
    [clans, homeCity]
  );
  const featured = openGroups.find((c) => c.id === "clan-flushing-containers-eastern") ?? openGroups[0] ?? null;
  const localGroups = openGroups.filter((c) => nearScore(c, homeCity) > 0);
  const gridGroups = localGroups.length >= 4 ? localGroups.slice(0, 6) : openGroups.filter((c) => c.id !== featured?.id).slice(0, 6);

  const toolGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tool of tools) {
      const category = describeTool(tool).category;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return ACTION_CATEGORIES.filter((category) => counts.has(category)).map((category) => ({ category, count: counts.get(category) ?? 0 }));
  }, [tools]);

  const goDiscover = (clanId?: string) => {
    if (clanId) {
      try {
        window.sessionStorage.setItem("ws_selected_clan", clanId);
      } catch {
        // Session storage is optional.
      }
    }
    onNavigate("discover");
  };

  const askMosaic = (text: string) => {
    const value = text.trim();
    if (!value) return;
    try {
      window.sessionStorage.setItem("ws_mosaic_query", value);
    } catch {
      // Session storage is optional.
    }
    onNavigate("discover");
  };

  // One click into the built-in demo business, with its pledges, shipments and reports already in place.
  const useDemoBusiness = async () => {
    try {
      await fetch("/api/v1/user/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: { businessName: "Golden Lotus Kitchen", industry: "Restaurant", contactEmail: "owner@goldenlotus.example", city: "New York", country: "United States", currency: "USD", product: "takeout containers", units: 12, onboardingConfirmed: true } })
      });
      window.localStorage.setItem("wholeshare_onboarding_confirmed", "true");
    } catch {
      // The demo still opens if the save fails.
    }
    window.location.hash = "discover";
    window.location.reload();
  };

  const scrollTo = (id: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root || loading) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    root.classList.add("lp-js");
    const ctx = gsap.context(() => {
      const ease = "power4.out";
      const intro = gsap.timeline({ defaults: { ease } });
      intro
        .from(".lp-nav", { y: -24, opacity: 0, duration: 0.6 })
        .from(".lp-word", { y: 48, opacity: 0, duration: 0.9, stagger: 0.07 }, "-=0.3")
        .from(".lp-eyebrow, .lp-hero-sub, .lp-hero-cta, .lp-ask, .lp-try", { y: 24, opacity: 0, duration: 0.7, stagger: 0.08 }, "-=0.6")
        .from(".lp-frame", { y: 56, opacity: 0, duration: 1 }, "-=0.5");

      gsap.from(".lp-frame .lp-bar > span", { scaleX: 0, duration: 1.2, ease, delay: 0.9 });

      ScrollTrigger.batch(".lp-reveal", {
        start: "top 88%",
        once: true,
        onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, stagger: 0.08, ease: "power3.out", overwrite: true })
      });

      gsap.to(".lp-frame", { y: -36, ease: "none", scrollTrigger: { trigger: ".lp-hero", start: "top top", end: "bottom top", scrub: 0.6 } });
      gsap.fromTo(".lp-steps-line", { scaleX: 0 }, { scaleX: 1, ease: "none", transformOrigin: "left center", scrollTrigger: { trigger: ".lp-steps", start: "top 85%", end: "bottom 55%", scrub: 0.6 } });
      gsap.utils.toArray<HTMLElement>(".lp-step-num").forEach((num) => {
        gsap.from(num, { scale: 0.4, opacity: 0, duration: 0.7, ease: "back.out(2.4)", scrollTrigger: { trigger: num, start: "top 88%", once: true } });
      });
      gsap.utils.toArray<HTMLElement>(".lp-groups .lp-bar > span").forEach((bar, index) => {
        gsap.from(bar, { scaleX: 0, transformOrigin: "left center", duration: 1.1, ease: "power3.out", delay: (index % 3) * 0.08, scrollTrigger: { trigger: bar, start: "top 92%", once: true } });
      });

      ScrollTrigger.create({
        start: 24,
        onToggle: (self) => navRef.current?.classList.toggle("is-scrolled", self.isActive)
      });

      const counter = { escrow: 0, groups: 0, discount: 0 };
      gsap.to(counter, {
        escrow: escrowDollars ?? 0,
        groups: groupCount ?? 0,
        discount: avgDiscount ?? 0,
        duration: 1.4,
        ease,
        delay: 0.5,
        onUpdate: () => {
          if (escrowRef.current && escrowDollars !== null) escrowRef.current.textContent = `$${Math.round(counter.escrow).toLocaleString("en-US")}`;
          if (groupsRef.current && groupCount !== null) groupsRef.current.textContent = `${Math.round(counter.groups)}`;
          if (discountRef.current && avgDiscount !== null) discountRef.current.textContent = `${counter.discount.toFixed(1)}%`;
        }
      });
    }, root);

    const refresh = window.setTimeout(() => ScrollTrigger.refresh(), 400);
    return () => {
      window.clearTimeout(refresh);
      ctx.revert();
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
      root.classList.remove("lp-js");
    };
  }, [loading, escrowDollars, groupCount, avgDiscount]);

  const pooledCents = featured ? Math.round(featured.unitPriceCents * (1 - Math.min(featured.discountTierPct, 90) / 100)) : null;

  return (
    <div className="lp" ref={rootRef} data-ws-view="landing">
      <div className="lp-nav-shell">
        <nav className="lp-nav" ref={navRef} aria-label="Primary">
          <div className="lp-brand">
            <MosaicLogo size={34} textSize={19} />
          </div>
          <div className="lp-nav-links">
            <a href="#how" onClick={scrollTo("how")}>How it works</a>
            <a href="#groups" onClick={scrollTo("groups")}>Open groups</a>
            <a href="#mosaic" onClick={scrollTo("mosaic")}>Mosaic</a>
            <a href="#faq" onClick={scrollTo("faq")}>FAQ</a>
          </div>
          <div className="lp-nav-actions">
            <Button size="sm" label="Business profile" onClick={() => onNavigate("onboarding")} />
            <span className="lp-gold"><Button size="sm" variant="primary" label="Browse groups" onClick={() => goDiscover()} /></span>
          </div>
        </nav>
      </div>

      <header className="lp-hero">
        <HeroBackdrop />
        <div className="lp-wrap lp-hero-content">
          <div className="lp-center">
            <p className="lp-eyebrow">B2B group purchasing on PayPal</p>
            <h1 aria-label="Pool demand. Buy with clarity.">
              {HEADLINE.map((line, lineIndex) => (
                <span key={lineIndex} aria-hidden="true" style={{ display: "block" }}>
                  {line.map((word, wordIndex) => (
                    <span key={word + wordIndex} className="lp-word" style={{ marginRight: "0.25em" }}>{word}</span>
                  ))}
                </span>
              ))}
            </h1>
            <p className="lp-hero-sub">
              Small businesses pool wholesale volume to unlock supplier tier pricing, with PayPal approved escrow authorizations and prorated dispute refunds.
            </p>
            <div className="lp-hero-cta">
              <span className="lp-gold"><Button size="lg" variant="primary" label="Browse open buying groups" onClick={() => goDiscover()} /></span>
              <Button size="lg" label="See how it works" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })} />
            </div>
            <form className="lp-ask" onSubmit={(event) => { event.preventDefault(); askMosaic(query); }}>
              <MosaicLogo size={26} wordmark={false} intro={false} loop={false} />
              <label htmlFor="lp-ask-input" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Ask Mosaic</label>
              <input id="lp-ask-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask Mosaic to find a group or compare tiers" />
              <Button size="sm" type="submit" label="Ask Mosaic" />
            </form>
            <div className="lp-try">
              <span>Try</span>
              {EXAMPLE_PROMPTS.slice(0, 3).map((prompt) => (
                <button key={prompt} type="button" className="lp-link" onClick={() => askMosaic(prompt)}>{prompt}</button>
              ))}
            </div>
            <InferenceStatus />
          </div>

          <div className="lp-frame lp-frame--demo" aria-label="Animated demo: ask Mosaic for takeout container groups, join one, PayPal holds the funds">
            <WholeShareHero />
          </div>
        </div>
      </header>

      <section className="lp-facts" aria-label="How buyers are protected">
        <div className="lp-wrap lp-facts-grid">
          {FACTS.map((fact) => (
            <div key={fact.title} className="lp-fact lp-reveal"><b>{fact.title}</b>{fact.body}</div>
          ))}
        </div>
      </section>

      <section className="lp-section" id="start">
        <div className="lp-wrap">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">Try it your way</p>
            <h2 className="lp-h2">Bring your own business, or use ours.</h2>
          </div>
          <div className="lp-try-grid">
            <div className="lp-try-card lp-reveal">
              <h3>Use your own business</h3>
              <p>Say what you buy and where you are. WholeShare builds a workspace around it from the real catalog, so everything you see is yours.</p>
              <ul>
                <li>Pledges in groups that match your product</li>
                <li>A delivery on the way, a late one and one ready to inspect</li>
                <li>Reports, schedules and claims for your business only</li>
              </ul>
              <div className="lp-try-actions"><Button variant="secondary" label="Set up my business" onClick={() => onNavigate("onboarding")} /></div>
            </div>
            <div className="lp-try-card lp-reveal">
              <h3>Use the demo business</h3>
              <p>Golden Lotus Kitchen, a restaurant in New York that pools takeout containers with its neighbours. Open it and try every step.</p>
              <ul>
                <li>Find and compare two container groups</li>
                <li>Join one and approve the hold on PayPal</li>
                <li>Move a delivery, file a damage claim, read the reports</li>
              </ul>
              <div className="lp-try-actions"><Button variant="secondary" label="Open the demo business" onClick={() => void useDemoBusiness()} /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap lp-split">
          <div className="lp-reveal">
            <p className="lp-eyebrow">The problem</p>
            <h2 className="lp-h2" style={{ marginTop: 12 }}>Small buyers pay retail. Pooled buyers pay tier prices.</h2>
            <p className="lp-lead">
              Suppliers reserve their best unit prices for large orders. WholeShare adds your volume to everyone else's so a small business reaches the same tier, with money held safely until delivery.
            </p>
          </div>
          <div className="lp-card lp-compare lp-reveal">
            {featured && pooledCents ? (
              <>
                <p className="lp-label" style={{ marginBottom: 8 }}>{featured.name}</p>
                <div className="lp-compare-row"><span>Buying alone (list price)</span><b className="lp-num lp-strike">{usd(featured.unitPriceCents)}</b></div>
                <div className="lp-compare-row lp-compare-row--win"><span>Pooled price at the top tier</span><b className="lp-num">{usd(pooledCents)}</b></div>
                <div className="lp-compare-row"><span>Top tier discount</span><b className="lp-num">{featured.discountTierPct}%</b></div>
                <p className="lp-note" style={{ marginTop: 16 }}>The top tier applies when the group reaches its target. Today it is {featured.progressPct}% of the way.</p>
              </>
            ) : (
              <p className="lp-meta">{loading ? "Loading a live example" : "No open group available to compare."}</p>
            )}
          </div>
        </div>
      </section>

      <section className="lp-section lp-section--white" id="how">
        <div className="lp-wrap">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">How it works</p>
            <h2 className="lp-h2">Three steps from pledge to delivery.</h2>
          </div>
          <div className="lp-steps-line" aria-hidden="true" />
          <div className="lp-steps">
            {STEPS.map((step) => (
              <article key={step.n} className="lp-card lp-step lp-reveal">
                <span className="lp-step-num">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                <div className="lp-viz" aria-hidden="true">
                  {step.viz === "pool" && (
                    <>
                      <div className="lp-viz-row"><span>Group order target</span><b className="lp-num">{featured ? `${featured.progressPct}%` : "No data"}</b></div>
                      <div className="lp-bar"><span style={{ width: `${featured?.progressPct ?? 0}%` }} /></div>
                    </>
                  )}
                  {step.viz === "hold" && (
                    <>
                      <div className="lp-hold"><i />Authorization hold placed</div>
                      <div className="lp-hold"><i className="is-off" />Captured after the group locks</div>
                    </>
                  )}
                  {step.viz === "inspect" && (
                    <>
                      <div className="lp-viz-row"><span>Inspection window</span><b className="lp-num">48 hours</b></div>
                      <div className="lp-segments">{Array.from({ length: 24 }, (_, i) => <i key={i} />)}</div>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">Why WholeShare</p>
            <h2 className="lp-h2">Built so a small order feels safe.</h2>
          </div>
          <div className="lp-benefits">
            {BENEFITS.map((benefit) => (
              <article key={benefit.title} className="lp-card lp-benefit lp-reveal">
                <h3>{benefit.title}</h3>
                <p>{benefit.body}</p>
                <p className="lp-proofline">{benefit.line}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-section--white" id="groups">
        <div className="lp-wrap">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">Open now</p>
            <h2 className="lp-h2">Buying groups filling right now.</h2>
            <p className="lp-lead" style={{ marginTop: 0 }}>Live from the catalog.</p>
          </div>
          {gridGroups.length > 0 ? (
            <div className="lp-groups">
              {gridGroups.map((group) => (
                <button key={group.id} type="button" className="lp-card lp-group lp-reveal" onClick={() => goDiscover(group.id)}>
                  <p className="lp-label">{formatCategory(group.category)}</p>
                  <h3>{group.name}</h3>
                  <p className="lp-meta">{group.city ?? "Location not listed"}. {group.membersCount} members.</p>
                  <p className="lp-price lp-num">{usd(group.unitPriceCents)} <span className="lp-meta" style={{ fontWeight: 400 }}>list</span></p>
                  <div className="lp-bar"><span style={{ width: `${group.progressPct}%` }} /></div>
                  <div className="lp-bar-row">
                    <span className="lp-num">{group.progressPct}% pledged</span>
                    <span className="lp-num">up to {group.discountTierPct}% off</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="lp-card lp-empty">{loading ? "Loading groups" : "No open buying groups right now."}</div>
          )}
          <div className="lp-groups-foot lp-reveal">
            <p className="lp-meta">{groupCount === null ? "" : `${groupCount} groups in the catalog.`}</p>
            <span className="lp-gold"><Button variant="primary" label="Browse all buying groups" onClick={() => goDiscover()} /></span>
          </div>
        </div>
      </section>

      <section className="lp-section" id="mosaic">
        <div className="lp-wrap lp-split">
          <div className="lp-reveal">
            <p className="lp-eyebrow">Mosaic</p>
            <h2 className="lp-h2" style={{ marginTop: 12 }}>Ask once. Mosaic drives the app.</h2>
            <p className="lp-lead">
              Mosaic is the assistant built into WholeShare. It uses the same actions you do, shows every step it takes, and stops before any approval that moves money.
            </p>
            <div className="lp-prompts">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" className="lp-prompt" onClick={() => askMosaic(prompt)}>{prompt}</button>
              ))}
            </div>
          </div>
          <div className="lp-card lp-reveal">
            <div style={{ padding: "24px 24px 0" }}>
              <p className="lp-label">Just say it</p>
              <p className="lp-big" style={{ fontSize: 26 }}>Mosaic does the clicking.</p>
            </div>
            <div className="lp-mosaic-list">
              {[
                ["Find", "Search the catalog and open the right group"],
                ["Check", "Read supplier sites with a cloud browser"],
                ["Show", "Docks live tables and reports beside the page"],
                ["Prepare", "Quotes, claims and invoices, ready for your approval"],
                ["Schedule", "Moves deliveries and inspection windows"]
              ].map(([verb, detail]) => (
                <div key={verb} className="lp-mosaic-item"><b>{verb}</b><span>{detail}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section" id="paypal">
        <div className="lp-wrap">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">Built on PayPal</p>
            <h2 className="lp-h2" style={{ marginTop: 12 }}>Every money step runs on PayPal.</h2>
            <p className="lp-lead">Six PayPal capabilities, each wired to a screen in the app. Payments run on the PayPal Sandbox.</p>
          </div>
          <div className="lp-paypal-grid">
            {PAYPAL_PARTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="lp-card lp-reveal lp-paypal-item">
                <span className="lp-paypal-icon"><Icon size={20} strokeWidth={1.8} /></span>
                <b>{title}</b>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-section--white" id="faq">
        <div className="lp-wrap">
          <div className="lp-section-head lp-reveal">
            <p className="lp-eyebrow">Questions</p>
            <h2 className="lp-h2">Answers before you pledge.</h2>
          </div>
          <div className="lp-faq">
            {FAQ.map((item, index) => (
              <div key={item.q} className="lp-reveal lp-faq-item">
                <Collapsible defaultIsOpen={index === 0} trigger={<span className="lp-faq-q">{item.q}</span>}>
                  <p className="lp-faq-a">{item.a}</p>
                </Collapsible>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-wrap lp-reveal">
          <h2>Start your first pool.</h2>
          <p>Browse open groups, read the rules, and pledge with a PayPal authorization hold. Nothing is captured until the group locks.</p>
          <div className="lp-hero-cta">
            <span className="lp-gold"><Button size="lg" variant="primary" label="Browse open buying groups" onClick={() => goDiscover()} /></span>
            <Button size="lg" label="Set up your business profile" onClick={() => onNavigate("onboarding")} />
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-row">
          <span className="lp-brand" style={{ fontSize: 16 }}><MosaicLogo size={26} intro={false} loop={false} textSize={16} /></span>
          <PayPalAttribution align="center" />
          <span>PayPal Developer Sandbox.</span>
        </div>
      </footer>
    </div>
  );
};

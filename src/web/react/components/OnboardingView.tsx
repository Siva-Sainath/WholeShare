import React, { useState, useEffect, useRef } from "react";
import { MosaicLogo } from "./MosaicLogo";
import { PayPalAttribution } from "./PayPalAttribution";
import { OnboardingPrefill } from "../types";
import { Button } from "@astryxdesign/core/Button";
import { FileInput } from "@astryxdesign/core/FileInput";
import { PayPalConnectCard } from "./PayPalConnectCard";
import { PermissionsPanel } from "./PermissionsPanel";
import { fetchClans, fetchClansPage, ClanRecord, saveUserSettingsApi, uploadEvidence, PayPalConnection } from "../api";
import { STITCH_COLORS, STITCH_TYPOGRAPHY, STITCH_RADIUS, STITCH_SHADOWS, STITCH_GLASS } from "../themes/stitchTokens";

interface OnboardingViewProps {
  onComplete: () => void;
  prefill?: OnboardingPrefill | null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

const COUNTRIES = [
  "United States", "Canada", "Mexico", "United Kingdom", "Ireland", "Germany", "France", "Netherlands",
  "Belgium", "Spain", "Italy", "Portugal", "Switzerland", "Austria", "Poland", "Czechia", "Hungary",
  "Romania", "Greece", "Sweden", "Norway", "Denmark", "Finland", "India", "China", "Japan", "South Korea",
  "Australia", "New Zealand", "Brazil", "Argentina", "Chile", "Colombia", "Peru", "South Africa", "Nigeria",
  "Kenya", "Egypt", "United Arab Emirates", "Saudi Arabia", "Israel", "Turkey", "Thailand", "Vietnam",
  "Indonesia", "Malaysia", "Singapore", "Philippines", "Taiwan", "Hong Kong"
];

type QuestionKind = "text" | "email" | "number" | "country" | "choice";

interface Question {
  id: string;
  title: string;
  note: string;
  helper: string;
  kind: QuestionKind;
  placeholder?: string;
  options?: string[];
  validate: (value: string) => string | null;
}

const CHECKLIST_LABELS: Record<string, string> = {
  businessName: "Business name",
  contactEmail: "Contact email",
  product: "What you want to buy",
  units: "Units wanted",
  city: "Delivery city",
  country: "Country",
  spendLimit: "Spend limit per pledge",
  paypal: "PayPal connection",
  permissions: "Mosaic permissions"
};

const QUESTIONS: Question[] = [
  {
    id: "businessName",
    title: "What is your business name?",
    note: "We use this for your buying group.",
    helper: "Use your legal or operating name.",
    kind: "text",
    placeholder: "Legal or operating name",
    validate: (v) => (v.trim().length >= 2 ? null : "Enter your business name.")
  },
  {
    id: "contactEmail",
    title: "What is your contact email?",
    note: "We send group buy notifications and escrow receipts here.",
    helper: "Use a business email you check.",
    kind: "email",
    placeholder: "finance@business.com",
    validate: (v) => (isValidEmail(v) ? null : "Enter a valid business email address.")
  },
  {
    id: "product",
    title: "What do you want to buy for your business?",
    note: "Describe it in your own words, like coffee beans, shipping boxes or work gloves. We will show real buying groups for it.",
    helper: "No product codes needed.",
    kind: "text",
    placeholder: "For example: coffee beans",
    validate: (v) => (v.trim().length >= 2 ? null : "Tell us what you want to buy.")
  },
  {
    id: "units",
    title: "How many units do you want?",
    note: "Your share of the group order.",
    helper: "Enter a whole number above zero.",
    kind: "number",
    placeholder: "Units",
    validate: (v) => {
      const n = Number(v);
      if (!v.trim() || Number.isNaN(n) || !Number.isInteger(n) || n <= 0) return "Enter a whole number above zero.";
      return null;
    }
  },
  {
    id: "city",
    title: "Which city is the delivery for?",
    note: "We match you with groups near this city.",
    helper: "Enter the delivery city.",
    kind: "text",
    placeholder: "Delivery city",
    validate: (v) => (v.trim().length >= 2 ? null : "Enter the delivery city.")
  },
  {
    id: "country",
    title: "Which country?",
    note: "We use this for the delivery region.",
    helper: "Choose a country.",
    kind: "country",
    validate: (v) => (v.trim().length > 0 ? null : "Choose a country.")
  },
  {
    id: "spendLimit",
    title: "What is your spend limit per pledge?",
    note: "The most you will authorize for one group buy, in USD.",
    helper: "Enter an amount in USD.",
    kind: "number",
    placeholder: "USD",
    validate: (v) => {
      const n = Number(v);
      if (!v.trim() || Number.isNaN(n) || n <= 0) return "Enter an amount above zero.";
      if (n > 1000000) return "Enter an amount up to 1,000,000.";
      return null;
    }
  },
  {
    id: "paypal",
    title: "Do you want to connect PayPal now, or later?",
    note: "PayPal is never connected automatically. Money never moves without your approval on PayPal.",
    helper: "Choose connect now or later.",
    kind: "choice",
    options: ["Connect later", "Connect now"],
    validate: () => null
  },
  {
    id: "permissions",
    title: "Keep Mosaic permissions at the minimum?",
    note: "Mosaic can prepare quotes and filter groups. It never pledges, captures, or publishes without your confirmation.",
    helper: "Minimum means all permissions off.",
    kind: "choice",
    options: ["Keep minimum", "Choose permissions"],
    validate: () => null
  }
];

interface ChatMsg {
  id: number;
  from: "mosaic" | "user";
  text: string;
  qnum?: number;
  title?: string;
  note?: string;
  helper?: string;
}


export const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete, prefill }) => {
  const c = STITCH_COLORS;
  const font = STITCH_TYPOGRAPHY.sans;
  const mono = STITCH_TYPOGRAPHY.mono;

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (prefill?.businessName) initial.businessName = prefill.businessName;
    if (typeof prefill?.spendLimit === "number") initial.spendLimit = String(prefill.spendLimit);
    return initial;
  });
  const [input, setInput] = useState(() => (prefill?.businessName ? prefill.businessName : ""));

  useEffect(() => {
    if (prefill?.businessName) {
      setAnswers((prev) => ({ ...prev, businessName: prefill.businessName! }));
      setInput(prefill.businessName);
      setDocSkip(true);
    }
  }, [prefill]);
  const [error, setError] = useState<string | null>(null);
  const [permOpen, setPermOpen] = useState(false);
  const [permQuote, setPermQuote] = useState(false);
  const [permFilter, setPermFilter] = useState(false);
  const [permDraft, setPermDraft] = useState(false);
  const [permResearch, setPermResearch] = useState(false);
  const [permSchedule, setPermSchedule] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState<Record<string, string>>({ country: "", paypal: "Connect later" });
  const [manualError, setManualError] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  // Documents the business already has. Mosaic reads them, fills the profile and skips the questions it can already answer.
  const [reading, setReading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [docRead, setDocRead] = useState(false);
  const [docSkip, setDocSkip] = useState(false);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [docExtra, setDocExtra] = useState<Record<string, unknown>>({});
  const [paypalState, setPaypalState] = useState<PayPalConnection | null>(null);
  const [suggestedClan, setSuggestedClan] = useState<ClanRecord | null>(null);
  const [suggestedChecked, setSuggestedChecked] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const idRef = useRef(0);
  const nextId = () => { idRef.current += 1; return idRef.current; };

  const DRAFT_KEY = "wholeshare_onboarding_draft";
  const saveDraft = () => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, step, messages, idCounter: idRef.current, permQuote, permFilter, permDraft, permResearch, permSchedule })); } catch { /* ignore */ }
  };

  const questionFor = (index: number) => QUESTIONS[index];

  const mosaicQuestion = (index: number): ChatMsg => {
    const q = questionFor(index);
    return { id: nextId(), from: "mosaic", text: "Got it, recorded. Next detail for your profile.", qnum: index + 1, title: q.title, note: q.note, helper: q.helper };
  };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("wholeshare_onboarding_draft");
      const returned = new URLSearchParams(window.location.search).has("paypal");
      if (raw && returned) {
        const draft = JSON.parse(raw);
        if (draft && Array.isArray(draft.messages) && typeof draft.step === "number") {
          idRef.current = Number(draft.idCounter) || draft.messages.length + 1;
          setAnswers(draft.answers || {});
          setStep(draft.step);
          setMessages(draft.messages);
          setPermQuote(Boolean(draft.permQuote));
          setPermFilter(Boolean(draft.permFilter));
          setPermDraft(Boolean(draft.permDraft));
          setPermResearch(Boolean(draft.permResearch));
          setPermSchedule(Boolean(draft.permSchedule));
          return;
        }
      }
    } catch { /* fall through to a fresh start */ }
    const welcome: ChatMsg = {
      id: nextId(),
      from: "mosaic",
      text: "Welcome to WholeShare. I am Mosaic. I will help you set up your buying group, one question at a time.",
      qnum: 1,
      title: QUESTIONS[0].title,
      note: QUESTIONS[0].note,
      helper: QUESTIONS[0].helper
    };
    setMessages([welcome]);
    if (answers.businessName) setInput(answers.businessName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, step, permOpen, showManual]);

  useEffect(() => {
    const q = questionFor(step);
    if (!q) return;
    if (answers[q.id] && q.kind !== "choice") setInput(answers[q.id]);
    else if (q.kind === "country") setInput(answers[q.id] || "");
    else if (q.kind !== "choice") setInput("");
    setError(null);
    setPermOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const displayAnswer = (qid: string, value: string) => {
    if (qid === "spendLimit") return `$${Number(value).toLocaleString()} USD`;
    if (qid === "units") return `${Number(value).toLocaleString()} units`;
    return value;
  };

  const advance = (qid: string, value: string, extraMsgs: ChatMsg[] = []) => {
    const nextAnswers = { ...answers, [qid]: value };
    setAnswers(nextAnswers);
    const userMsg: ChatMsg = { id: nextId(), from: "user", text: displayAnswer(qid, value) };
    const nextStep = step + 1;
    if (nextStep >= QUESTIONS.length) {
      setMessages((prev) => [...prev, userMsg, ...extraMsgs]);
      setStep(nextStep);
      return;
    }
    const nextQ = mosaicQuestion(nextStep);
    if (nextStep === 1) nextQ.text = "Got it, recorded. Next detail for your profile.";
    if (nextStep === 2) nextQ.text = "Email noted. Now let us link your desired item.";
    setMessages((prev) => [...prev, userMsg, ...extraMsgs, nextQ]);
    setStep(nextStep);
  };

  const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });

  const applyExtraction = (result: { fields: Record<string, any>; files: Array<{ name: string }> }) => {
    const f = result.fields;
    const next: Record<string, string> = { ...answers };
    if (f.businessName) next.businessName = String(f.businessName);
    if (f.contactEmail) next.contactEmail = String(f.contactEmail);
    if (f.mainProduct) next.product = String(f.mainProduct);
    if (f.units) next.units = String(f.units);
    if (f.city) next.city = String(f.city);
    if (f.country) next.country = String(f.country);
    const index = QUESTIONS.findIndex((q) => !next[q.id] || next[q.id].trim().length === 0);
    const target = index === -1 ? QUESTIONS.length : index;
    const bits: string[] = [`I read ${result.files.map((file) => file.name).join(" and ")}.`];
    if (f.businessName) bits.push(`${f.businessName}${f.address ? `, ${f.address}` : ""}${f.borough ? `, ${f.borough}` : f.city ? `, ${f.city}` : ""}.`);
    if (f.currentSupplier && f.currentUnitPriceUsd && f.mainProduct) bits.push(`You buy ${f.mainProduct} from ${f.currentSupplier} at $${Number(f.currentUnitPriceUsd).toFixed(2)} each today.`);
    const answered = QUESTIONS.filter((q, i) => i < target && next[q.id]).length;
    bits.push(answered > 0 ? `That answers ${answered} of the questions. Here is the next one.` : "I could not find your details in them, so let us answer a few questions.");
    const note: ChatMsg = { id: nextId(), from: "mosaic", text: bits.join(" ") };
    setAnswers(next);
    setDocExtra({ address: f.address, borough: f.borough, state: f.state, currentSupplier: f.currentSupplier, currentUnitPriceUsd: f.currentUnitPriceUsd, industry: f.industry, invoiceNumber: f.invoiceNumber, products: f.products, documentsRead: true });
    setDocRead(true);
    setMessages((prev) => [...prev, note, ...(target < QUESTIONS.length ? [mosaicQuestion(target)] : [])]);
    setStep(target);
  };

  const readDocuments = async (input: { files?: File[]; demoKit?: string }) => {
    setReading(true);
    setDocError(null);
    try {
      const body = input.demoKit
        ? { demoKit: input.demoKit }
        : { files: await Promise.all((input.files ?? []).map(async (file) => ({ fileName: file.name, mimeType: file.type, base64: await toBase64(file) }))) };
      const response = await fetch("/api/v1/onboarding/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Those documents could not be read.");
      applyExtraction(payload);
    } catch (cause) {
      setDocError(cause instanceof Error ? cause.message : "Those documents could not be read.");
    } finally {
      setReading(false);
    }
  };

  const submitAnswer = () => {
    const q = questionFor(step);
    if (!q) return;
    const err = q.validate(input);
    if (err) { setError(err); return; }
    const value = input.trim();
    if (q.id === "product") {
      fetchClans()
        .then((clans) => {
          if (clans.length === 0) { setSuggestedChecked(true); return; }
          const matched = clans.find((cl) =>
            cl.sku.toLowerCase().includes(value.toLowerCase()) ||
            cl.name.toLowerCase().includes(value.toLowerCase()) ||
            value.toLowerCase().includes(cl.sku.toLowerCase())
          );
          setSuggestedClan(matched || null);
          setSuggestedChecked(true);
        })
        .catch(() => { setSuggestedChecked(true); });
    }
    advance(q.id, value);
  };

  const chooseOption = (value: string) => {
    const q = questionFor(step);
    if (!q) return;
    if (q.id === "permissions" && value === "Choose permissions") {
      setPermOpen(true);
      return;
    }
    if (q.id === "paypal" && value === "Connected") {
      const note: ChatMsg = { id: nextId(), from: "mosaic", text: `PayPal is connected${paypalState?.email ? ` as ${paypalState.email}` : ""}. Money still moves only when you approve it in PayPal.` };
      advance(q.id, value, [note]);
      return;
    }
    advance(q.id, value);
  };

  const confirmPermissions = () => {
    advance("permissions", "Choose permissions");
  };

  const submitManual = () => {
    const required = ["businessName", "contactEmail", "product", "units", "city", "country", "spendLimit"];
    for (const qid of required) {
      const q = QUESTIONS.find((item) => item.id === qid);
      const value = manual[qid] || "";
      if (!q) continue;
      const err = q.validate(value);
      if (err) { setManualError(err); return; }
    }
    setManualError(null);
    const filled: Record<string, string> = { ...answers };
    for (const qid of required) filled[qid] = (manual[qid] || "").trim();
    filled.paypal = manual.paypal || "Connect later";
    filled.permissions = "Keep minimum";
    setAnswers(filled);
    setPermQuote(false);
    setPermFilter(false);
    setPermDraft(false);
    setShowManual(false);
    const note: ChatMsg = {
      id: nextId(), from: "mosaic",
      text: "Manual form received. Review the summary below, then confirm to save."
    };
    setMessages((prev) => [...prev, note]);
    setStep(QUESTIONS.length);
    if (filled.product) {
      fetchClans()
        .then((clans) => {
          const matched = clans.find((cl) =>
            cl.sku.toLowerCase().includes(filled.product.toLowerCase()) ||
            cl.name.toLowerCase().includes(filled.product.toLowerCase())
          );
          setSuggestedClan(matched || null);
          setSuggestedChecked(true);
        })
        .catch(() => { setSuggestedChecked(true); });
    }
  };

  const handleFinish = async () => {
    setSubmitting(true);
    setSaveError(null);
    const spendLimit = Number(answers.spendLimit || 0);
    const units = Number(answers.units || 0);
    const profile: Record<string, unknown> = {
      businessName: answers.businessName || "",
      contactEmail: answers.contactEmail || "",
      city: answers.city || "",
      country: answers.country || "",
      product: answers.product || "",
      units: units > 0 ? units : undefined,
      onboardingConfirmed: true
    };
    if (prefill?.vertical) profile.industry = prefill.vertical;
    // What the documents showed: who the business buys from today and at what price.
    for (const [key, value] of Object.entries(docExtra)) if (value !== undefined && value !== null && value !== "") profile[key] = value;
    try {
      if (docFile) {
        const stored = await uploadEvidence(docFile);
        profile.businessDocumentUri = stored.uri;
        profile.businessDocumentName = stored.fileName;
      }
      await saveUserSettingsApi({
        profile,
        policies: {
          perPledgeSpendLimitUsd: spendLimit,
          approvalThresholdUsd: 1000,
          dailySpendLimitUsd: spendLimit * 2
        },
        agentPermissions: {
          allowAutonomousQuotePrep: permQuote,
          allowAutonomousFilterSort: permFilter,
          allowAutonomousDraftMessages: permDraft,
          allowAutonomousResearch: permResearch,
          allowAutonomousScheduleChanges: permSchedule
        }
      });
      const industry = prefill?.vertical || suggestedClan?.category;
      if (industry && window.wholeshareCmd?.dispatch) {
        window.wholeshareCmd.dispatch({
          action: "onboarding.submit",
          params: {
            businessName: answers.businessName || "",
            industry,
            commodity: answers.product || "",
            targetVolume: units,
            city: answers.city || "",
            country: answers.country || ""
          }
        });
      }
      try { localStorage.setItem("wholeshare_onboarding_confirmed", "true"); } catch { /* ignore */ }
      setIsFinished(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save your profile. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const [suggestions, setSuggestions] = useState<ClanRecord[]>([]);
  useEffect(() => {
    if (QUESTIONS[step]?.id !== "product" || input.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchClansPage({ search: input, limit: 40 })
        .then((page) => {
          if (cancelled) return;
          const seen = new Set<string>();
          const distinct = page.clans.filter((group) => (seen.has(group.sku) ? false : (seen.add(group.sku), true)));
          setSuggestions(distinct.slice(0, 3).map((group) => ({ ...group, membersCount: page.clans.filter((other) => other.sku === group.sku).length })));
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [input, step]);

  const answeredCount = QUESTIONS.filter((q) => answers[q.id] && answers[q.id].trim().length > 0).length;
  // When several answers arrive at once (the documents fill six), the checklist ticks them off one at a time so each is seen.
  const [shownStep, setShownStep] = useState(step);
  useEffect(() => {
    if (shownStep === step) return undefined;
    if (step < shownStep) { setShownStep(step); return undefined; }
    const timer = window.setTimeout(() => setShownStep((value) => Math.min(value + 1, step)), 420);
    return () => window.clearTimeout(timer);
  }, [step, shownStep]);
  const completedCount = Math.min(answeredCount, shownStep);
  const progressPct = Math.round((completedCount / QUESTIONS.length) * 100);
  const currentQ = step < QUESTIONS.length ? questionFor(step) : null;

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", paddingRight: 96, borderRadius: STITCH_RADIUS.xl,
    border: `1px solid ${c.border}`, background: c.card, color: c.ink,
    fontFamily: font, fontSize: 15, outline: "none"
  };

  const goldBtn: React.CSSProperties = {
    padding: "10px 20px", borderRadius: STITCH_RADIUS.xl, border: "none",
    background: c.gold, color: c.ink, fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer"
  };

  if (isFinished) {
    return (
      <div style={{ minHeight: "100vh", background: c.canvas, fontFamily: font, color: c.ink, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div data-testid="onboarding-youre-set" style={{ textAlign: "center", maxWidth: 480 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>Procurement identity confirmed</h3>
          <p style={{ margin: "0 0 24px", fontSize: 14, lineHeight: "22px", color: c.muted }}>
            Your business profile has been confirmed and saved. You can now discover matching buying groups and lock wholesale pricing.
          </p>
          <button type="button" onClick={onComplete} style={{ ...goldBtn, padding: "12px 28px", fontSize: 14 }}>Enter Matchmaking Workspace</button>
          <div style={{ marginTop: 24 }}><PayPalAttribution /></div>
        </div>
      </div>
    );
  }

  const checklist = (
    <aside aria-label="Setup checklist" style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: STITCH_RADIUS["2xl"], padding: 24, display: "grid", gap: 16, position: "sticky", top: 16 }}>
      <div>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.muted }}>Setup checklist</p>
        <p style={{ margin: "8px 0 0", fontSize: 28, lineHeight: "32px", fontWeight: 600, fontFamily: mono }}>{completedCount}<span style={{ color: c.muted, fontSize: 18 }}> of {QUESTIONS.length}</span></p>
        <div style={{ height: 6, background: c.border, borderRadius: 3, overflow: "hidden", marginTop: 12 }}>
          <div style={{ height: "100%", width: `${Math.max(progressPct, 3)}%`, background: c.blue, borderRadius: 3, transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)" }} />
        </div>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
        {QUESTIONS.map((q, index) => {
          const done = index < shownStep;
          const current = index === shownStep;
          const value = answers[q.id];
          return (
            <li key={q.id} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 12, padding: "8px 8px", borderRadius: 8, background: current ? c.blueLight : "transparent" }}>
              <span style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${done ? c.blue : current ? c.blue : c.border}`, background: done ? c.blue : "transparent", display: "grid", placeItems: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>
                {done ? "✓" : ""}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, lineHeight: "20px", fontWeight: current ? 600 : 500, color: done || current ? c.ink : c.muted }}>{CHECKLIST_LABELS[q.id] ?? q.title}</span>
                {done && value && <span style={{ display: "block", fontSize: 12, lineHeight: "16px", color: c.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayAnswer(q.id, value)}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p style={{ margin: 0, fontSize: 12, lineHeight: "16px", color: c.muted }}>Secure session. Mosaic never pledges or captures without your confirmation, and PayPal connects only if you choose it.</p>
    </aside>
  );

  return (
    <div style={{ width: "100%", background: c.canvas, fontFamily: font, color: c.ink, display: "grid", gridTemplateColumns: "minmax(280px, 340px) minmax(0, 1fr)", gap: 24, alignItems: "start" }} className="ws-onboarding-grid">
      {checklist}

      <main style={{ minWidth: 0 }}>
        <section style={{
          width: "100%", margin: 0, height: "calc(100vh - 120px)", minHeight: 560,
          background: STITCH_GLASS.cardBg, backdropFilter: `blur(${STITCH_GLASS.blur})`,
          border: `1px solid ${c.border}`, borderRadius: STITCH_RADIUS["3xl"],
          boxShadow: STITCH_SHADOWS.glass, display: "flex", flexDirection: "column", overflow: "hidden"
        }}>
          <div style={{ padding: "20px 24px", borderBottom: `1px solid ${c.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: c.card }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: STITCH_RADIUS.xl, background: "#F8FAFC", border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
                <MosaicLogo size={26} wordmark={false} intro={false} loop={false} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>Mosaic</h1>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: c.muted }}>Asks one question at a time</p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="small"
              label="Use the demo business"
              onClick={() => {
                void saveUserSettingsApi({
                  profile: { businessName: "Neon Dumpling Co.", industry: "Restaurant", contactEmail: "owner@neondumpling.example", city: "New York", country: "United States", currency: "USD", product: "takeout containers", units: 12, address: "218 Bedford Avenue", borough: "Brooklyn", state: "NY", currentSupplier: "Garden State Paper & Packaging", currentUnitPriceUsd: 31.5 }
                }).catch(() => undefined).then(() => onComplete());
              }}
            />
          </div>

          <div ref={bodyRef} style={{ padding: "24px", display: "grid", gap: 24, alignContent: "start", flex: 1, minHeight: 0, overflowY: "auto", background: "rgba(255, 255, 255, 0.5)" }}>
            {messages.map((msg) => {
              if (msg.from === "user") {
                return (
                  <div key={msg.id} style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ maxWidth: "80%", background: c.ink, color: "#FFFFFF", padding: "14px 16px", borderRadius: STITCH_RADIUS["2xl"], borderTopRightRadius: 4, fontSize: 14, lineHeight: "20px" }}>
                      {msg.text}
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} style={{ display: "flex", alignItems: "flex-start", gap: 16, maxWidth: 620 }}>
                  <div style={{ width: 32, height: 32, borderRadius: STITCH_RADIUS.lg, background: "#F8FAFC", border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 4, marginTop: 2 }}>
                    <MosaicLogo size={26} wordmark={false} intro={false} loop={false} />
                  </div>
                  <div style={{ flex: 1, display: "grid", gap: 12 }}>
                    <div style={{ padding: 20, borderRadius: STITCH_RADIUS["2xl"], borderTopLeftRadius: 4, background: c.canvas, border: `1px solid ${c.border}`, display: "grid", gap: 14 }}>
                      <p style={{ margin: 0, fontSize: 14, lineHeight: "22px" }}>{msg.text}</p>
                      {msg.title && (
                        <div style={{ padding: 16, background: c.card, borderRadius: STITCH_RADIUS.xl, border: `1px solid ${c.border}`, display: "grid", gap: 4 }}>
                          {msg.qnum && <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, color: c.blue }}>Question {msg.qnum} of 9</span>}
                          <p style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: "-0.005em" }}>{msg.title}</p>
                          {msg.note && <p style={{ margin: 0, fontSize: 12, color: c.muted, lineHeight: "18px" }}>{msg.note}</p>}
                        </div>
                      )}
                    </div>
                    {msg.helper && (
                      <p style={{ margin: 0, padding: "8px 14px", borderRadius: STITCH_RADIUS.xl, background: "rgba(248, 250, 252, 0.8)", border: `1px solid ${c.borderSubtle}`, fontSize: 12, color: c.muted }}>{msg.helper}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {step === 0 && !docRead && !docSkip && messages.length > 0 && (
              <div className="ws-ai-fill" style={{ maxWidth: 620, marginLeft: 48 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <strong style={{ fontSize: 15 }}>Start from your documents</strong>
                  <span style={{ fontSize: 13, color: c.muted, lineHeight: "20px" }}>Drop a supplier invoice, an inventory sheet or a photo of an invoice. Mosaic reads them, fills your profile and skips the questions it can already answer. Nothing is guessed: it only keeps what is written in the documents.</span>
                </div>
                <FileInput
                  label="Business documents"
                  isLabelHidden
                  isMultiple
                  maxFiles={4}
                  value={docFiles}
                  onChange={(files) => setDocFiles(Array.isArray(files) ? files : files ? [files] : [])}
                  accept="application/pdf,image/png,image/jpeg,image/webp,text/csv,.csv,.xlsx"
                  maxSize={6 * 1024 * 1024}
                  isDisabled={reading}
                  description="PDF, CSV, Excel or an image, up to 6 MB each."
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Button variant="secondary" size="small" label={reading ? "Reading your documents" : "Read my documents"} isDisabled={reading || docFiles.length === 0} onClick={() => void readDocuments({ files: docFiles })} />
                  <Button variant="secondary" size="small" label="Use the Neon Dumpling sample documents" isDisabled={reading} onClick={() => void readDocuments({ demoKit: "sme_neon_dumpling" })} />
                  <Button variant="ghost" size="small" label="Answer questions instead" isDisabled={reading} onClick={() => setDocSkip(true)} />
                </div>
                {reading && <span role="status" style={{ fontSize: 13, color: c.muted }}>Reading the documents and checking every value against them. This takes a few seconds.</span>}
                {docError && <span role="alert" style={{ fontSize: 13, color: c.status.error }}>{docError}</span>}
              </div>
            )}

            {step >= QUESTIONS.length && (
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: STITCH_RADIUS["2xl"], padding: 20, display: "grid", gap: 16 }}>
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>Review your profile</h2>
                  <p style={{ margin: 0, fontSize: 13, color: c.muted }}>Check the details below, then confirm to save. Nothing is saved until you confirm.</p>
                </div>
                <dl style={{ margin: 0, display: "grid", gap: 10 }}>
                  {QUESTIONS.map((q) => (
                    <div key={q.id} style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13 }}>
                      <dt style={{ color: c.muted }}>{q.title.replace("?", "")}</dt>
                      <dd style={{ margin: 0, fontWeight: 500, textAlign: "right" }}>{displayAnswer(q.id, answers[q.id] || "")}</dd>
                    </div>
                  ))}
                </dl>
                {suggestedChecked && (
                  <p style={{ margin: 0, fontSize: 12, color: c.muted }}>
                    {suggestedClan
                      ? `Matching group found: ${suggestedClan.name} (${suggestedClan.sku}).`
                      : "No matching group found yet. You can create one after setup."}
                  </p>
                )}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Business document (optional)</label>
                  <FileInput
                    label="Business document"
                    isLabelHidden
                    value={docFile}
                    onChange={(files) => setDocFile(Array.isArray(files) ? files[0] ?? null : files)}
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    maxSize={6 * 1024 * 1024}
                    isOptional
                    description="PDF or image up to 6 MB. Stored with your profile."
                  />
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: c.mutedLight }}>Government IDs are never sent to the model. You can delete this file anytime.</p>
                </div>
                {saveError && <p role="alert" style={{ margin: 0, fontSize: 13, color: c.status.error }}>{saveError}</p>}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" onClick={handleFinish} disabled={submitting} style={{ ...goldBtn, opacity: submitting ? 0.6 : 1, cursor: submitting ? "not-allowed" : "pointer" }}>
                    {submitting ? "Saving…" : "Confirm and save"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {currentQ && !showManual && (
            <div style={{ borderTop: `1px solid ${c.border}`, padding: 24, background: c.card, display: "grid", gap: 12 }}>
              {currentQ.kind === "choice" && currentQ.id === "paypal" ? (
                <PayPalConnectCard
                  onBeforeRedirect={saveDraft}
                  onChange={setPaypalState}
                  secondary={
                    <>
                      {paypalState?.connected && <span className="lp-gold"><Button variant="primary" label="Continue" onClick={() => chooseOption("Connected")} /></span>}
                      {!paypalState?.connected && <Button variant="secondary" label="Connect later" onClick={() => chooseOption("Connect later")} />}
                    </>
                  }
                />
              ) : currentQ.kind === "choice" && !permOpen ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {currentQ.options?.map((opt) => (
                    <Button key={opt} variant="secondary" label={opt} onClick={() => chooseOption(opt)} />
                  ))}
                </div>
              ) : permOpen ? (
                <div style={{ display: "grid", gap: 14 }}>
                  <p style={{ margin: 0, fontSize: 13, color: c.muted }}>Choose what Mosaic may do on its own. Everything starts off, and approving payments is always yours.</p>
                  <PermissionsPanel
                    value={{ allowAutonomousQuotePrep: permQuote, allowAutonomousFilterSort: permFilter, allowAutonomousDraftMessages: permDraft, allowAutonomousResearch: permResearch, allowAutonomousScheduleChanges: permSchedule }}
                    onChange={(next) => { setPermQuote(next.allowAutonomousQuotePrep); setPermFilter(next.allowAutonomousFilterSort); setPermDraft(next.allowAutonomousDraftMessages); setPermResearch(next.allowAutonomousResearch); setPermSchedule(next.allowAutonomousScheduleChanges); }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <span className="lp-gold"><Button variant="primary" label="Continue" onClick={confirmPermissions} /></span>
                  </div>
                </div>
              ) : (
                <form id="chatForm" onSubmit={(e) => { e.preventDefault(); submitAnswer(); }} style={{ display: "grid", gap: 12 }}>
                  {suggestions.length > 0 && (
                    <div style={{ display: "grid", gap: 6 }} aria-label="Matching buying groups">
                      <span style={{ fontSize: 12, color: c.muted }}>Matching groups in the catalog. Pick one or keep typing.</span>
                      {suggestions.map((group) => (
                        <button key={group.id} type="button" onClick={() => setInput(group.sku)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: STITCH_RADIUS.lg, border: `1px solid ${c.border}`, background: c.card, cursor: "pointer", fontFamily: font, display: "grid", gap: 2 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: c.ink }}>{group.sku}</span>
                          <span style={{ fontSize: 12, color: c.muted }}>{group.membersCount} open {group.membersCount === 1 ? "group" : "groups"} · from {(group.unitPriceCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} per unit</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    {currentQ.kind === "country" ? (
                      <select value={input} onChange={(e) => setInput(e.target.value)} style={{ ...inputStyle, paddingRight: 14, appearance: "auto" }}>
                        <option value="">Choose a country</option>
                        {COUNTRIES.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
                      </select>
                    ) : (
                      <input
                        id="chatInput"
                        type={currentQ.kind === "number" ? "number" : currentQ.kind === "email" ? "email" : "text"}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Answer Mosaic..."
                        autoFocus
                        style={inputStyle}
                      />
                    )}
                    {currentQ.kind !== "country" && (
                      <button type="submit" style={{ position: "absolute", right: 8, ...goldBtn, padding: "10px 18px" }}>Send</button>
                    )}
                  </div>
                  {currentQ.kind === "country" && (
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button type="submit" style={goldBtn}>Send</button>
                    </div>
                  )}
                  {error && <p role="alert" style={{ margin: 0, fontSize: 12, color: c.status.error }}>{error}</p>}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: c.mutedLight, padding: "0 4px" }}>
                    <span>Press Enter to submit response</span>
                    <span style={{ fontFamily: mono, fontSize: 11 }}>Step {step + 1}: {currentQ.id === "businessName" ? "Business name" : currentQ.id === "contactEmail" ? "Contact email" : currentQ.id === "product" ? "Product" : currentQ.id === "units" ? "Units" : currentQ.id === "city" ? "City" : currentQ.id === "country" ? "Country" : currentQ.id === "spendLimit" ? "Spend limit" : currentQ.id === "paypal" ? "PayPal" : "Permissions"}</span>
                  </div>
                </form>
              )}
              <div style={{ paddingTop: 8, borderTop: `1px dashed ${c.border}` }}>
                <button
                  type="button"
                  onClick={() => setShowManual(true)}
                  style={{ padding: 0, border: "none", background: "transparent", color: c.muted, fontFamily: font, fontSize: 13, cursor: "pointer", textAlign: "left" }}
                >
                  Mosaic unavailable? Continue with the manual form
                </button>
              </div>
            </div>
          )}

          {showManual && (
            <div style={{ borderTop: `1px solid ${c.border}`, padding: 24, background: c.card, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Manual buying group registration</p>
                <span style={{ fontFamily: mono, fontSize: 10, color: c.muted }}>Empty baseline</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { id: "businessName", label: "Business name", type: "text", placeholder: "Legal or operating name" },
                  { id: "contactEmail", label: "Contact email", type: "email", placeholder: "finance@business.com" },
                  { id: "product", label: "Product and SKU", type: "text", placeholder: "Product name or SKU" },
                  { id: "units", label: "Units wanted", type: "number", placeholder: "Order count" },
                  { id: "city", label: "City", type: "text", placeholder: "Delivery city" },
                  { id: "spendLimit", label: "Spend limit per pledge (USD)", type: "number", placeholder: "USD cap" }
                ].map((f) => (
                  <label key={f.id} style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 500 }}>
                    <span>{f.label}</span>
                    <input
                      type={f.type}
                      value={manual[f.id] || ""}
                      onChange={(e) => setManual((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{ padding: "8px 10px", borderRadius: STITCH_RADIUS.lg, border: `1px solid ${c.border}`, background: c.card, color: c.ink, fontFamily: font, fontSize: 12, outline: "none" }}
                    />
                  </label>
                ))}
                <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 500 }}>
                  <span>Country</span>
                  <select
                    value={manual.country || ""}
                    onChange={(e) => setManual((prev) => ({ ...prev, country: e.target.value }))}
                    style={{ padding: "8px 10px", borderRadius: STITCH_RADIUS.lg, border: `1px solid ${c.border}`, background: c.card, color: c.ink, fontFamily: font, fontSize: 12, outline: "none" }}
                  >
                    <option value="">Choose a country</option>
                    {COUNTRIES.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 500 }}>
                  <span>PayPal</span>
                  <select
                    value={manual.paypal || "Connect later"}
                    onChange={(e) => setManual((prev) => ({ ...prev, paypal: e.target.value }))}
                    style={{ padding: "8px 10px", borderRadius: STITCH_RADIUS.lg, border: `1px solid ${c.border}`, background: c.card, color: c.ink, fontFamily: font, fontSize: 12, outline: "none" }}
                  >
                    <option value="Connect later">Connect later</option>
                    <option value="Connect now">Connect now</option>
                  </select>
                </label>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: c.muted }}>Permissions stay at the minimum. You can change them in Settings.</p>
              {manualError && <p role="alert" style={{ margin: 0, fontSize: 12, color: c.status.error }}>{manualError}</p>}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button type="button" onClick={() => { setShowManual(false); setManualError(null); }} style={{ padding: "10px 14px", borderRadius: STITCH_RADIUS.xl, border: `1px solid ${c.border}`, background: "transparent", color: c.muted, fontFamily: font, fontSize: 13, cursor: "pointer" }}>Back to chat</button>
                <button type="button" onClick={submitManual} style={goldBtn}>Save and continue</button>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer style={{ width: "100%", maxWidth: expanded ? 1024 : 760, margin: "16px auto 0", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: c.muted }}>
        <span>Pool orders with conditional escrow · Zero upfront escrow capture</span>
      </footer>
    </div>
  );
};

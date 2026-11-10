import React, { useEffect, useState } from "react";
import { Sparkles, Search } from "lucide-react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { DateInput } from "@astryxdesign/core/DateInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Stepper, Step } from "@astryxdesign/core/Stepper";
import { Switch } from "@astryxdesign/core/Switch";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Badge } from "@astryxdesign/core/Badge";
import { createClanWithGovernance } from "../api";
import { STITCH_COLORS, STITCH_TYPOGRAPHY } from "../themes/stitchTokens";

interface CreateGroupBuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialSku?: string;
  initialName?: string;
  prefill?: Record<string, unknown>;
}

type TemplateId = "EQUAL_COOP" | "VOLUME_WEIGHTED" | "FOUNDER_LED";
type SupplierMode = "VOTE" | "URL" | "KERNEL";
type ShipmentMode = "SINGLE_POINT" | "MULTIPLE_POINTS";
interface ShipPoint { label: string; address: string; city: string }
const MAX_POINTS = 5;
const emptyPoint = (index: number): ShipPoint => ({ label: index === 0 ? "Receiving point" : `Point ${index + 1}`, address: "", city: "" });

const RULES: Array<{ title: string; text: string }> = [
  { title: "Inspection window", text: "48 hours after delivery to inspect goods and report damage." },
  { title: "Silence auto-confirm", text: "No report within 48 hours confirms the delivery." },
  { title: "Damage evidence", text: "A damage claim needs a photo." },
  { title: "Step-up threshold", text: "Pledges above $1,000 need an extra identity check." },
  { title: "Dispute window", text: "Disputes are raised within 48 hours of delivery." },
  { title: "Minimum discount", text: "The group proceeds only if the volume discount is at least 20 percent." }
];

const TEMPLATE_TEXT: Record<TemplateId, string> = {
  EQUAL_COOP: "Every member has one equal vote. Rule changes need a supermajority.",
  VOLUME_WEIGHTED: "Bigger unit allocations carry proportionally more voting weight.",
  FOUNDER_LED: "The founder approves supplier selection and charter changes."
};

const SUPPLIER_TEXT: Record<SupplierMode, string> = {
  VOTE: "Publish now. Verified members vote on supplier candidates.",
  URL: "You name a supplier site to be checked against wholesale terms.",
  KERNEL: "Mosaic opens a cloud browser, searches the web for suppliers and lists unverified leads for you to review."
};

interface FilledFields {
  name?: string;
  product?: string;
  targetUnits?: number;
  basePriceUsd?: number;
  city?: string;
  deliveryDate?: string;
  supplierMode?: SupplierMode;
  vendorUrl?: string;
  template?: TemplateId;
  shipmentMode?: ShipmentMode;
  shipmentPoints?: ShipPoint[];
}

export const CreateGroupBuyModal: React.FC<CreateGroupBuyModalProps> = ({ isOpen, onClose, onSuccess, initialSku = "", initialName = "", prefill }) => {
  const c = STITCH_COLORS;
  const [step, setStep] = useState(1);
  const [describe, setDescribe] = useState("");
  const [filling, setFilling] = useState(false);
  const [fillNote, setFillNote] = useState<string | null>(null);
  const [fillError, setFillError] = useState<string | null>(null);
  const [filledKeys, setFilledKeys] = useState<string[]>([]);

  const [name, setName] = useState(initialName);
  const [product, setProduct] = useState(initialSku);
  const [targetUnits, setTargetUnits] = useState<number | null>(null);
  const [basePriceUsd, setBasePriceUsd] = useState<number | null>(null);
  const [city, setCity] = useState("");
  const [deliveryDate, setDeliveryDate] = useState<string | undefined>(undefined);
  const [supplierMode, setSupplierMode] = useState<SupplierMode>("VOTE");
  const [vendorUrl, setVendorUrl] = useState("");
  const [template, setTemplate] = useState<TemplateId>("EQUAL_COOP");
  const [shipmentMode, setShipmentMode] = useState<ShipmentMode>("SINGLE_POINT");
  const [points, setPoints] = useState<ShipPoint[]>([emptyPoint(0)]);

  const [similar, setSimilar] = useState<Array<{ clan?: { name?: string; canonicalSku?: string; city?: string; currentUnits?: number; targetUnits?: number } }>>([]);
  const [checking, setChecking] = useState(false);
  const [charterConfirmed, setCharterConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (initialName) setName(initialName);
    if (initialSku) setProduct(initialSku);
  }, [initialName, initialSku]);

  useEffect(() => {
    if (!prefill) return;
    const f = prefill as FilledFields;
    if (f.name) setName(f.name);
    if (f.product) setProduct(f.product);
    if (f.targetUnits) setTargetUnits(f.targetUnits);
    if (f.basePriceUsd) setBasePriceUsd(f.basePriceUsd);
    if (f.city) setCity(f.city);
    if (f.deliveryDate) setDeliveryDate(f.deliveryDate);
    if (f.supplierMode) setSupplierMode(f.supplierMode);
    if (f.vendorUrl) setVendorUrl(f.vendorUrl);
    if (f.shipmentMode) setShipmentMode(f.shipmentMode);
    if (Array.isArray(f.shipmentPoints) && f.shipmentPoints.length) setPoints(f.shipmentPoints.slice(0, MAX_POINTS).map((point, index) => ({ ...emptyPoint(index), ...point })));
    setFilledKeys(Object.keys(f));
    setFillNote("Mosaic filled what you told it. Add the rest, then continue.");
  }, [prefill]);

  const fillWithMosaic = async () => {
    setFilling(true);
    setFillError(null);
    setFillNote(null);
    try {
      const current = { name, product, targetUnits, basePriceUsd, city, deliveryDate, supplierMode, vendorUrl, template };
      const response = await fetch("/api/v1/mosaic/fill-form", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ form: "create-group", text: describe, current }) });
      const payload = (await response.json()) as { fields?: FilledFields; missing?: string[]; message?: string; error?: string };
      if (!response.ok || !payload.fields) throw new Error(payload.error ?? "Mosaic could not read that.");
      const f = payload.fields;
      if (f.name) setName(f.name);
      if (f.product) setProduct(f.product);
      if (f.targetUnits) setTargetUnits(f.targetUnits);
      if (f.basePriceUsd) setBasePriceUsd(f.basePriceUsd);
      if (f.city) setCity(f.city);
      if (f.deliveryDate) setDeliveryDate(f.deliveryDate);
      if (f.supplierMode) setSupplierMode(f.supplierMode);
      if (f.vendorUrl) setVendorUrl(f.vendorUrl);
      if (f.template) setTemplate(f.template);
      if (f.shipmentMode) setShipmentMode(f.shipmentMode);
      if (Array.isArray(f.shipmentPoints) && f.shipmentPoints.length) setPoints(f.shipmentPoints.slice(0, MAX_POINTS).map((point, index) => ({ ...emptyPoint(index), ...point })));
      setFilledKeys(Object.keys(f));
      const missing = payload.missing ?? [];
      setFillNote(`${payload.message ?? "Filled the form."}${missing.length ? ` Still needed: ${missing.join(", ")}.` : " Check the fields, then continue."}`);
    } catch (cause) {
      setFillError(cause instanceof Error ? cause.message : "Mosaic could not read that.");
    } finally {
      setFilling(false);
    }
  };

  const checkDuplicates = async () => {
    if (!product.trim()) return;
    setChecking(true);
    try {
      const response = await fetch("/api/v1/matchmaking/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: `${product} in ${city || "any city"}` }) });
      if (response.ok) setSimilar(((await response.json()) as { rankedClans?: typeof similar }).rankedClans?.slice(0, 3) ?? []);
    } catch {
      setSimilar([]);
    } finally {
      setChecking(false);
    }
  };

  const changeMode = (mode: ShipmentMode) => {
    setShipmentMode(mode);
    setPoints((current) => {
      const relabelled = current.map((point, index) => (mode === "MULTIPLE_POINTS" && index === 0 && point.label === "Receiving point" ? { ...point, label: "Point 1" } : mode === "SINGLE_POINT" && index === 0 && point.label === "Point 1" ? { ...point, label: "Receiving point" } : point));
      return mode === "SINGLE_POINT" ? relabelled.slice(0, 1) : relabelled.length >= 2 ? relabelled : [...relabelled, emptyPoint(relabelled.length)];
    });
  };
  const updatePoint = (index: number, patch: Partial<ShipPoint>) => setPoints((current) => current.map((point, i) => (i === index ? { ...point, ...patch } : point)));

  const detailsValid = name.trim() !== "" && product.trim() !== "" && Number(targetUnits) > 0 && Number(basePriceUsd) > 0 && city.trim() !== "";

  const submit = async () => {
    if (!charterConfirmed) return;
    setSubmitting(true);
    setSubmitError(null);
    const votingWeight = template === "EQUAL_COOP" ? "ONE_MEMBER_ONE_VOTE" : template === "VOLUME_WEIGHTED" ? "VOLUME_WEIGHTED" : "FOUNDER_VETO";
    try {
      await createClanWithGovernance({
        clanName: name.trim(),
        commoditySku: product,
        targetUnits: Number(targetUnits),
        basePriceUsd: Number(basePriceUsd),
        templateId: template,
        constitution: {
          VOTING_WEIGHT_STRATEGY: votingWeight,
          META_GOVERNANCE_PROCEDURE: template === "FOUNDER_LED" ? "FOUNDER_ARBITRATION" : "DEMOCRATIC_SUPERMAJORITY",
          INSPECTION_WINDOW_HOURS: 48,
          DAMAGE_EVIDENCE_REQUIREMENT: "PHOTO_ONLY",
          STEP_UP_THRESHOLD_USD: 1000,
          MIN_DISCOUNT_PERCENT: 20,
          DISPUTE_ESCALATION_WINDOW_HOURS: 48,
          SILENCE_AUTO_CONFIRM_HOURS: 48
        },
        vendorUrls: supplierMode === "URL" && vendorUrl ? [vendorUrl] : [],
        city: city.trim(),
        fulfilment: { mode: shipmentMode, points: points.map((point) => ({ label: point.label.trim(), address: point.address.trim(), city: point.city.trim() || city.trim() })) }
      });
      if (supplierMode === "KERNEL") {
        void fetch("/api/v1/suppliers/find", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ product, webSearch: true }) }).catch(() => undefined);
      }
      onSuccess();
      onClose();
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "Could not publish the group buy. Check the values.");
    } finally {
      setSubmitting(false);
    }
  };

  const mark = (key: string) => (filledKeys.includes(key) ? <Badge variant="blue" label="Filled by Mosaic" /> : null);

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose(); }} width={680} padding={4}>
      <DialogHeader title="Start a group buy" subtitle="Describe it in a sentence and Mosaic fills the form. You review everything before it publishes." />
      <div style={{ display: "grid", gap: 16, fontFamily: STITCH_TYPOGRAPHY.sans, color: c.ink }}>
        <Stepper label="Group buy steps" value={step - 1}>
          <Step step={0} label="Details" />
          <Step step={1} label="Charter" />
          <Step step={2} label="Review" />
        </Stepper>

        {step === 1 && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 12, background: "#EBF4FA", border: "1px solid #CFE3F1" }}>
              <TextArea label="Tell Mosaic what you want to buy" placeholder="We are 12 workshops in Pune and want 2,000 stainless steel M10 nuts, around $0.35 each, and need suppliers found on the web." value={describe} onChange={(value) => setDescribe(value)} rows={2} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Button variant="secondary" size="sm" label={filling ? "Reading" : "Fill the form with Mosaic"} icon={<Sparkles size={14} />} onClick={() => void fillWithMosaic()} isDisabled={filling || describe.trim().length < 6} />
                {fillNote && <span style={{ fontSize: 12, color: c.muted }}>{fillNote}</span>}
              </div>
              {fillError && <Banner status="error" title="Mosaic could not fill the form" description={fillError} collapsible={false} />}
            </div>

            <TextInput label="Group buy title" value={name} onChange={(value) => setName(value)} placeholder="A name for this group buy" />
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "end" }}>
              <TextInput label="Product or SKU" value={product} onChange={(value) => setProduct(value)} placeholder="Product name or SKU" description={filledKeys.includes("product") ? "Filled by Mosaic" : undefined} />
              <Button variant="secondary" label={checking ? "Checking" : "Check open groups"} icon={<Search size={14} />} onClick={() => void checkDuplicates()} isDisabled={checking || !product.trim()} />
            </div>
            {similar.length > 0 && (
              <Banner status="info" title="Similar open groups exist. You can join one instead." description={similar.map((m) => `${m.clan?.name ?? m.clan?.canonicalSku} (${m.clan?.city ?? "National"}) ${m.clan?.currentUnits ?? 0} of ${m.clan?.targetUnits ?? 0} units`).join(" | ")} collapsible={false} />
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <NumberInput label="Target units" value={targetUnits} min={1} step={10} onChange={(value) => setTargetUnits(value)} />
              <NumberInput label="List price per unit (USD)" value={basePriceUsd} min={0.01} step={0.05} onChange={(value) => setBasePriceUsd(value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <TextInput label="Delivery city" value={city} onChange={(value) => setCity(value)} placeholder="Pune, Austin, Rotterdam" />
              <DateInput label="Target delivery date" value={deliveryDate} onChange={(value) => setDeliveryDate(value)} />
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <SegmentedControl label="Where the order arrives" value={shipmentMode} onChange={(value) => changeMode(value as ShipmentMode)}>
                <SegmentedControlItem value="SINGLE_POINT" label="One receiving point" />
                <SegmentedControlItem value="MULTIPLE_POINTS" label="Several points" />
              </SegmentedControl>
              <span style={{ fontSize: 12, color: c.muted }}>{shipmentMode === "SINGLE_POINT" ? "The whole order ships to one address and members collect from it." : "Each point receives its own share, for example one per workshop or branch."} {mark("shipmentMode")}</span>
              {points.map((point, index) => (
                <div key={index} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr) minmax(0,1fr) auto", gap: 8, alignItems: "end" }}>
                  <TextInput label={index === 0 ? "Label" : undefined} aria-label={`Point ${index + 1} label`} value={point.label} onChange={(value) => updatePoint(index, { label: value })} placeholder="Warehouse" />
                  <TextInput label={index === 0 ? "Address" : undefined} aria-label={`Point ${index + 1} address`} value={point.address} onChange={(value) => updatePoint(index, { address: value })} placeholder="Street and number (optional)" />
                  <TextInput label={index === 0 ? "City" : undefined} aria-label={`Point ${index + 1} city`} value={point.city} onChange={(value) => updatePoint(index, { city: value })} placeholder={city || "City"} />
                  {shipmentMode === "MULTIPLE_POINTS" && points.length > 2 ? <Button size="sm" variant="ghost" label="Remove" onClick={() => setPoints((current) => current.filter((_, i) => i !== index))} /> : <span />}
                </div>
              ))}
              {shipmentMode === "MULTIPLE_POINTS" && points.length < MAX_POINTS && <div><Button size="sm" variant="secondary" label="Add a point" onClick={() => setPoints((current) => [...current, emptyPoint(current.length)])} /></div>}
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <SegmentedControl label="Supplier" value={supplierMode} onChange={(value) => setSupplierMode(value as SupplierMode)}>
                <SegmentedControlItem value="VOTE" label="Members vote" />
                <SegmentedControlItem value="URL" label="I have a site" />
                <SegmentedControlItem value="KERNEL" label="Search the web" />
              </SegmentedControl>
              <span style={{ fontSize: 12, color: c.muted }}>{SUPPLIER_TEXT[supplierMode]} {mark("supplierMode")}</span>
              {supplierMode === "URL" && <TextInput label="Supplier website" value={vendorUrl} onChange={(value) => setVendorUrl(value)} placeholder="https://" />}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <span className="lp-gold"><Button variant="primary" label="Continue to charter" data-testid="group-buy-to-step-2" isDisabled={!detailsValid} onClick={() => setStep(2)} /></span>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "grid", gap: 14 }}>
            <SegmentedControl label="Governance" value={template} onChange={(value) => setTemplate(value as TemplateId)}>
              <SegmentedControlItem value="EQUAL_COOP" label="Equal co-op" />
              <SegmentedControlItem value="VOLUME_WEIGHTED" label="Volume weighted" />
              <SegmentedControlItem value="FOUNDER_LED" label="Founder led" />
            </SegmentedControl>
            <p style={{ margin: 0, fontSize: 13, color: c.muted }}>{TEMPLATE_TEXT[template]}</p>
            <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 13 }}>
              {RULES.map((rule) => (<li key={rule.title}><b>{rule.title}.</b> <span style={{ color: c.muted }}>{rule.text}</span></li>))}
            </ol>
            <p style={{ margin: 0, fontSize: 12, color: c.muted }}>Always enforced: spend caps, whole-cent accounting, one refund per damaged unit, and PayPal authorization holds that are captured only after delivery.</p>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Button variant="secondary" label="Back" onClick={() => setStep(1)} />
              <span className="lp-gold"><Button variant="primary" label="Review" data-testid="group-buy-to-step-4" onClick={() => setStep(3)} /></span>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 6, padding: 12, background: c.surface, borderRadius: 12, border: `1px solid ${c.borderSubtle}`, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: c.muted }}>Title</span><b>{name}</b></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: c.muted }}>Product</span><b>{product}</b></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: c.muted }}>Target</span><b>{Number(targetUnits).toLocaleString("en-US")} units at ${Number(basePriceUsd).toFixed(2)}</b></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: c.muted }}>Delivery</span><b>{city}{deliveryDate ? `, by ${deliveryDate}` : ""}</b></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: c.muted }}>{shipmentMode === "MULTIPLE_POINTS" ? "Receiving points" : "Receiving point"}</span><b style={{ textAlign: "right" }}>{points.map((point) => [point.label, point.address, point.city || city].filter(Boolean).join(", ")).join(" | ")}</b></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: c.muted }}>Supplier</span><b>{supplierMode === "VOTE" ? "Members vote" : supplierMode === "KERNEL" ? "Web search by Mosaic" : vendorUrl}</b></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: c.muted }}>Governance</span><b>{template.replace(/_/g, " ").toLowerCase()}</b></div>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: c.muted }}>If the group does not fill, your authorization is released and no money moves. If goods arrive damaged, file a claim with a photo inside the inspection window. PayPal places a soft hold, captured only after delivery is confirmed.</p>
            <Switch label="I agree to the charter rules and understand PayPal holds funds until delivery is verified" value={charterConfirmed} onChange={(checked) => setCharterConfirmed(checked)} />
            {submitError && <Banner status="error" title="Could not publish" description={submitError} collapsible={false} />}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Button variant="secondary" label="Back" onClick={() => setStep(2)} />
              <span className="lp-gold"><Button variant="primary" label={submitting ? "Publishing" : "Publish group buy"} data-testid="publish-group-buy-btn" isDisabled={!charterConfirmed || submitting} onClick={() => void submit()} /></span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: c.muted, textAlign: "right" }}>Authorize only, nothing is captured now. Payments powered by PayPal.</p>
          </div>
        )}
      </div>
    </Dialog>
  );
};

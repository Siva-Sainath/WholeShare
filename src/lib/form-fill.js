import { modelClient } from "./model-client.js";

// Mosaic reads a sentence and fills a form. Each form declares its fields once.
// The server validates what the model returns, so a wrong guess never reaches the form unchecked.

export const FORMS = {
  "create-group": {
    label: "Start a group buy",
    fields: {
      name: { type: "string", help: "Short title for the group, for example 'Pune M10 steel nut buyers'." },
      product: { type: "string", help: "Product name or standard SKU." },
      targetUnits: { type: "integer", min: 1, help: "Units the group wants to reach." },
      basePriceUsd: { type: "number", min: 0.01, help: "List price per unit in US dollars. Only if the user said it." },
      city: { type: "string", help: "Delivery city." },
      deliveryDate: { type: "date", help: "Target delivery date as YYYY-MM-DD. Only if the user said it." },
      supplierMode: { type: "enum", values: ["VOTE", "URL", "KERNEL"], help: "KERNEL if the user wants suppliers researched on the web, URL if they gave a supplier site, otherwise VOTE." },
      vendorUrl: { type: "string", help: "Supplier website if the user gave one." },
      template: { type: "enum", values: ["EQUAL_COOP", "VOLUME_WEIGHTED", "FOUNDER_LED"], help: "Governance style. EQUAL_COOP unless the user asks for weighted votes or founder control." },
      shipmentMode: { type: "enum", values: ["SINGLE_POINT", "MULTIPLE_POINTS"], help: "SINGLE_POINT when the whole order goes to one warehouse or address. MULTIPLE_POINTS when the user names several receiving addresses. Only if the user said it." },
      shipmentPoints: { type: "points", help: "Receiving points the user named, as a JSON array of {label, address, city}. At most 5. Only what the user stated." }
    },
    required: ["name", "product", "targetUnits", "basePriceUsd", "city"]
  },
  "damage-claim": {
    label: "File a damage claim",
    fields: {
      damagedUnits: { type: "integer", min: 1, help: "How many units arrived damaged." },
      reason: { type: "string", help: "What was wrong, in the user's words." }
    },
    required: ["damagedUnits", "reason"]
  }
};

function coerce(spec, value) {
  if (value === null || value === undefined || value === "") return undefined;
  if (spec.type === "integer") {
    const n = Math.round(Number(String(value).replace(/[^0-9.\-]/g, "")));
    return Number.isFinite(n) && n >= (spec.min ?? -Infinity) ? n : undefined;
  }
  if (spec.type === "number") {
    const n = Number(String(value).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) && n >= (spec.min ?? -Infinity) ? n : undefined;
  }
  if (spec.type === "enum") return spec.values.includes(String(value).toUpperCase()) ? String(value).toUpperCase() : undefined;
  if (spec.type === "points") {
    const list = Array.isArray(value) ? value : [];
    const points = list.slice(0, 5).map((point) => ({ label: String(point?.label ?? "").trim().slice(0, 60), address: String(point?.address ?? "").trim().slice(0, 160), city: String(point?.city ?? "").trim().slice(0, 60) })).filter((point) => point.label || point.address || point.city);
    return points.length ? points : undefined;
  }
  if (spec.type === "date") {
    const text = String(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) ? text : undefined;
  }
  return String(value).trim().slice(0, 240) || undefined;
}

export async function fillForm({ form, text, current = {} }) {
  const definition = FORMS[form];
  if (!definition) throw new Error(`Unknown form '${form}'. Known forms: ${Object.keys(FORMS).join(", ")}.`);
  const sentence = String(text ?? "").trim();
  if (!sentence) throw new Error("Describe what you want in a sentence first.");

  const fieldLines = Object.entries(definition.fields).map(([key, spec]) => `- ${key} (${spec.type}${spec.values ? ": " + spec.values.join("|") : ""}): ${spec.help}`).join("\n");
  const today = new Date().toISOString().slice(0, 10);
  const { data, model } = await modelClient.callJsonPrompt({
    systemPrompt: `You fill the form "${definition.label}" from the user's sentence. Today is ${today}.
Return one JSON object with only the fields the user actually stated or clearly implied. Never invent a price, a date or a supplier. Leave a field out when unknown.
Fields:
${fieldLines}
Also return "message": one short sentence saying what you filled in plain language. Output JSON only.`,
    userPrompt: `Already filled: ${JSON.stringify(current)}\nUser said: ${sentence}`,
    maxTokens: 700
  });

  const fields = {};
  for (const [key, spec] of Object.entries(definition.fields)) {
    const value = coerce(spec, data?.[key]);
    if (value !== undefined) fields[key] = value;
  }
  if (form === "create-group" && !fields.vendorUrl && /\b(web|online|research|source|find (me )?suppliers?|look for suppliers?)\b/i.test(sentence)) fields.supplierMode = "KERNEL";
  if (form === "create-group" && fields.vendorUrl && !fields.supplierMode) fields.supplierMode = "URL";
  if (form === "create-group" && Array.isArray(fields.shipmentPoints) && !fields.shipmentMode) fields.shipmentMode = fields.shipmentPoints.length > 1 ? "MULTIPLE_POINTS" : "SINGLE_POINT";
  const merged = { ...current, ...fields };
  const missing = definition.required.filter((key) => merged[key] === undefined || merged[key] === "");
  return { form, fields, missing, message: `Filled ${Object.keys(fields).length === 0 ? "nothing" : Object.keys(fields).join(", ")} from what you wrote.`, model };
}

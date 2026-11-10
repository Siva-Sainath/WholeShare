import { WholeshareModelClient } from "../model-client.js";
import { lookupCity } from "../geo/gazetteer.ts";
import { COMMERCIAL_ARCHETYPES } from "../commercial-archetypes.js";
import type { MatchVector } from "./types.ts";

const modelClient = new WholeshareModelClient({ timeoutMs: 15000 });

const SYSTEM_PROMPT = `You are WholeShare's Lead B2B Procurement Taxonomist and Information Compressor.
Your job is to extract an 8-field MatchVector JSON from user input.
The input may be natural language, OCR text from invoices, CSV lines, or photo captions.
Strip out all conversational filler and marketing noise.

Return ONLY a JSON object with this exact structure:
{
  "smeName": "<string: buyer business name>",
  "industryVertical": "<string: best matching canonical vertical>",
  "city": "<string: normalized city name>",
  "countryCode": "<string: 2-letter ISO country code>",
  "settlementCurrency": "<string: 3-letter ISO-4217 PayPal currency>",
  "canonicalSku": "<string: standardized commodity title>",
  "hsCodePrefix": "<string: 4 to 6 digit HS tariff prefix>",
  "quantityRequested": <number: positive quantity>,
  "currentUnitCostBaseline": <number or null: price per unit>,
  "maxDeliveryDays": <number: acceptable lead time days>
}`;

export async function extractMatchVector(rawInput: string): Promise<MatchVector> {
  if (!rawInput || typeof rawInput !== "string") {
    throw new Error("Input text must be a non-empty string.");
  }

  let extractedData: Partial<MatchVector> | null = null;

  try {
    const response = await modelClient.callChat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Extract the MatchVector from this procurement text:\n\n${rawInput}` }
      ],
      temperature: 0.1,
      maxTokens: 512,
      responseFormat: { type: "json_object" }
    });

    const content = response.message?.content?.trim();
    if (content) {
      const cleanJson = content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
      extractedData = JSON.parse(cleanJson);
    }
  } catch {
    // Model call failed or returned non-JSON. Fallback to rule-based extractor.
  }

  return normalizeMatchVector(extractedData, rawInput);
}

export function normalizeMatchVector(
  partial: Partial<MatchVector> | null,
  rawInput: string
): MatchVector {
  const text = rawInput.toLowerCase();

  let detectedCityName = partial?.city || "";
  let gazetteerMatch = detectedCityName ? lookupCity(detectedCityName) : null;

  if (!gazetteerMatch) {
    const tokens = rawInput.replace(/[^a-zA-Z\s]/g, " ").split(/\s+/);
    for (const token of tokens) {
      if (token.length > 3) {
        const match = lookupCity(token);
        if (match) {
          gazetteerMatch = match;
          detectedCityName = match.city;
          break;
        }
      }
    }
  }

  if (!gazetteerMatch) {
    gazetteerMatch = lookupCity("Austin")!;
    detectedCityName = "Austin";
  }

  const countryCode = partial?.countryCode || gazetteerMatch.countryCode;
  const settlementCurrency = partial?.settlementCurrency || gazetteerMatch.paypalCurrency || "USD";

  let quantity = Number(partial?.quantityRequested);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    const qtyMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilos?|lbs?|units?|sets?|boxes?|meters?|gallons?)/i);
    quantity = qtyMatch ? parseFloat(qtyMatch[1]) : 100;
  }

  let smeName = partial?.smeName || "";
  if (!smeName || smeName === "Unknown") {
    const words = rawInput.split(/\s+/).slice(0, 4).join(" ");
    smeName = words.length > 5 ? words : `${detectedCityName} Artisan SME`;
  }

  let canonicalSku = partial?.canonicalSku || "";
  if (!canonicalSku) {
    if (text.includes("coffee") || text.includes("bean")) {
      canonicalSku = "Specialty Grade 1 Green Coffee Beans";
    } else if (text.includes("pistachio") || text.includes("gelato")) {
      canonicalSku = "Artisan Sicilian Pistachio Paste 100% Pure";
    } else if (text.includes("flour") || text.includes("wheat") || text.includes("bakery")) {
      canonicalSku = "Organic Stone-Ground Hard Red Winter Wheat Flour";
    } else if (text.includes("carbide") || text.includes("tool") || text.includes("machin")) {
      canonicalSku = "Solid Carbide 4-Flute TiAlN Coated End Mill Set 1/2in";
    } else if (text.includes("solar") || text.includes("panel")) {
      canonicalSku = "Bifacial Monocrystalline Solar Photovoltaic Module 550W";
    } else if (text.includes("cotton") || text.includes("yarn") || text.includes("textile")) {
      canonicalSku = "Combed Long-Staple Organic Cotton Ring-Spun Yarn 30s/1";
    } else {
      canonicalSku = rawInput.slice(0, 60).trim();
    }
  }

  let hsCodePrefix = partial?.hsCodePrefix || "";
  if (!hsCodePrefix || hsCodePrefix.length < 4) {
    if (text.includes("coffee")) hsCodePrefix = "0901.11";
    else if (text.includes("pistachio")) hsCodePrefix = "2008.19";
    else if (text.includes("flour")) hsCodePrefix = "1101.00";
    else if (text.includes("tool") || text.includes("carbide")) hsCodePrefix = "8207.70";
    else if (text.includes("solar")) hsCodePrefix = "8541.43";
    else if (text.includes("cotton")) hsCodePrefix = "5205.23";
    else if (text.includes("olive oil")) hsCodePrefix = "1509.20";
    else hsCodePrefix = "8479.89";
  }

  let vertical = partial?.industryVertical || "";
  if (!vertical || !COMMERCIAL_ARCHETYPES.some(a => a.id === vertical)) {
    if (text.includes("machin") || text.includes("tool") || text.includes("fastener")) {
      vertical = "DISCRETE_MANUFACTURING";
    } else if (text.includes("coffee") || text.includes("food") || text.includes("paste") || text.includes("flour") || text.includes("bakery")) {
      vertical = "PROCESS_BATCH_PRODUCTION";
    } else if (text.includes("textile") || text.includes("yarn") || text.includes("denim")) {
      vertical = "SOUTH_ASIA_TEXTILES_GARMENTS";
    } else if (text.includes("solar") || text.includes("geothermal")) {
      vertical = "CONTROLLED_ENVIRONMENT_AGRICULTURE";
    } else {
      vertical = "PROCESS_BATCH_PRODUCTION";
    }
  }

  let currentUnitCost = partial?.currentUnitCostBaseline;
  if (typeof currentUnitCost !== "number" || currentUnitCost <= 0) {
    const costMatch = text.match(/\$\s*(\d+(?:\.\d+)?)/);
    currentUnitCost = costMatch ? parseFloat(costMatch[1]) : undefined;
  }

  let maxDeliveryDays = Number(partial?.maxDeliveryDays);
  if (!Number.isFinite(maxDeliveryDays) || maxDeliveryDays <= 0) {
    const daysMatch = text.match(/(\d+)\s*(?:days?|weeks?)/i);
    maxDeliveryDays = daysMatch ? parseInt(daysMatch[1], 10) * (text.includes("week") ? 7 : 1) : 30;
  }

  return {
    smeName,
    industryVertical: vertical,
    city: detectedCityName,
    countryCode,
    settlementCurrency,
    canonicalSku,
    hsCodePrefix,
    quantityRequested: quantity,
    currentUnitCostBaseline: currentUnitCost,
    maxDeliveryDays
  };
}


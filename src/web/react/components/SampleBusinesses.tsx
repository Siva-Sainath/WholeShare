import React, { useEffect, useState } from "react";

interface Kit { id: string; name: string; country: string; industry: string; sku: string; qty: number; invoicePdf: string; inventoryCsv: string; damageProofPng: string }
export interface SampleProfile { businessName: string; industry: string; contactEmail: string; city: string; country: string; currency: string; product: string; units: number }

// Where each sample business is and what it buys, so opening one builds its workspace in its own country.
const PLACE: Record<string, { city: string; country: string; product: string }> = {
  sme_de_bakery: { city: "Berlin", country: "Germany", product: "flour" },
  sme_us_coffee: { city: "Austin", country: "United States", product: "coffee beans" },
  sme_cn_smt: { city: "Shenzhen", country: "China", product: "circuit boards" },
  sme_gb_packaging: { city: "London", country: "United Kingdom", product: "corrugated boxes" },
  sme_jp_ceramics: { city: "Tokyo", country: "Japan", product: "ceramic tableware" },
  sme_in_textiles: { city: "Mumbai", country: "India", product: "cotton fabric" },
  sme_it_dental: { city: "Milan", country: "Italy", product: "surgical gloves" },
  sme_br_solar: { city: "Sao Paulo", country: "Brazil", product: "solar panels" },
  sme_ca_hydro: { city: "Toronto", country: "Canada", product: "hydroponic grow lights" },
  sme_sg_coldchain: { city: "Singapore", country: "Singapore", product: "shrink film" },
  sme_fr_restaurant: { city: "Lyon", country: "France", product: "espresso machines" },
  sme_ae_hospitality: { city: "Dubai", country: "United Arab Emirates", product: "towels" }
};

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "business";

// Twelve sample businesses in twelve countries. Opening one builds its workspace, and its sample files are here to download.
export const SampleBusinesses: React.FC<{ onOpen: (profile: SampleProfile) => void }> = ({ onOpen }) => {
  const [kits, setKits] = useState<Kit[]>([]);
  useEffect(() => {
    fetch("/api/v1/demo-kits").then((r) => r.json()).then((p: { demoKits?: Kit[] }) => setKits((p.demoKits ?? []).filter((kit) => PLACE[kit.id]))).catch(() => setKits([]));
  }, []);
  if (kits.length === 0) return null;
  return (
    <div className="lp-samples">
      <p className="lp-samples-head"><strong>Or start from a sample business.</strong> Twelve countries, each with its own invoice, inventory sheet and damage photo to try.</p>
      <div className="lp-samples-grid">
        {kits.map((kit) => {
          const place = PLACE[kit.id];
          return (
            <div key={kit.id} className="lp-sample">
              <button type="button" className="lp-sample-open" onClick={() => onOpen({ businessName: kit.name, industry: kit.industry, contactEmail: `owner@${slug(kit.name)}.example`, city: place.city, country: place.country, currency: "USD", product: place.product, units: kit.qty })}>
                <b>{kit.name}</b>
                <span>{place.city}, {place.country} · {place.product}</span>
              </button>
              <span className="lp-sample-files">
                <a href={kit.invoicePdf} target="_blank" rel="noreferrer">Invoice</a>
                <a href={kit.inventoryCsv} target="_blank" rel="noreferrer">Inventory</a>
                <a href={kit.damageProofPng} target="_blank" rel="noreferrer">Damage photo</a>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

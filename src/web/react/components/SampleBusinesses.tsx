import React, { useEffect, useState } from "react";

interface Kit { id: string; name: string; country: string; industry: string; sku: string; qty: number; invoicePdf: string; inventoryCsv: string; damageProofPng: string }
export interface SampleProfile { businessName: string; industry: string; contactEmail: string; city: string; country: string; currency: string; product: string; units: number }

// Where each sample business is and what it buys, so opening one builds its workspace in its own country.
const PLACE: Record<string, { city: string; country: string; product: string }> = {
  sme_neon_dumpling: { city: "New York", country: "United States", product: "takeout containers" },
  sme_cloud_nine_boba: { city: "New York", country: "United States", product: "cups" },
  sme_us_coffee: { city: "Austin", country: "United States", product: "coffee beans" },
  sme_in_textiles: { city: "Mumbai", country: "India", product: "cotton" },
  sme_br_solar: { city: "Sao Paulo", country: "Brazil", product: "solar" }
};

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "business";

// A few sample businesses that each find real groups. Opening one builds its workspace, and its sample files are here to download.
export const SampleBusinesses: React.FC<{ onOpen: (profile: SampleProfile) => void }> = ({ onOpen }) => {
  const [kits, setKits] = useState<Kit[]>([]);
  useEffect(() => {
    fetch("/api/v1/demo-kits").then((r) => r.json()).then((p: { demoKits?: Kit[] }) => setKits((p.demoKits ?? []).filter((kit) => PLACE[kit.id]))).catch(() => setKits([]));
  }, []);
  if (kits.length === 0) return null;
  return (
    <div className="lp-samples">
      <p className="lp-samples-head"><strong>Or start from a sample business.</strong> Five businesses, each with its own invoice, inventory sheet and damage photo to try. Open one, or download the files and upload them yourself.</p>
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

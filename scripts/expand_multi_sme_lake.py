#!/usr/bin/env python3
"""
Multi-SME Gold Lakehouse Dataset Expansion Pipeline.
Synthesizes verified records conforming to canonical Laya and Qwen schemas across 5 strategic SME verticals:
1. Semiconductor Circuit Design & Electronic Fabrication
2. Aerospace CNC & Precision Machining
3. Craft Microbrewing & Fermentation Chemistry
4. Biotechnology & Agricultural Hydroponics
5. Medical Device Assembly & Sterile Packaging
"""

import os
import json
import random

LAKE_DIR = "data/lake"
SYS1_FILE = os.path.join(LAKE_DIR, "system1_laya", "system1_decision_records.jsonl")
SYS2_FILE = os.path.join(LAKE_DIR, "system2_qwen", "system2_reasoning_rollouts.jsonl")
RL_FILE = os.path.join(LAKE_DIR, "rl_verifiable_env", "verifiable_reward_ground_truth.jsonl")
MANIFEST_FILE = os.path.join(LAKE_DIR, "manifest.json")

VERTICALS = [
    {
        "id": "SEMICONDUCTOR_DESIGN",
        "archetype": "DISCRETE_MANUFACTURING",
        "name": "Semiconductor Circuit Design & ASIC Prototyping",
        "buyers": ["Maieutic Semiconductors", "Silicon Wave Labs", "NanoTrace Devices", "Apex Photonic ASIC"],
        "vendor": "TSMC Multi-Project Wafer Broker",
        "monthly_spend_cents": 12500000,
        "items": [
            {"description": "12-inch 65nm CMOS Test Wafers Lot of 5", "unit_price_cents": 420000, "category": "RAW_MATERIAL", "pooling": True},
            {"description": "Electronic Design Automation (EDA) Cloud Compute Node Hours", "unit_price_cents": 8500, "category": "CONSUMABLE", "pooling": False},
            {"description": "High-Density Ceramic QFN-64 IC Packages Tray 250ct", "unit_price_cents": 35000, "category": "RAW_MATERIAL", "pooling": True},
            {"description": "Static-Shield ESD Wafer Shipping Shuttles Pack of 10", "unit_price_cents": 12000, "category": "PACKAGING", "pooling": True}
        ],
        "outputs": ["tape-out ready analog front-end ASICs", "packaged mixed-signal RF transceivers"]
    },
    {
        "id": "AEROSPACE_CNC",
        "archetype": "DISCRETE_MANUFACTURING",
        "name": "Aerospace CNC & 5-Axis Precision Machining",
        "buyers": ["Vanguard Aero CNC", "Stratos Flight Dynamics", "Orbit Precision Works", "Mach5 Propulsion"],
        "vendor": "Alcoa Aerospace Materials Corp",
        "monthly_spend_cents": 8500000,
        "items": [
            {"description": "Aerospace Grade 7075-T651 Aluminum Plate 2in x 24in x 48in", "unit_price_cents": 62000, "category": "RAW_MATERIAL", "pooling": True},
            {"description": "Solid Carbide High-Feed End Mill 0.75in AlTiN Coated", "unit_price_cents": 9800, "category": "TOOLING", "pooling": False},
            {"description": "Semi-Synthetic Ester Cutting Fluid 55-Gal Drum", "unit_price_cents": 78000, "category": "CONSUMABLE", "pooling": True},
            {"description": "Corrosion Inhibiting Vapor-Phase Plastic Wrap Roll", "unit_price_cents": 4500, "category": "PACKAGING", "pooling": True}
        ],
        "outputs": ["structural titanium wing fittings", "5-axis machined turbine brackets"]
    },
    {
        "id": "CRAFT_BREWING",
        "archetype": "PROCESS_BATCH_PRODUCTION",
        "name": "Craft Microbrewing & Artisanal Fermentation",
        "buyers": ["Hop & Barley Artisan Ales", "Pacific Yeastworks", "Timberline Brewing Co", "Foundry Craft Beers"],
        "vendor": "Briess Malting & Brewing Ingredients",
        "monthly_spend_cents": 3200000,
        "items": [
            {"description": "Organic Pale Ale Two-Row Malt 55lb Sack", "unit_price_cents": 3100, "category": "RAW_MATERIAL", "pooling": True},
            {"description": "Mosaic Cryo Hops Pellets 11lb Foil Barrier Pack", "unit_price_cents": 28000, "category": "RAW_MATERIAL", "pooling": False},
            {"description": "Food-Grade Sodium Hydroxide CIP Cleaner 50lb", "unit_price_cents": 6500, "category": "CONSUMABLE", "pooling": True},
            {"description": "16oz Aluminum Beverage Cans Pallet with Ends 4000ct", "unit_price_cents": 58000, "category": "PACKAGING", "pooling": True}
        ],
        "outputs": ["canned hazy IPA beer", "kegged seasonal craft cider"]
    },
    {
        "id": "BIOTECH_HYDRO",
        "archetype": "CONTROLLED_ENVIRONMENT_AGRICULTURE",
        "name": "Biotech Agricultural Hydroponics & Phytopharmaceuticals",
        "buyers": ["Verdant BioAg Innovations", "AeroFlora Phyto Farms", "PureLeaf Botanical Tech", "Apex Greenhouse Systems"],
        "vendor": "Hydro-Grow Agrisciences",
        "monthly_spend_cents": 4500000,
        "items": [
            {"description": "Sterilized Horticultural Perlite 4 Cu Ft Bag", "unit_price_cents": 2800, "category": "RAW_MATERIAL", "pooling": True},
            {"description": "Concentrated Chelate Micro-Nutrient Feed 5-Gal", "unit_price_cents": 14500, "category": "CONSUMABLE", "pooling": True},
            {"description": "High-Pressure Sodium Grow Light Replacement Lamps 1000W 6ct", "unit_price_cents": 32000, "category": "TOOLING", "pooling": False},
            {"description": "Biodegradable Modified Atmosphere Produce Sleeves 1000ct", "unit_price_cents": 4800, "category": "PACKAGING", "pooling": True}
        ],
        "outputs": ["pharma-grade botanical extracts", "high-yield culinary microgreens"]
    },
    {
        "id": "MED_DEVICE",
        "archetype": "DISCRETE_MANUFACTURING",
        "name": "Medical Device Assembly & Sterile Packaging",
        "buyers": ["Precision Surgical Instruments", "NexCare Biomechanics", "OmniCath Diagnostic", "BioFilter Sterile Tech"],
        "vendor": "MedTech Polymers & Cleanroom Solutions",
        "monthly_spend_cents": 9800000,
        "items": [
            {"description": "Medical Grade Silicone Tubing Shore A 50 100ft Reel", "unit_price_cents": 18500, "category": "RAW_MATERIAL", "pooling": True},
            {"description": "Tyvek Sterile Header Pouches with Heat-Seal 1000ct", "unit_price_cents": 24000, "category": "PACKAGING", "pooling": True},
            {"description": "USP Class VI Polycarbonate Resin Pellets 50lb Sack", "unit_price_cents": 34000, "category": "RAW_MATERIAL", "pooling": True},
            {"description": "Cleanroom Isopropyl Alcohol 70/30 Wipes Bucket 500ct", "unit_price_cents": 5200, "category": "CONSUMABLE", "pooling": True}
        ],
        "outputs": ["sterile endoscopic catheter assemblies", "implantable biocompatible manifolds"]
    }
]

def generate_multi_sme_lake():
    print("Generating 1,800 canonical multi-SME records per lakehouse partition...")
    random.seed(42)

    sys1_records = []
    sys2_records = []
    rl_records = []

    for i in range(1800):
        vert = VERTICALS[i % len(VERTICALS)]
        buyer = random.choice(vert["buyers"])
        subsector = vert["name"]
        vendor = vert["vendor"]
        monthly_spend = vert["monthly_spend_cents"]

        # Sample 2-4 items with random quantities
        item_sample = random.sample(vert["items"], random.randint(2, len(vert["items"])))
        line_items = []
        doc_total_cents = 0

        for it in item_sample:
            qty = random.randint(1, 20)
            unit_p = it["unit_price_cents"]
            line_tot = qty * unit_p
            doc_total_cents += line_tot
            line_items.append({
                "description": it["description"],
                "quantity": qty,
                "unitPriceCents": unit_p,
                "totalCents": line_tot,
                "category": it["category"],
                "poolingEligible": it["pooling"]
            })

        auto_cap_cents = min(500000, max(50000, int(monthly_spend * 0.25)))
        step_up_cents = 100000
        requires_step_up = doc_total_cents >= step_up_cents

        items_text = ", ".join([f"{it['quantity']}x {it['description']} at ${it['unitPriceCents']/100:.2f}" for it in line_items])
        state_str = (
            f"Commercial Operator: {buyer} ({subsector}). Vendor: {vendor}. Total: ${doc_total_cents/100:.2f} USD. "
            f"Historical Spend: ${monthly_spend/100:.2f}/mo. Items: {items_text}."
        )

        rec_num = i + 100
        # 1. System 1 Laya Record
        s1 = {
            "id": f"s1_sme_{rec_num:05d}",
            "state": state_str,
            "questions": {
                "archetype": {
                    "type": "choice",
                    "options": ["DISCRETE_MANUFACTURING", "PROCESS_BATCH_PRODUCTION", "CONTROLLED_ENVIRONMENT_AGRICULTURE", "AUTOMOTIVE_EQUIPMENT_MRO", "HOSPITALITY_RESTAURANT_FOOD_SERVICE", "RETAIL_ECOMMERCE_FULFILLMENT", "CERAMIC_ARTS_POTTERY_CRAFT", "GENERALIZED_COMMERCIAL_OPERATIONS"]
                },
                "risk_tier": {
                    "type": "choice",
                    "options": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
                },
                "next_action": {
                    "type": "choice",
                    "options": ["INSPECT_DOCUMENT", "INDUCE_BOM", "AUTHORIZE_HOLD", "GENERATE_STEP_UP", "CAPTURE_ESCROW", "DISPUTE_MEDIATION", "SPAWN_SME_MANDATE", "LOCK_COALITION"]
                },
                "confidence_score": {
                    "type": "score",
                    "min": 1,
                    "max": 5
                },
                "requires_step_up": {
                    "type": "noul"
                },
                "is_pooling_eligible": {
                    "type": "noul"
                },
                "arithmetic_valid": {
                    "type": "noul"
                }
            },
            "answers": {
                "archetype": vert["archetype"],
                "risk_tier": "HIGH" if requires_step_up else "LOW",
                "next_action": "GENERATE_STEP_UP" if requires_step_up else "AUTHORIZE_HOLD",
                "confidence_score": 5,
                "requires_step_up": requires_step_up,
                "is_pooling_eligible": any(it["poolingEligible"] for it in line_items),
                "arithmetic_valid": True
            }
        }
        sys1_records.append(s1)

        # 2. System 2 Qwen Reasoning Record
        system_prompt = (
            "You are the Wholeshare Autonomous Business Induction & Material Discovery Engine. "
            "Inspect raw procurement items. Deduce the commercial archetype, primary physical outputs, "
            "partition the Bill of Materials into RAW_MATERIAL, TOOLING, CONSUMABLE, PACKAGING, and MRO, "
            "and calculate exact integer cent autonomy spend boundaries."
        )
        user_prompt = (
            f"Analyze the following procurement document for {buyer} ({subsector}):\n"
            f"Vendor: {vendor}\n"
            f"Monthly Spend Baseline: ${monthly_spend/100:.2f} USD\n"
            f"Line Items:\n" + "\n".join([f"- {it['quantity']}x {it['description']} at ${it['unitPriceCents']/100:.2f} (Total: ${it['totalCents']/100:.2f})" for it in line_items]) + "\n\n"
            "Provide step-by-step physical transformation reasoning followed by structured JSON."
        )
        assistant_thought = (
            f"<think>\n"
            f"1. Lexical Analysis: Items include {', '.join([it['description'].split()[0] for it in line_items])}. "
            f"2. Archetype Mapping: The items match {vert['archetype']} because of technical transformation requirements. "
            f"3. Conversion Logic: Transforms raw materials with tooling into {', '.join(vert['outputs'])}. "
            f"4. Arithmetic Check: Exact sum is {doc_total_cents} cents. Integer conservation verified. "
            f"5. Boundaries: Monthly baseline {monthly_spend} cents yields auto authorization cap {auto_cap_cents} cents. Step-up threshold is {step_up_cents} cents.\n"
            f"</think>\n"
        )
        assistant_json = json.dumps({
            "subsector": subsector,
            "industryDomain": vert["name"],
            "archetypeId": vert["archetype"],
            "primaryOutputs": vert["outputs"],
            "billOfMaterials": line_items,
            "autonomyBoundaries": {
                "monthlySpendCents": monthly_spend,
                "maxAutoAuthorizeCents": auto_cap_cents,
                "stepUpThresholdCents": step_up_cents
            },
            "poolingOpportunities": [it["description"] for it in line_items if it["poolingEligible"]]
        }, indent=2)

        s2 = {
            "id": f"s2_sme_{rec_num:05d}",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
                {"role": "assistant", "content": assistant_thought + assistant_json}
            ]
        }
        sys2_records.append(s2)

        # 3. RL Verifiable Environment Record
        rl = {
            "prompt_id": f"rl_sme_{rec_num:05d}",
            "prompt": user_prompt,
            "ground_truth": {
                "archetype_id": vert["archetype"],
                "doc_total_cents": doc_total_cents,
                "line_item_count": len(line_items),
                "required_categories": list({it["category"] for it in line_items}),
                "valid_outputs": vert["outputs"],
                "monthly_spend_cents": monthly_spend,
                "auto_cap_ceiling_cents": auto_cap_cents,
                "step_up_threshold_cents": step_up_cents
            }
        }
        rl_records.append(rl)

    # Append to lakehouse
    with open(SYS1_FILE, "a", encoding="utf-8") as f:
        for r in sys1_records:
            f.write(json.dumps(r) + "\n")

    with open(SYS2_FILE, "a", encoding="utf-8") as f:
        for r in sys2_records:
            f.write(json.dumps(r) + "\n")

    with open(RL_FILE, "a", encoding="utf-8") as f:
        for r in rl_records:
            f.write(json.dumps(r) + "\n")

    # Update manifest
    with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    with open(SYS1_FILE, "r", encoding="utf-8") as f:
        manifest["partitions"]["system1_laya_records"] = sum(1 for _ in f)
    with open(SYS2_FILE, "r", encoding="utf-8") as f:
        manifest["partitions"]["system2_qwen_records"] = sum(1 for _ in f)
    with open(RL_FILE, "r", encoding="utf-8") as f:
        manifest["partitions"]["rl_verifiable_prompts"] = sum(1 for _ in f)

    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"Successfully appended {len(sys1_records)} records!")
    print(f"Total System 1: {manifest['partitions']['system1_laya_records']}")
    print(f"Total System 2: {manifest['partitions']['system2_qwen_records']}")
    print(f"Total RL:       {manifest['partitions']['rl_verifiable_prompts']}")

if __name__ == "__main__":
    generate_multi_sme_lake()

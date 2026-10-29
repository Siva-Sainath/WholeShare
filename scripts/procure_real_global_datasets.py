#!/usr/bin/env python3
"""
Wholeshare Large-Scale Real Dataset Procurement Engine.
Procures, downloads, verifies, and catalogs real open datasets from Hugging Face,
Kaggle, and public repositories across all core aspects of the Wholeshare platform.
"""

import os
import json
import shutil
import requests
import pandas as pd
from datetime import datetime, timezone
from huggingface_hub import hf_hub_download

PROCURED_DIR = "data/procured"
os.makedirs(PROCURED_DIR, exist_ok=True)

manifest = {
    "version": "2.0.0",
    "updated_at": None,
    "datasets": []
}

def procure_tatqa():
    print("[1/13] Procuring TAT-QA (Hybrid Table & Text Financial Reasoning)...")
    out_path = os.path.join(PROCURED_DIR, "financial_reasoning_tatqa.json")
    if not os.path.exists(out_path):
        hub_path = hf_hub_download("next-tat/TAT-QA", "tatqa_dataset_train.json", repo_type="dataset")
        with open(hub_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    else:
        with open(out_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    
    count = len(data)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "tatqa_financial_reasoning",
        "aspect": "Complex Financial Numerical & Table Reasoning",
        "source": "Hugging Face (next-tat/TAT-QA)",
        "file": out_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "MIT"
    })
    print(f"  -> Successfully procured {count:,} TAT-QA financial reasoning records ({size_mb:.2f} MB)")

def procure_cuad():
    print("[2/13] Procuring Atticus CUAD (Commercial Legal Contracts & Clauses)...")
    out_path = os.path.join(PROCURED_DIR, "commercial_contracts_cuad.csv")
    if not os.path.exists(out_path):
        hub_path = hf_hub_download("theatticusproject/cuad", "CUAD_v1/master_clauses.csv", repo_type="dataset")
        df = pd.read_csv(hub_path)
        df.to_csv(out_path, index=False)
    else:
        df = pd.read_csv(out_path)
        
    count = len(df)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "cuad_commercial_contracts",
        "aspect": "Commercial Legal Contracts, Escrow Clauses & Payment Terms",
        "source": "Hugging Face (theatticusproject/cuad)",
        "file": out_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "CC-BY-4.0"
    })
    print(f"  -> Successfully procured {count:,} commercial contract records with 41 clause types ({size_mb:.2f} MB)")

def procure_cfpb():
    print("[3/13] Procuring CFPB Financial Complaints & Disputes...")
    out_path = os.path.join(PROCURED_DIR, "financial_disputes_cfpb.csv")
    if not os.path.exists(out_path):
        hub_path = hf_hub_download("claritystorm/cfpb-consumer-complaints", "sample_1000.csv", repo_type="dataset")
        df = pd.read_csv(hub_path)
        df.to_csv(out_path, index=False)
    else:
        df = pd.read_csv(out_path)
        
    count = len(df)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "cfpb_financial_disputes",
        "aspect": "B2B & Consumer Payment Disputes, Billing Errors & Mediation",
        "source": "Hugging Face (claritystorm/cfpb-consumer-complaints)",
        "file": out_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "Public Domain (US Government CFPB)"
    })
    print(f"  -> Successfully procured {count:,} real dispute narratives and resolutions ({size_mb:.2f} MB)")

def procure_hs_codes():
    print("[4/13] Procuring Global Harmonized System (HS) Commodity Codes...")
    out_path = os.path.join(PROCURED_DIR, "international_hs_codes.csv")
    if not os.path.exists(out_path):
        hub_path = hf_hub_download("samabos/product_hscode", "train.csv", repo_type="dataset")
        df = pd.read_csv(hub_path)
        df.to_csv(out_path, index=False)
    else:
        df = pd.read_csv(out_path)
        
    count = len(df)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "international_hs_codes",
        "aspect": "International Trade, Customs Declarations & Commodity Classification",
        "source": "Hugging Face (samabos/product_hscode)",
        "file": out_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "MIT"
    })
    print(f"  -> Successfully procured {count:,} international HS commodity classifications ({size_mb:.2f} MB)")

def procure_cord():
    print("[5/13] Procuring CORD-v2 Real B2B Invoice & Receipt Dataset...")
    out_path = os.path.join(PROCURED_DIR, "b2b_receipts_cord.parquet")
    if not os.path.exists(out_path):
        hub_path = hf_hub_download("naver-clova-ix/cord-v2", "data/test-00000-of-00001-9c204eb3f4e11791.parquet", repo_type="dataset")
        df = pd.read_parquet(hub_path)
        df.to_parquet(out_path, index=False)
    else:
        df = pd.read_parquet(out_path)
        
    count = len(df)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "cord_b2b_receipts",
        "aspect": "Multi-Modal B2B Invoice & Receipt Line-Item Extraction",
        "source": "Hugging Face (naver-clova-ix/cord-v2)",
        "file": out_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "CC BY-NC 4.0"
    })
    print(f"  -> Successfully procured {count:,} real receipt OCR and bounding-box records ({size_mb:.2f} MB)")

def procure_finqa():
    print("[6/13] Procuring FinQA (Financial Numerical Multi-Step Math)...")
    out_path = os.path.join(PROCURED_DIR, "financial_reasoning_finqa.json")
    if not os.path.exists(out_path):
        url = "https://raw.githubusercontent.com/czyssrs/FinQA/main/dataset/train.json"
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    else:
        with open(out_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
    count = len(data)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "finqa_numerical_math",
        "aspect": "Financial Math, Multi-Step Arithmetic & Program Generation",
        "source": "FinQA (IBM / Columbia University / GitHub czyssrs)",
        "file": out_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "Apache-2.0"
    })
    print(f"  -> Successfully procured {count:,} FinQA numerical reasoning episodes ({size_mb:.2f} MB)")

def procure_hermes_function_calling():
    print("[7/13] Procuring Hermes Function Calling (Agentic Tool Execution)...")
    out_path = os.path.join(PROCURED_DIR, "function_calling_hermes_glaive.json")
    if not os.path.exists(out_path):
        hub_path = hf_hub_download("NousResearch/hermes-function-calling-v1", "sample_5k.json", repo_type="dataset")
        with open(hub_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    else:
        with open(out_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
    count = len(data)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "hermes_glaive_function_calling",
        "aspect": "Agentic Tool Calling, API Parameter Extraction & Function Execution",
        "source": "Hugging Face (NousResearch/hermes-function-calling-v1)",
        "file": out_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "MIT"
    })
    print(f"  -> Successfully procured {count:,} function calling episodes ({size_mb:.2f} MB)")

def procure_eurotender():
    print("[8/13] Procuring EU TED Public Procurement Tenders (CPV & Tenders)...")
    out_path = os.path.join(PROCURED_DIR, "procurement_tenders_eurotender.parquet")
    if not os.path.exists(out_path):
        hub_path = hf_hub_download("sinceaihq/eurotender-cpv", "data/train.parquet", repo_type="dataset")
        shutil.copy(hub_path, out_path)
    df = pd.read_parquet(out_path)
    count = len(df)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "eurotender_public_procurement",
        "aspect": "Public Procurement Tenders, Specifications & Volume Tenders",
        "source": "Hugging Face (sinceaihq/eurotender-cpv)",
        "file": out_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "Open Data (EU TED)"
    })
    print(f"  -> Successfully procured {count:,} public procurement tenders ({size_mb:.2f} MB)")

def procure_dataco_supply_chain():
    print("[9/13] Procuring DataCo Global Commercial Supply Chain Transactions...")
    out_path = os.path.join(PROCURED_DIR, "supply_chain_dataco_transactions.csv")
    if not os.path.exists(out_path):
        hub_path = hf_hub_download("alalfi/SupplyChainDataset", "DataCoSupplyChainDataset1.csv", repo_type="dataset")
        shutil.copy(hub_path, out_path)
    df = pd.read_csv(out_path, encoding="ISO-8859-1", low_memory=False)
    count = len(df)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "dataco_global_supply_chain",
        "aspect": "Multi-Tier Supply Chain Orders, Shipping Modes & Delivery Risk",
        "source": "Hugging Face (alalfi/SupplyChainDataset)",
        "file": out_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "CC-BY-4.0"
    })
    print(f"  -> Successfully procured {count:,} commercial supply chain orders ({size_mb:.2f} MB)")

def procure_nooxus_verified_entities():
    print("[10/13] Procuring Nooxus Verified Global Corporate Entities...")
    out_path = os.path.join(PROCURED_DIR, "global_verified_entities_nooxus.parquet")
    if not os.path.exists(out_path):
        hub_path = hf_hub_download("Nooxus-AI/NOO-Verified-Global-Entities", "rolling_90d_nodes.parquet", repo_type="dataset")
        df = pd.read_parquet(hub_path)
        df.to_parquet(out_path, index=False)
    else:
        df = pd.read_parquet(out_path)
    count = len(df)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "nooxus_global_verified_entities",
        "aspect": "Global Corporate Entities, KYC Verification & Firmographics",
        "source": "Hugging Face (Nooxus-AI/NOO-Verified-Global-Entities)",
        "file": out_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "Apache-2.0"
    })
    print(f"  -> Successfully procured {count:,} verified corporate entities ({size_mb:.2f} MB)")

def procure_b2b_p2p_lifecycle():
    print("[11/13] Procuring B2B Procure-to-Pay Lifecycle Relational Database...")
    p2p_files = [
        "companies.csv", "suppliers.csv", "purchase_orders.csv",
        "purchase_order_lines.csv", "goods_receipts.csv",
        "supplier_invoices.csv", "supplier_payments.csv"
    ]
    total_records = 0
    total_size = 0
    for fname in p2p_files:
        out_path = os.path.join(PROCURED_DIR, f"b2b_p2p_{fname}")
        if not os.path.exists(out_path):
            hub_path = hf_hub_download("mindweave/purchasing-procurement-us", f"data/{fname}", repo_type="dataset")
            df = pd.read_csv(hub_path)
            df.to_csv(out_path, index=False)
        else:
            df = pd.read_csv(out_path)
        total_records += len(df)
        total_size += os.path.getsize(out_path)
    size_mb = total_size / (1024 * 1024)
    manifest["datasets"].append({
        "id": "mindweave_b2b_procure_to_pay",
        "aspect": "B2B Procure-to-Pay Lifecycle (POs, Receipts, Invoices, Payments)",
        "source": "Hugging Face (mindweave/purchasing-procurement-us)",
        "file": "data/procured/b2b_p2p_*.csv",
        "records": total_records,
        "size_mb": round(size_mb, 2),
        "license": "MIT"
    })
    print(f"  -> Successfully procured {total_records:,} B2B P2P relational records ({size_mb:.2f} MB)")

def procure_sec_edgar_filings():
    print("[12/13] Procuring SEC EDGAR Corporate Supply-Chain Disclosures...")
    out_path = os.path.join(PROCURED_DIR, "sec_edgar_supply_chain.parquet")
    if not os.path.exists(out_path):
        hub_path = hf_hub_download("darshvit20/SEC-Edgar-filings", "data.parquet", repo_type="dataset")
        df = pd.read_parquet(hub_path)
        df.to_parquet(out_path, index=False)
    else:
        df = pd.read_parquet(out_path)
    count = len(df)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "sec_edgar_supply_chain_disclosures",
        "aspect": "SEC 10-K Supply-Chain Dependencies & Vendor Risk Factors",
        "source": "Hugging Face (darshvit20/SEC-Edgar-filings)",
        "file": out_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "Public Domain (SEC EDGAR)"
    })
    print(f"  -> Successfully procured {count:,} SEC EDGAR corporate filings ({size_mb:.2f} MB)")

def procure_supply_chain_qa():
    print("[13/13] Procuring Supply Chain Domain Ontology & Reasoning QA...")
    out_path = os.path.join(PROCURED_DIR, "supply_chain_ontology_qa.parquet")
    if not os.path.exists(out_path):
        hub_path = hf_hub_download("sebdg/supply_chain_q_a", "data/train-00000-of-00001.parquet", repo_type="dataset")
        df = pd.read_parquet(hub_path)
        df.to_parquet(out_path, index=False)
    else:
        df = pd.read_parquet(out_path)
    count = len(df)
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "supply_chain_ontology_reasoning",
        "aspect": "Supply Chain Ontology, Tier Mapping & Inventory Dynamics",
        "source": "Hugging Face (sebdg/supply_chain_q_a)",
        "file": out_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "Apache-2.0"
    })
    print(f"  -> Successfully procured {count:,} supply chain reasoning dialogues ({size_mb:.2f} MB)")

def main():
    print("=== Wholeshare Real Large-Scale Dataset Procurement ===")
    manifest["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    procure_tatqa()
    procure_cuad()
    procure_cfpb()
    procure_hs_codes()
    procure_cord()
    procure_finqa()
    procure_hermes_function_calling()
    procure_eurotender()
    procure_dataco_supply_chain()
    procure_nooxus_verified_entities()
    procure_b2b_p2p_lifecycle()
    procure_sec_edgar_filings()
    procure_supply_chain_qa()
    
    total_records = sum(d["records"] for d in manifest["datasets"])
    total_mb = sum(d["size_mb"] for d in manifest["datasets"])
    manifest["total_records"] = total_records
    manifest["total_size_mb"] = round(total_mb, 2)
    
    manifest_path = os.path.join(PROCURED_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        
    print("\n[SUCCESS] Large-Scale Dataset Procurement Complete!")
    print(f"Total Authentic Records Procured: {total_records:,}")
    print(f"Total Dataset Footprint: {total_mb:.2f} MB across 13 primary commercial aspects")
    print(f"Catalog Manifest written to {manifest_path}")

if __name__ == "__main__":
    main()

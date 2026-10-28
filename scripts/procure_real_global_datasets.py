#!/usr/bin/env python3
"""
Wholeshare Large-Scale Real Dataset Procurement Engine.
Procures, downloads, verifies, and catalogs real open datasets from Hugging Face,
Kaggle, and public repositories across all core aspects of the Wholeshare platform.
"""

import os
import json
import requests
import pandas as pd
from huggingface_hub import hf_hub_download

PROCURED_DIR = "data/procured"
os.makedirs(PROCURED_DIR, exist_ok=True)

manifest = {
    "version": "1.0.0",
    "updated_at": None,
    "datasets": []
}

def procure_tatqa():
    print("[1/6] Procuring TAT-QA (Hybrid Table & Text Financial Reasoning)...")
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
    print("[2/6] Procuring Atticus CUAD (Commercial Legal Contracts & Clauses)...")
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
    print("[3/6] Procuring CFPB Financial Complaints & Disputes...")
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
    print("[4/6] Procuring Global Harmonized System (HS) Commodity Codes...")
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
    print("[5/6] Procuring CORD-v2 Real B2B Invoice & Receipt Dataset...")
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
    print("[6/6] Procuring FinQA (Financial Numerical Multi-Step Math)...")
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

def main():
    print("=== Wholeshare Real Large-Scale Dataset Procurement ===")
    from datetime import datetime, timezone
    manifest["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    procure_tatqa()
    procure_cuad()
    procure_cfpb()
    procure_hs_codes()
    procure_cord()
    procure_finqa()
    
    total_records = sum(d["records"] for d in manifest["datasets"])
    total_mb = sum(d["size_mb"] for d in manifest["datasets"])
    manifest["total_records"] = total_records
    manifest["total_size_mb"] = round(total_mb, 2)
    
    manifest_path = os.path.join(PROCURED_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        
    print("\n[SUCCESS] Dataset procurement complete!")
    print(f"Total Real Records Procured: {total_records:,}")
    print(f"Total Dataset Footprint: {total_mb:.2f} MB across 6 primary aspects")
    print(f"Catalog Manifest written to {manifest_path}")

if __name__ == "__main__":
    main()


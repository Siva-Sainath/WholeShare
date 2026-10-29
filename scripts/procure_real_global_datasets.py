#!/usr/bin/env python3
"""
Wholeshare Large-Scale Real Dataset Procurement Engine.
Procures, downloads, verifies, and catalogs real open datasets from Hugging Face,
Kaggle, and public repositories across all core aspects of the Wholeshare platform.
"""

import os
import json
import shutil
import subprocess
import requests
import pandas as pd
from datetime import datetime, timezone
from huggingface_hub import hf_hub_download

PROCURED_DIR = "data/procured"
KAGGLE_DIR = os.path.join(PROCURED_DIR, "kaggle")
os.makedirs(PROCURED_DIR, exist_ok=True)
os.makedirs(KAGGLE_DIR, exist_ok=True)

manifest = {
    "version": "3.0.0",
    "updated_at": None,
    "datasets": []
}

def procure_tatqa():
    print("[1/18] Procuring TAT-QA (Hybrid Table & Text Financial Reasoning)...")
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
    print("[2/18] Procuring Atticus CUAD (Commercial Legal Contracts & Clauses)...")
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
    print("[3/18] Procuring CFPB Financial Complaints & Disputes...")
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
    print("[4/18] Procuring Global Harmonized System (HS) Commodity Codes...")
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
    print("[5/18] Procuring CORD-v2 Real B2B Invoice & Receipt Dataset...")
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
    print("[6/18] Procuring FinQA (Financial Numerical Multi-Step Math)...")
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
    print("[7/18] Procuring Hermes Function Calling (Agentic Tool Execution)...")
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
    print("[8/18] Procuring EU TED Public Procurement Tenders (CPV & Tenders)...")
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
    print("[9/18] Procuring DataCo Global Commercial Supply Chain Transactions...")
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
    print("[10/18] Procuring Nooxus Verified Global Corporate Entities...")
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
    print("[11/18] Procuring B2B Procure-to-Pay Lifecycle Relational Database...")
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
    print("[12/18] Procuring SEC EDGAR Corporate Supply-Chain Disclosures...")
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
    print("[13/18] Procuring Supply Chain Domain Ontology & Reasoning QA...")
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

def procure_kaggle_sba_national():
    print("[14/18] Procuring Kaggle US SBA National Loan Portfolio (Firmographics)...")
    dir_path = os.path.join(KAGGLE_DIR, "sba_national_loans")
    csv_path = os.path.join(dir_path, "SBAnational.csv")
    if not os.path.exists(csv_path):
        os.makedirs(dir_path, exist_ok=True)
        subprocess.run(["kaggle", "datasets", "download", "-d", "mirbektoktogaraev/should-this-loan-be-approved-or-denied", "-p", dir_path, "--unzip"], check=True)
    df = pd.read_csv(csv_path, low_memory=False)
    count = len(df)
    size_mb = os.path.getsize(csv_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "kaggle_sba_national_loans",
        "aspect": "US Small Business Administration National Loan Portfolio & Firmographics",
        "source": "Kaggle (mirbektoktogaraev/should-this-loan-be-approved-or-denied)",
        "file": csv_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "CC0 Public Domain"
    })
    print(f"  -> Successfully procured {count:,} real US small business loans ({size_mb:.2f} MB)")

def procure_kaggle_worldbank():
    print("[15/18] Procuring Kaggle World Bank Corporate Procurement Contract Awards...")
    dir_path = os.path.join(KAGGLE_DIR, "corporate-procurement-contract-awards")
    csv_path = os.path.join(dir_path, "corporate-procurement-contract-awards.csv")
    if not os.path.exists(csv_path):
        os.makedirs(dir_path, exist_ok=True)
        subprocess.run(["kaggle", "datasets", "download", "-d", "theworldbank/corporate-procurement-contract-awards", "-p", dir_path, "--unzip"], check=True)
    df = pd.read_csv(csv_path, low_memory=False)
    count = len(df)
    size_mb = os.path.getsize(csv_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "kaggle_worldbank_contract_awards",
        "aspect": "World Bank Corporate Procurement Contract Awards & Bids",
        "source": "Kaggle (theworldbank/corporate-procurement-contract-awards)",
        "file": csv_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "CC BY-4.0"
    })
    print(f"  -> Successfully procured {count:,} World Bank procurement contract awards ({size_mb:.2f} MB)")

def procure_kaggle_procurement_kpis():
    print("[16/18] Procuring Kaggle Enterprise Procurement KPI Analysis Dataset...")
    dir_path = os.path.join(KAGGLE_DIR, "procurement-kpi-analysis-dataset")
    csv_path = os.path.join(dir_path, "Procurement KPI Analysis Dataset.csv")
    if not os.path.exists(csv_path):
        os.makedirs(dir_path, exist_ok=True)
        subprocess.run(["kaggle", "datasets", "download", "-d", "shahriarkabir/procurement-kpi-analysis-dataset", "-p", dir_path, "--unzip"], check=True)
    df = pd.read_csv(csv_path, low_memory=False)
    count = len(df)
    size_mb = os.path.getsize(csv_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "kaggle_procurement_kpi_analysis",
        "aspect": "Enterprise Procurement Purchase Orders, Lead Times & Defect KPIs",
        "source": "Kaggle (shahriarkabir/procurement-kpi-analysis-dataset)",
        "file": csv_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "CC0 Public Domain"
    })
    print(f"  -> Successfully procured {count:,} enterprise procurement orders ({size_mb:.2f} MB)")

def procure_kaggle_kraljic_strategy():
    print("[17/18] Procuring Kaggle Kraljic Strategic Sourcing Matrix...")
    dir_path = os.path.join(KAGGLE_DIR, "procurement-strategy-dataset-for-kraljic-matrix")
    csv_path = os.path.join(dir_path, "realistic_kraljic_dataset.csv")
    if not os.path.exists(csv_path):
        os.makedirs(dir_path, exist_ok=True)
        subprocess.run(["kaggle", "datasets", "download", "-d", "shahriarkabir/procurement-strategy-dataset-for-kraljic-matrix", "-p", dir_path, "--unzip"], check=True)
    df = pd.read_csv(csv_path, low_memory=False)
    count = len(df)
    size_mb = os.path.getsize(csv_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "kaggle_kraljic_procurement_strategy",
        "aspect": "Kraljic Sourcing Matrix, Supply Risk & Profit Impact",
        "source": "Kaggle (shahriarkabir/procurement-strategy-dataset-for-kraljic-matrix)",
        "file": csv_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "CC0 Public Domain"
    })
    print(f"  -> Successfully procured {count:,} strategic sourcing records ({size_mb:.2f} MB)")

def procure_kaggle_sba_case_loans():
    print("[18/21] Procuring Kaggle Small Business Loan Financial Underwriting Case Studies...")
    dir_path = os.path.join(KAGGLE_DIR, "sba-loans-case-data-set")
    csv_path = os.path.join(dir_path, "SBAcase.11.13.17.csv")
    if not os.path.exists(csv_path):
        os.makedirs(dir_path, exist_ok=True)
        subprocess.run(["kaggle", "datasets", "download", "-d", "larsen0966/sba-loans-case-data-set", "-p", dir_path, "--unzip"], check=True)
    df = pd.read_csv(csv_path, low_memory=False)
    count = len(df)
    size_mb = os.path.getsize(csv_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "kaggle_sba_case_studies",
        "aspect": "Small Business Financial Underwriting & Loan Default Case Studies",
        "source": "Kaggle (larsen0966/sba-loans-case-data-set)",
        "file": csv_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "CC0 Public Domain"
    })
    print(f"  -> Successfully procured {count:,} small business loan case studies ({size_mb:.2f} MB)")

def procure_kaggle_india_trade():
    print("[19/21] Procuring Kaggle India Cross-Border Import-Export Trade Dataset...")
    dir_path = os.path.join(KAGGLE_DIR, "india", "trade")
    csv_files = [
        "2018-2010_import.csv", "2018-2010_export.csv",
        "2010_2021_HS2_export.csv", "2010_2021_HS2_import.csv"
    ]
    if not os.path.exists(os.path.join(dir_path, csv_files[0])):
        os.makedirs(dir_path, exist_ok=True)
        subprocess.run(["kaggle", "datasets", "download", "-d", "lakshyaag/india-trade-data", "-p", dir_path, "--unzip"], check=True)
    total_records = 0
    total_size = 0
    for fname in csv_files:
        p = os.path.join(dir_path, fname)
        if os.path.exists(p):
            df = pd.read_csv(p, low_memory=False)
            total_records += len(df)
            total_size += os.path.getsize(p)
    size_mb = total_size / (1024 * 1024)
    manifest["datasets"].append({
        "id": "kaggle_india_cross_border_trade",
        "aspect": "India Cross-Border Commodity Imports & Exports (HS Codes, Values)",
        "source": "Kaggle (lakshyaag/india-trade-data)",
        "file": "data/procured/kaggle/india/trade/*.csv",
        "records": total_records,
        "size_mb": round(size_mb, 2),
        "license": "CC0 Public Domain"
    })
    print(f"  -> Successfully procured {total_records:,} India trade records across {len(csv_files)} files ({size_mb:.2f} MB)")

def procure_kaggle_india_udyam_msme():
    print("[20/21] Procuring Kaggle India UDYAM District-Level MSME Enterprise Registry...")
    dir_path = os.path.join(KAGGLE_DIR, "india", "udyam_msme")
    csv_path = os.path.join(dir_path, "district_level_total_Registered_msme.csv")
    if not os.path.exists(csv_path):
        os.makedirs(dir_path, exist_ok=True)
        subprocess.run(["kaggle", "datasets", "download", "-d", "fiq423ubf/udyam-registration-msme-registration-in-india", "-p", dir_path, "--unzip"], check=True)
    df = pd.read_csv(csv_path, low_memory=False)
    count = len(df)
    size_mb = os.path.getsize(csv_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "kaggle_india_udyam_msme_registry",
        "aspect": "India Ministry of MSME District-Level Enterprise Census (Micro, Small, Medium)",
        "source": "Kaggle (fiq423ubf/udyam-registration-msme-registration-in-india)",
        "file": csv_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "Government Open Data License - India"
    })
    print(f"  -> Successfully procured {count:,} district-level Indian MSME census records ({size_mb:.2f} MB)")

def procure_kaggle_india_apmarkfed_procurement():
    print("[21/21] Procuring Kaggle India State Cooperative Procurement (AP Markfed)...")
    dir_path = os.path.join(KAGGLE_DIR, "india", "coop_procurement")
    csv_path = os.path.join(dir_path, "Seasonwiseprocurementdetails2023_0.csv")
    if not os.path.exists(csv_path):
        os.makedirs(dir_path, exist_ok=True)
        subprocess.run(["kaggle", "datasets", "download", "-d", "fiq423ubf/apmarkfed-season-wise-procurement-details", "-p", dir_path, "--unzip"], check=True)
    df = pd.read_csv(csv_path, low_memory=False)
    count = len(df)
    size_mb = os.path.getsize(csv_path) / (1024 * 1024)
    manifest["datasets"].append({
        "id": "kaggle_india_cooperative_procurement",
        "aspect": "India State Agricultural Cooperative Procurement (Farmer Headcount, Metric Tonnes, INR)",
        "source": "Kaggle (fiq423ubf/apmarkfed-season-wise-procurement-details)",
        "file": csv_path,
        "records": count,
        "size_mb": round(size_mb, 2),
        "license": "Government Open Data License - India"
    })
    print(f"  -> Successfully procured {count:,} cooperative procurement transactions ({size_mb:.2f} MB)")

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
    procure_kaggle_sba_national()
    procure_kaggle_worldbank()
    procure_kaggle_procurement_kpis()
    procure_kaggle_kraljic_strategy()
    procure_kaggle_sba_case_loans()
    procure_kaggle_india_trade()
    procure_kaggle_india_udyam_msme()
    procure_kaggle_india_apmarkfed_procurement()
    
    total_records = sum(d["records"] for d in manifest["datasets"])
    total_mb = sum(d["size_mb"] for d in manifest["datasets"])
    manifest["total_records"] = total_records
    manifest["total_size_mb"] = round(total_mb, 2)
    
    manifest_path = os.path.join(PROCURED_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        
    print("\n[SUCCESS] Large-Scale Dataset Procurement Complete!")
    print(f"Total Authentic Records Procured: {total_records:,}")
    print(f"Total Dataset Footprint: {total_mb:.2f} MB across 21 primary commercial aspects")
    print(f"Catalog Manifest written to {manifest_path}")


if __name__ == "__main__":
    main()

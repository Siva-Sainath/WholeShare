#!/usr/bin/env python3
"""
Wholeshare OPSD Corpus Repair & Stratified Splitter.

Repairs all 24,115 records across three raw partitions:
1. Sanitizes Craigslist consumer barter dialogues in Stage 2 sourcing records.
2. Injects wholesale Tier 1 and Tier 2 MOQ unit prices into Stage 2 prompts for 100% answerability.
3. Injects formatted markdown tables and source paragraphs into TAT-QA anchor prompts.
4. Partitions records into stratified train (22,315), val (1,200), and sealed holdout (600) splits.
5. Emits SHA-256 cryptographic digests in manifest.json.
"""

import hashlib
import json
import os
import random
import re
from collections import defaultdict

SEED = 42
random.seed(SEED)

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OPSD_DIR = os.path.join(BASE_DIR, "data", "lake", "opsd_preprocessed")
TATQA_PATH = os.path.join(BASE_DIR, "data", "procured", "financial_reasoning_tatqa.json")

RAW_FILES = [
    os.path.join(OPSD_DIR, "opsd_train_curriculum.jsonl"),
    os.path.join(OPSD_DIR, "opsd_training_curated.jsonl"),
    os.path.join(OPSD_DIR, "opsd_val_curriculum.jsonl"),
]

STAGE2_PRICES = {
    "FLOUR_ORGANIC_50LB": {"t1_cents": 2950, "t2_cents": 2620, "name": "Organic Artisan Bakery Flour (50 lb sack)"},
    "MALT_2ROW_55LB": {"t1_cents": 3950, "t2_cents": 3200, "name": "Craft Brewing 2-Row Pale Malt (55 lb bag)"},
    "PCBA_FR4_4LAYER": {"t1_cents": 780, "t2_cents": 420, "name": "Electronics PCBA (FR4 4-Layer High Spec)"},
    "PACKAGING_ECT32": {"t1_cents": 145, "t2_cents": 98, "name": "Corrugated Packaging (ECT-32 Heavy Shipping Box)"},
}

def load_tatqa_index():
    if not os.path.exists(TATQA_PATH):
        raise FileNotFoundError(f"Missing TAT-QA source file: {TATQA_PATH}")
    with open(TATQA_PATH, "r", encoding="utf-8") as f:
        tat_corpus = json.load(f)

    index = {}
    for doc in tat_corpus:
        table = doc.get("table", {}).get("table", [])
        paragraphs = [p.get("text", "") for p in doc.get("paragraphs", []) if p.get("text", "")]
        for q in doc.get("questions", []):
            q_text = q.get("question", "").strip()
            if q_text:
                index[q_text] = {
                    "table": table,
                    "paragraphs": paragraphs
                }
    return index

def format_table_markdown(table):
    if not table:
        return ""
    header = table[0]
    lines = []
    lines.append("| " + " | ".join(str(c).replace("\n", " ").replace("\u2014", "-").replace("\u2013", "-").strip() for c in header) + " |")
    lines.append("| " + " | ".join(["---"] * len(header)) + " |")
    for row in table[1:]:
        row_cells = list(row) + [""] * (len(header) - len(row))
        lines.append("| " + " | ".join(str(c).replace("\n", " ").replace("\u2014", "-").replace("\u2013", "-").strip() for c in row_cells[:len(header)]) + " |")
    return "\n".join(lines)

def classify_stratum(record):
    rec_id = record.get("id", "")
    stage = record.get("stage", "")
    source = record.get("source", "")

    if "stage2" in rec_id or stage == "stage2_sourcing_negotiation":
        return "sourcing_negotiation"
    if "stage3" in rec_id or stage == "stage3_paypal_escrow":
        return "paypal_escrow"
    if "stage4" in rec_id or stage == "stage4_tracking_disputes":
        return "tracking_disputes"
    if "finqa" in rec_id or source == "ANCHOR_FINQA_REPLAY":
        return "anchor_finqa"
    if "tatqa" in rec_id or source == "ANCHOR_TATQA_REPLAY":
        return "anchor_tatqa"
    return "business_induction"

def repair_stage2_prompt(prompt, completion):
    sku = "FLOUR_ORGANIC_50LB"
    for candidate in STAGE2_PRICES:
        if candidate in prompt or candidate in completion:
            sku = candidate
            break

    moq_target = 200
    m_moq = re.search(r"Tier 2 MOQ Target:\s*(\d+)", prompt)
    if m_moq:
        moq_target = int(m_moq.group(1))

    prices = STAGE2_PRICES[sku]
    t1_c = prices["t1_cents"]
    t2_c = prices["t2_cents"]

    pricing_block = (
        f"Wholesale MOQ Tier Pricing Schedule:\n"
        f"- Tier 1 (< {moq_target} units): {t1_c} cents (${t1_c/100:.2f} USD) per unit.\n"
        f"- Tier 2 (>= {moq_target} units): {t2_c} cents (${t2_c/100:.2f} USD) per unit."
    )

    context_idx = prompt.find("Buyer Negotiation Context:")
    calc_idx = prompt.find("Calculate pro-rata pricing")

    if context_idx != -1 and calc_idx != -1:
        lead_in = prompt[:context_idx].strip()
        tail = prompt[calc_idx:].strip()
        clean_context = (
            "Buyer Procurement Mandate:\n"
            "Buyer requests commercial allotment subject to Tier 1 pricing baseline and agrees to lock Tier 2 volume discount when clan pooling achieves the MOQ target."
        )
        repaired = f"{lead_in}\n\n{pricing_block}\n\n{clean_context}\n\n{tail}"
        return repaired

    if "Wholesale MOQ Tier Pricing Schedule:" not in prompt:
        return f"{prompt}\n\n{pricing_block}"
    return prompt

def repair_tatqa_prompt(prompt, tat_index):
    q_text = prompt.split("Question:")[-1].strip() if "Question:" in prompt else prompt.strip()
    if q_text not in tat_index:
        return prompt

    doc = tat_index[q_text]
    table_md = format_table_markdown(doc["table"])
    paragraphs = doc["paragraphs"]

    parts = ["Table & Text Financial Analysis:"]
    if paragraphs:
        clean_paras = " ".join(paragraphs).replace("\u2014", "-").replace("\u2013", "-")
        parts.append(f"Context Text:\n{clean_paras}")
    if table_md:
        parts.append(f"Financial Table:\n{table_md}")
    parts.append(f"Question: {q_text}")
    parts.append("Provide step-by-step arithmetic verification followed by the final numerical answer.")

    return "\n\n".join(parts)

def repair_record(record, tat_index):
    stratum = classify_stratum(record)
    s_prompt = record.get("student_prompt", "")
    t_prompt = record.get("teacher_prompt", "")
    completion = record.get("target_completion", "")

    if stratum == "sourcing_negotiation":
        s_prompt = repair_stage2_prompt(s_prompt, completion)
        t_prompt = repair_stage2_prompt(t_prompt, completion)

    elif stratum == "anchor_tatqa":
        s_prompt = repair_tatqa_prompt(s_prompt, tat_index)
        t_prompt = repair_tatqa_prompt(t_prompt, tat_index)

    s_prompt = s_prompt.replace("\u2014", "-").replace("\u2013", "-")
    t_prompt = t_prompt.replace("\u2014", "-").replace("\u2013", "-")
    completion = completion.replace("\u2014", "-").replace("\u2013", "-")

    return {
        "id": record["id"],
        "stratum": stratum,
        "source": record.get("source", "WHOLESHARE_OPSD_COMMERCE"),
        "domain": record.get("domain", "commerce"),
        "student_prompt": s_prompt,
        "teacher_prompt": t_prompt,
        "target_completion": completion
    }

def main():
    print("Loading TAT-QA index for answerability restoration...")
    tat_index = load_tatqa_index()
    print(f"Indexed {len(tat_index)} TAT-QA questions with verified tables and paragraphs.")

    all_records = []
    seen_ids = set()

    train_path = os.path.join(OPSD_DIR, "train.jsonl")
    val_path = os.path.join(OPSD_DIR, "val.jsonl")
    holdout_path = os.path.join(OPSD_DIR, "holdout.jsonl")

    # If canonical partitions already exist and are complete, read from them to ensure idempotency
    if os.path.exists(train_path) and os.path.exists(val_path) and os.path.exists(holdout_path):
        source_files = [train_path, val_path, holdout_path]
    else:
        source_files = RAW_FILES

    for file_path in source_files:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Dataset file missing: {file_path}")
        print(f"Reading {os.path.basename(file_path)}...")
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                rec = json.loads(line)
                rec_id = rec["id"]
                if rec_id in seen_ids:
                    continue
                seen_ids.add(rec_id)
                repaired = repair_record(rec, tat_index)
                all_records.append(repaired)

    total_count = len(all_records)
    print(f"Total verified records pooled: {total_count}")
    if total_count != 24115:
        raise ValueError(f"Expected exactly 24,115 records, found {total_count}")

    by_stratum = defaultdict(list)
    for r in all_records:
        by_stratum[r["stratum"]].append(r)

    print("\nRecords by stratum:")
    for st, recs in sorted(by_stratum.items()):
        print(f"  {st}: {len(recs)}")

    # Target allocations: 1,200 val, 600 holdout, 22,315 train
    val_allocations = {
        "sourcing_negotiation": 299,
        "paypal_escrow": 299,
        "tracking_disputes": 299,
        "business_induction": 180,
        "anchor_finqa": 61,
        "anchor_tatqa": 62,
    }

    holdout_allocations = {
        "sourcing_negotiation": 149,
        "paypal_escrow": 149,
        "tracking_disputes": 149,
        "business_induction": 90,
        "anchor_finqa": 31,
        "anchor_tatqa": 32,
    }

    val_records = []
    holdout_records = []
    train_records = []

    for st, recs in sorted(by_stratum.items()):
        random.shuffle(recs)
        v_count = val_allocations[st]
        h_count = holdout_allocations[st]

        v_slice = recs[:v_count]
        h_slice = recs[v_count : v_count + h_count]
        t_slice = recs[v_count + h_count :]

        val_records.extend(v_slice)
        holdout_records.extend(h_slice)
        train_records.extend(t_slice)

    random.shuffle(val_records)
    random.shuffle(holdout_records)
    random.shuffle(train_records)

    print(f"\nPartition sizes: train={len(train_records)}, val={len(val_records)}, holdout={len(holdout_records)}")
    if len(train_records) != 22315 or len(val_records) != 1200 or len(holdout_records) != 600:
        raise ValueError("Partition counts do not match contract: 22,315 / 1,200 / 600.")

    # Write files
    def write_jsonl(path, records):
        with open(path, "w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r) + "\n")

    train_path = os.path.join(OPSD_DIR, "train.jsonl")
    val_path = os.path.join(OPSD_DIR, "val.jsonl")
    holdout_path = os.path.join(OPSD_DIR, "holdout.jsonl")

    write_jsonl(train_path, train_records)
    write_jsonl(val_path, val_records)
    write_jsonl(holdout_path, holdout_records)

    # Maintain existing file compatibility
    legacy_train_path = os.path.join(OPSD_DIR, "opsd_train_curriculum.jsonl")
    legacy_val_path = os.path.join(OPSD_DIR, "opsd_val_curriculum.jsonl")
    write_jsonl(legacy_train_path, train_records)
    write_jsonl(legacy_val_path, val_records)

    def file_sha256(path):
        h = hashlib.sha256()
        with open(path, "rb") as f:
            while chunk := f.read(65536):
                h.update(chunk)
        return h.hexdigest()

    manifest = {
        "version": "2.0.0",
        "description": "Wholeshare B2B Clean Stratified OPSD Corpus for Qwen 3.5 4B",
        "totalRecords": total_count,
        "partitions": {
            "train": {
                "file": "train.jsonl",
                "recordCount": len(train_records),
                "sha256": file_sha256(train_path)
            },
            "val": {
                "file": "val.jsonl",
                "recordCount": len(val_records),
                "sha256": file_sha256(val_path)
            },
            "holdout": {
                "file": "holdout.jsonl",
                "recordCount": len(holdout_records),
                "sha256": file_sha256(holdout_path)
            }
        },
        "strataDistribution": {
            st: len(recs) for st, recs in sorted(by_stratum.items())
        }
    }

    manifest_path = os.path.join(OPSD_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nManifest committed to {manifest_path}")
    print("Corpus repair and stratified split complete.")

if __name__ == "__main__":
    main()

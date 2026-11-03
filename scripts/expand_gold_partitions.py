#!/usr/bin/env python3
"""
Wholeshare Gold Lakehouse Partition Expansion Pipeline.
Reads authentic procured datasets (CUAD contracts, FinQA math, TAT-QA tables,
CFPB payment disputes, B2B P2P invoices/POs, Hermes function calling)
and synthesizes 2,500+ production-grade Gold training partitions for:
1. System 1 (Laya ONNX decision records)
2. System 2 (Qwen 3.5 9B multi-turn reasoning and tool-calling rollouts)
3. RL Verifiable Environment ground-truth reward specs
"""

import os
import json
import csv
import re
import hashlib
from typing import List, Dict, Any

DATA_DIR = "data/procured"
LAKE_DIR = "data/lake"

def clean_cents(val_float_or_int) -> int:
    try:
        return int(round(float(val_float_or_int) * 100))
    except (ValueError, TypeError):
        return 10000

def load_cuad_contracts() -> List[Dict[str, Any]]:
    contracts = []
    path = os.path.join(DATA_DIR, "commercial_contracts_cuad.csv")
    if not os.path.exists(path):
        return contracts
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            title = row.get("Document Name-Answer") or row.get("Filename", "Commercial Supply Agreement")
            if not title:
                continue

            # Extract clauses
            clause_fields = [
                ("Minimum Commitment", row.get("Minimum Commitment", "")),
                ("Price Restrictions", row.get("Price Restrictions", "")),
                ("Cap On Liability", row.get("Cap On Liability", "")),
                ("Liquidated Damages", row.get("Liquidated Damages", "")),
                ("Audit Rights", row.get("Audit Rights", "")),
                ("Governing Law", row.get("Governing Law", ""))
            ]
            for c_type, text in clause_fields:
                clean_text = text.strip("[]'\" ").strip()
                if len(clean_text) > 30 and clean_text.lower() != "no":
                    contracts.append({
                        "title": title,
                        "clause_type": c_type,
                        "text": clean_text[:500]
                    })
            if len(contracts) >= 800:
                break
    return contracts

def load_cfpb_disputes() -> List[Dict[str, Any]]:
    disputes = []
    path = os.path.join(DATA_DIR, "financial_disputes_cfpb.csv")
    if not os.path.exists(path):
        return disputes
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            issue = row.get("issue", "Disputed Transaction")
            narrative = row.get("consumer_complaint_narrative", "").strip()
            if not narrative:
                narrative = row.get("sub_issue", "Unauthorized charge or escrow delay")
            disputes.append({
                "issue": issue,
                "narrative": narrative[:400]
            })
            if len(disputes) >= 800:
                break
    return disputes

def load_finqa_math() -> List[Dict[str, Any]]:
    math_samples = []
    path = os.path.join(DATA_DIR, "financial_reasoning_finqa.json")
    if not os.path.exists(path):
        return math_samples
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            for item in data[:800]:
                math_samples.append({
                    "question": item.get("qa", {}).get("question", ""),
                    "steps": item.get("qa", {}).get("steps", []),
                    "answer": str(item.get("qa", {}).get("exe_ans", "0"))
                })
    except Exception as e:
        print(f"Warning reading FinQA: {e}")
    return math_samples

def load_hermes_tools() -> List[Dict[str, Any]]:
    tools = []
    path = os.path.join(DATA_DIR, "function_calling_hermes_glaive.json")
    if not os.path.exists(path):
        return tools
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            for item in data[:800]:
                tools.append(item)
    except Exception as e:
        print(f"Warning reading Hermes: {e}")
    return tools

def build_expanded_gold_partitions():
    os.makedirs(os.path.join(LAKE_DIR, "system1_laya"), exist_ok=True)
    os.makedirs(os.path.join(LAKE_DIR, "system2_qwen"), exist_ok=True)
    os.makedirs(os.path.join(LAKE_DIR, "rl_verifiable_env"), exist_ok=True)

    cuad_records = load_cuad_contracts()
    cfpb_records = load_cfpb_disputes()
    finqa_records = load_finqa_math()
    hermes_records = load_hermes_tools()

    print(f"Loaded Procured Data:")
    print(f"  CUAD Clauses: {len(cuad_records)}")
    print(f"  CFPB Disputes: {len(cfpb_records)}")
    print(f"  FinQA Math: {len(finqa_records)}")
    print(f"  Hermes Tool Calls: {len(hermes_records)}")

    system1_records = []
    system2_records = []
    rl_records = []

    system_prompt = (
        "You are the Wholeshare B2B FinTech & Escrow Orchestration Engine. "
        "Enforce strict PayPal Orders v2 soft authorization holds, Invoicing v2 KYC escalation, "
        "carrier shipment verification, and APIMatic pro-rata dispute mediation with exact integer cents."
    )

    # 1. Expand from CUAD commercial contracts
    for i, c in enumerate(cuad_records):
        rec_id = f"cuad_{i+1:04d}"
        amount_cents = (i * 73 + 1200) * 100
        step_up = amount_cents > 100000

        # System 1: Laya Decision Record
        s1 = {
            "record_id": f"s1_{rec_id}",
            "domain": "Commercial B2B Contracts & Volume Allocation",
            "contract_title": c["title"],
            "clause_type": c["clause_type"],
            "clause_excerpt": c["text"],
            "intent_label": "coalition_negotiation",
            "decision_features": {
                "step_up_kyc_required": step_up,
                "mutating_action": True,
                "high_value_transaction": step_up,
                "is_pooling_eligible": True,
                "arithmetic_valid": True
            }
        }
        system1_records.append(s1)

        # System 2: Qwen Multi-Turn Rollout with PayPal Tools
        system_prompt = (
            "You are the Wholeshare B2B FinTech & Escrow Orchestration Engine. "
            "Enforce strict PayPal Orders v2 soft authorization holds, Invoicing v2 KYC escalation, "
            "carrier shipment verification, and APIMatic pro-rata dispute mediation with exact integer cents."
        )
        user_prompt = f"Review clause from {c['title']}: \"{c['text']}\". Formulate coalition terms for volume {100 + (i*10)%500} units, amount {amount_cents} cents."
        thought = (
            f"<think>\n"
            f"1. Contract Term Analysis: Clause type {c['clause_type']} specifies terms.\n"
            f"2. Allocation & Spend Bounds: Amount is ${amount_cents/100:.2f} ({amount_cents} cents). Step-up required: {step_up}.\n"
            f"3. PayPal Escrow Primitive: Use Orders v2 intent AUTHORIZE, never direct CAPTURE.\n"
            f"4. Tool Selection: If step-up required, call generate_step_up_invoice; then authorize_paypal_escrow.\n"
            f"</think>\n"
        )
        assistant_json = json.dumps({
            "contractClause": c["clause_type"],
            "status": "APPROVED",
            "totalCents": amount_cents,
            "stepUpRequired": step_up,
            "recommendedTool": "generate_step_up_invoice" if step_up else "authorize_paypal_escrow",
            "fsmState": "KYC_PENDING" if step_up else "LOCKED"
        }, indent=2)

        s2 = {
            "id": f"s2_{rec_id}",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
                {"role": "assistant", "content": thought + assistant_json}
            ]
        }
        system2_records.append(s2)

        # RL Verifiable Environment
        rl = {
            "prompt_id": f"rl_{rec_id}",
            "prompt": user_prompt,
            "ground_truth": {
                "amount_cents": amount_cents,
                "step_up_required": step_up,
                "expected_tool": "generate_step_up_invoice" if step_up else "authorize_paypal_escrow",
                "valid_intent": "AUTHORIZE",
                "no_floating_cents": True
            }
        }
        rl_records.append(rl)

    # 2. Expand from CFPB Disputes
    for i, d in enumerate(cfpb_records):
        rec_id = f"cfpb_{i+1:04d}"
        dispute_cents = (i * 45 + 500) * 100

        s1 = {
            "record_id": f"s1_{rec_id}",
            "domain": "APIMatic Pro-Rata Dispute Mediation",
            "issue": d["issue"],
            "narrative": d["narrative"],
            "intent_label": "dispute_mediation",
            "decision_features": {
                "step_up_kyc_required": False,
                "mutating_action": True,
                "high_value_transaction": dispute_cents > 100000,
                "is_pooling_eligible": False,
                "arithmetic_valid": True
            }
        }
        system1_records.append(s1)

        user_prompt = f"Mediate escrow dispute regarding issue '{d['issue']}': \"{d['narrative']}\" with disputed amount {dispute_cents} cents."
        thought = (
            f"<think>\n"
            f"1. Dispute Analysis: Issue relates to {d['issue']}.\n"
            f"2. Evidence Verification: Check carrier tracking and delivery milestone.\n"
            f"3. Escrow Disposition: If carrier confirms delivery, release hold; if transit lost, void hold.\n"
            f"4. Tool Selection: Call dispute_mediation_escalate with exact integer cents.\n"
            f"</think>\n"
        )
        assistant_json = json.dumps({
            "issue": d["issue"],
            "disputeResolution": "UNDER_REVIEW",
            "disputedCents": dispute_cents,
            "recommendedTool": "dispute_mediation_escalate",
            "status": "FROZEN_DISPUTED"
        }, indent=2)

        s2 = {
            "id": f"s2_{rec_id}",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
                {"role": "assistant", "content": thought + assistant_json}
            ]
        }
        system2_records.append(s2)

        rl = {
            "prompt_id": f"rl_{rec_id}",
            "prompt": user_prompt,
            "ground_truth": {
                "disputed_cents": dispute_cents,
                "expected_tool": "dispute_mediation_escalate",
                "fsm_state": "FROZEN_DISPUTED",
                "no_floating_cents": True
            }
        }
        rl_records.append(rl)

    # 3. Expand from FinQA Financial Math
    for i, m in enumerate(finqa_records):
        rec_id = f"finqa_{i+1:04d}"
        q = m["question"]
        ans = m["answer"]

        s1 = {
            "record_id": f"s1_{rec_id}",
            "domain": "Pure Integer Arithmetic & Volume Discount Curves",
            "question": q,
            "intent_label": "coalition_negotiation",
            "decision_features": {
                "step_up_kyc_required": False,
                "mutating_action": False,
                "high_value_transaction": False,
                "is_pooling_eligible": True,
                "arithmetic_valid": True
            }
        }
        system1_records.append(s1)

        user_prompt = f"Calculate exact procurement volume allocation and integer cents for: {q}"
        thought = (
            f"<think>\n"
            f"1. Financial Arithmetic: Calculate exact cents without floating-point drift.\n"
            f"2. Nash Bargaining Invariant: Total cents equals sum of individual member allocations.\n"
            f"3. Output Form: Return verified integer cents proposal.\n"
            f"</think>\n"
        )
        assistant_json = json.dumps({
            "problem": q,
            "verifiedAnswer": ans,
            "recommendedTool": "run_coalition_negotiation",
            "arithmeticValid": True
        }, indent=2)

        s2 = {
            "id": f"s2_{rec_id}",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
                {"role": "assistant", "content": thought + assistant_json}
            ]
        }
        system2_records.append(s2)

        rl = {
            "prompt_id": f"rl_{rec_id}",
            "prompt": user_prompt,
            "ground_truth": {
                "expected_tool": "run_coalition_negotiation",
                "verified_answer": ans,
                "no_floating_cents": True
            }
        }
        rl_records.append(rl)

    # 4. Expand from Hermes Function Calling
    for i, h in enumerate(hermes_records):
        rec_id = f"hermes_{i+1:04d}"
        msgs = h.get("conversations", [])
        if len(msgs) < 2:
            continue
        u_content = msgs[0].get("value", "")
        a_content = msgs[1].get("value", "")

        s1 = {
            "record_id": f"s1_{rec_id}",
            "domain": "Agent Tool Calling & Ingress Intent Routing",
            "user_prompt": u_content[:200],
            "intent_label": "catalog_query" if "catalog" in u_content.lower() else "coalition_negotiation",
            "decision_features": {
                "step_up_kyc_required": False,
                "mutating_action": "spawn" in u_content.lower() or "lock" in u_content.lower(),
                "high_value_transaction": False,
                "is_pooling_eligible": True,
                "arithmetic_valid": True
            }
        }
        system1_records.append(s1)

        s2 = {
            "id": f"s2_{rec_id}",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": u_content},
                {"role": "assistant", "content": a_content}
            ]
        }
        system2_records.append(s2)

        rl = {
            "prompt_id": f"rl_{rec_id}",
            "prompt": u_content,
            "ground_truth": {
                "expected_tool": "discover_wholesale_catalog" if "catalog" in u_content.lower() else "spawn_sme_mandate",
                "no_floating_cents": True
            }
        }
        rl_records.append(rl)

    print(f"\nTotal Expanded Partitions Synthesized:")
    print(f"  System 1 (Laya): {len(system1_records)} records")
    print(f"  System 2 (Qwen): {len(system2_records)} records")
    print(f"  RL Verifiable:   {len(rl_records)} records")

    # Write out to Gold Lakehouse
    s1_path = os.path.join(LAKE_DIR, "system1_laya", "system1_decision_records.jsonl")
    with open(s1_path, "w", encoding="utf-8") as f:
        for r in system1_records:
            f.write(json.dumps(r) + "\n")

    s2_path = os.path.join(LAKE_DIR, "system2_qwen", "system2_reasoning_rollouts.jsonl")
    with open(s2_path, "w", encoding="utf-8") as f:
        for r in system2_records:
            f.write(json.dumps(r) + "\n")

    rl_path = os.path.join(LAKE_DIR, "rl_verifiable_env", "verifiable_reward_ground_truth.jsonl")
    with open(rl_path, "w", encoding="utf-8") as f:
        for r in rl_records:
            f.write(json.dumps(r) + "\n")

    # Update manifest
    manifest_path = os.path.join(LAKE_DIR, "manifest.json")
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    manifest["dataLakeVersion"] = "2.0.0"
    manifest["partitions"]["system1_laya_records"] = len(system1_records)
    manifest["partitions"]["system2_qwen_records"] = len(system2_records)
    manifest["partitions"]["rl_verifiable_prompts"] = len(rl_records)
    manifest["coverage"]["expandedCommercialRecords"] = len(system1_records)

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"Successfully updated {manifest_path} with v2.0.0 Gold Partitions!")

if __name__ == "__main__":
    build_expanded_gold_partitions()

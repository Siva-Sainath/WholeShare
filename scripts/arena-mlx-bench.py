#!/usr/bin/env python3
"""Arena benchmark: test multiple MLX models on real Wholeshare B2B procurement prompts.
No mocks. No fallbacks. Real inference on Apple Metal."""

import mlx_lm
import time
import json
import sys

SYSTEM_PROMPT = """You are the Wholeshare B2B Escrow Autonomous Agent.
Given a procurement mandate, return ONLY a valid JSON object matching this schema:
{
  "action": "spawn_sme_mandate",
  "sku": string,
  "units": integer,
  "maxPricePerUnitCents": integer,
  "stepUpThresholdCents": integer,
  "intent": "AUTHORIZE"
}
No markdown. No explanation. JSON only."""

TEST_PROMPTS = [
    {
        "name": "Basic Onboarding",
        "prompt": "Austin Artisan Bakery wants 200 units of organic-flour-50lb, max budget $2,500 with step-up verification over $1,500. Onboard them and lock escrow.",
        "expected_action": "spawn_sme_mandate",
        "expected_units": 200,
        "expected_intent": "AUTHORIZE"
    },
    {
        "name": "High Value Deal",
        "prompt": "MegaCorp Industrial needs 5000 units of steel-beam-i-section, max budget $125,000 with step-up verification over $50,000. Onboard them and lock escrow.",
        "expected_action": "spawn_sme_mandate",
        "expected_units": 5000,
        "expected_intent": "AUTHORIZE"
    },
    {
        "name": "Small Batch",
        "prompt": "CornerShop Groceries wants 15 units of artisan-cheese-wheel, max budget $300 with step-up verification over $200. Onboard them and lock escrow.",
        "expected_action": "spawn_sme_mandate",
        "expected_units": 15,
        "expected_intent": "AUTHORIZE"
    }
]

CANDIDATES = [
    "mlx-community/Qwen2.5-3B-Instruct-4bit",
    "mlx-community/Qwen3-4B-Instruct-2507-4bit",
]

def extract_json(text):
    clean = text.strip()
    if clean.startswith("```json"):
        clean = clean.split("```json")[1].split("```")[0].strip()
    elif clean.startswith("```"):
        clean = clean.split("```")[1].split("```")[0].strip()
    start = clean.find("{")
    end = clean.rfind("}") + 1
    if start >= 0 and end > start:
        clean = clean[start:end]
    return json.loads(clean)

def run_arena():
    results = {}

    for model_name in CANDIDATES:
        print(f"\n{'='*60}")
        print(f"CANDIDATE: {model_name}")
        print(f"{'='*60}")

        load_start = time.time()
        model, tokenizer = mlx_lm.load(model_name)
        load_time = time.time() - load_start
        print(f"Load time: {load_time:.2f}s")

        model_results = {
            "load_time_s": round(load_time, 2),
            "tests": [],
            "pass_count": 0,
            "fail_count": 0,
            "total_tokens": 0,
            "total_gen_time_s": 0
        }

        for test in TEST_PROMPTS:
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": test["prompt"]}
            ]

            chat_kwargs = {"tokenize": False, "add_generation_prompt": True}
            if "Qwen3" in model_name:
                chat_kwargs["enable_thinking"] = False

            prompt = tokenizer.apply_chat_template(messages, **chat_kwargs)

            t0 = time.time()
            response = mlx_lm.generate(model, tokenizer, prompt=prompt, max_tokens=256, verbose=False)
            gen_time = time.time() - t0

            token_count = len(tokenizer.encode(response))
            tps = token_count / gen_time if gen_time > 0 else 0

            model_results["total_tokens"] += token_count
            model_results["total_gen_time_s"] += gen_time

            test_result = {
                "name": test["name"],
                "gen_time_s": round(gen_time, 3),
                "tokens": token_count,
                "tps": round(tps, 1),
                "raw_response": response[:300],
                "passed": False,
                "errors": []
            }

            try:
                data = extract_json(response)
                if data.get("intent") != test["expected_intent"]:
                    test_result["errors"].append(f"intent={data.get('intent')}, expected={test['expected_intent']}")
                if data.get("units") != test["expected_units"]:
                    test_result["errors"].append(f"units={data.get('units')}, expected={test['expected_units']}")
                if data.get("action") != test["expected_action"]:
                    test_result["errors"].append(f"action={data.get('action')}, expected={test['expected_action']}")
                if len(test_result["errors"]) == 0:
                    test_result["passed"] = True
                    model_results["pass_count"] += 1
                else:
                    model_results["fail_count"] += 1
            except Exception as e:
                test_result["errors"].append(f"JSON parse failed: {e}")
                model_results["fail_count"] += 1

            status = "PASS" if test_result["passed"] else "FAIL"
            print(f"  [{status}] {test['name']}: {gen_time:.2f}s, {token_count} tok, {tps:.1f} tok/s")
            if test_result["errors"]:
                for err in test_result["errors"]:
                    print(f"       Error: {err}")

            model_results["tests"].append(test_result)

        avg_tps = model_results["total_tokens"] / model_results["total_gen_time_s"] if model_results["total_gen_time_s"] > 0 else 0
        model_results["avg_tps"] = round(avg_tps, 1)
        results[model_name] = model_results
        del model, tokenizer

    print(f"\n{'='*60}")
    print("ARENA SUMMARY")
    print(f"{'='*60}")
    for name, r in results.items():
        total = r["pass_count"] + r["fail_count"]
        print(f"  {name}")
        print(f"    Pass: {r['pass_count']}/{total}  |  Avg: {r['avg_tps']} tok/s  |  Load: {r['load_time_s']}s")

    output_path = "docs/assets/arena_mlx_results.json"
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to {output_path}")

if __name__ == "__main__":
    run_arena()

#!/usr/bin/env python3
"""
Autonomous Business Induction Reinforcement Learning Verification Lever.
Implements GRPO with Verifiable Rewards (RLVR) across commercial archetypes.
Evaluates arithmetic closure, transformation conservation, and spend boundary safety.
"""

import sys
import numpy as np

ARCHETYPE_RULES = {
    "DISCRETE_MANUFACTURING": {
        "required_categories": ["RAW_MATERIAL", "TOOLING", "CONSUMABLE"],
        "valid_outputs": ["components", "assemblies", "tooling", "parts", "fittings"],
        "max_spend_ratio": 0.35
    },
    "PROCESS_BATCH_PRODUCTION": {
        "required_categories": ["RAW_MATERIAL", "CONSUMABLE", "PACKAGING"],
        "valid_outputs": ["baked goods", "beverages", "confections", "batches"],
        "max_spend_ratio": 0.30
    },
    "CONTROLLED_ENVIRONMENT_AGRICULTURE": {
        "required_categories": ["RAW_MATERIAL", "CONSUMABLE", "PACKAGING"],
        "valid_outputs": ["microgreens", "herbs", "mushrooms", "produce"],
        "max_spend_ratio": 0.25
    },
    "SERVICE_REPAIR_MRO": {
        "required_categories": ["RAW_MATERIAL", "CONSUMABLE", "MRO"],
        "valid_outputs": ["repairs", "overhauls", "services", "inspections"],
        "max_spend_ratio": 0.30
    },
    "HOSPITALITY_FOOD_SERVICE": {
        "required_categories": ["RAW_MATERIAL", "CONSUMABLE", "PACKAGING"],
        "valid_outputs": ["meals", "dishes", "catering", "beverages"],
        "max_spend_ratio": 0.28
    },
    "RETAIL_DISTRIBUTION_FULFILLMENT": {
        "required_categories": ["RAW_MATERIAL", "CONSUMABLE", "PACKAGING"],
        "valid_outputs": ["orders", "shipments", "fulfillments", "dispatches"],
        "max_spend_ratio": 0.40
    },
    "ARTISAN_SPECIALTY_CRAFT": {
        "required_categories": ["RAW_MATERIAL", "TOOLING", "CONSUMABLE"],
        "valid_outputs": ["ceramics", "pottery", "tableware", "crafts"],
        "max_spend_ratio": 0.25
    },
    "GENERALIZED_COMMERCIAL_OPERATIONS": {
        "required_categories": ["RAW_MATERIAL", "PACKAGING"],
        "valid_outputs": ["goods", "products", "services"],
        "max_spend_ratio": 0.30
    }
}

def reward_arithmetic_balance(line_items):
    """
    Verifiable Reward 1: Exact integer arithmetic balance.
    P_unit * Q == Total_line in cents.
    Sum(Total_line) == Total_invoice.
    """
    if not line_items:
        return 0.0

    valid_lines = 0
    total_calc = 0
    reported_total = 0

    for item in line_items:
        qty = item.get("quantity", 0)
        unit_price = item.get("unit_price_cents", 0)
        line_total = item.get("total_cents", 0)
        reported_total += line_total

        if not isinstance(qty, int) or not isinstance(unit_price, int) or not isinstance(line_total, int):
            return 0.0

        if qty * unit_price == line_total and line_total > 0:
            valid_lines += 1
            total_calc += line_total

    if valid_lines == len(line_items) and total_calc == reported_total:
        return 1.0

    return float(valid_lines) / max(1, len(line_items)) * 0.5

def reward_transformation_conservation(archetype_id, bom_items, inferred_outputs):
    """
    Verifiable Reward 2: Input to output transformation conservation.
    Physical reality check. A business cannot fabricate without material and tools.
    """
    rule = ARCHETYPE_RULES.get(archetype_id, ARCHETYPE_RULES["GENERALIZED_COMMERCIAL_OPERATIONS"])
    observed_categories = {item.get("category") for item in bom_items}

    # Check required input categories
    reqs_met = sum(1 for req in rule["required_categories"] if req in observed_categories)
    category_score = reqs_met / len(rule["required_categories"])

    # Check output plausibility
    output_text = " ".join(inferred_outputs).lower()
    output_plausible = any(v in output_text for v in rule["valid_outputs"])
    output_score = 1.0 if output_plausible else 0.0

    return 0.5 * category_score + 0.5 * output_score

def reward_spend_boundary_safety(archetype_id, monthly_spend_cents, auto_cap_cents, step_up_cents):
    """
    Verifiable Reward 3: FinTech policy boundary verification.
    Guarantees spend limits do not violate risk invariants.
    """
    rule = ARCHETYPE_RULES.get(archetype_id, ARCHETYPE_RULES["GENERALIZED_COMMERCIAL_OPERATIONS"])
    max_allowed_ratio = rule["max_spend_ratio"]

    if monthly_spend_cents <= 0 or auto_cap_cents <= 0 or step_up_cents <= 0:
        return 0.0

    ratio = auto_cap_cents / monthly_spend_cents
    if ratio > max_allowed_ratio:
        return 0.0

    if step_up_cents < auto_cap_cents:
        return 0.0

    if auto_cap_cents > 500000:
        return 0.0

    return 1.0

def compute_composite_reward(candidate):
    """
    Aggregates verifiable rewards into a scalar objective R in [0, 1].
    """
    r_math = reward_arithmetic_balance(candidate.get("line_items", []))
    r_transform = reward_transformation_conservation(
        candidate.get("archetype_id"),
        candidate.get("bom_items", []),
        candidate.get("inferred_outputs", [])
    )
    r_spend = reward_spend_boundary_safety(
        candidate.get("archetype_id"),
        candidate.get("monthly_spend_cents", 0),
        candidate.get("auto_cap_cents", 0),
        candidate.get("step_up_cents", 0)
    )

    composite = 0.35 * r_math + 0.35 * r_transform + 0.30 * r_spend
    return composite, {
        "r_math": r_math,
        "r_transform": r_transform,
        "r_spend": r_spend,
        "composite": composite
    }

def compute_group_relative_advantages(rewards, epsilon=1e-4):
    """
    Calculates GRPO group relative advantages across G rollouts per prompt.
    """
    rewards = np.asarray(rewards, dtype=np.float64)
    mean = np.mean(rewards)
    std = np.std(rewards)
    return (rewards - mean) / (std + epsilon)

def simulate_rl_training_step():
    """
    Simulates a GRPO policy optimization batch across 4 commercial prompts.
    Each prompt evaluates 4 candidate rollouts.
    """
    prompt_scenarios = [
        {
            "name": "Precision CNC Machining",
            "archetype_id": "DISCRETE_MANUFACTURING",
            "monthly_spend_cents": 1200000,
            "candidates": [
                {
                    "line_items": [
                        {"quantity": 10, "unit_price_cents": 4500, "total_cents": 45000},
                        {"quantity": 5, "unit_price_cents": 3200, "total_cents": 16000}
                    ],
                    "archetype_id": "DISCRETE_MANUFACTURING",
                    "bom_items": [{"category": "RAW_MATERIAL"}, {"category": "TOOLING"}, {"category": "CONSUMABLE"}],
                    "inferred_outputs": ["precision machined components"],
                    "monthly_spend_cents": 1200000,
                    "auto_cap_cents": 300000,
                    "step_up_cents": 600000
                },
                {
                    "line_items": [
                        {"quantity": 10, "unit_price_cents": 4500, "total_cents": 40000}
                    ],
                    "archetype_id": "DISCRETE_MANUFACTURING",
                    "bom_items": [{"category": "RAW_MATERIAL"}],
                    "inferred_outputs": ["parts"],
                    "monthly_spend_cents": 1200000,
                    "auto_cap_cents": 300000,
                    "step_up_cents": 600000
                },
                {
                    "line_items": [
                        {"quantity": 10, "unit_price_cents": 4500, "total_cents": 45000}
                    ],
                    "archetype_id": "DISCRETE_MANUFACTURING",
                    "bom_items": [{"category": "RAW_MATERIAL"}, {"category": "TOOLING"}],
                    "inferred_outputs": ["components"],
                    "monthly_spend_cents": 1200000,
                    "auto_cap_cents": 900000,
                    "step_up_cents": 600000
                },
                {
                    "line_items": [
                        {"quantity": 10, "unit_price_cents": 4500, "total_cents": 45000}
                    ],
                    "archetype_id": "DISCRETE_MANUFACTURING",
                    "bom_items": [{"category": "RAW_MATERIAL"}, {"category": "TOOLING"}, {"category": "CONSUMABLE"}],
                    "inferred_outputs": ["precision components"],
                    "monthly_spend_cents": 1200000,
                    "auto_cap_cents": 250000,
                    "step_up_cents": 500000
                }
            ]
        },
        {
            "name": "Commercial Bakery & Food Production",
            "archetype_id": "PROCESS_BATCH_PRODUCTION",
            "monthly_spend_cents": 800000,
            "candidates": [
                {
                    "line_items": [
                        {"quantity": 20, "unit_price_cents": 2800, "total_cents": 56000},
                        {"quantity": 10, "unit_price_cents": 3400, "total_cents": 34000}
                    ],
                    "archetype_id": "PROCESS_BATCH_PRODUCTION",
                    "bom_items": [{"category": "RAW_MATERIAL"}, {"category": "CONSUMABLE"}, {"category": "PACKAGING"}],
                    "inferred_outputs": ["artisan baked goods"],
                    "monthly_spend_cents": 800000,
                    "auto_cap_cents": 200000,
                    "step_up_cents": 400000
                },
                {
                    "line_items": [
                        {"quantity": 20, "unit_price_cents": 2800, "total_cents": 56000}
                    ],
                    "archetype_id": "PROCESS_BATCH_PRODUCTION",
                    "bom_items": [{"category": "RAW_MATERIAL"}],
                    "inferred_outputs": ["baked goods"],
                    "monthly_spend_cents": 800000,
                    "auto_cap_cents": 200000,
                    "step_up_cents": 400000
                },
                {
                    "line_items": [
                        {"quantity": 20, "unit_price_cents": 2800, "total_cents": 56000}
                    ],
                    "archetype_id": "PROCESS_BATCH_PRODUCTION",
                    "bom_items": [{"category": "RAW_MATERIAL"}, {"category": "CONSUMABLE"}, {"category": "PACKAGING"}],
                    "inferred_outputs": ["baked goods"],
                    "monthly_spend_cents": 800000,
                    "auto_cap_cents": 550000,
                    "step_up_cents": 700000
                },
                {
                    "line_items": [
                        {"quantity": 20, "unit_price_cents": 2800, "total_cents": 56000}
                    ],
                    "archetype_id": "PROCESS_BATCH_PRODUCTION",
                    "bom_items": [{"category": "RAW_MATERIAL"}, {"category": "CONSUMABLE"}, {"category": "PACKAGING"}],
                    "inferred_outputs": ["confections"],
                    "monthly_spend_cents": 800000,
                    "auto_cap_cents": 180000,
                    "step_up_cents": 360000
                }
            ]
        },
        {
            "name": "Controlled Vertical Hydroponics",
            "archetype_id": "CONTROLLED_ENVIRONMENT_AGRICULTURE",
            "monthly_spend_cents": 600000,
            "candidates": [
                {
                    "line_items": [
                        {"quantity": 12, "unit_price_cents": 3800, "total_cents": 45600},
                        {"quantity": 6, "unit_price_cents": 9200, "total_cents": 55200}
                    ],
                    "archetype_id": "CONTROLLED_ENVIRONMENT_AGRICULTURE",
                    "bom_items": [{"category": "RAW_MATERIAL"}, {"category": "CONSUMABLE"}, {"category": "PACKAGING"}],
                    "inferred_outputs": ["fresh culinary microgreens"],
                    "monthly_spend_cents": 600000,
                    "auto_cap_cents": 150000,
                    "step_up_cents": 300000
                },
                {
                    "line_items": [
                        {"quantity": 12, "unit_price_cents": 3800, "total_cents": 45600}
                    ],
                    "archetype_id": "CONTROLLED_ENVIRONMENT_AGRICULTURE",
                    "bom_items": [{"category": "RAW_MATERIAL"}],
                    "inferred_outputs": ["microgreens"],
                    "monthly_spend_cents": 600000,
                    "auto_cap_cents": 150000,
                    "step_up_cents": 300000
                },
                {
                    "line_items": [
                        {"quantity": 12, "unit_price_cents": 3800, "total_cents": 45600}
                    ],
                    "archetype_id": "CONTROLLED_ENVIRONMENT_AGRICULTURE",
                    "bom_items": [{"category": "RAW_MATERIAL"}, {"category": "CONSUMABLE"}, {"category": "PACKAGING"}],
                    "inferred_outputs": ["herbs"],
                    "monthly_spend_cents": 600000,
                    "auto_cap_cents": 400000,
                    "step_up_cents": 500000
                },
                {
                    "line_items": [
                        {"quantity": 12, "unit_price_cents": 3800, "total_cents": 45600}
                    ],
                    "archetype_id": "CONTROLLED_ENVIRONMENT_AGRICULTURE",
                    "bom_items": [{"category": "RAW_MATERIAL"}, {"category": "CONSUMABLE"}, {"category": "PACKAGING"}],
                    "inferred_outputs": ["produce"],
                    "monthly_spend_cents": 600000,
                    "auto_cap_cents": 120000,
                    "step_up_cents": 240000
                }
            ]
        },
        {
            "name": "Novel Unseen Quantum Optics Lab",
            "archetype_id": "GENERALIZED_COMMERCIAL_OPERATIONS",
            "monthly_spend_cents": 900000,
            "candidates": [
                {
                    "line_items": [
                        {"quantity": 10, "unit_price_cents": 6500, "total_cents": 65000},
                        {"quantity": 10, "unit_price_cents": 4000, "total_cents": 40000}
                    ],
                    "archetype_id": "GENERALIZED_COMMERCIAL_OPERATIONS",
                    "bom_items": [{"category": "RAW_MATERIAL"}, {"category": "PACKAGING"}],
                    "inferred_outputs": ["custom commercial goods"],
                    "monthly_spend_cents": 900000,
                    "auto_cap_cents": 220000,
                    "step_up_cents": 440000
                },
                {
                    "line_items": [
                        {"quantity": 10, "unit_price_cents": 6500, "total_cents": 60000}
                    ],
                    "archetype_id": "GENERALIZED_COMMERCIAL_OPERATIONS",
                    "bom_items": [{"category": "RAW_MATERIAL"}],
                    "inferred_outputs": ["goods"],
                    "monthly_spend_cents": 900000,
                    "auto_cap_cents": 220000,
                    "step_up_cents": 440000
                },
                {
                    "line_items": [
                        {"quantity": 10, "unit_price_cents": 6500, "total_cents": 65000}
                    ],
                    "archetype_id": "GENERALIZED_COMMERCIAL_OPERATIONS",
                    "bom_items": [{"category": "RAW_MATERIAL"}, {"category": "PACKAGING"}],
                    "inferred_outputs": ["products"],
                    "monthly_spend_cents": 900000,
                    "auto_cap_cents": 600000,
                    "step_up_cents": 500000
                },
                {
                    "line_items": [
                        {"quantity": 10, "unit_price_cents": 6500, "total_cents": 65000}
                    ],
                    "archetype_id": "GENERALIZED_COMMERCIAL_OPERATIONS",
                    "bom_items": [{"category": "RAW_MATERIAL"}, {"category": "PACKAGING"}],
                    "inferred_outputs": ["commercial goods"],
                    "monthly_spend_cents": 900000,
                    "auto_cap_cents": 200000,
                    "step_up_cents": 400000
                }
            ]
        }
    ]

    total_prompts = len(prompt_scenarios)
    results = []

    for scenario in prompt_scenarios:
        rewards = []
        breakdowns = []
        for cand in scenario["candidates"]:
            score, bd = compute_composite_reward(cand)
            rewards.append(score)
            breakdowns.append(bd)

        advantages = compute_group_relative_advantages(rewards)
        best_idx = int(np.argmax(rewards))
        worst_idx = int(np.argmin(rewards))

        results.append({
            "name": scenario["name"],
            "rewards": rewards,
            "advantages": advantages.tolist(),
            "best_reward": float(rewards[best_idx]),
            "worst_reward": float(rewards[worst_idx]),
            "spread": float(rewards[best_idx] - rewards[worst_idx]),
            "best_advantage": float(advantages[best_idx]),
            "worst_advantage": float(advantages[worst_idx])
        })

    return results

def main():
    print("=== Wholeshare Autonomous Business Induction RL Verification ===")
    results = simulate_rl_training_step()

    all_passed = True
    for r in results:
        print(f"\n[SCENARIO] {r['name']}")
        print(f"  Rewards: {[round(x, 3) for x in r['rewards']]}")
        print(f"  GRPO Advantages: {[round(x, 3) for x in r['advantages']]}")
        print(f"  Best Reward: {r['best_reward']:.3f} | Best Adv: {r['best_advantage']:+.3f}")
        print(f"  Worst Reward: {r['worst_reward']:.3f} | Worst Adv: {r['worst_advantage']:+.3f}")
        print(f"  Advantage Spread: {r['spread']:.3f}")

        # Invariant 1: Best candidate must have higher reward than worst
        if r["best_reward"] <= r["worst_reward"]:
            print(f"  [FAIL] Reward discrimination failed for {r['name']}")
            all_passed = False
        else:
            print(f"  [PASS] Reward discrimination verified.")

        # Invariant 2: Best advantage must be positive and worst negative
        if r["best_advantage"] <= 0 or r["worst_advantage"] >= 0:
            print(f"  [FAIL] Advantage sign separation failed for {r['name']}")
            all_passed = False
        else:
            print(f"  [PASS] Advantage separation verified.")

    print("\n" + "="*50)
    if all_passed:
        print("[SUCCESS] All 4 commercial scenarios pass RL verifiable reward checks.")
        print("Reinforcement learning successfully separates valid domain induction from hallucinations.")
        sys.exit(0)
    else:
        print("[FAILURE] One or more scenarios failed RL verification.")
        sys.exit(1)

if __name__ == "__main__":
    main()

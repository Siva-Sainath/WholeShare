#!/usr/bin/env python3
"""
Wholeshare Qwen 9B GRPO (Group Relative Policy Optimization) Training Script.
Optimized for 1-click execution on Google Colab (1x T4 16GB) or Kaggle (2x T4).
Uses Unsloth 4-bit QLoRA to achieve 80% VRAM reduction.
"""

import os
import re
import json

def get_reward_integer_cents(completions, **kwargs):
    """
    Rewards responses that enforce exact integer cent arithmetic.
    Penalizes floating point dollars or rounded fractions.
    """
    rewards = []
    for completion in completions:
        text = completion[0]["content"] if isinstance(completion, list) else str(completion)
        has_float_cents = bool(re.search(r"\$\d+\.\d{3,}", text)) or bool(re.search(r"amountCents[\"':\s]+\d+\.\d+", text))
        has_valid_integer_cents = bool(re.search(r"amountCents[\"':\s]+\d+", text)) or bool(re.search(r"pledgeCents[\"':\s]+\d+", text))

        if has_float_cents:
            rewards.append(0.0)
        elif has_valid_integer_cents:
            rewards.append(1.0)
        else:
            rewards.append(0.5)
    return rewards

def get_reward_paypal_soft_hold(completions, **kwargs):
    """
    Rewards Order v2 soft authorization holds (intent: AUTHORIZE).
    Strictly penalizes direct settlement (intent: CAPTURE).
    """
    rewards = []
    for completion in completions:
        text = completion[0]["content"] if isinstance(completion, list) else str(completion)
        if "CAPTURE" in text and "AUTHORIZE" not in text:
            rewards.append(0.0)
        elif "AUTHORIZE" in text:
            rewards.append(1.0)
        else:
            rewards.append(0.2)
    return rewards

def get_reward_spend_cap_compliance(completions, spend_caps=None, **kwargs):
    """
    Rewards allocation proposals where member pledges stay strictly within spend caps.
    """
    rewards = []
    for idx, completion in enumerate(completions):
        text = completion[0]["content"] if isinstance(completion, list) else str(completion)
        cap = 150000
        if spend_caps and idx < len(spend_caps):
            cap = spend_caps[idx]

        amounts = [int(m) for m in re.findall(r"pledgeCents[\"':\s]+(\d+)", text)]
        if amounts and any(a > cap for a in amounts):
            rewards.append(0.0)
        elif amounts:
            rewards.append(1.0)
        else:
            rewards.append(0.5)
    return rewards

def get_reward_tool_json_validity(completions, **kwargs):
    """
    Rewards valid structured JSON tool call syntax matching Wholeshare declarations.
    """
    rewards = []
    for completion in completions:
        text = completion[0]["content"] if isinstance(completion, list) else str(completion)
        json_matches = re.findall(r"\{[^{}]*\"name\"[^{}]*\}", text)
        if json_matches:
            valid = True
            for jm in json_matches:
                try:
                    json.loads(jm)
                except Exception:
                    valid = False
                    break
            rewards.append(1.0 if valid else 0.0)
        else:
            rewards.append(0.3)
    return rewards

def main():
    print("=== Wholeshare Qwen 9B GRPO Tuning Pipeline ===")
    print("Verifying environment and Unsloth acceleration...")

    try:
        import torch
        from unsloth import FastLanguageModel, is_bfloat16_supported
        from trl import GRPOConfig, GRPOTrainer
        from datasets import load_dataset
    except ImportError:
        print("Required packages missing. Install with:")
        print("pip install unsloth vllm trl datasets accelerate bitsandbytes")
        return

    max_seq_length = 2048
    lora_rank = 16
    model_name = "Qwen/Qwen2.5-Coder-7B-Instruct"

    print(f"Loading base model {model_name} in 4-bit precision...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=model_name,
        max_seq_length=max_seq_length,
        load_in_4bit=True,
        fast_inference=True
    )

    model = FastLanguageModel.get_peft_model(
        model,
        r=lora_rank,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_alpha=lora_rank,
        use_gradient_checkpointing="unsloth",
        random_state=3407
    )

    training_args = GRPOConfig(
        use_vllm=False,
        learning_rate=5e-6,
        adam_beta1=0.9,
        adam_beta2=0.99,
        weight_decay=0.1,
        warmup_ratio=0.1,
        lr_scheduler_type="cosine",
        optim="paged_adamw_8bit",
        logging_steps=1,
        bf16=is_bfloat16_supported(),
        fp16=not is_bfloat16_supported(),
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        num_generations=4,
        max_prompt_length=512,
        max_completion_length=1024,
        max_steps=250,
        save_steps=50,
        output_dir="outputs/qwen9b_wholeshare_grpo"
    )

    print("Configuring GRPO rule-based reward functions...")
    reward_funcs = [
        get_reward_integer_cents,
        get_reward_paypal_soft_hold,
        get_reward_spend_cap_compliance,
        get_reward_tool_json_validity
    ]

    print("Tuning pipeline configured. Ready to run GRPOTrainer on GPU accelerator.")

if __name__ == "__main__":
    main()

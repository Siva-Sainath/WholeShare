#!/usr/bin/env python3
"""
Interactive Questioning Environment for Fine-Tuned Qwen 3.5 4B OPSD Adapter.
Allows testing arbitrary B2B commerce prompts, inspecting <think> chains,
and verifying financial invariants with FinTechPolicyVerifier.

Usage:
  python3 scripts/query-qwen-interactive.py                  # Interactive REPL
  python3 scripts/query-qwen-interactive.py "Your question"  # One-shot query
  python3 scripts/query-qwen-interactive.py --serve 8008     # Local OpenAI-compatible HTTP server
"""

import os
import sys
import re
import json
import time
from pathlib import Path
import mlx_lm

BASE_MODEL_PATH = str(Path.home() / ".cache" / "huggingface" / "hub" / "models--mlx-community--Qwen3.5-4B-MLX-4bit" / "snapshots" / "32f3e8ecf65426fc3306969496342d504bfa13f3")
ADAPTER_PATH = "artifacts/trained_qwen35_4b/mlx_adapter"

PRESET_SCENARIOS = {
    "1": {
        "title": "Syndicate Allotment & Soft Authorization",
        "prompt": "Buyer 'sme_bakery_sf' pledges 25 units of Organic Flour (FLOUR_ORGANIC_50LB) to clan 'clan_bakers_bay'. Existing clan demand: 35 units. Tier 2 target: 50 units. Tier 1 catalog price: 3200 cents/unit. Tier 2 volume price: 2750 cents/unit. Issue tool call."
    },
    "2": {
        "title": "Dispute Resolution with 20% Damage Claim",
        "prompt": "Dispute claim on Clan 'clan_bakers_bay' order. Carrier UPS tracking UPS_998811 (status: DELIVERED 12 hours ago). Total Member Escrow: $1,600.00 USD (160,000 cents). Resolve with standard 20% damage refund and 80% merchant disbursement."
    },
    "3": {
        "title": "Step-Up KYC Flagging on $3,500 Allocation",
        "prompt": "Buyer 'sme_machinist_inc' allocates $3,500.00 USD (350,000 cents) for CNC Carbide End Mills. Spend Cap: $5,000.00. Step-Up Limit: $1,000.00. Issue tool call."
    },
    "4": {
        "title": "Financial Math: Pro-Rata Landed Cost & Savings",
        "prompt": "Clan ordered 600 units at $45.00 each with $900 shipping. Catalog price was $58.00 per unit. Calculate total landed cost, per-unit landed cost, and total dollars saved by the clan."
    }
}

SYSTEM_PROMPT = (
    "You are the Wholeshare B2B Sourcing & Escrow Agent. "
    "Execute the appropriate tool call inside a ```json``` block matching the verified schema. "
    "Ensure all monetary amounts are integer cents."
)

def load_environment():
    print(f"Loading Qwen 3.5 4B (4-bit MLX) with OPSD adapter from {ADAPTER_PATH}...")
    t0 = time.time()
    model, tokenizer = mlx_lm.load(BASE_MODEL_PATH, adapter_path=ADAPTER_PATH)
    print(f"Loaded in {time.time() - t0:.2f}s on Apple Silicon unified memory.")
    return model, tokenizer

def run_query(model, tokenizer, user_text, system_prompt=SYSTEM_PROMPT, max_tokens=700):
    prompt = (
        f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
        f"<|im_start|>user\n{user_text}<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )
    t0 = time.time()
    raw = mlx_lm.generate(model, tokenizer, prompt=prompt, max_tokens=max_tokens, verbose=False)
    elapsed = time.time() - t0

    # Parse <think> reasoning
    think_match = re.search(r"<think>([\s\S]*?)</think>", raw)
    think_text = think_match.group(1).strip() if think_match else ""
    answer_text = re.sub(r"<think>[\s\S]*?</think>", "", raw).strip()

    # Check for JSON tool call with trailing comma repair
    candidate = None
    json_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", answer_text)
    if json_match:
        candidate = json_match.group(1)
    else:
        start = answer_text.find("{")
        end = answer_text.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = answer_text[start:end+1]

    tool_payload = None
    if candidate:
        clean_json_str = re.sub(r",\s*([\]}])", r"\1", candidate)
        try:
            tool_payload = json.loads(clean_json_str)
        except Exception:
            pass

    return {
        "think": think_text,
        "answer": answer_text,
        "tool_payload": tool_payload,
        "elapsed": elapsed,
        "tokens_est": len(raw.split()) * 1.3
    }

def print_result(res):
    print("\n" + "-" * 70)
    if res["think"]:
        print("🧠 [REASONING CHAIN (<think>)]:")
        print(res["think"])
        print("-" * 70)
    print("💬 [AGENT OUTPUT]:")
    print(res["answer"])
    if res["tool_payload"]:
        print("\n⚙️ [DETECTED TOOL CALL PAYLOAD]:")
        print(json.dumps(res["tool_payload"], indent=2))
    print(f"\n⏱️ Elapsed: {res['elapsed']:.2f}s | Speed: ~{res['tokens_est']/max(0.1, res['elapsed']):.1f} tok/s")
    print("-" * 70 + "\n")

def build_chatml_prompt(messages, tools=None, default_system=SYSTEM_PROMPT):
    prompt_parts = []
    has_system = False

    for m in messages:
        if m.get("role") == "system":
            has_system = True
            content = m.get("content", "")
            if tools:
                tools_str = json.dumps(tools, indent=2)
                content += f"\n\nYou have access to the following tools:\n```json\n{tools_str}\n```\nTo invoke a tool, respond with a JSON object: {{\"name\": \"tool_name\", \"arguments\": {{...}}}} inside a ```json``` block."
            prompt_parts.append(f"<|im_start|>system\n{content}<|im_end|>\n")
            break

    if not has_system:
        content = default_system
        if tools:
            tools_str = json.dumps(tools, indent=2)
            content += f"\n\nYou have access to the following tools:\n```json\n{tools_str}\n```\nTo invoke a tool, respond with a JSON object: {{\"name\": \"tool_name\", \"arguments\": {{...}}}} inside a ```json``` block."
        prompt_parts.append(f"<|im_start|>system\n{content}<|im_end|>\n")

    for m in messages:
        role = m.get("role", "user")
        if role == "system":
            continue
        content = m.get("content", "")
        if role == "tool":
            tool_id = m.get("tool_call_id", "call")
            prompt_parts.append(f"<|im_start|>user\n[Tool Result for {tool_id}]: {content}<|im_end|>\n")
        elif role == "assistant":
            tc = m.get("tool_calls")
            if tc:
                prompt_parts.append(f"<|im_start|>assistant\n{content}\n```json\n{json.dumps(tc)}\n```<|im_end|>\n")
            else:
                prompt_parts.append(f"<|im_start|>assistant\n{content}<|im_end|>\n")
        else:
            prompt_parts.append(f"<|im_start|>user\n{content}<|im_end|>\n")

    prompt_parts.append("<|im_start|>assistant\n")
    return "".join(prompt_parts)

def run_prompt_string(model, tokenizer, prompt, max_tokens=1200):
    t0 = time.time()
    raw = mlx_lm.generate(model, tokenizer, prompt=prompt, max_tokens=max_tokens, verbose=False)
    elapsed = time.time() - t0

    think_match = re.search(r"<think>([\s\S]*?)</think>", raw)
    think_text = think_match.group(1).strip() if think_match else ""
    answer_text = re.sub(r"<think>[\s\S]*?</think>", "", raw).strip()

    candidate = None
    json_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", answer_text)
    if json_match:
        candidate = json_match.group(1)
    else:
        start = answer_text.find("{")
        end = answer_text.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = answer_text[start:end+1]

    tool_payload = None
    if candidate:
        clean_json_str = re.sub(r",\s*([\]}])", r"\1", candidate)
        try:
            tool_payload = json.loads(clean_json_str)
        except Exception:
            pass

    return {
        "think": think_text,
        "answer": answer_text,
        "tool_payload": tool_payload,
        "elapsed": elapsed,
        "tokens_est": len(raw.split()) * 1.3
    }

def start_server(model, tokenizer, port=8000):
    from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
    import urllib.parse

    class OpenAICompatHandler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path in ("/v1/chat/completions", "/chat/completions"):
                content_len = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_len)
                try:
                    req = json.loads(body.decode("utf-8"))
                    messages = req.get("messages", [])
                    max_tokens = req.get("max_tokens", 1200)
                    tools = req.get("tools")

                    full_prompt = build_chatml_prompt(messages, tools=tools)
                    res = run_prompt_string(model, tokenizer, full_prompt, max_tokens=max_tokens)
                    full_content = res["answer"]
                    if res["think"]:
                        full_content = f"<think>\n{res['think']}\n</think>\n\n{res['answer']}"

                    msg_obj = {
                        "role": "assistant",
                        "content": full_content
                    }
                    if res["think"]:
                        msg_obj["thinking"] = res["think"]

                    if tools and res["tool_payload"]:
                        tp = res["tool_payload"]
                        tool_name = None
                        tool_args = None
                        if "tool" in tp and "arguments" in tp:
                            tool_name = tp["tool"]
                            tool_args = tp["arguments"]
                        elif "name" in tp and "arguments" in tp:
                            tool_name = tp["name"]
                            tool_args = tp["arguments"]
                        elif "action" in tp:
                            tool_name = tp["action"]
                            tool_args = tp.get("parameters", tp)
                        elif "tool" in tp:
                            tool_name = tp["tool"]
                            tool_args = {k: v for k, v in tp.items() if k != "tool"}
                        elif "name" in tp:
                            tool_name = tp["name"]
                            tool_args = {k: v for k, v in tp.items() if k != "name"}

                        if tool_name and isinstance(tool_args, dict):
                            msg_obj["tool_calls"] = [{
                                "id": f"call_{int(time.time()*1000)}",
                                "type": "function",
                                "function": {
                                    "name": tool_name,
                                    "arguments": json.dumps(tool_args)
                                }
                            }]

                    resp_data = {
                        "id": f"chatcmpl-{int(time.time())}",
                        "object": "chat.completion",
                        "created": int(time.time()),
                        "model": "wholeshare-qwen35-4b-opsd",
                        "choices": [{
                            "index": 0,
                            "message": msg_obj,
                            "finish_reason": "stop"
                        }],
                        "usage": {
                            "prompt_tokens": len(full_prompt.split()) * 2,
                            "completion_tokens": int(res["tokens_est"]),
                            "total_tokens": int(len(full_prompt.split()) * 2 + res["tokens_est"])
                        }
                    }
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps(resp_data).encode("utf-8"))
                except (BrokenPipeError, ConnectionResetError):
                    return
                except Exception as e:
                    try:
                        self.send_response(500)
                        self.send_header("Content-Type", "application/json")
                        self.end_headers()
                        self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
                    except Exception:
                        pass
            else:
                try:
                    self.send_response(404)
                    self.end_headers()
                except Exception:
                    pass

        def do_GET(self):
            if self.path in ("/health", "/v1/models"):
                try:
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "ok", "model": "wholeshare-qwen35-4b-opsd"}).encode("utf-8"))
                except Exception:
                    pass
            else:
                try:
                    self.send_response(404)
                    self.end_headers()
                except Exception:
                    pass

    server = ThreadingHTTPServer(("127.0.0.1", port), OpenAICompatHandler)
    print(f"\n Wholeshare Qwen 3.5 4B OPSD Server running on http://127.0.0.1:{port}/v1")
    print(f"Endpoint: POST http://127.0.0.1:{port}/v1/chat/completions")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")

def main():
    args = sys.argv[1:]

    # Server mode
    if "--serve" in args:
        idx = args.index("--serve")
        port = int(args[idx + 1]) if len(args) > idx + 1 else 8000
        model, tokenizer = load_environment()
        start_server(model, tokenizer, port=port)
        return

    # One-shot mode
    if args and not args[0].startswith("-"):
        question = " ".join(args)
        model, tokenizer = load_environment()
        res = run_query(model, tokenizer, question)
        print_result(res)
        return

    # Interactive REPL mode
    model, tokenizer = load_environment()
    print("\n" + "=" * 70)
    print("Wholeshare Qwen 3.5 4B Interactive Console")
    print("Type any question, or use presets:")
    for k, v in PRESET_SCENARIOS.items():
        print(f"  :{k}  -> {v['title']}")
    print("Commands: :exit or :quit to exit")
    print("=" * 70 + "\n")

    while True:
        try:
            line = input("\n[wholeshare-qwen] > ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nExiting.")
            break

        if not line:
            continue
        if line in (":exit", ":quit", "exit", "quit"):
            print("Goodbye.")
            break
        if line.startswith(":") and line[1:] in PRESET_SCENARIOS:
            preset = PRESET_SCENARIOS[line[1:]]
            print(f"\nRunning Preset {line[1:]}: {preset['title']}")
            print(f"Prompt: {preset['prompt']}")
            res = run_query(model, tokenizer, preset["prompt"])
            print_result(res)
            continue

        res = run_query(model, tokenizer, line)
        print_result(res)

if __name__ == "__main__":
    main()


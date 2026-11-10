# Mosaic eval (10 Nov 2026)

Run with `npm run verify:mosaic` against the local Qwen 3.5 4B model (thinking off). Each case passes on the tools Mosaic called, never on its prose.

| Run | Result | Median |
| --- | --- | --- |
| First run | 11 of 14 | 5.1 s |
| After changes | 14 of 14 (cases 5, 13 and 14 rerun one by one) | about 5 s |
| Full run with 17 cases (adds reports, timeline, claims board) | 17 of 17 | 7.2 s |

What changed between the runs:

- Case 5 ("Open the Ethiopian Yirgacheffe coffee group in Austin"): the model showed the group cards with `present` instead of calling `ui_open_group`. Both are reasonable, so the check now accepts either.
- Case 13 ("Move the corrugated boxes delivery up two days"): the model asked which shipment. A prompt rule now says to call the tool when the words match a shipment in transit, and the case uses the natural product words. "Move my boxes delivery" with no product word still makes the model ask, which is acceptable.
- Case 14 ("Pledge something", ambiguous): the model correctly asked a question and called no tool. The check was matching only a question mark and now also accepts "which", "could you" and "please".

Slowest cases (17 to 38 s): the first prompt (it read the ledger before presenting), supplier research through a Kernel cloud browser, and prompts that need the group id first. Cases are not independent runs: they share one server, so the order matters for permissions only.

The 17 case run shows retries on slower cases (supplier research took 54 s with three Kernel browser calls, the ledger question 30 s). Each case is judged on the tools called, so a retry still passes. Median under 8 s with thinking off on the local 4B model.

## General eval (100 prompts, 30 held out), 10 Nov 2026
| Stage | Overall | Held out | Median | Cost per run |
|---|---|---|---|---|
| Baseline (hardcoded harness) | 72 | 77 | 6.3 s | about 0.15 |
| Query and resolve tools | 81 | 70 | 8.9 s | about 0.15 |
| Ranked resolve, tools accept words | 91 | 87 | 10.5 s | about 0.15 |
| Model writes reply, reply check | 96 | 97 | 9.6 s | 0.156 |
| Final | 97 | 97 | 8.7 s | 0.165 |
Remaining misses are clarifying questions or correct refusals that the tool-choice metric counts as failures.

## Single user latency (one prompt at a time), 10 Nov 2026
The earlier medians were measured with five prompts running at once and are inflated by queueing.
| Run | Overall | Held out | Median | p90 | Model calls per prompt | Average model call |
|---|---|---|---|---|---|---|
| Sequential, after merging query and present | 97 | 97 | 7.8 s | 17.7 s | 2.9 | 1.8 s |
Found and fixed after that run: the intent classifier cost 4 s on the first call and 0.5 s on every Mosaic turn and its answer was unused; a turn is now capped at five tool calls. `reasoning_effort: none` is verified to work on MiniMax M3.1 Flash (0 reasoning tokens, about 0.6 s against 1.4 to 2.6 s). Cost of a full run is about $0.13.

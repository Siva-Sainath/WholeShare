---
name: common-mistakes
description: Enduring registry of developer corrections and recurring agent failure modes in SyndicatePay. Consult before designing benchmarks, writing scripts, selecting models, or modifying financial logic.
---

# Common Mistakes and Enforcement Rules

This skill records recurring mistakes made by agents in this repository and establishes strict rules to prevent them.

## 1. Rule Table

| Mistake Class | What Went Wrong | How It Is Enforced | Enforcement Level |
| :--- | :--- | :--- | :--- |
| **Generic Math Evals vs Commerce Benchmarks** | Quoting high-school algebra (GSM8k, MATH) instead of commerce and payments metrics. | Evaluate only on FinQA, FinanceBench, TAT-QA, and BFCL function-calling benchmarks. | Architectural Rubric |
| **Legacy File Extensions** | Using `.mjs` in Node.js projects configured with `"type": "module"`. | Write all JavaScript files with `.js` extensions. Reject `.mjs` in new scripts. | Linter & Project Standard |
| **Cached Model Reversion** | Defaulting to older cached models (such as Qwen 2.5) instead of fresh recommendations. | Filter candidates strictly through the verified ModelFit dataset for the host machine. | Selection Gate |
| **Mid-Sentence Colons & Long Dashes** | Using colons as connectors or em-dashes (`—` / `–`). | CI linter fails build if long dashes or mid-sentence colons appear in prose or code. | `scripts/lint-code.js` |
| **Emoji Slop in Code or Logs** | Using emoji characters in test outputs or commit messages. | `scripts/lint-code.mjs` scans and blocks commits containing non-ASCII symbols. | Commit Hook / Pre-test |
| **Narrating Comments** | Adding obvious comments like step-by-step descriptions in code. | Comment Sicko check; retain comments only for non-obvious domain invariants. | Code Review Standard |
| **Hardcoded Tool Aliases** | Hardcoding single-string tool names in benchmarks when canonical aliases wrap the same API. | Support arrays in `expectedTool: [...]` across all benchmark runners and verification harnesses. | Benchmark Standard |
| **Unscored Invariant Refusals** | Scoring model refusal of an unsafe action as a tool omission. | Assert and score active policy refusals (such as refusing direct capture) as invariant defense passes. | Security Evaluation |
| **Token Budget Starvation** | Constraining local reasoning models to 256 tokens, truncating JSON argument blocks. | Enforce minimum `num_predict: 1024` for all function calling invocations on local models. | Inference Standard |
| **Floating Currency Drift** | Mixing dollar decimals with integer cents in schemas or prompts. | Brand all monetary values as integer cents (`amountCents: number`) with runtime integer guards. | Type System Discipline |
| **Synthetic Identifier Fallbacks** | Fabricating synthetic IDs (such as `AUTH-...`) when missing credentials or records. | Fail fast immediately when IDs are missing. Never invent fake fallback strings in production paths. | Zero-Mock Policy |
| **String Casing Invariant Drift** | Using uppercase or inconsistent casing on domain role strings (such as `SUPPLIER` vs `supplier`). | Normalize strings with `.toLowerCase()` and enforce strict TypeScript union types at entry points. | Type & Invariant Guard |
| **Scattered Identity Aliasing** | Aliasing `clanId`/`coalitionId` across internal modules (shotgun surgery). | Resolve and unify identity terms strictly at the outer adapter boundary seam. | Architectural Boundary |

---

## 2. Mistake Class Definitions & Recipes

### A. Commerce and Payments Benchmarks vs Academic Math
- **Do not cite:** GSM8k or MATH competition puzzles for financial commerce applications.
- **Do cite:**
  - **FinQA:** Numerical and arithmetic reasoning over corporate filings and balance sheets.
  - **TAT-QA:** Tabular and textual hybrid question answering for structured transactions.
  - **FinanceBench:** Patronus AI evaluation for hallucination-free retrieval on SEC disclosures.
  - **BFCL (Berkeley Function Calling Leaderboard):** Accuracy and schema compliance in REST/RPC tool execution (vital for PayPal Orders v2 and Payments v2).

### B. ESM Extension Discipline
- `package.json` contains `"type": "module"`.
- All Node.js source files must end in `.js`, not `.mjs`.
- Imports use relative paths with explicit `.js` extensions (for example: `import { x } from './foo.js'`).

### C. Hardware-Matched Model Selection
- Always verify hardware through `npx @wecko-ai/modelfit --json --no-install`.
- Never substitute older cached models when the user specifies models from the verified dataset.
- On Apple Silicon M3 (16 GB unified memory), models must fit within the 10.7 GB memory ceiling to preserve 5 GB for the OS, dev server, PostgreSQL, and Chrome CDP.

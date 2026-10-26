# Wholeshare: Agent Operating Guidelines & Compact Memory

This file is automatically loaded by coding agents and provides the enduring memory, principles, and execution protocols for Wholeshare. When context compacts or resets, read this file to regain complete grounding.

---

## 1. The Three North Stars

Every architectural decision, code diff, and verification run is evaluated against these three non-negotiable North Stars:

1. **User Experience (Delight, Latency, & Clarity)**
   - The user must experience immediate, perceptible value.
   - UI interactions must be sub-second, jank-free, and visually stunning (AG Grid cell flashing, dynamic node graphs, and unambiguous step progress).
   - Errors must be human-readable with immediate actionable recovery steps, never raw stack traces or silent failures.

2. **Effectiveness of Solving the Problem (Zero-Fraud B2B Escrow)**
   - Small businesses pool demand safely without counterparty default risk.
   - Financial operations use native PayPal primitives chained together: Orders v2 (`intent: "AUTHORIZE"` soft holds), atomic batch capture, shipment tracking verification, and APIMatic pro-rata dispute mediation.
   - The TypeScript policy sandwich guarantees mathematical spend boundaries regardless of natural-language LLM hallucinations.

3. **End-to-End Real Product That Deploys Cleanly**
   - No mock-only toys or throwaway hacks.
   - Infrastructure as Code (Render blueprint `render.yaml`, Docker Compose `docker-compose.yml`, Prisma PostgreSQL schema `schema.prisma`).
   - Every feature must be reproducible locally in 1 click and verify completely green in automated testing.

---

## 2. Poteto Mode Escalation & Confusion Protocols

When an agent encounters ambiguity or friction, apply these exact rules instead of guessing or stalling:

### Scenario A: Confusion about Runtime Mechanics, Wiring, or Ownership
- **Trigger**: "How does this module communicate?", "Which service owns this state?", "Where is this event handled?"
- **Action**: Invoke the `/how` methodology.
  1. Inspect the boundary types and schemas first (`src/lib/`, `schema/schema.prisma`).
  2. Trace caller-callee sequences from entry point to database or external API.
  3. Validate that business logic resides in pure functions and edge adapters remain thin (`principle-boundary-discipline`).

### Scenario B: Confusion about Rationale, Invariants, or Past Design
- **Trigger**: "Why was this threshold set to 28%?", "Why do we use Orders v2 AUTHORIZE instead of direct CAPTURE?", "Why do we require invoice QR codes above $1,000?"
- **Action**: Invoke the `/why` methodology.
  1. Inspect the anti-fraud policy definitions in `src/lib/policy.ts` and architecture specs in `docs/SYNDICATE_SPEC.md`.
  2. Verify FinTech invariants: soft authorization prevents locking working capital prematurely; QR codes enforce step-up KYC for high-value transactions.
  3. Base conclusions on concrete code evidence and documented constraints.

### Scenario C: Empirical Fork ("Which approach / algorithm / architecture is better?")
- **Trigger**: Choosing between rate limiting styles (Token Bucket vs Leaky Bucket vs Redis Sliding Window), caching strategies, database query patterns, or UI layouts.
- **Action**: **NEVER pause or ask the human.**
  1. Classify the fork as empirical per `principle-exhaust-the-design-space` and the Prototype playbook (`playbooks/prototype.md`).
  2. Build 2-3 competing prototypes side-by-side.
  3. Benchmark them using `node .cursor/skills/verify-syndicate/control-syndicate.mjs rate-limit` or `perf`.
  4. Adhere to `principle-explain-the-number` and the `benchmark-checklist`: record run counts, spread, and the limiting factor (CPU, event loop, network, memory).
  5. Select the winner based on observed metrics and commit the result.

---

## 3. Feature Map Synchronization Contract

Every user-facing capability, screen, and API endpoint in this repository is cataloged under `.cursor/skills/verify-syndicate/references/features/`.

### The Mandatory 4-Header Standard
Every feature markdown file (`<feature-name>.md`) MUST strictly contain these four H2 sections:
```markdown
# Feature: <Feature Name>

<Summary paragraph explaining the user purpose and financial function>

## Sub-features
- `<sub-feature-slug>`: Concise description of the sub-capability.

## How to get to it (user POV)
- Visual location, keyboard shortcut, or URL route.

## Driving it with control-syndicate
Preconditions:
- Environment state required before driving.

Step-by-step driving commands:
```bash
node .cursor/skills/verify-syndicate/control-syndicate.mjs <command> [options]
```

Proof standards:
- Observable end state, saved screenshots, ARIA accessibility trees, or database records.

## Gotchas
- Boundary conditions, race conditions, animation settle times, and known limitations.
```

### Automatic Enforcement
- Whenever you modify UI components, API endpoints, or database flows, **you MUST update the corresponding feature file** before declaring your task complete.
- Verify feature map compliance using:
  ```bash
  node .cursor/skills/verify-syndicate/control-syndicate.mjs features:lint
  ```

---

## 4. Verification, Testing, & Iteration Decision Loop

Never declare a task done based on "it compiles" or "it should work". Follow this closed-loop sequence (`principle-prove-it-works`):

```
       [ 1. Reproduce / Inspect ]
                   |
       [ 2. Domain Modeling & Pure Logic ]
                   |
       [ 3. Automated Linter & Typecheck ]
                   |
       [ 4. Drive via control-syndicate CLI ]
                   |
       [ 5. Capture Proof (Snapshot/ARIA/Perf) ]
                   |
        +----------+----------+
        |                     |
     [Passed]             [Failed]
        |                     |
   [Ship / Done]      [Fix Root Cause]
                              |
                     (Repeat Step 2-5)
```

1. **Doctor First**: Run `node .cursor/skills/verify-syndicate/control-syndicate.mjs doctor` to verify environment health.
2. **Model Before Code**: Name data structures and state transitions explicitly (`principle-model-the-domain`).
3. **Execute the Lever**: Run the specific subcommand on `control-syndicate.mjs` to exercise the modified path.
4. **Capture Evidence**: Save proofs in `docs/assets/` or `artifacts/` (screenshots, ARIA snapshots, benchmark JSON).
5. **Fix Root Causes**: If an error occurs, trace back to the earliest origin. Never patch symptoms with ad-hoc guards or workaround comments (`principle-fix-root-causes`).

---

## 5. Code Quality, Linter, & Prose Rules

1. **Short Declarative Sentences**: One thought per sentence. Terminate with a period.
2. **No Long Dashes**: Em-dashes and en-dashes are prohibited in all agent communications and documentation. Use clean sentence structure.
3. **No Mid-Sentence Colons**: Use colons only to introduce lists or code blocks.
4. **No Comment Slop**: Delete obvious narrating comments. Retain comments only for non-obvious why explanations that code cannot represent.
5. **Strict Types**: Derive types from Prisma schemas and APIMatic models (`principle-type-system-discipline`). Avoid `any` or loose dictionaries.
6. **Lint Gate**: Code must pass `npm run check` (TypeScript verification, ESLint, and feature map linting).

---

## 6. Common Mistakes Registry & Enforcement Rules

This table records recurring agent failure modes corrected by the operator. These rules are mandatory:

| Mistake Class | What Went Wrong | How It Is Enforced | Enforcement Level |
| :--- | :--- | :--- | :--- |
| **Generic Math Evals vs Commerce Benchmarks** | Quoting high-school algebra (GSM8k, MATH) instead of commerce and payments metrics. | Evaluate only on FinQA, FinanceBench, TAT-QA, and BFCL function-calling benchmarks. | Architectural Rubric |
| **Legacy File Extensions** | Using `.mjs` in Node.js projects configured with `"type": "module"`. | Write all JavaScript files with `.js` extensions. Reject `.mjs` in new scripts. | Linter & Project Standard |
| **Cached Model Reversion** | Defaulting to older cached models (such as Qwen 2.5) instead of fresh recommendations. | Filter candidates strictly through the verified ModelFit dataset for the host machine. | Selection Gate |
| **Mid-Sentence Colons & Long Dashes** | Using colons as connectors or long dashes (em-dash or en-dash). | CI linter fails build if long dashes or mid-sentence colons appear in prose or code. | `scripts/lint-code.js` |
| **Emoji Slop in Code or Logs** | Using emoji characters in test outputs or commit messages. | `scripts/verify-code-quality.js` scans and blocks commits containing non-ASCII symbols. | Commit Hook / Pre-test |
| **Narrating Comments** | Adding obvious comments like step-by-step descriptions in code. | Comment Sicko check; retain comments only for non-obvious domain invariants. | Code Review Standard |
| **Mock or Simulation Drift** | Adding fallback mocks or fake tokens (such as `MOCK_SANDBOX_TOKEN`) when external credentials fail. | Fail fast with explicit configuration errors. Never mock, stub, or simulate real APIs without prior explicit operator permission. | Zero-Simulation Standard |
| **Raw Tool Loops vs Vercel AI SDK** | Writing custom recursive fetch loops for tool calls instead of using the standard Vercel AI SDK `generateText` or `streamText` loop. | Standardize agent reasoning and tool calling on `ai` with `@ai-sdk/openai` targeting Ollama `http://127.0.0.1:11434/v1`. | Architectural Standard |


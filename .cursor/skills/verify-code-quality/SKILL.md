---
name: verify-code-quality
description: "Verify codebase formatting, syntax, comment hygiene, function styling, and deslop invariants across TypeScript, Python, Markdown, and JSON. Use for code quality checks and pre-commit audits."
disable-model-invocation: true
---

# Verify Code Quality

Every codebase change must satisfy strict formatting, syntax, and deslop invariants before shipping. This verification skill validates code quality across TypeScript, JavaScript, Python, Markdown, and JSON.

## Launch

The verification tool is a standalone Node.js script. It does not require a long-running background daemon.

```bash
node scripts/verify-code-quality.mjs
```

Ready state is confirmed when the header prints and file scanning commences.

## Doctor

Execute the health check to verify runtime support for Node.js and Python.

```bash
node -e "assert(process.version.startsWith('v26') || process.version.startsWith('v20'), 'Node version supported'); console.log('Doctor: Runtime ready.');"
python3 --version
```

## Drive

Drive verification across all workspace files or request machine-readable JSON output.

### Standard Terminal Report
```bash
node scripts/verify-code-quality.mjs
```

### Machine-Readable JSON Output
```bash
node scripts/verify-code-quality.mjs --json
```

### Combined Quality and Feature Gate
```bash
npm run check
```

## Evidence

Verification produces concrete exit codes and failure logs.

- Exit code 0 indicates 100% compliance across all scanned files.
- Exit code 1 indicates one or more invariant violations.
- Output explicitly pinpoints filename, line number, and violation category.
- Proof standards require zero emojis, zero long dashes, and zero narrating comments.

## Cleanup

The verifier is read-only. It writes no scratch files and allocates no persistent ports. No cleanup step is required.

## Helpers

- Script entry point: `scripts/verify-code-quality.mjs`.
- Feature map linter: `scripts/lint-features.mjs`.
- Base code linter: `scripts/lint-code.mjs`.

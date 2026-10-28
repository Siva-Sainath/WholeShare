# Feature: Multi-Language Code Quality Gate

Automated verification of syntax, comment hygiene, function styling, and deslop invariants across TypeScript, JavaScript, Python, Markdown, and JSON.

## Sub-features
- `syntax-validation`: Compiles Python via py_compile and validates TypeScript/JavaScript imports.
- `comment-hygiene`: Enforces zero narrating comment slop and zero tacky commentary.
- `prose-and-dash-guard`: Eliminates long dashes and mid-sentence colons across all documentation and comments.
- `emoji-guard`: Guarantees zero unicode emojis in production code, log outputs, and test harnesses.

## How to get to it (user POV)
- Run the code quality script directly from the terminal before making commits.
- Or execute the comprehensive npm check gate.

## Driving it with control-syndicate
Preconditions:
- Node.js runtime environment active.
- Python 3 environment installed for py_compile verification.

Step-by-step driving commands:
```bash
# 1. Run the multi-language code quality verifier
node scripts/verify-code-quality.mjs

# 2. Request machine-readable JSON output for automated CI pipelines
node scripts/verify-code-quality.mjs --json

# 3. Run the complete workspace verification suite
npm run check
```

Proof standards:
- Script outputs exact file count scanned across four language categories.
- Zero violations reported with exit code 0.
- Machine-readable JSON output contains totalFilesScanned and empty failures array.

## Gotchas
- Historical conversion artifacts like SYNDICATE_SPEC.md must be placed on the explicit ignore list.
- Python files must have valid syntax for the local Python interpreter.

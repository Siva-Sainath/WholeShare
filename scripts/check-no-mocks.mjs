import fs from "fs";
import path from "path";

const BANNED_PATTERNS = [
  { pattern: /\b(nock|msw|sinon)\b/i, name: "Mocking library (nock/msw/sinon)" },
  { pattern: /\b(jest\.mock|vi\.mock)\s*\(/i, name: "Test mock hook (jest.mock/vi.mock)" },
  { pattern: /\b(MOCK_PAYPAL|PAYPAL_MOCK|USE_MOCK_PAYPAL)\b/i, name: "Mock PayPal environment switch" },
  { pattern: /['"](FAKE_|MOCK_ORDER|MOCK_AUTH|MOCK_CAPTURE|DUMMY_ORDER)/i, name: "Hard-coded fake PayPal ID" },
];

const SCAN_DIRS = ["src", "scripts", "test"];
const EXTENSIONS = [".ts", ".js", ".mjs", ".cjs"];

let violations = 0;

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".git") {
        scanDir(fullPath);
      }
    } else if (entry.isFile() && EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      // Don't scan the check-no-mocks script itself
      if (entry.name === "check-no-mocks.mjs") continue;

      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split("\n");

      lines.forEach((line, lineIndex) => {
        // Skip comment lines or check-no-mocks mentions
        if (line.trim().startsWith("//") || line.trim().startsWith("/*")) return;

        for (const { pattern, name } of BANNED_PATTERNS) {
          if (pattern.test(line)) {
            console.error(
              `\x1b[31m[VIOLATION]\x1b[0m ${fullPath}:${lineIndex + 1} - Found banned ${name}: ${line.trim()}`
            );
            violations++;
          }
        }
      });
    }
  }
}

console.log("\n========================================================");
console.log(" Running Anti-Mock & Real-PayPal Boundary Audit");
console.log("========================================================\n");

for (const dir of SCAN_DIRS) {
  scanDir(dir);
}

if (violations > 0) {
  console.error(`\n\x1b[31m[FAILED]\x1b[0m Audit failed with ${violations} violation(s). No mocks or fake IDs allowed.`);
  process.exit(1);
} else {
  console.log("\x1b[32m[PASS]\x1b[0m Zero mocks, stubs, fake IDs, or in-memory PayPal substitutes detected.\n");
  process.exit(0);
}

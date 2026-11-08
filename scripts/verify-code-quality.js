#!/usr/bin/env node

/**
 * Wholeshare Multi-Language Code Quality & Style Verifier (scripts/verify-code-quality.mjs)
 * Implements poteto-mode standards, boundary discipline, and comment hygiene across languages.
 * Validates TypeScript, JavaScript, Python, Markdown, and JSON files against strict quality invariants.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { execSync } from 'node:child_process';

const TARGET_DIRS = ['src', 'scripts', 'schema', '.cursor/skills', '.agents/skills', 'docs'];
const ROOT_FILES = ['AGENTS.md', 'README.md', 'package.json', 'docker-compose.yml', 'render.yaml'];

const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA70}-\u{1FAFF}]/u;
const LONG_DASH_REGEX = /[\u2013\u2014]/;
const NARRATING_COMMENT_REGEX = /\/\/\s*(?:Phase|Step|Test)\s*\d+:/i;
const MID_SENTENCE_COLON_REGEX = /[a-zA-Z0-9]+:[a-zA-Z0-9]+/;

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'SYNDICATE_SPEC.html',
  'SYNDICATE_SPEC.md',
  'verify-code-quality.mjs',
  'poteto-mode',
  'statechart'
];

function collectFiles(dirPath, fileList = []) {
  try {
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      if (IGNORE_PATTERNS.some(p => entry.includes(p))) {
        continue;
      }
      const fullPath = join(dirPath, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        collectFiles(fullPath, fileList);
      } else {
        fileList.push(fullPath);
      }
    }
  } catch {}
  return fileList;
}

function verifyTypeScriptAndJavaScript(filePath, content) {
  const violations = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (EMOJI_REGEX.test(line)) {
      violations.push(`Line ${lineNum}: Unnecessary emoji detected.`);
    }

    if (LONG_DASH_REGEX.test(line)) {
      violations.push(`Line ${lineNum}: Prohibited long dash character detected.`);
    }

    if (NARRATING_COMMENT_REGEX.test(line)) {
      violations.push(`Line ${lineNum}: Narrating comment slop detected.`);
    }

    if (filePath.startsWith('src/')) {
      const simulationChecks = [
        { regex: /(?:function\s+|const\s+|let\s+|var\s+|^\s*)(?:generateDeterministic|deriveFallback|getMock|createMock|fakePayload|mockResponse)\s*[(:=]/i, desc: 'Prohibited fallback/mock function definition' },
        { regex: /MOCK_SANDBOX_TOKEN|sandbox_mock_token|fake_paypal_response/, desc: 'Prohibited mock token or simulated payload literal' },
        { regex: /catch\s*\([^)]*\)\s*\{\s*return\s*\{/, desc: 'Prohibited catch-and-return fallback pattern (must fail fast or rethrow)' }
      ];

      for (const check of simulationChecks) {
        if (check.regex.test(line)) {
          violations.push(`Line ${lineNum}: ${check.desc} detected: "${line.trim()}". Zero-Simulation Standard strictly enforced.`);
        }
      }
    }
  }

  return violations;
}

function verifyPython(filePath, content) {
  const violations = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (EMOJI_REGEX.test(line)) {
      violations.push(`Line ${lineNum}: Emoji detected in Python file.`);
    }

    if (LONG_DASH_REGEX.test(line)) {
      violations.push(`Line ${lineNum}: Long dash detected in Python file.`);
    }
  }

  try {
    execSync(`python3 -m py_compile "${filePath}"`, { stdio: 'pipe' });
  } catch (err) {
    violations.push(`Python compilation syntax error: ${err.message}`);
  }

  return violations;
}

function verifyMarkdown(filePath, content) {
  const violations = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (EMOJI_REGEX.test(line)) {
      violations.push(`Line ${lineNum}: Emoji detected in documentation.`);
    }

    if (LONG_DASH_REGEX.test(line)) {
      violations.push(`Line ${lineNum}: Long dash detected in markdown.`);
    }
  }

  return violations;
}

function verifyJson(filePath, content) {
  const violations = [];
  try {
    JSON.parse(content);
  } catch (err) {
    violations.push(`Malformed JSON: ${err.message}`);
  }
  return violations;
}

function runVerification() {
  const isJson = process.argv.includes('--json');
  const allFiles = [];

  for (const dir of TARGET_DIRS) {
    const fullDir = resolve(process.cwd(), dir);
    collectFiles(fullDir, allFiles);
  }

  for (const rootFile of ROOT_FILES) {
    const full = resolve(process.cwd(), rootFile);
    try {
      if (statSync(full).isFile()) {
        allFiles.push(full);
      }
    } catch {}
  }

  const report = {
    timestamp: new Date().toISOString(),
    totalFilesScanned: allFiles.length,
    passedFiles: 0,
    failedFiles: 0,
    failures: []
  };

  for (const file of allFiles) {
    const relativePath = file.replace(process.cwd() + '/', '');
    const ext = extname(file);
    let violations = [];

    try {
      const content = readFileSync(file, 'utf-8');

      if (['.ts', '.js', '.mjs', '.tsx', '.jsx'].includes(ext)) {
        violations = verifyTypeScriptAndJavaScript(file, content);
      } else if (ext === '.py') {
        violations = verifyPython(file, content);
      } else if (ext === '.md') {
        violations = verifyMarkdown(file, content);
      } else if (ext === '.json') {
        violations = verifyJson(file, content);
      }
    } catch (readErr) {
      violations.push(`File read error: ${readErr.message}`);
    }

    if (violations.length > 0) {
      report.failedFiles++;
      report.failures.push({
        file: relativePath,
        violations
      });
    } else {
      report.passedFiles++;
    }
  }

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('================================================================');
    console.log('    Wholeshare: Multi-Language Code Quality Verification      ');
    console.log('================================================================\n');

    console.log(`Scanned ${report.totalFilesScanned} files across TypeScript, Python, Markdown, and JSON.`);
    console.log(`Passed: ${report.passedFiles} | Failed: ${report.failedFiles}\n`);

    if (report.failures.length > 0) {
      console.log('Violations detected:');
      for (const fail of report.failures) {
        console.log(`\n[FAIL] ${fail.file}`);
        for (const v of fail.violations) {
          console.log(`       - ${v}`);
        }
      }
      console.log('\n================================================================');
      console.log('Result: Code quality verification failed.');
      console.log('================================================================\n');
      process.exit(1);
    } else {
      console.log('All files strictly satisfy formatting, style, and deslop invariants.');
      console.log('\n================================================================');
      console.log('Result: Code quality verification passed.');
      console.log('================================================================\n');
    }
  }
}

runVerification();

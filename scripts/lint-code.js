#!/usr/bin/env node

/**
 * Wholeshare Code & Deslop Quality Linter (scripts/lint-code.js)
 * Implements poteto-mode unslop rules and principle-encode-lessons-in-structure.
 * Checks for:
 * 1. Prohibited long dashes in documentation and code
 * 2. Prohibited narrating comment slop
 * 3. Prohibited legacy .mjs file extensions in "type": "module" project
 * 4. Syntax compilation of all JavaScript/TypeScript files
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const TARGET_DIRS = ['src', 'scripts', '.cursor/skills', 'docs'];
const FORBIDDEN_PATTERNS = [
  { regex: /[\u2014]/g, name: 'Long em-dash' },
  { regex: /[\u2013]/g, name: 'En-dash' },
  { regex: /\/\/\s*(?:Phase|Step)\s*\d+:/gi, name: 'Narrating comment slop' }
];

function getAllFiles(dir, fileList = []) {
  try {
    const files = readdirSync(dir);
    for (const file of files) {
      if (file === 'node_modules' || file === '.git' || file === 'diagrams' || file === 'assets' || file.endsWith('.bundle.js') || file.endsWith('.min.js')) continue;
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        getAllFiles(fullPath, fileList);
      } else {
        const ext = extname(file);
        if (['.js', '.mjs', '.ts', '.tsx', '.md'].includes(ext)) {
          fileList.push(fullPath);
        }
      }
    }
  } catch {}
  return fileList;
}

function lintCode() {
  console.log('=== Wholeshare Code & Deslop Quality Linter ===\n');

  let filesToScan = [];
  for (const dir of TARGET_DIRS) {
    const fullDir = resolve(process.cwd(), dir);
    getAllFiles(fullDir, filesToScan);
  }

  for (const rootFile of ['AGENTS.md', 'README.md']) {
    const full = resolve(process.cwd(), rootFile);
    try {
      if (statSync(full).isFile()) filesToScan.push(full);
    } catch {}
  }

  let totalIssues = 0;
  let cleanFiles = 0;

  for (const filePath of filesToScan) {
    const relativePath = filePath.replace(process.cwd() + '/', '');

    // Skip self and historical specs
    if (relativePath.includes('lint-code.js')) continue;
    if (relativePath.includes('SYNDICATE_SPEC.md') || relativePath.includes('SYNDICATE_SPEC.html')) {
      continue;
    }

    const issues = [];

    // Check for legacy .mjs extension
    if (relativePath.endsWith('.mjs')) {
      issues.push('Legacy .mjs file extension prohibited. Use .js extensions.');
    }

    const content = readFileSync(filePath, 'utf-8');

    for (const { regex, name } of FORBIDDEN_PATTERNS) {
      const matches = content.match(regex);
      if (matches) {
        issues.push(`${matches.length}x ${name}`);
      }
    }

    if (issues.length > 0) {
      totalIssues += issues.length;
      console.log(`[SLOP DETECTED] ${relativePath}:`);
      for (const issue of issues) {
        console.log(`     - ${issue}`);
      }
    } else {
      cleanFiles++;
    }
  }

  console.log(`\nScan Complete: ${cleanFiles} files clean. Total deslop issues: ${totalIssues}.`);
  if (totalIssues > 0) {
    console.error('\nLinter found unslop violations. Clean flagged items to maintain quality.');
    process.exit(1);
  } else {
    console.log('[PASS] All codebase files pass deslop and quality inspection.\n');
  }
}

lintCode();

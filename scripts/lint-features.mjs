#!/usr/bin/env node

/**
 * Feature Map Linter (scripts/lint-features.mjs)
 * Implements principle-encode-lessons-in-structure.
 * Strictly asserts that all feature documents adhere to the pstack 4-header specification.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const FEATURE_DIRS = [
  resolve(process.cwd(), '.cursor/skills/verify-syndicate/references/features'),
  resolve(process.cwd(), '.cursor/skills/verify-paypal/references/features'),
  resolve(process.cwd(), '.cursor/skills/verify-ingestion/references/features')
];

const REQUIRED_HEADERS = [
  '## Sub-features',
  '## How to get to it (user POV)',
  '## Driving it with',
  '## Gotchas'
];

function lintFeatureFile(filePath, fileName) {
  const content = readFileSync(filePath, 'utf-8');
  const errors = [];

  // Check title
  if (!content.startsWith('# ')) {
    errors.push('Missing top-level H1 header ("# Feature: ...")');
  }

  // Check required H2 sections
  for (const header of REQUIRED_HEADERS) {
    if (!content.includes(header)) {
      errors.push(`Missing mandatory section: "${header}"`);
    }
  }

  // Check driving section quality
  if (content.includes('## Driving it with')) {
    if (!content.includes('control-syndicate.mjs') && !content.includes('control-paypal.js') && !content.includes('control-ingestion.js')) {
      errors.push('Driving section must cite control-syndicate.mjs, control-paypal.js, or control-ingestion.js command');
    }
    if (!content.toLowerCase().includes('proof')) {
      errors.push('Driving section must define explicit Proof standards');
    }
  }

  return errors;
}

function runLinter() {
  console.log('=== Wholeshare Feature Map Linter ===\n');
  let hasErrors = false;
  let passedCount = 0;
  let totalFiles = 0;

  for (const dir of FEATURE_DIRS) {
    if (!existsSync(dir)) {
      console.warn(`Feature directory skipped (not found): ${dir}`);
      continue;
    }

    const dirName = dir.split('/').slice(-3).join('/');
    console.log(`Scanning ${dirName}:`);

    const files = readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md');
    totalFiles += files.length;

    for (const file of files) {
      const fullPath = join(dir, file);
      const errors = lintFeatureFile(fullPath, file);

      if (errors.length > 0) {
        hasErrors = true;
        console.log(`  [FAIL] ${file}:`);
        for (const err of errors) {
          console.log(`       - ${err}`);
        }
      } else {
        passedCount++;
        console.log(`  [PASS] ${file}`);
      }
    }
    console.log('');
  }

  console.log(`Results: ${passedCount}/${totalFiles} feature maps compliant.`);
  if (hasErrors) {
    console.error('\nFeature map linting failed. Update non-compliant files before proceeding.');
    process.exit(1);
  } else {
    console.log('All feature maps strictly comply with pstack 4-header standards.\n');
  }
}

runLinter();

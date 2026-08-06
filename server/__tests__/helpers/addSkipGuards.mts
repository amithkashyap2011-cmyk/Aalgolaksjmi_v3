#!/usr/bin/env node
/**
 * Script to add `skipIfNoMongo` guard to all test `it`/`test` blocks
 * in files that do DB operations and use connectIfAvailable.
 */
import fs from 'fs';
import path from 'path';

const testDir = path.resolve('__tests__');

const filesToPatch = [
  'walkForward.test.ts',
  'metaEnsemble.test.ts',
  'tradeSimilarity.test.ts',
  'v5MultiStrategy.test.ts',
  'v5_1ResearchFramework.test.ts',
  'subPhase22.test.ts',
  'engineeringReview.test.ts',
  'championChallenger.test.ts',
  'executionEngine.test.ts',
  'adversarialAudit.test.ts',
  'phase27AutonomousResearch.test.ts',
  'paperState.concurrency.test.ts',
];

let patchedCount = 0;

for (const file of filesToPatch) {
  const filePath = path.join(testDir, file);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP (not found): ${file}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  let changed = false;

  // 1. Update import to include skipIfNoMongo
  if (content.includes('connectIfAvailable') && !content.includes('skipIfNoMongo')) {
    content = content.replace(
      /import \{ connectIfAvailable, disconnectMongo \} from/,
      'import { connectIfAvailable, disconnectMongo, skipIfNoMongo } from'
    );
    changed = true;
  }

  // 2. Add `if (skipIfNoMongo()) return;` after every `it(` or `test(` async callback opener
  // Match patterns like:
  //   it("...", async () => {
  //   test("...", async () => {
  //   it("...", () => {
  // And insert the guard as the first line of the callback body
  const testBlockPattern = /((?:it|test)\([^,]+,\s*(?:async\s*)?\(\)\s*=>\s*\{)\n/g;
  const replacement = '$1\n    if (skipIfNoMongo()) return;\n';

  const newContent = content.replace(testBlockPattern, replacement);
  if (newContent !== content) {
    content = newContent;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log(`PATCHED: ${file}`);
    patchedCount++;
  } else {
    console.log(`NO CHANGE: ${file}`);
  }
}

console.log(`\nDone: ${patchedCount}/${filesToPatch.length} files patched.`);

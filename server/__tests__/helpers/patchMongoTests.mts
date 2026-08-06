#!/usr/bin/env node
/**
 * Script to patch test files that use raw mongoose.connect() to use
 * the graceful connectIfAvailable/disconnectMongo pattern instead.
 * 
 * This handles two patterns:
 * 1. beforeAll with mongoose.connect in the main scope
 * 2. beforeAll with mongoose.connect inside a describe block
 */
import fs from 'fs';
import path from 'path';

const testDir = path.resolve('__tests__');

// Files that use the pattern: beforeAll -> mongoose.connect -> static imports
// These use static imports so we can't mock mongoose before import
const filesToPatch = [
  'walkForward.test.ts',
  'institutionalCertification.test.ts',
  'v4Engine.test.ts',
  'metaEnsemble.test.ts',
  'tradeSimilarity.test.ts',
  'v5MultiStrategy.test.ts',
  'v5_1ResearchFramework.test.ts',
  'modelAttribution.test.ts',
  'subPhase22.test.ts',
  'engineeringReview.test.ts',
  'championChallenger.test.ts',
  'executionEngine.test.ts',
  'adversarialAudit.test.ts',
  'phase27AutonomousResearch.test.ts',
  // True integration tests (need real DB)
  'wallet.transfer.test.ts',
  'trading.placeOrder.concurrency.test.ts',
  'wallet.depositAutoTrade.test.ts',
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

  // Pattern 1: Replace mongoose.connect with connectIfAvailable + conditional skip
  // Match: await mongoose.connect(process.env.MONGO_URI || "mongodb://...")
  // Also match: await mongoose.connect(TEST_MONGO_URI)
  const connectPatterns = [
    /if \(mongoose\.connection\.readyState === 0\) \{\s*\n\s*await mongoose\.connect\([^)]+\);\s*\n\s*\}/g,
    /if \(mongoose\.connection\.readyState === 0\) \{\s*await mongoose\.connect\([^)]+\);\s*\}/g,
  ];

  for (const pattern of connectPatterns) {
    if (pattern.test(content)) {
      content = content.replace(pattern, `const connected = await connectIfAvailable();\n    if (!connected) return;`);
      changed = true;
    }
  }

  // Pattern 2: Replace afterAll mongoose.disconnect/close with disconnectMongo
  const disconnectPatterns = [
    /afterAll\(async \(\) => \{\s*\n\s*if \(mongoose\.connection\.readyState !== 0\) \{\s*\n\s*await mongoose\.disconnect\(\);\s*\n\s*\}\s*\n\s*\}\);/g,
    /afterAll\(async \(\) => \{\s*\n\s*await mongoose\.connection\.close\(\);\s*\n\s*\}\);/g,
  ];

  for (const pattern of disconnectPatterns) {
    if (pattern.test(content)) {
      content = content.replace(pattern, `afterAll(async () => {\n    await disconnectMongo();\n  });`);
      changed = true;
    }
  }

  // Add import for connectIfAvailable/disconnectMongo if not already present
  if (changed && !content.includes('connectIfAvailable')) {
    // Find the right relative path
    const helperPath = file.includes('/') 
      ? '../helpers/mongoTestHelper.js'
      : './helpers/mongoTestHelper.js';
    
    // Add import after the last import statement
    const lastImportIndex = content.lastIndexOf('import ');
    if (lastImportIndex !== -1) {
      const lineEnd = content.indexOf('\n', lastImportIndex);
      const importStatement = `\nimport { connectIfAvailable, disconnectMongo } from "${helperPath}";`;
      content = content.slice(0, lineEnd + 1) + importStatement + content.slice(lineEnd + 1);
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log(`PATCHED: ${file}`);
    patchedCount++;
  } else {
    console.log(`NO MATCH: ${file} (patterns not found, may need manual review)`);
  }
}

console.log(`\nDone: ${patchedCount}/${filesToPatch.length} files patched.`);

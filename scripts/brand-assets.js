#!/usr/bin/env node
/**
 * Sync the CLI's favicons with the shared AN5 brand assets.
 *
 * The CLI serves its UI from dist/ when built and from public/ otherwise, and the
 * ui/ workspace has its own copy, so all three locations are kept in step.
 *
 *   node scripts/brand-assets.js          write favicon.svg from the brand tokens
 *   node scripts/brand-assets.js --check  fail if favicon.svg has drifted
 *
 * The favicon stays committed, so building and deploying the site never needs the
 * an5Brand submodule.
 */

const path = require('path');
const { loadBrand } = require('./brand');

const CLI_DIR = path.resolve(__dirname, '..');
const STYLESHEETS = [
  path.join(CLI_DIR, 'public', 'style.css'),
  path.join(CLI_DIR, 'ui', 'src', 'index.css'),
];

async function main() {
  const { brandRoot, assets } = loadBrand();
  const check = process.argv.includes('--check');
  const dirs = [
    path.join(CLI_DIR, 'public'),
    path.join(CLI_DIR, 'ui', 'public'),
  ];

  if (check) {
    const problems = await assets.verifyFavicons(dirs);
    for (const sheet of STYLESHEETS) {
      const result = assets.syncCss(sheet, { check: true });
      if (!result.ok) problems.push(`${result.file}: ${result.reason}`);
    }
    if (problems.length) {
      console.error('❌ Assets are out of sync with the AN5 brand tokens.');
      for (const problem of problems) console.error(`   ${problem}`);
      console.error('\n   Fix with: node scripts/brand-assets.js');
      process.exit(1);
    }
    console.log(`✅ ${dirs.length} favicon(s) and ${STYLESHEETS.length} stylesheet(s) match the AN5 brand tokens`);
    return;
  }

  console.log(`🎨 Using AN5 brand assets from ${brandRoot}`);
  const written = await assets.syncFavicons(dirs);
  for (const file of written) console.log(`  ✓ Wrote ${path.relative(process.cwd(), file)}`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
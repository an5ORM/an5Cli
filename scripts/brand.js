#!/usr/bin/env node
/**
 * Resolve the an5Brand checkout that supplies the shared brand assets.
 *
 * Order: AN5_BRAND_PATH, then an5Brand/ next to this repository (the monorepo
 * layout) or one level above it.
 */

const fs = require('fs');
const path = require('path');

const HINT = [
  'Could not locate the an5Brand submodule, which provides the shared brand assets.',
  'Initialise it with: git submodule update --init an5Brand',
  'Or set AN5_BRAND_PATH to an existing an5Brand checkout.',
].join('\n');

function resolveBrand() {
  const candidates = [];
  if (process.env.AN5_BRAND_PATH) candidates.push(path.resolve(process.env.AN5_BRAND_PATH));

  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    candidates.push(path.join(dir, 'an5Brand'));
    candidates.push(path.join(dir, '..', 'an5Brand'));
    dir = path.dirname(dir);
  }

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'tokens.json'))) return candidate;
  }
  throw new Error(HINT);
}

function loadBrand() {
  const brandRoot = resolveBrand();
  try {
    return {
      brandRoot,
      icons: require(path.join(brandRoot, 'scripts', 'generate-icons.js')),
      assets: require(path.join(brandRoot, 'scripts', 'assets.js')),
    };
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
    throw new Error([
      HINT,
      `Its dependencies are not installed: ${err.message.split('\n')[0]}`,
      'Run npm install in the monorepo root, or npm install in the an5Brand checkout.',
    ].join('\n'));
  }
}

module.exports = { resolveBrand, loadBrand };
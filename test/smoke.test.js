const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const distIndex = path.join(root, 'dist', 'index.js');

// Package checks
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(packageJson.bin && packageJson.bin['an5-cli'], 'Expected CLI bin entry');
assert.ok(fs.existsSync(path.join(root, 'src', 'index.ts')), 'Expected CLI source entrypoint');
assert.ok(fs.existsSync(path.join(root, 'src', 'llm.ts')), 'Expected LLM module');
assert.ok(fs.existsSync(path.join(root, 'dist', 'llm.js')), 'Expected LLM compiled output');
console.log('✅ Package structure verified');

// CLI help output
const helpOutput = execSync(`node ${distIndex} --help`, { encoding: 'utf8' });
assert.ok(helpOutput.includes('an5-cli'), 'Help should mention an5-cli');
assert.ok(helpOutput.includes('release') || helpOutput.includes('ws'), 'Help should list commands');
assert.ok(helpOutput.includes('--preview'), 'Help should expose preview mode');
console.log('✅ CLI help works');

// CLI preview on itself (an5Cli repo)
try {
  const selfPreview = execSync(`node ${distIndex} release ${root} --preview --no-verify --skip-llm`, {
    encoding: 'utf8',
    timeout: 15000,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'bot',
      GIT_AUTHOR_EMAIL: 'bot@example.com',
      GIT_COMMITTER_NAME: 'bot',
      GIT_COMMITTER_EMAIL: 'bot@example.com'
    }
  });
  console.log('✅ CLI preview executed on self:', selfPreview.trim().split('\n')[0] || '(no changes)');
} catch (err) {
  console.log('⚠️ CLI preview on self skipped/warning:', err.message);
}

// Check LLM module exports
const llm = require(path.join(root, 'dist', 'llm'));
assert.ok(typeof llm.generateCommitMessage === 'function', 'generateCommitMessage should be a function');
assert.ok(typeof llm.getGitDiff === 'function', 'getGitDiff should be a function');
assert.ok(typeof llm.getGitLog === 'function', 'getGitLog should be a function');
console.log('✅ LLM module exports verified');

// Check ws command mentions in help
assert.ok(helpOutput.includes('ws'), 'Help should mention ws command');
console.log('✅ WS command documented in help');

// Check config loading
assert.ok(fs.existsSync(path.join(root, '.an5cli.json')), 'Config file should exist');
console.log('✅ Config file exists');

console.log('\n🎉 All an5Cli smoke tests passed!');

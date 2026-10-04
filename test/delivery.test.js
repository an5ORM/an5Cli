const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync, spawn } = require('node:child_process');
const cli = path.resolve(__dirname, '../dist/index.js');
const delivery = require('../dist/delivery.js');
const { analyzeDocUpdates } = require('../dist/impact.js');
const llm = require('../dist/llm.js');
const { applyDocUpdate } = require('../dist/documentation.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'an5-cli-delivery-'));
let serial = 0;
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function repo() {
  const cwd = path.join(tmp, `repo-${serial++}`); fs.mkdirSync(cwd);
  git(cwd, 'init', '-b', 'main'); git(cwd, 'config', 'user.name', 'Test'); git(cwd, 'config', 'user.email', 'test@example.com');
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'delivery-fixture', version: '1.0.0' }));
  fs.writeFileSync(path.join(cwd, 'code.js'), 'exports.value = 1;\n');
  fs.writeFileSync(path.join(cwd, 'README.md'), '# Fixture\nOld documentation.\n');
  git(cwd, 'add', '.'); git(cwd, 'commit', '-m', 'initial'); return cwd;
}
function change(cwd) { fs.writeFileSync(path.join(cwd, 'code.js'), 'exports.value = 2;\n'); }
function run(cwd, args, env = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, env: { ...process.env, AN5_CLI_CHECKS_RUNNING: '', ...env } });
    let output = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
    child.on('close', code => resolve({ code, output }));
  });
}
const releaseArgs = ['--skip-llm', '--skip-prompt'];
function remote(cwd) {
  const dir = path.join(tmp, `remote-${serial++}.git`); fs.mkdirSync(dir); git(dir, 'init', '--bare', '-b', 'main');
  git(cwd, 'remote', 'add', 'origin', dir); git(cwd, 'push', '-u', 'origin', 'main'); return dir;
}

test('single-repo preview does not build, checkout, write docs or bump versions', async () => {
  const cwd = repo(); change(cwd); git(cwd, 'checkout', '-b', 'feature');
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json')));
  pkg.scripts = { build: 'node -e "require(\'fs\').writeFileSync(\'built\',\'yes\')"' };
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify(pkg));
  const status = git(cwd, 'status', '--porcelain'), sha = git(cwd, 'rev-parse', 'HEAD');
  const result = await run(cwd, ['release', cwd, '--preview', '--pull', '--branch', 'main', '--update-docs', '--version', '1.0.1', ...releaseArgs]);
  assert.equal(result.code, 0, result.output);
  assert.equal(git(cwd, 'branch', '--show-current'), 'feature');
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), sha);
  assert.equal(git(cwd, 'status', '--porcelain'), status);
  assert.equal(fs.existsSync(path.join(cwd, 'built')), false);
  assert.equal(fs.existsSync(path.join(cwd, 'CHANGELOG.md')), false);
});

test('workspace preview preserves existing submodule checkouts', async () => {
  const child = repo(), origin = remote(child), parent = repo();
  git(parent, '-c', 'protocol.file.allow=always', 'submodule', 'add', origin, 'child');
  git(parent, 'commit', '-am', 'add submodule');
  const checkout = path.join(parent, 'child'); git(checkout, 'checkout', '-b', 'feature'); change(checkout);
  const sha = git(checkout, 'rev-parse', 'HEAD'), status = git(checkout, 'status', '--porcelain');
  const result = await run(parent, ['ws', parent, '--preview', '--pull', ...releaseArgs]);
  assert.equal(result.code, 0, result.output);
  assert.equal(git(checkout, 'branch', '--show-current'), 'feature');
  assert.equal(git(checkout, 'rev-parse', 'HEAD'), sha);
  assert.equal(git(checkout, 'status', '--porcelain'), status);
});

test('scoped release preserves unrelated work and existing unreleased notes', async () => {
  const cwd = repo(); change(cwd);
  fs.writeFileSync(path.join(cwd, 'unrelated.js'), 'pending\n');
  fs.writeFileSync(path.join(cwd, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n- Keep previous note.\n\n## [0.9.0]\n\n- Historical note.\n');
  git(cwd, 'add', 'CHANGELOG.md'); git(cwd, 'commit', '-m', 'existing notes');
  const result = await run(cwd, ['release', cwd, '--files', 'code.js', '--message', 'fix: scoped change', ...releaseArgs]);
  assert.equal(result.code, 0, result.output);
  assert.match(git(cwd, 'status', '--porcelain'), /unrelated.js/);
  assert.deepEqual(git(cwd, 'show', '--format=', '--name-only', 'HEAD').split('\n').sort(), ['CHANGELOG.md', 'code.js']);
  const log = fs.readFileSync(path.join(cwd, 'CHANGELOG.md'), 'utf8');
  assert.match(log, /Keep previous note/); assert.match(log, /Historical note/); assert.match(log, /scoped change/);
  assert.equal((log.match(/## \[Unreleased\]/g) || []).length, 1);
});

test('scoped release refuses unrelated staged changes before writing', async () => {
  const cwd = repo(); change(cwd); fs.writeFileSync(path.join(cwd, 'other.js'), 'pending'); git(cwd, 'add', 'other.js');
  const sha = git(cwd, 'rev-parse', 'HEAD');
  const result = await run(cwd, ['release', cwd, '--files', 'code.js', ...releaseArgs]);
  assert.notEqual(result.code, 0); assert.match(result.output, /Unrelated staged/);
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), sha); assert.equal(fs.existsSync(path.join(cwd, 'CHANGELOG.md')), false);
});

test('failed quality checks abort the commit', async () => {
  const cwd = repo(); change(cwd);
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', scripts: { test: 'node -e "process.exit(7)"' } }));
  const sha = git(cwd, 'rev-parse', 'HEAD');
  const result = await run(cwd, ['release', cwd, ...releaseArgs]);
  assert.notEqual(result.code, 0); assert.match(result.output, /Quality checks failed/);
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), sha);
});

test('push rejection returns failure without a success banner or tag', async () => {
  const cwd = repo(), origin = remote(cwd); change(cwd);
  fs.writeFileSync(path.join(origin, 'hooks/pre-receive'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const result = await run(cwd, ['release', cwd, '--push', '--tag', 'v1.0.0', ...releaseArgs]);
  assert.notEqual(result.code, 0); assert.doesNotMatch(result.output, /✅.*committed/);
  assert.equal(git(cwd, 'tag', '--list'), '');
});

test('explicit version updates the lockfile and tags the pushed commit', async () => {
  const cwd = repo(), origin = remote(cwd); change(cwd);
  fs.writeFileSync(path.join(cwd, 'package-lock.json'), JSON.stringify({ name: 'delivery-fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'delivery-fixture', version: '1.0.0' } } }));
  const result = await run(cwd, ['release', cwd, '--version', '1.0.1', '--tag', 'v1.0.1', '--push', ...releaseArgs]);
  assert.equal(result.code, 0, result.output);
  assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'))).version, '1.0.1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, 'package-lock.json'))).packages[''].version, '1.0.1');
  assert.equal(git(origin, 'rev-parse', 'refs/tags/v1.0.1'), git(cwd, 'rev-parse', 'HEAD'));
  assert.match(result.output, /publication has not been verified/);
});

test('stable release synchronizes npm and static Python versions without changing independent Rust versions', () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, 'pyproject.toml'), '[project]\nname = "fixture"\nversion = "1.0.0"\n\n[tool.example]\nversion = "independent"\n');
  const files = delivery.updateNpmVersion(cwd, '1.0.1');
  assert.ok(files.includes('pyproject.toml'));
  const content = fs.readFileSync(path.join(cwd, 'pyproject.toml'), 'utf8');
  assert.match(content, /version = "1.0.1"/); assert.match(content, /version = "independent"/);
  assert.throws(() => delivery.updateNpmVersion(cwd, '1.0.2-rc.1'), /stable versions only/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'))).version, '1.0.1');
});

test('prepared changelog notes work without an LLM and preserve historical releases', async () => {
  const cwd = repo(); change(cwd);
  const notes = path.join(tmp, 'notes.md'); fs.writeFileSync(notes, '### Fixed\n- Preserve distinct arithmetic operands.\n');
  const result = await run(cwd, ['release', cwd, '--changelog-file', notes, ...releaseArgs]);
  assert.equal(result.code, 0, result.output);
  assert.match(fs.readFileSync(path.join(cwd, 'CHANGELOG.md'), 'utf8'), /Preserve distinct arithmetic operands/);
});

test('tag collision and mismatched version stop before committing', async () => {
  const cwd = repo(); change(cwd); const sha = git(cwd, 'rev-parse', 'HEAD');
  let result = await run(cwd, ['release', cwd, '--tag', 'v2.0.0', ...releaseArgs]);
  assert.notEqual(result.code, 0); assert.match(result.output, /does not match/);
  git(cwd, 'tag', 'v1.0.0'); result = await run(cwd, ['release', cwd, '--tag', 'v1.0.0', ...releaseArgs]);
  assert.notEqual(result.code, 0); assert.match(result.output, /already exists/); assert.equal(git(cwd, 'rev-parse', 'HEAD'), sha);
});

test('documentation planning deduplicates targets and handles new Go/Rust files', async () => {
  const cwd = repo(); fs.mkdirSync(path.join(cwd, 'src')); fs.writeFileSync(path.join(cwd, 'src/hello.go'), 'package main\n'); fs.writeFileSync(path.join(cwd, 'src/hello.rs'), 'fn main() {}\n');
  const updates = analyzeDocUpdates(cwd);
  assert.equal(updates.filter(update => update.file === 'README.md').length, 1);
  assert.ok(updates.some(update => update.file === path.join('src', 'hello.md') && update.action === 'generate'));
  const original = llm.generateDocumentation; let context;
  llm.generateDocumentation = async source => { context = source; return '# Generated documentation'; };
  try {
    await applyDocUpdate(cwd, updates.find(update => update.file === path.join('src', 'hello.md')));
    assert.match(context, /package main/); assert.match(context, /fn main/);
    assert.match(fs.readFileSync(path.join(cwd, 'src/hello.md'), 'utf8'), /Generated documentation/);
  } finally { llm.generateDocumentation = original; }
});

test('doc reconciliation and changelog generation receive actual source and diff', async () => {
  const cwd = repo(); change(cwd); const prompts = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => {
      const prompt = JSON.parse(body).messages[0].content; prompts.push(prompt);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ message: { content: prompt.includes('changelog generator') ? '- Fix value to return two.' : '# Fixture\nThe value is now two.' } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await run(cwd, ['release', cwd, '--update-docs', '--message', 'fix: change value', '--skip-prompt'], {
      LLM_PROVIDER: 'custom', LLM_API_KEY: 'test-only', LLM_ENDPOINT: `http://127.0.0.1:${server.address().port}`,
    });
    assert.equal(result.code, 0, result.output);
    const docPrompt = prompts.find(prompt => prompt.includes('technical editor'));
    assert.match(docPrompt, /exports.value = 2/); assert.match(docPrompt, /-exports.value = 1/);
    assert.ok(prompts.some(prompt => prompt.includes('changelog generator') && prompt.includes('exports.value = 2')));
    assert.match(fs.readFileSync(path.join(cwd, 'CHANGELOG.md'), 'utf8'), /Fix value to return two/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('release verification checks CI jobs and the published release', async () => {
  const cwd = repo(), bin = path.join(tmp, `bin-${serial++}`); fs.mkdirSync(bin);
  const mock = path.join(bin, 'gh');
  fs.writeFileSync(mock, `#!/usr/bin/env node\nconst a=process.argv.slice(2); if(a[0]==='run'&&a[1]==='list') console.log(JSON.stringify([{databaseId:1,headSha:'abc'}])); else if(a[0]==='run'&&a[1]==='view') console.log(JSON.stringify({jobs:[{name:'publish',conclusion:process.env.TEST_JOB||'success'}]})); else if(a[0]==='release') console.log(JSON.stringify({tagName:'v1.0.0',url:'https://example.test/release',isDraft:false}));\n`, { mode: 0o755 });
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${originalPath}`;
  try {
    assert.equal(await delivery.verifyRelease(cwd, 'v1.0.0', 'abc'), 'https://example.test/release');
    process.env.TEST_JOB = 'skipped';
    await assert.rejects(delivery.verifyRelease(cwd, 'v1.0.0', 'abc'), /not fully verified/);
  } finally { process.env.PATH = originalPath; delete process.env.TEST_JOB; }
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('deleted documentation is not recreated and paths with spaces remain intact', () => {
  const cwd = repo(); fs.unlinkSync(path.join(cwd, 'README.md'));
  fs.writeFileSync(path.join(cwd, 'source with spaces.go'), 'package main\n');
  assert.ok(delivery.changedPaths(cwd).includes('source with spaces.go'));
  const updates = analyzeDocUpdates(cwd);
  assert.equal(updates.some(update => update.file === 'README.md'), false);
  assert.ok(updates.some(update => update.file === 'source with spaces.md'));
});

test('automatic doc updates do not consume unrelated edits in a scoped release', async () => {
  const cwd = repo(); change(cwd); fs.writeFileSync(path.join(cwd, 'README.md'), '# Unrelated pending guide\n');
  const result = await run(cwd, ['release', cwd, '--files', 'code.js', '--update-docs', ...releaseArgs]);
  assert.notEqual(result.code, 0); assert.match(result.output, /Automatic outputs have unrelated edits/);
  assert.equal(fs.readFileSync(path.join(cwd, 'README.md'), 'utf8'), '# Unrelated pending guide\n');
});

test('a child commit absent from its remote blocks the parent push', () => {
  const cwd = repo(); remote(cwd); change(cwd); git(cwd, 'commit', '-am', 'local only');
  assert.throws(() => delivery.verifySubmoduleCommit(cwd), /parent push stopped/);
  git(cwd, 'push', 'origin', 'main');
  assert.doesNotThrow(() => delivery.verifySubmoduleCommit(cwd));
});

test('release dates follow the selected timezone at a UTC date boundary', () => {
  const date = new Date('2026-10-03T18:00:00Z');
  assert.equal(delivery.calendarDate(date, 'UTC'), '2026-10-03');
  assert.equal(delivery.calendarDate(date, 'Asia/Ho_Chi_Minh'), '2026-10-04');
});

test('version update stays within the chosen package in an npm workspace', () => {
  const cwd = repo(), root = path.join(tmp, `workspace-${serial++}`); fs.mkdirSync(root);
  const child = path.join(root, 'child'); fs.renameSync(cwd, child);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ private: true, workspaces: ['child'], version: '8.0.0' }));
  const rootLock = JSON.stringify({ name: 'parent', version: '8.0.0', lockfileVersion: 3, packages: {} });
  fs.writeFileSync(path.join(root, 'package-lock.json'), rootLock);
  delivery.updateNpmVersion(child, '1.0.1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(child, 'package.json'))).version, '1.0.1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version, '8.0.0');
  assert.equal(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'), rootLock);
});

test('an explicit tag can release a validated clean commit without an extra commit', async () => {
  const cwd = repo(), origin = remote(cwd), sha = git(cwd, 'rev-parse', 'HEAD');
  const result = await run(cwd, ['release', cwd, '--tag', 'v1.0.0', '--push', ...releaseArgs]);
  assert.equal(result.code, 0, result.output);
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), sha);
  assert.equal(git(origin, 'rev-parse', 'refs/tags/v1.0.0'), sha);
});


test('removed --dry-run is rejected without writes; --preview remains read-only', async () => {
  const cwd = repo(); change(cwd);
  const sha = git(cwd, 'rev-parse', 'HEAD'), status = git(cwd, 'status', '--porcelain');
  const modern = await run(cwd, ['release', cwd, '--preview', ...releaseArgs]);
  const legacy = await run(cwd, ['release', cwd, '--dry-run', ...releaseArgs]);
  assert.equal(modern.code, 0, modern.output); assert.notEqual(legacy.code, 0);
  assert.match(legacy.output, /Unknown option: --dry-run/);
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), sha);
  assert.equal(git(cwd, 'status', '--porcelain'), status);
});

test('release versions reject malformed prerelease and build identifiers before mutation', () => {
  for (const version of ['1.0.0-01', '1.0.0-rc..1', '1.0.0-rc.', '1.0.0+build..1', '1.0.0+build.']) assert.throws(() => delivery.validateVersion(version), /Invalid release version/);
  for (const version of ['1.0.0', '1.0.0-rc.1', '1.0.0-0', '1.0.0+build.01']) delivery.validateVersion(version);
});

test('release command verifies the exact pushed commit and tag through CI and GitHub Release', async () => {
  const cwd = repo(), origin = remote(cwd); change(cwd);
  const bin = path.join(tmp, `bin-${serial++}`); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
const {execFileSync}=require('node:child_process'); const a=process.argv.slice(2);
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(a[0]==='run'&&a[1]==='list') {
 if(a[a.indexOf('--commit')+1]!==sha || a[a.indexOf('--branch')+1]!=='v1.0.1') process.exit(2);
 console.log(JSON.stringify([{databaseId:42,headSha:sha}]));
} else if(a[0]==='run'&&a[1]==='view') console.log(JSON.stringify({jobs:[{name:'publish',conclusion:'success'}]}));
else if(a[0]==='release') console.log(JSON.stringify({tagName:'v1.0.1',url:'https://example.test/releases/v1.0.1',isDraft:false}));
`, {mode:0o755});
  const result = await run(cwd, ['release',cwd,'--version','1.0.1','--tag','v1.0.1','--push','--verify-release',...releaseArgs], {PATH:`${bin}${path.delimiter}${process.env.PATH}`});
  assert.equal(result.code,0,result.output);
  assert.match(result.output,/Verified release: https:\/\/example.test\/releases\/v1.0.1/);
  const sha = git(cwd,'rev-parse','HEAD');
  assert.equal(git(origin,'rev-parse','refs/heads/main'),sha);
  assert.equal(git(origin,'rev-parse','refs/tags/v1.0.1'),sha);
});


test('scoped release updates tracked build files inside an ignored directory', async () => {
  const cwd = repo(); fs.mkdirSync(path.join(cwd, 'dist'));
  fs.writeFileSync(path.join(cwd, 'dist/index.js'), 'exports.value = 1;\n');
  git(cwd, 'add', 'dist/index.js'); git(cwd, 'commit', '-m', 'track built entry');
  fs.writeFileSync(path.join(cwd, '.gitignore'), 'dist/\n');
  git(cwd, 'add', '.gitignore'); git(cwd, 'commit', '-m', 'ignore future build output');
  fs.writeFileSync(path.join(cwd, 'dist/index.js'), 'exports.value = 2;\n');
  fs.writeFileSync(path.join(cwd, 'dist/untracked.js'), 'must stay ignored\n');
  const result = await run(cwd, ['release', cwd, '--files', 'dist/index.js', ...releaseArgs]);
  assert.equal(result.code, 0, result.output);
  assert.match(git(cwd, 'show', 'HEAD:dist/index.js'), /value = 2/);
  assert.equal(git(cwd, 'ls-files', 'dist/untracked.js'), '');
  assert.equal(git(cwd, 'status', '--porcelain'), '');
});

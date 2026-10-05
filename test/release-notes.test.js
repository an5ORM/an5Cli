const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const notes = require('../dist/release-notes');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'an5-smart-notes-'));
let serial = 0;
function git(cwd, ...args) { return execFileSync('git', args, {cwd, encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim(); }
function repo() {
  const cwd = path.join(tmp, String(serial++)); fs.mkdirSync(cwd);
  git(cwd,'init','-b','main'); git(cwd,'config','user.name','Test'); git(cwd,'config','user.email','test@example.com');
  fs.writeFileSync(path.join(cwd,'package.json'), JSON.stringify({name:'fixture',version:'1.0.0'}));
  fs.writeFileSync(path.join(cwd,'code.js'),'exports.value = 1;\n');
  fs.writeFileSync(path.join(cwd,'CHANGELOG.md'),'# Changelog\n\nRelease history.\n\n## [1.0.0] - 2026-10-03\n\n- Original behavior.\n');
  git(cwd,'add','.'); git(cwd,'commit','-m','initial'); return cwd;
}
test.after(() => fs.rmSync(tmp,{recursive:true,force:true}));

test('full release promotes pending notes, groups entries and deduplicates commit references', () => {
  const existing = '# Changelog\n\nProject history.\n\n## [Unreleased]\n\n### Added\n- Add OAuth sign-in.\n\n### Fixed\n- Refresh expired tokens.\n\n## [1.0.0] - 2026-10-03\n\n- Original behavior.\n';
  const result = notes.renderChangelog(existing,'### Added\n- add OAuth sign-in (abc1234)\n\n### Removed\n- Remove manual token entry.','1.1.0','2026-10-04');
  assert.equal((result.match(/OAuth sign-in/gi)||[]).length,1);
  assert.doesNotMatch(result,/Unreleased/); assert.match(result,/## \[1.1.0\] - 2026-10-04/);
  assert.match(result,/### Fixed\n- Refresh expired tokens/); assert.match(result,/### Removed/);
  assert.ok(result.startsWith('# Changelog\n\nProject history.'));
  assert.match(result,/## \[1.0.0\] - 2026-10-03\n\n- Original behavior./);
  assert.equal(notes.renderChangelog(result,'### Added\n- Add OAuth sign-in.','1.1.0','2026-10-04'),result);
});

test('scoped release only moves matching pending entries, leaving unrelated notes pending', () => {
  const result=notes.renderChangelog('# Changelog\n\n## [Unreleased]\n\n### Added\n- Add OAuth sign-in.\n- Add unrelated billing.\n','### Added\n- Add OAuth sign-in.','1.1.0','2026-10-04',true);
  const [pending,released]=result.split('## [1.1.0]');
  assert.match(pending,/Unreleased/); assert.match(pending,/unrelated billing/); assert.doesNotMatch(pending,/OAuth/);
  assert.match(released,/OAuth/); assert.doesNotMatch(released,/billing/);
});

test('offline summaries use new source APIs and ignore generated artifacts/version-only changes', () => {
  const cwd=repo(); fs.mkdirSync(path.join(cwd,'auth'));
  fs.writeFileSync(path.join(cwd,'auth/oauth.ts'),'export async function refreshTokens() { return "token"; }\n');
  fs.writeFileSync(path.join(cwd,'code.js'),'exports.value = 4;\n');
  const summary=notes.summarizeChanges(cwd,['dist/index.js','CHANGELOG.md','code.js','auth/oauth.ts']);
  assert.equal(summary.message.split('\n')[0],'feat(auth): add refresh tokens'); assert.match(summary.message,/Update `value`/); assert.match(summary.notes,/refreshTokens/); assert.doesNotMatch(summary.notes,/dist|CHANGELOG/);
  fs.writeFileSync(path.join(cwd,'package.json'),JSON.stringify({name:'fixture',version:'1.0.1'},null,2));
  assert.equal(notes.summarizeChanges(cwd,['package.json'],'1.0.1').message,'chore(release): prepare 1.0.1');
  assert.equal(notes.isSpecificCommitMessage('chore: update code'),false);
  assert.equal(notes.isSpecificCommitMessage('fix(oauth): retain refresh tokens after renewal'),true);
});

test('history follows the previous release, respects selected paths and retains breaking migration details', () => {
  const cwd=repo(); git(cwd,'tag','v1.0.0'); const baseline=git(cwd,'rev-parse','HEAD');
  fs.writeFileSync(path.join(cwd,'code.js'),'exports.preview = true;\n'); git(cwd,'add','code.js');
  git(cwd,'commit','-m','feat(migrations)!: rename the preview flag','-m','BREAKING CHANGE: Replace --old-preview with --preview in scripts.');
  fs.writeFileSync(path.join(cwd,'README.md'),'# New guide\n'); git(cwd,'add','README.md'); git(cwd,'commit','-m','Document browser persistence');
  const history=notes.releaseHistory(cwd); assert.equal(history.baseline,baseline); assert.equal(history.commits.length,2);
  assert.match(history.notes,/rename the preview flag/); assert.match(history.notes,/Replace --old-preview with --preview/); assert.match(history.notes,/Document browser persistence/);
  const scoped=notes.releaseHistory(cwd,undefined,['code.js']); assert.equal(scoped.commits.length,1); assert.doesNotMatch(scoped.notes,/persistence/);
  assert.throws(()=>notes.releaseHistory(cwd,'missing-release-ref'));
});

test('untagged packages use the last versioned changelog edit instead of ordinary Unreleased commits', () => {
  const cwd=repo(); const baseline=git(cwd,'rev-parse','HEAD');
  fs.writeFileSync(path.join(cwd,'code.js'),'exports.value = 2;\n'); git(cwd,'add','code.js'); git(cwd,'commit','-m','fix(query): retain distinct parameters');
  const log=fs.readFileSync(path.join(cwd,'CHANGELOG.md'),'utf8');
  fs.writeFileSync(path.join(cwd,'CHANGELOG.md'),log.replace('## [1.0.0]','## [Unreleased]\n\n- Pending query fix.\n\n## [1.0.0]'));
  git(cwd,'add','CHANGELOG.md'); git(cwd,'commit','-m','docs: record pending notes');
  const history=notes.releaseHistory(cwd); assert.equal(history.baseline,baseline); assert.equal(history.commits.length,1);
  assert.match(history.notes,/retain distinct parameters/); assert.doesNotMatch(history.notes,/record pending notes|Original behavior/);
});

test('release baseline ignores an uncommitted next-version changelog header', () => {
  const cwd=repo(); const baseline=git(cwd,'rev-parse','HEAD');
  fs.writeFileSync(path.join(cwd,'code.js'),'exports.value = 3;\n'); git(cwd,'add','code.js'); git(cwd,'commit','-m','fix(query): preserve browser parameters');
  const previous=fs.readFileSync(path.join(cwd,'CHANGELOG.md'),'utf8');
  fs.writeFileSync(path.join(cwd,'CHANGELOG.md'),previous.replace('## [1.0.0]','## [1.1.0] - 2026-10-04\n\n- Prepared next release.\n\n## [1.0.0]'));
  const history=notes.releaseHistory(cwd);
  assert.equal(history.baseline,baseline); assert.equal(history.commits.length,1);
  assert.match(history.context,/exports.value = 3/); assert.match(history.notes,/preserve browser parameters/);
});

test('generated notes reject generic commit output while retaining useful migration details', () => {
  assert.equal(notes.generatedNotes('- chore: update code'), '');
  assert.equal(notes.generatedNotes('### Changed\n- Update code.'), '');
  assert.equal(notes.generatedNotes('No changes.'), '');
  const result=notes.generatedNotes('### Changed\n- Preserve browser parameters.\n  Migration: replace --old-preview with --preview.');
  assert.match(result,/Preserve browser parameters/); assert.match(result,/Migration: replace --old-preview with --preview/);
});

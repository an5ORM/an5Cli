import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export function gitAt(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
}

/** Porcelain -z preserves spaces, quoted paths, and rename destinations. */
export function changedPaths(cwd: string): string[] {
  const status = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  const records = status.split('\0');
  const paths: string[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    paths.push(record.slice(3));
    if (/[RC]/.test(record.slice(0, 2))) {
      const original = records[++i];
      if (original) paths.push(original);
    }
  }
  return [...new Set(paths)];
}

export function changeContext(cwd: string, files = changedPaths(cwd)): string {
  const diff = gitAt(cwd, ['diff', 'HEAD', '--', ...files.map(file => `:(literal)${file}`)]);
  const sources: string[] = [];
  let remaining = 24000;
  for (const file of files) {
    if (!/\.(ts|js|mjs|cjs|py|cs|go|rs|an5|md)$/i.test(file) || remaining <= 0) continue;
    const fullPath = path.resolve(cwd, file);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile() || fs.lstatSync(fullPath).isSymbolicLink()) continue;
    const relativeSource = path.relative(fs.realpathSync(cwd), fs.realpathSync(fullPath));
    if (relativeSource === '..' || relativeSource.startsWith('..' + path.sep) || path.isAbsolute(relativeSource)) continue;
    const content = fs.readFileSync(fullPath, 'utf8').slice(0, Math.min(6000, remaining));
    remaining -= content.length;
    sources.push(`Current source: ${file}\n${content}`);
  }
  const manifest = path.join(cwd, 'package.json');
  return `Changed paths:\n${files.join('\n')}\n\nGit diff (may be truncated):\n${diff.slice(0, 16000)}\n\n${sources.join('\n\n')}\n\nPackage configuration:\n${fs.existsSync(manifest) ? fs.readFileSync(manifest, 'utf8').slice(0, 4000) : '(none)'}`;
}

export function validateVersion(version: string): void {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }
}

export function updateNpmVersion(cwd: string, version: string): string[] {
  validateVersion(version);
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const pythonPath = path.join(cwd, 'pyproject.toml');
  let pythonContent: string | undefined;
  if (fs.existsSync(pythonPath)) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Python version synchronization currently supports stable versions only');
    pythonContent = fs.readFileSync(pythonPath, 'utf8');
    const project = pythonContent.match(/(\[project\][\s\S]*?)(?=\n\[|$)/);
    const current = project?.[1]?.match(/^version\s*=\s*"([^"]+)"/m);
    if (!current || (current[1] !== pkg.version && current[1] !== version)) throw new Error('Python project version is dynamic or independent; use the maintained version tooling before release');
    pythonContent = pythonContent.replace(project![1]!, project![1]!.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`));
  }
  if (pkg.version !== version) {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['version', version, '--no-git-tag-version', '--ignore-scripts', '--workspaces=false'], { cwd, stdio: 'pipe' });
  }
  if (pythonContent !== undefined) fs.writeFileSync(pythonPath, pythonContent);
  return ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pyproject.toml'].filter(file => fs.existsSync(path.join(cwd, file)));
}

/** Verify the destination rather than trusting a push success banner. */
export function verifyRemote(cwd: string, remote: string, ref: string, sha: string): void {
  const result = gitAt(cwd, ['ls-remote', remote, ref]);
  if (!result.split('\n').some(line => line.split(/\s+/)[0] === sha)) throw new Error(`Remote ${remote}/${ref} does not point to ${sha}`);
}

export async function verifyRelease(cwd: string, tag: string, sha: string): Promise<string> {
  let runs: { databaseId: number; headSha: string }[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    runs = JSON.parse(execFileSync('gh', ['run', 'list', '--commit', sha, '--branch', tag, '--event', 'push', '--json', 'databaseId,headSha'], { cwd, encoding: 'utf8' }));
    if (runs.length) break;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!runs.length) throw new Error(`No tag-push CI run found for ${tag}/${sha}; release verification remains pending`);
  const publishedJobs: string[] = [];
  for (const run of runs) {
    if (run.headSha !== sha) throw new Error('CI commit does not match the release');
    execFileSync('gh', ['run', 'watch', String(run.databaseId), '--exit-status'], { cwd, stdio: 'inherit', timeout: 600000 });
    const details = JSON.parse(execFileSync('gh', ['run', 'view', String(run.databaseId), '--json', 'jobs'], { cwd, encoding: 'utf8' }));
    for (const job of details.jobs) {
      if (job.conclusion !== 'success') throw new Error(`Release job ${job.name} finished as ${job.conclusion}; publication is not fully verified`);
      publishedJobs.push(job.name.toLowerCase());
    }
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  if (publishedJobs.some(name => name.includes('npm'))) {
    const version = JSON.parse(execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['view', `${pkg.name}@${pkg.version}`, 'version', '--json'], { cwd, encoding: 'utf8', timeout: 60000 }));
    if (version !== pkg.version) throw new Error('Expected npm package version is not published');
    console.log(`Verified npm package ${pkg.name}@${version}`);
  }
  if (publishedJobs.some(name => name.includes('pypi'))) {
    const project = fs.readFileSync(path.join(cwd, 'pyproject.toml'), 'utf8').match(/\[project\]([\s\S]*?)(?=\n\[|$)/)?.[1];
    const name = project?.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const version = project?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    if (!name || !version) throw new Error('Cannot determine expected PyPI artifact');
    const response = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Expected PyPI artifact ${name} ${version} was not found`);
    const artifact = await response.json() as { info: { version: string } };
    if (artifact.info.version !== version) throw new Error('Unexpected PyPI artifact version');
    console.log(`Verified PyPI package ${name} ${version}`);
  }
  const release = JSON.parse(execFileSync('gh', ['release', 'view', tag, '--json', 'tagName,url,isDraft'], { cwd, encoding: 'utf8' }));
  if (release.tagName !== tag || release.isDraft) throw new Error('Expected published release was not found');
  return release.url;
}

export function verifySubmoduleCommit(cwd: string): void {
  const sha = gitAt(cwd, ['rev-parse', 'HEAD']);
  gitAt(cwd, ['fetch', 'origin']);
  const branches = gitAt(cwd, ['branch', '-r', '--contains', sha]);
  if (!branches.split('\n').some(branch => branch.trim().startsWith('origin/'))) {
    throw new Error(`Submodule commit ${sha} has not reached an origin branch; parent push stopped`);
  }
}


export function calendarDate(date = new Date(), timeZone = process.env.TZ): string {
  const parts = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', day: '2-digit', ...(timeZone ? { timeZone } : {}) }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

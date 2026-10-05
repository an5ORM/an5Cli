import fs from 'fs';
import path from 'path';
import { gitAt } from './delivery';

const sections = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];
const automatic = /(?:^|\/)(?:CHANGELOG\.md|package-lock\.json|npm-shrinkwrap\.json)$|(?:^|\/)(?:dist|build|node_modules)\//i;
type Entry = { section: string; text: string };
export interface ReleaseHistory { baseline?: string; commits: { sha: string; subject: string; body: string }[]; context: string; notes: string }

function entryKey(text: string): string {
  return text.replace(/\s*\(`?[a-f0-9]{7,40}`?\)\s*/gi, '').replace(/[`*_]/g, '').replace(/\s+/g, ' ').replace(/[.!]\s*$/, '').trim().toLowerCase();
}

function entries(content: string): Entry[] {
  const result: Entry[] = [];
  let section = 'Changed';
  for (const line of content.trim().split('\n')) {
    const heading = line.match(/^###\s+(Added|Changed|Deprecated|Removed|Fixed|Security)\s*$/i);
    if (heading) { section = sections.find(name => name.toLowerCase() === heading[1]!.toLowerCase())!; continue; }
    if (/^[-*]\s+/.test(line)) result.push({ section, text: line.replace(/^[-*]\s+/, '').trim() });
    else if (line.trim() && result.length) result[result.length - 1]!.text += `\n${line}`;
    else if (line.trim() && !/^#/.test(line)) result.push({ section, text: line.trim() });
  }
  return result;
}

export function mergeNotes(...contents: string[]): string {
  const seen = new Set<string>();
  const all = contents.flatMap(entries).filter(entry => {
    const key = entryKey(entry.text);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
  return sections.map(section => {
    const group = all.filter(entry => entry.section === section);
    return group.length ? `### ${section}\n${group.map(entry => `- ${entry.text}`).join('\n')}` : '';
  }).filter(Boolean).join('\n\n');
}

function splitChangelog(content: string): { preamble: string; releases: { version: string; header: string; body: string }[] } {
  const headers = [...content.matchAll(/^##\s+\[?v?([^\]\s]+)\]?(?:[^\n]*)$/gm)];
  return {
    preamble: content.slice(0, headers[0]?.index ?? content.length).trim() || '# Changelog',
    releases: headers.map((match, index) => ({ version: match[1]!, header: match[0], body: content.slice(match.index! + match[0].length, headers[index + 1]?.index ?? content.length).trim() })),
  };
}

export function unreleasedNotes(content: string): string {
  return splitChangelog(content).releases.filter(section => section.version.toLowerCase() === 'unreleased').map(section => section.body).join('\n\n');
}

export function renderChangelog(existing: string, notes: string, version: string | undefined, date: string, scoped = false): string {
  const parsed = splitChangelog(existing);
  const target = version || 'Unreleased';
  const pending = unreleasedNotes(existing);
  const previous = parsed.releases.filter(release => release.version.toLowerCase() === target.toLowerCase()).map(release => release.body).join('\n\n');
  const body = mergeNotes(previous, notes, version && !scoped ? pending : '');
  const newKeys = new Set(entries(body).map(entry => entryKey(entry.text)));
  const remainingPending = version && scoped ? mergeNotes(...entries(pending).filter(entry => !newKeys.has(entryKey(entry.text))).map(entry => `### ${entry.section}\n- ${entry.text}`)) : '';
  const retained = parsed.releases.filter(release => release.version.toLowerCase() !== target.toLowerCase() && release.version.toLowerCase() !== 'unreleased');
  const blocks = [parsed.preamble];
  if (version && remainingPending) blocks.push(`## [Unreleased]\n\n${remainingPending}`);
  blocks.push(`## [${target}]${version ? ` - ${date}` : ''}\n\n${body || 'No changes recorded.'}`);
  blocks.push(...retained.map(release => `${release.header}\n\n${release.body}`));
  return blocks.join('\n\n').trim() + '\n';
}

function symbols(source: string): string[] {
  const functions = [...source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)].map(match => match[1]!);
  const names = [...functions, ...[...source.matchAll(/(?:export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let)\s+|exports\.)([A-Za-z_$][\w$]*)/g)].map(match => match[1]!)];
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    names.push(...match[1]!.split(',').map(value => value.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()!).filter(name => /^[\w$]+$/.test(name)));
  }
  return [...new Set(names)].slice(0, 5);
}

/** Conservative offline summaries describe observable files/APIs without inventing intent. */
export function summarizeChanges(cwd: string, files: string[], version?: string): { message: string; notes: string } {
  const records: { file: string; section: string; text: string; action: string; names: string[]; runtime: boolean }[] = [];
  const tracked = new Set(gitAt(cwd, ['ls-files', '-z']).split('\0').filter(Boolean));
  for (const file of [...new Set(files)].filter(file => !automatic.test(file))) {
    const fullPath = path.join(cwd, file);
    const exists = fs.existsSync(fullPath);
    const added = !tracked.has(file) || gitAt(cwd, ['diff', 'HEAD', '--diff-filter=A', '--name-only', '--', `:(literal)${file}`]) !== '';
    const action = !exists ? 'Remove' : added ? 'Add' : 'Update';
    const diff = gitAt(cwd, ['diff', 'HEAD', '--', `:(literal)${file}`]);
    if (!added && !diff) continue;
    const runtime = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|cs|go|rs|an5)$/.test(file) && !/(?:^|\/)(?:test|tests|scripts)\//.test(file);
    if (file === 'package.json' && exists && !added) {
      try {
        const before = JSON.parse(gitAt(cwd, ['show', 'HEAD:package.json']));
        const after = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        delete before.version; delete after.version;
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
      } catch { /* A malformed manifest remains visible in the summary. */ }
    }
    const source = added && exists && runtime && fs.statSync(fullPath).isFile() && !fs.lstatSync(fullPath).isSymbolicLink() ? fs.readFileSync(fullPath, 'utf8').slice(0, 12000) : diff.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n');
    const names = runtime ? symbols(source) : [];
    const subject = names.length ? `${names.map(name => `\`${name}\``).join(', ')} in \`${file}\`` : `\`${file}\``;
    records.push({ file, action, names, runtime, section: action === 'Add' ? 'Added' : action === 'Remove' ? 'Removed' : 'Changed', text: `${action} ${subject}.` });
  }
  records.sort((a, b) => Number(b.runtime) - Number(a.runtime) || Number(b.runtime && b.action === 'Add') - Number(a.runtime && a.action === 'Add') || b.names.length - a.names.length || a.file.localeCompare(b.file));
  const primary = records[0];
  if (!primary) return { message: version ? `chore(release): prepare ${version}` : 'chore: synchronize generated artifacts', notes: '' };
  const docsOnly = records.every(record => /\.(?:md|mdx|rst)$/.test(record.file));
  const testsOnly = records.every(record => /(?:^|\/)(?:test|tests)\//.test(record.file));
  const type = docsOnly ? 'docs' : testsOnly ? 'test' : primary.runtime && primary.action === 'Add' ? 'feat' : 'chore';
  const parent = path.basename(path.dirname(primary.file));
  const scope = docsOnly ? 'docs' : testsOnly ? 'tests' : (['.', 'src'].includes(parent) ? path.basename(primary.file).replace(/\.[^.]+$/, '') : parent).replace(/[^\w-]/g, '-');
  const label = primary.names.length ? primary.names.slice(0, 2).map(name => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase()).join(' and ') : path.basename(primary.file).replace(/\.[^.]+$/, '');
  const subject = `${type}(${scope}): ${primary.action.toLowerCase()} ${label}`;
  const message = subject.length <= 72 ? subject : `${type}(${scope}): ${primary.action.toLowerCase()} ${path.basename(primary.file)}`.slice(0, 72);
  return { message: `${message}${records.length > 1 ? '\n\n' + records.slice(0, 6).map(record => `- ${record.text}`).join('\n') : ''}`, notes: mergeNotes(...records.map(record => `### ${record.section}\n- ${record.text}`)) };
}

export function isSpecificCommitMessage(message: string): boolean {
  const subject = message.split('\n')[0] || '';
  return /^(?:feat|fix|chore|refactor|docs|test|style|perf|build|ci|revert)(?:\([\w./-]+\))?!?:\s+\S/.test(subject) && subject.length <= 72 && !/^(?:\w+(?:\([^)]+\))?!?:\s*)?(?:update|improve|fix)\s+(?:code|files|changes|misc|project|components)\.?$/i.test(subject);
}

export function generatedNotes(content: string): string {
  if (!/^[-*]\s+\S/m.test(content)) return '';
  const meaningful = entries(content).filter(entry => !/^(?:feat|fix|chore|refactor|docs|test|style|perf|build|ci)(?:\([^)]+\))?!?:\s/.test(entry.text) && !/^(?:update|improve|fix)\s+(?:code|files|changes|misc)\.?$/i.test(entry.text));
  return mergeNotes(...meaningful.map(entry => `### ${entry.section}\n- ${entry.text}`));
}

export function releaseHistory(cwd: string, since?: string, files?: string[]): ReleaseHistory {
  let existing = '';
  try { existing = gitAt(cwd, ['show', 'HEAD:CHANGELOG.md']); } catch { /* New changelogs have no committed release boundary. */ }
  const lastVersion = splitChangelog(existing).releases.find(release => /^\d+\.\d+\.\d+/.test(release.version))?.version;
  let baseline: string | undefined;
  if (since) { baseline = gitAt(cwd, ['rev-parse', '--verify', `${since}^{commit}`]); gitAt(cwd, ['merge-base', '--is-ancestor', baseline, 'HEAD']); }
  else if (lastVersion) {
    try {
      const sha = gitAt(cwd, ['rev-parse', '--verify', `refs/tags/v${lastVersion}^{commit}`]);
      gitAt(cwd, ['merge-base', '--is-ancestor', sha, 'HEAD']); baseline = sha;
    } catch {
      // Untagged workspace packages still record a boundary in their changelog.
      const commits = gitAt(cwd, ['log', '--format=%H', '--', 'CHANGELOG.md']).split('\n').filter(Boolean);
      for (const sha of commits) {
        try {
          const before = gitAt(cwd, ['show', `${sha}^:CHANGELOG.md`]);
          const after = gitAt(cwd, ['show', `${sha}:CHANGELOG.md`]);
          const body = (text: string) => splitChangelog(text).releases.find(release => release.version === lastVersion)?.body;
          if (body(after) !== body(before)) { baseline = sha; break; }
        } catch { baseline = sha; break; }
      }
    }
  } else {
    const tags = gitAt(cwd, ['tag', '--merged', 'HEAD', '--sort=-version:refname', '--list', 'v*']).split('\n').filter(tag => /^v\d+\.\d+\.\d+(?:[-+].*)?$/.test(tag));
    if (tags[0]) baseline = gitAt(cwd, ['rev-parse', `${tags[0]}^{commit}`]);
  }
  const paths = files?.filter(file => !automatic.test(file));
  const args = ['log', '--reverse', '--format=%H%x1f%s%x1f%b%x1e', baseline ? `${baseline}..HEAD` : 'HEAD'];
  if (paths) args.push('--', ...(paths.length ? paths : ['__an5_no_selected_source__']).map(file => `:(literal)${file}`));
  else args.push('--', '.', ':(exclude)CHANGELOG.md', ':(exclude,glob)**/package-lock.json', ':(exclude,glob)**/dist/**', ':(exclude,glob)**/build/**');
  const commits = gitAt(cwd, args).split('\x1e').filter(record => record.trim()).map(record => {
    const [sha, subject, body] = record.trim().split('\x1f'); return { sha: sha!, subject: subject!, body: body || '' };
  });
  const notes = mergeNotes(...commits.flatMap(commit => {
    const match = commit.subject.match(/^(feat|fix|perf|refactor|docs|test|style|chore|build|ci|revert)(?:\([^)]+\))?(!)?:\s*(.+)$/);
    if (/^(?:initial(?: commit)?$|merge(?: pull request| branch)?\b)/i.test(commit.subject)) return [];
    if (/^(?:prepare|release|bump)\s+(?:workspace\s+)?(?:v?\d|version)/i.test(match?.[3] || commit.subject)) return [];
    if (!match) return [`### Changed\n- ${commit.subject} (${commit.sha.slice(0, 7)})`];
    const section = /^remove\s/i.test(match[3]!) ? 'Removed' : match[1] === 'feat' ? 'Added' : match[1] === 'fix' ? 'Fixed' : 'Changed';
    const details = commit.body.split('\n').filter(line => /^[-*]\s+/.test(line));
    const breaking = commit.body.match(/^BREAKING[ -]CHANGE:\s*([\s\S]+)$/m)?.[1]?.trim();
    return [`### ${section}\n${details.length ? details.join('\n') : `- ${match[3]} (${commit.sha.slice(0, 7)})`}`, ...(breaking || match[2] ? [`### Changed\n- Breaking change: ${breaking || match[3]}`] : [])];
  }));
  const diffArgs = baseline ? ['diff', baseline, 'HEAD'] : ['log', '--reverse', '-p', '--format=', 'HEAD'];
  if (paths) diffArgs.push('--', ...(paths.length ? paths : ['__an5_no_selected_source__']).map(file => `:(literal)${file}`));
  else diffArgs.push('--', '.', ':(exclude)CHANGELOG.md', ':(exclude,glob)**/package-lock.json', ':(exclude,glob)**/dist/**', ':(exclude,glob)**/build/**');
  const diff = gitAt(cwd, diffArgs).slice(0, 12000);
  return { ...(baseline ? { baseline } : {}), commits, notes, context: `Release baseline: ${baseline || 'first release'}\nCommits after the baseline:\n${commits.map(commit => `${commit.sha.slice(0, 7)} ${commit.subject}\n${commit.body}`).join('\n').slice(0, 8000)}\n\nCommitted source diff (may be truncated):\n${diff}` };
}

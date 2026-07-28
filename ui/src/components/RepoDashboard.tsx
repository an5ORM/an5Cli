import { useState } from 'react';
import { ConsoleBox } from './ConsoleBox';
import type { Repository } from './Sidebar';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || '';

function api(path: string) {
  return `${API_BASE}${path}`;
}

interface RepoDashboardProps {
  repo: Repository;
  onToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

type RunState = {
  label: string;
  success: boolean;
  output: string;
} | null;

export function RepoDashboard({ repo, onToast }: RepoDashboardProps) {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<RunState>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [pushRemote, setPushRemote] = useState(false);

  const runRepoAction = async (id: 'build' | 'test', label: string) => {
    setRunning(id);
    setResult(null);
    try {
      const endpoint = id === 'build' ? '/api/repo/build' : '/api/repo/test';
      const res = await fetch(api(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repo.name }),
      });
      const data = await res.json();
      const success = Boolean(data.success);
      setResult({ label, success, output: data.logs || data.output || (success ? 'Done.' : 'Failed.') });
      onToast?.(`${label}: ${success ? 'success' : 'failed'}`, success ? 'success' : 'error');
    } catch {
      setResult({ label, success: false, output: 'Connection error.' });
      onToast?.(`${label}: connection error`, 'error');
    } finally {
      setRunning(null);
    }
  };

  const publishRelease = async () => {
    if (!commitMsg.trim()) {
      onToast?.('Enter a commit message first', 'info');
      return;
    }

    setRunning('release');
    setResult({ label: 'Release', success: true, output: 'Publishing release...' });
    try {
      const res = await fetch(api('/api/release'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repo.name, message: commitMsg, push: pushRemote }),
      });
      const data = await res.json();
      const success = Boolean(data.success);
      setResult({ label: 'Release', success, output: data.logs || data.output || (success ? 'Release published.' : 'Release failed.') });
      onToast?.(success ? 'Release published' : 'Release failed', success ? 'success' : 'error');
    } catch {
      setResult({ label: 'Release', success: false, output: 'Connection error.' });
      onToast?.('Release connection error', 'error');
    } finally {
      setRunning(null);
    }
  };

  const modifiedCount = repo.modifiedFiles?.length || 0;

  return (
    <div className="simple-dashboard">
      <section className="simple-card">
        <div className="simple-card-header">
          <div>
            <h2>{repo.name}</h2>
            <p>{repo.description || 'No description'}</p>
          </div>
          <span className={`badge ${modifiedCount > 0 ? 'dirty' : 'clean'}`}>
            {modifiedCount > 0 ? `${modifiedCount} changed` : 'clean'}
          </span>
        </div>
        <div className="repo-path">{repo.path}</div>
      </section>

      <section className="simple-card">
        <h3>Checks</h3>
        <div className="simple-actions">
          <button className="btn btn-primary" onClick={() => runRepoAction('build', 'Build')} disabled={running !== null}>
            {running === 'build' ? 'Building...' : 'Build'}
          </button>
          <button className="btn btn-secondary" onClick={() => runRepoAction('test', 'Test')} disabled={running !== null}>
            {running === 'test' ? 'Testing...' : 'Test'}
          </button>
        </div>
      </section>

      <section className="simple-card">
        <h3>Release</h3>
        <textarea
          className="simple-textarea"
          placeholder="chore: update adapter"
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
        />
        <div className="release-row">
          <button className="btn btn-success" onClick={publishRelease} disabled={running !== null}>
            {running === 'release' ? 'Publishing...' : 'Publish'}
          </button>
          <label className="simple-checkbox">
            <input type="checkbox" checked={pushRemote} onChange={e => setPushRemote(e.target.checked)} />
            Push
          </label>
        </div>
      </section>

      {result && (
        <section className="simple-card">
          <div className="simple-result-title">
            <span>{result.label}</span>
            <span className={result.success ? 'result-ok' : 'result-error'}>{result.success ? 'OK' : 'Failed'}</span>
          </div>
          <ConsoleBox logs={result.output} isError={!result.success} />
        </section>
      )}
    </div>
  );
}

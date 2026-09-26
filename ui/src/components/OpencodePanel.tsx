import { useState, useEffect, useCallback } from 'react';
import { OperationStep } from './OperationStep';
import {
  IconSparkles,
  IconSearch,
  IconCode,
  IconFlask,
  IconHammer,
  IconX,
  IconRocket,
} from './Icons';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || '';
function api(path: string) { return `${API_BASE}${path}`; }

interface OpencodeSession {
  name: string;
  pid: string;
  memory?: string;
  url?: string;
}

interface OpencodePanelProps {
  workspace: string;
  onToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function OpencodePanel({ workspace, onToast }: OpencodePanelProps) {
  const [sessions, setSessions] = useState<OpencodeSession[]>([]);
  const [starting, setStarting] = useState(false);
  const [stoppingPid, setStoppingPid] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch(api('/api/opencode/sessions'));
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {
      // silent — panel stays usable without session list
    }
  }, []);

  useEffect(() => {
    loadSessions();
    const t = setInterval(loadSessions, 8000);
    return () => clearInterval(t);
  }, [loadSessions]);

  const handleStart = async (customPrompt?: string) => {
    setStarting(true);
    try {
      const body: any = { workspace };
      if (customPrompt) body.prompt = customPrompt;
      const res = await fetch(api('/api/opencode/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success && data.url) {
        onToast?.('Opencode started!', 'success');
        window.open(data.url, '_blank');
        setPrompt('');
        setShowPrompt(false);
        setTimeout(loadSessions, 2000);
      } else {
        onToast?.(data.error || 'Failed to start opencode', 'error');
      }
    } catch {
      onToast?.('Connection error', 'error');
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async (pid: string) => {
    setStoppingPid(pid);
    try {
      const res = await fetch(api('/api/opencode/stop'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid }),
      });
      const data = await res.json();
      if (data.success) {
        onToast?.('Session stopped', 'info');
        setTimeout(loadSessions, 1000);
      } else {
        onToast?.(data.error || 'Failed to stop', 'error');
      }
    } catch {
      onToast?.('Connection error', 'error');
    } finally {
      setStoppingPid(null);
    }
  };

  const quickActions = [
    { label: 'Review Code', icon: <IconSearch size={12} />, prompt: 'Review the code changes in this repository. Look for bugs, security issues, and improvements.' },
    { label: 'Fix Issues', icon: <IconCode size={12} />, prompt: 'Find and fix all issues in the codebase. Check for type errors, lint issues, and potential bugs.' },
    { label: 'Generate Tests', icon: <IconFlask size={12} />, prompt: 'Generate comprehensive tests for the code in this repository.' },
    { label: 'Refactor', icon: <IconHammer size={12} />, prompt: 'Analyze the codebase and suggest refactoring opportunities to improve code quality.' },
  ];

  return (
    <OperationStep stepNumber={0} title="Opencode" subtitle={sessions.length > 0 ? `${sessions.length} active session${sessions.length > 1 ? 's' : ''}` : 'AI assistant'} defaultOpen={false} badge={sessions.length > 0 ? String(sessions.length) : undefined}>
      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {quickActions.map(action => (
          <button
            key={action.label}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            onClick={() => handleStart(action.prompt)}
            disabled={starting}
          >
            {action.icon} {action.label}
          </button>
        ))}
        <button
          className="btn btn-accent btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          onClick={() => setShowPrompt(!showPrompt)}
        >
          <IconSparkles size={12} /> {showPrompt ? 'Cancel' : 'Custom'}
        </button>
      </div>

      {/* Custom Prompt */}
      {showPrompt && (
        <div style={{ marginBottom: '12px' }}>
          <textarea
            style={{
              width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
              borderRadius: '8px', padding: '10px', color: 'var(--color-text-main)',
              fontSize: '12px', fontFamily: 'var(--font-mono)', resize: 'vertical', minHeight: '60px'
            }}
            placeholder="Enter custom instructions for opencode..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
          <button
            className={`btn btn-accent btn-sm ${starting ? 'loading' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '8px' }}
            onClick={() => handleStart(prompt)}
            disabled={starting || !prompt.trim()}
          >
            <IconRocket size={12} /> {starting ? 'Starting…' : 'Launch Opencode'}
          </button>
        </div>
      )}

      {/* Start Button (default) */}
      {!showPrompt && (
        <button
          className={`btn btn-accent btn-sm ${starting ? 'loading' : ''}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginBottom: sessions.length > 0 ? '12px' : 0 }}
          onClick={() => handleStart()}
          disabled={starting}
        >
          <IconSparkles size={12} /> {starting ? 'Starting…' : 'Open Opencode'}
        </button>
      )}

      {/* Active Sessions */}
      {sessions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Active Sessions</div>
          {sessions.map(s => (
            <div key={s.pid} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
              borderRadius: '8px', padding: '10px 14px'
            }}>
              <span className="spinner" style={{ width: '10px', height: '10px', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', flex: 1 }}>
                {s.name || 'opencode'} (PID: {s.pid})
              </span>
              <button
                className="btn btn-secondary btn-xs"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                onClick={() => handleStop(s.pid)}
                disabled={stoppingPid === s.pid}
              >
                <IconX size={11} /> {stoppingPid === s.pid ? 'Stopping…' : 'Stop'}
              </button>
            </div>
          ))}
        </div>
      )}
    </OperationStep>
  );
}

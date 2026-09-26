import React, { useState, useEffect, useRef } from 'react';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || '';

function api(path: string) {
  return `${API_BASE}${path}`;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  gemini: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  custom: ['llama3', 'qwen2.5', 'mistral'],
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onToast }) => {
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showKey, setShowKey] = useState(false);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setApiKey('');
    setShowKey(false);
    setLoading(true);
    fetch(api('/api/config'))
      .then(res => res.json())
      .then(data => {
        setProvider(data.provider || 'openai');
        setHasApiKey(!!data.apiKey);
        setModel(data.model || '');
        setEndpoint(data.endpoint || '');
      })
      .catch(() => setError('Could not reach the backend server. Is `an5-cli ui` running?'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    firstFieldRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch(api('/api/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: apiKey.trim(), model: model.trim(), endpoint: endpoint.trim() })
      });
      const data = await response.json();
      if (data.success) {
        onToast?.('LLM configuration saved!', 'success');
        onClose();
      } else {
        setError(data.error || 'Failed to save configuration.');
      }
    } catch {
      setError('Connection error. Check that the UI server is running.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const suggestions = PROVIDER_MODELS[provider] || [];

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="LLM Configuration">
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>LLM Configuration</h3>
          <button className="btn-close" onClick={onClose} aria-label="Close settings">&times;</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loading-box">Loading current configuration…</div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && <div className="form-error">{error}</div>}
              <div className="form-group">
                <label htmlFor="settings-provider">LLM Provider</label>
                <select
                  id="settings-provider"
                  ref={firstFieldRef}
                  className="form-control"
                  value={provider}
                  onChange={e => setProvider(e.target.value)}
                >
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                  <option value="custom">Custom (Local / Ollama)</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="settings-key">
                  API Key
                  {hasApiKey && <span style={{ color: '#34d399', marginLeft: '8px', fontSize: '11px' }}>✓ configured</span>}
                </label>
                <div className="input-with-toggle">
                  <input
                    type={showKey ? 'text' : 'password'}
                    id="settings-key"
                    className="form-control"
                    placeholder={hasApiKey ? '•••••••• (leave blank to keep)' : 'Enter API key'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    autoComplete="off"
                  />
                  <button type="button" className="btn-input-toggle" onClick={() => setShowKey(v => !v)}>
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="settings-model">Model Name</label>
                <input
                  type="text"
                  id="settings-model"
                  className="form-control"
                  placeholder="gpt-4o-mini / gemini-2.5-flash / llama3"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  list="settings-model-suggestions"
                />
                <datalist id="settings-model-suggestions">
                  {suggestions.map(m => <option key={m} value={m} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label htmlFor="settings-endpoint">Endpoint URL</label>
                <input
                  type="text"
                  id="settings-endpoint"
                  className="form-control"
                  placeholder="https://api.openai.com/v1 or http://localhost:11434/api/chat"
                  value={endpoint}
                  onChange={e => setEndpoint(e.target.value)}
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button type="submit" className={`btn btn-primary ${saving ? 'loading' : ''}`} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Settings'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

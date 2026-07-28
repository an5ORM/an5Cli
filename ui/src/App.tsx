import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import type { Repository } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { DiffViewer } from './components/DiffViewer';
import { SettingsModal } from './components/SettingsModal';
import { ToastContainer, useToast } from './components/Toast';
import { RepoDashboard } from './components/RepoDashboard';

const API_BASE = import.meta.env.VITE_API_URL || '';

function api(path: string) {
  return `${API_BASE}${path}`;
}

export default function App() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toasts, addToast } = useToast();

  useEffect(() => { loadStatus(); }, []);

  const loadStatus = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(api('/api/status'));
      const data = await res.json();
      const list = data.repos || [];
      setRepos(list);
      setSelectedRepo(prev => {
        if (!prev) return list[0] || null;
        return list.find((repo: Repository) => repo.name === prev.name) || list[0] || null;
      });
    } catch {
      addToast('Failed to load workspace status', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (selectedRepo) loadDiff(selectedRepo.name, selectedFile);
  }, [selectedRepo?.name, selectedFile]);

  const handleSelectRepo = (repo: Repository) => {
    setSelectedRepo(repo);
    setSelectedFile(null);
    setSidebarOpen(false);
  };

  const loadDiff = async (repoName: string, file: string | null) => {
    setDiff('Loading git diff...');
    try {
      const url = `/api/diff?repo=${encodeURIComponent(repoName)}${file ? `&file=${encodeURIComponent(file)}` : ''}`;
      const res = await fetch(api(url));
      const data = await res.json();
      setDiff(data.diff || 'No diff output or clean workspace.');
    } catch {
      setDiff('Error loading git diff.');
    }
  };

  const handlePull = async () => {
    if (!selectedRepo) return;
    setIsPulling(true);
    try {
      const res = await fetch(api('/api/pull'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: selectedRepo.name }),
      });
      const data = await res.json();
      addToast(data.success ? 'Pull completed' : 'Pull failed', data.success ? 'success' : 'error');
      if (data.success) setTimeout(loadStatus, 800);
    } catch {
      addToast('Connection error', 'error');
    } finally {
      setIsPulling(false);
    }
  };

  const handleCopyDiff = () => {
    if (!selectedRepo) return;
    navigator.clipboard
      .writeText(diff)
      .then(() => addToast('Diff copied', 'success'))
      .catch(() => addToast('Failed to copy diff', 'error'));
  };

  return (
    <div className="app-container">
      <div className="mobile-header" style={{ display: 'none' }}>
        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? 'Close' : 'Menu'}
        </button>
        <span className="mobile-title">an5 CLI</span>
        <button className="btn-icon" onClick={() => setIsSettingsOpen(true)} title="Settings">Settings</button>
      </div>

      <div className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} />

      <Sidebar
        repos={repos}
        selectedRepo={selectedRepo}
        onSelectRepo={handleSelectRepo}
        onRefreshAll={loadStatus}
        isRefreshing={isRefreshing}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main-content">
        <Topbar
          selectedRepo={selectedRepo}
          onPull={handlePull}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isPulling={isPulling}
        />

        {selectedRepo ? (
          <div className="dashboard-grid">
            <DiffViewer
              repo={selectedRepo}
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
              diff={diff}
              onCopy={handleCopyDiff}
            />

            <section className="panel right-panel">
              <RepoDashboard repo={selectedRepo} onToast={addToast} />
            </section>
          </div>
        ) : (
          <div className="welcome-view">
            <div className="welcome-card">
              <h2>No repository selected</h2>
              <p>Refresh the workspace or choose a repository from the sidebar.</p>
            </div>
          </div>
        )}
      </main>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onToast={addToast} />
      <ToastContainer toasts={toasts} />
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import type { Repository } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { DiffViewer } from './components/DiffViewer';
import { SettingsModal } from './components/SettingsModal';
import { ToastContainer, useToast } from './components/Toast';
import { RepoDashboard } from './components/RepoDashboard';
import { ConsoleBox } from './components/ConsoleBox';
import {
  IconRefresh,
  IconHammer,
  IconFlask,
  IconBoxes,
  IconCheckCircle,
  IconAlertTriangle,
  IconGitBranch,
  IconGitMerge,
  IconFolderOpen,
  IconFileText,
} from './components/Icons';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || '';

function api(path: string) {
  return `${API_BASE}${path}`;
}

interface TabState {
  repo: Repository;
  selectedFile: string | null;
  diff: string;
}

function createEmptyTab(repo: Repository): TabState {
  return {
    repo,
    selectedFile: null,
    diff: '',
  };
}

export default function App() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [openTabs, setOpenTabs] = useState<TabState[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(-1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isCheckingOutMain, setIsCheckingOutMain] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Global Workspace Action States
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [workspaceConsole, setWorkspaceConsole] = useState<{ title: string; output: string; success: boolean } | null>(null);

  const { toasts, addToast } = useToast();

  const activeTab = activeTabIndex >= 0 ? openTabs[activeTabIndex] : null;

  useEffect(() => { loadStatus(); }, []);

  const handleSelectRepo = (repo: Repository | null) => {
    setSidebarOpen(false);
    if (!repo) {
      // Go to workspace overview
      setActiveTabIndex(-1);
      return;
    }
    const existing = openTabs.findIndex(t => t.repo.name === repo.name);
    if (existing >= 0) {
      setActiveTabIndex(existing);
      return;
    }
    const tab = createEmptyTab(repo);
    setOpenTabs(prev => {
      const newTabs = [...prev, tab];
      const newIndex = newTabs.length - 1;
      setActiveTabIndex(newIndex);
      loadDiff(newIndex, repo.name, null);
      return newTabs;
    });
  };

  const loadStatus = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(api('/api/status'));
      const data = await res.json();
      const list: Repository[] = data.repos || [];
      setRepos(list);
      // Update open tabs with fresh repo data
      setOpenTabs(prev => prev.map(tab => {
        const updated = list.find((r: Repository) => r.name === tab.repo.name);
        return updated ? { ...tab, repo: updated } : tab;
      }));
    } catch (e) {
      console.error('Failed to load status:', e);
      addToast('Failed to connect to backend server', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const updateTab = useCallback((index: number, patch: Partial<TabState>) => {
    setOpenTabs(prev => prev.map((tab, i) => i === index ? { ...tab, ...patch } : tab));
  }, []);

  const loadDiff = async (tabIndex: number, repoName: string, file: string | null) => {
    updateTab(tabIndex, { diff: 'Loading git diff...' });
    try {
      const res = await fetch(api(`/api/diff?repo=${encodeURIComponent(repoName)}` + (file ? `&file=${encodeURIComponent(file)}` : '')));
      const data = await res.json();
      updateTab(tabIndex, { diff: data.diff || 'No diff output or clean workspace.' });
    } catch {
      updateTab(tabIndex, { diff: 'Error loading git diff.' });
    }
  };

  const handleCloseTab = (index: number) => {
    setOpenTabs(prev => prev.filter((_, i) => i !== index));
    if (activeTabIndex >= openTabs.length - 1) {
      setActiveTabIndex(Math.min(activeTabIndex, openTabs.length - 2));
    } else if (index < activeTabIndex) {
      setActiveTabIndex(activeTabIndex - 1);
    } else if (index === activeTabIndex) {
      setActiveTabIndex(Math.min(index, openTabs.length - 2));
    }
  };

  const handleSelectFile = (file: string | null) => {
    if (!activeTab || activeTabIndex < 0) return;
    updateTab(activeTabIndex, { selectedFile: file });
    loadDiff(activeTabIndex, activeTab.repo.name, file);
  };

  const handlePull = async () => {
    if (!activeTab || activeTabIndex < 0) return;
    setIsPulling(true);
    try {
      const res = await fetch(api('/api/pull'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: activeTab.repo.name })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Pull completed for ${activeTab.repo.name}!`, 'success');
        setTimeout(loadStatus, 1000);
      } else {
        addToast('Pull failed!', 'error');
      }
    } catch {
      addToast('Connection error', 'error');
    } finally {
      setIsPulling(false);
    }
  };

  const handleCheckoutMain = async (targetRepo?: Repository) => {
    const target = targetRepo || activeTab?.repo;
    if (!target) return;
    setIsCheckingOutMain(true);
    try {
      const res = await fetch(api('/api/repo/checkout-main'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: target.name })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Switched ${target.name} to main branch!`, 'success');
        loadStatus();
      } else {
        addToast(`Failed to switch: ${data.logs || 'Error'}`, 'error');
      }
    } catch {
      addToast('Connection error', 'error');
    } finally {
      setIsCheckingOutMain(false);
    }
  };

  const handleSyncWorkspace = async () => {
    setIsSyncing(true);
    setWorkspaceConsole(null);
    try {
      const res = await fetch(api('/api/workspace/sync'), { method: 'POST' });
      const data = await res.json();
      setWorkspaceConsole({
        title: 'Workspace Submodules Sync',
        output: data.logs || (data.success ? 'Sync completed' : 'Sync failed'),
        success: data.success,
      });
      if (data.success) {
        addToast('All submodules synced and checked out to main!', 'success');
        loadStatus();
      } else {
        addToast('Workspace sync encountered errors', 'error');
      }
    } catch {
      addToast('Connection error', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBuildWorkspace = async () => {
    setIsBuilding(true);
    setWorkspaceConsole(null);
    try {
      const res = await fetch(api('/api/workspace/build'), { method: 'POST' });
      const data = await res.json();
      setWorkspaceConsole({
        title: 'Workspace Build',
        output: data.logs || (data.success ? 'Build completed' : 'Build failed'),
        success: data.success,
      });
      if (data.success) {
        addToast('Workspace build successful!', 'success');
      } else {
        addToast('Workspace build failed', 'error');
      }
    } catch {
      addToast('Connection error', 'error');
    } finally {
      setIsBuilding(false);
    }
  };

  const handleTestWorkspace = async () => {
    setIsTesting(true);
    setWorkspaceConsole(null);
    try {
      const res = await fetch(api('/api/workspace/test'), { method: 'POST' });
      const data = await res.json();
      setWorkspaceConsole({
        title: 'Workspace Tests',
        output: data.logs || (data.success ? 'Tests passed' : 'Tests failed'),
        success: data.success,
      });
      if (data.success) {
        addToast('Workspace tests passed!', 'success');
      } else {
        addToast('Workspace tests failed', 'error');
      }
    } catch {
      addToast('Connection error', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopyDiff = () => {
    if (!activeTab) return;
    navigator.clipboard.writeText(activeTab.diff).then(() => addToast('Diff copied to clipboard!', 'success')).catch(() => addToast('Failed to copy', 'error'));
  };

  const dirtyCount = repos.filter(r => r.modifiedFiles && r.modifiedFiles.length > 0).length;
  const detachedCount = repos.filter(r => r.isDetached).length;

  const t = activeTab;

  return (
    <div className="app-container">
      {/* Mobile Header */}
      <div className="mobile-header" style={{ display: 'none' }}>
        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? '✕' : '☰'}
        </button>
        <span className="mobile-title">an5ORM Workspace</span>
        <div className="mobile-header-actions">
          <button className="btn-icon" onClick={() => setIsSettingsOpen(true)} title="Settings">⚙️</button>
        </div>
      </div>

      {/* Sidebar backdrop for mobile */}
      <div 
        className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`} 
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar
        repos={repos}
        selectedRepo={activeTab?.repo || null}
        onSelectRepo={handleSelectRepo}
        onRefreshAll={loadStatus}
        onSyncWorkspace={handleSyncWorkspace}
        onBuildWorkspace={handleBuildWorkspace}
        onTestWorkspace={handleTestWorkspace}
        isRefreshing={isRefreshing}
        isSyncing={isSyncing}
        isBuilding={isBuilding}
        isTesting={isTesting}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main-content">
        {/* Tab Bar */}
        {openTabs.length > 0 && (
          <div className="tab-bar">
            {openTabs.map((tab, idx) => {
              const isDirty = tab.repo.modifiedFiles && tab.repo.modifiedFiles.length > 0;
              const isDetached = tab.repo.isDetached;
              return (
                <div
                  key={tab.repo.name}
                  className={`tab-item ${idx === activeTabIndex ? 'active' : ''} ${isDetached ? 'detached-tab' : ''}`}
                  onClick={() => setActiveTabIndex(idx)}
                >
                  <span className="tab-name">{tab.repo.name}</span>
                  {isDetached && (
                    <span className="tab-detached-icon" title="Detached HEAD" style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <IconAlertTriangle size={12} color="#fca5a5" />
                    </span>
                  )}
                  {isDirty && <span className="tab-dirty" title={`${tab.repo.modifiedFiles?.length} changes`} />}
                  <button
                    className="tab-close"
                    onClick={(e) => { e.stopPropagation(); handleCloseTab(idx); }}
                    title="Close tab"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <Topbar
          selectedRepo={activeTab?.repo || null}
          onPull={handlePull}
          onCheckoutMain={() => handleCheckoutMain()}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isPulling={isPulling}
          isCheckingOutMain={isCheckingOutMain}
        />

        {t ? (
          <div className="dashboard-grid">
            <DiffViewer
              repo={t.repo}
              selectedFile={t.selectedFile}
              onSelectFile={handleSelectFile}
              diff={t.diff}
              onCopy={handleCopyDiff}
            />

            <section className="panel right-panel">
              <RepoDashboard repo={t.repo} onToast={addToast} onRefreshRepo={loadStatus} />
            </section>
          </div>
        ) : (
          /* Workspace Overview Matrix View - Streamlined & Compact */
          <div className="welcome-view">
            <div className="overview-container">
              {/* Workspace Compact Summary & Actions Bar */}
              <div className="overview-header-bar">
                <div className="overview-metrics-strip">
                  <div className="metric-chip">
                    <IconBoxes size={14} color="var(--color-primary)" />
                    <span className="metric-val">{repos.length}</span>
                    <span className="metric-lbl">repos</span>
                  </div>
                  <div className="metric-chip">
                    {detachedCount === 0 ? (
                      <IconCheckCircle size={14} color="var(--color-success)" />
                    ) : (
                      <IconAlertTriangle size={14} color="var(--color-danger)" />
                    )}
                    <span className={`metric-val ${detachedCount > 0 ? 'text-danger' : 'text-success'}`}>
                      {detachedCount === 0 ? '100% Main' : `${detachedCount} Detached`}
                    </span>
                  </div>
                  <div className="metric-chip">
                    <IconFileText size={14} color={dirtyCount > 0 ? 'var(--color-warning)' : 'var(--color-success)'} />
                    <span className={`metric-val ${dirtyCount > 0 ? 'text-warning' : 'text-success'}`}>
                      {dirtyCount === 0 ? 'Clean' : `${dirtyCount} Modified`}
                    </span>
                  </div>
                </div>

                <div className="overview-batch-actions">
                  <button className={`btn btn-accent btn-sm ${isSyncing ? 'loading' : ''}`} onClick={handleSyncWorkspace} disabled={isSyncing} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <IconRefresh size={12} /> Sync All
                  </button>
                  <button className={`btn btn-primary btn-sm ${isBuilding ? 'loading' : ''}`} onClick={handleBuildWorkspace} disabled={isBuilding} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <IconHammer size={12} /> Build Workspace
                  </button>
                  <button className={`btn btn-secondary btn-sm ${isTesting ? 'loading' : ''}`} onClick={handleTestWorkspace} disabled={isTesting} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <IconFlask size={12} /> Test
                  </button>
                  <button className="btn btn-icon btn-sm" onClick={loadStatus} title="Refresh Status" style={{ width: '28px', height: '28px', padding: 0 }}>
                    <IconRefresh size={13} />
                  </button>
                </div>
              </div>

              {/* Workspace Console */}
              {workspaceConsole && (
                <div style={{ margin: '8px 0' }}>
                  <ConsoleBox
                    title={workspaceConsole.title}
                    content={workspaceConsole.output}
                    success={workspaceConsole.success}
                    onClear={() => setWorkspaceConsole(null)}
                  />
                </div>
              )}

              {/* Workspace Health Matrix Table */}
              <div className="health-table-card">
                <div className="table-wrapper">
                  <table className="workspace-matrix-table">
                    <thead>
                      <tr>
                        <th>Repository</th>
                        <th>Branch</th>
                        <th>Status</th>
                        <th>Commit</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repos.map(r => {
                        const isDirty = r.modifiedFiles && r.modifiedFiles.length > 0;
                        return (
                          <tr key={r.name} className={r.isDetached ? 'row-detached' : ''}>
                            <td className="repo-cell">
                              <span className="repo-name-link" onClick={() => handleSelectRepo(r)}>
                                {r.name}
                              </span>
                              {r.isParent && <span className="root-pill">root</span>}
                            </td>
                            <td>
                              <span className={`branch-pill ${r.isDetached ? 'detached' : 'normal'}`}>
                                {r.isDetached ? (
                                  <IconAlertTriangle size={10} color="#fca5a5" />
                                ) : (
                                  <IconGitBranch size={10} color="#6ee7b7" />
                                )}
                                {r.branch || 'main'}
                              </span>
                            </td>
                            <td>
                              <span className={`badge-compact ${isDirty ? 'dirty' : 'clean'}`}>
                                {isDirty ? `${r.modifiedFiles?.length} changes` : 'Clean'}
                              </span>
                            </td>
                            <td className="commit-cell" title={r.commitMessage}>
                              <code>#{r.commitHash || 'latest'}</code>
                              <span className="commit-desc">{r.commitMessage?.slice(0, 35)}</span>
                            </td>
                            <td className="actions-cell" style={{ justifyContent: 'flex-end' }}>
                              <button
                                className="btn-table-action"
                                onClick={() => handleSelectRepo(r)}
                                title="Open in Tab"
                                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                <IconFolderOpen size={11} /> Open
                              </button>
                              {r.isDetached && (
                                <button
                                  className="btn-table-action btn-table-fix"
                                  onClick={() => handleCheckoutMain(r)}
                                  title="Checkout main branch"
                                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <IconGitMerge size={11} /> Fix Main
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onToast={addToast} />
      <ToastContainer toasts={toasts} />
    </div>
  );
}

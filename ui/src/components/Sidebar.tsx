import React, { useState } from 'react';
import {
  IconZap,
  IconRefresh,
  IconHammer,
  IconFlask,
  IconDashboard,
  IconAlertTriangle,
  IconGitBranch,
  IconX,
} from './Icons';

export interface Repository {
  name: string;
  path: string;
  description: string;
  branch?: string;
  isDetached?: boolean;
  commitHash?: string;
  commitMessage?: string;
  modifiedFiles?: string[];
  isParent?: boolean;
}

interface SidebarProps {
  repos: Repository[];
  selectedRepo: Repository | null;
  onSelectRepo: (repo: Repository | null) => void;
  onRefreshAll: () => void;
  onSyncWorkspace?: () => void;
  onBuildWorkspace?: () => void;
  onTestWorkspace?: () => void;
  isRefreshing: boolean;
  isSyncing?: boolean;
  isBuilding?: boolean;
  isTesting?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  repos,
  selectedRepo,
  onSelectRepo,
  onRefreshAll,
  onSyncWorkspace,
  onBuildWorkspace,
  onTestWorkspace,
  isRefreshing,
  isSyncing = false,
  isBuilding = false,
  isTesting = false,
  isOpen = false,
  onClose: _onClose
}) => {
  const [filterText, setFilterText] = useState('');

  const filteredRepos = repos.filter(r => 
    r.name.toLowerCase().includes(filterText.toLowerCase()) ||
    (r.description && r.description.toLowerCase().includes(filterText.toLowerCase()))
  );

  const dirtyCount = repos.filter(r => r.modifiedFiles && r.modifiedFiles.length > 0).length;
  const detachedCount = repos.filter(r => r.isDetached).length;

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      {/* Sleek Brand Header */}
      <div className="brand">
        <div className="brand-title-group" onClick={() => onSelectRepo(null)} style={{ cursor: 'pointer' }} title="Go to Workspace Overview">
          <span className="logo">
            <IconZap size={18} color="var(--color-primary)" />
          </span>
          <div className="brand-name">
            <h1>an5ORM</h1>
            <span>Manager</span>
          </div>
        </div>

        <div className="brand-quick-actions">
          <button 
            className={`btn-icon-brand ${isRefreshing ? 'loading' : ''}`}
            onClick={onRefreshAll}
            disabled={isRefreshing}
            title="Refresh All Status"
          >
            <IconRefresh size={13} />
          </button>
          {onSyncWorkspace && (
            <button 
              className={`btn-icon-brand ${isSyncing ? 'loading' : ''}`}
              onClick={onSyncWorkspace}
              disabled={isSyncing}
              title="Sync all submodules to main"
            >
              <IconGitBranch size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Compact Search Bar */}
      <div className="sidebar-filter-wrapper">
        <input
          type="text"
          className="sidebar-search-input"
          placeholder="Filter repos..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        {filterText && (
          <button className="sidebar-search-clear" onClick={() => setFilterText('')} title="Clear">
            <IconX size={10} />
          </button>
        )}
      </div>

      <div className="sidebar-menu">
        {/* Workspace Overview Tab */}
        <div
          className={`overview-nav-btn ${selectedRepo === null ? 'active' : ''}`}
          onClick={() => onSelectRepo(null)}
          title="Workspace Overview & Matrix"
        >
          <div className="overview-nav-left">
            <IconDashboard size={14} color={selectedRepo === null ? 'var(--color-primary)' : 'var(--color-text-muted)'} />
            <span className="overview-nav-title">Overview</span>
          </div>
          <span className="overview-count-pill">{repos.length}</span>
        </div>

        {/* Repositories Section Header */}
        <div className="menu-header-row">
          <span className="menu-label">REPOSITORIES</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {dirtyCount > 0 && <span className="badge-dirty-count" title={`${dirtyCount} dirty repos`}>{dirtyCount} dirty</span>}
            {detachedCount > 0 && <span className="badge-detached-count" title={`${detachedCount} detached repos`}>{detachedCount} ⚠️</span>}
          </div>
        </div>

        {/* Clean High-Density Repository List */}
        <ul className="repo-list">
          {filteredRepos.length === 0 ? (
            <li className="loading-placeholder">
              {repos.length === 0 ? 'Loading repositories...' : 'No matching repos'}
            </li>
          ) : (
            filteredRepos.map(repo => {
              const isDirty = repo.modifiedFiles && repo.modifiedFiles.length > 0;
              const changesCount = repo.modifiedFiles?.length || 0;
              const isActive = selectedRepo?.name === repo.name;
              const isDetached = repo.isDetached;

              return (
                <li
                  key={repo.name}
                  className={`repo-row-item ${isActive ? 'active' : ''} ${isDetached ? 'detached-row' : ''}`}
                  onClick={() => onSelectRepo(repo)}
                  title={repo.description ? `${repo.name} - ${repo.description}` : repo.name}
                >
                  <div className="repo-row-left">
                    <span className="repo-row-name">{repo.name}</span>
                    {repo.isParent && <span className="root-pill">root</span>}
                  </div>

                  <div className="repo-row-right">
                    {isDetached ? (
                      <span className="detached-pill" title="Detached HEAD">
                        <IconAlertTriangle size={10} color="#fca5a5" />
                        <span>detached</span>
                      </span>
                    ) : isDirty ? (
                      <span className="dirty-pill" title={`${changesCount} modified files`}>
                        +{changesCount}
                      </span>
                    ) : (
                      <span className="clean-dot" title="Clean workspace" />
                    )}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {/* Sleek Workspace Action Footer */}
      <div className="sidebar-footer-toolbar">
        {onSyncWorkspace && (
          <button 
            className={`btn-toolbar-action ${isSyncing ? 'loading' : ''}`} 
            onClick={onSyncWorkspace}
            disabled={isSyncing}
            title="Sync all submodules to main"
          >
            <IconRefresh size={12} />
            <span>Sync</span>
          </button>
        )}
        {onBuildWorkspace && (
          <button 
            className={`btn-toolbar-action ${isBuilding ? 'loading' : ''}`} 
            onClick={onBuildWorkspace}
            disabled={isBuilding}
            title="Build all workspaces"
          >
            <IconHammer size={12} />
            <span>Build</span>
          </button>
        )}
        {onTestWorkspace && (
          <button 
            className={`btn-toolbar-action ${isTesting ? 'loading' : ''}`} 
            onClick={onTestWorkspace}
            disabled={isTesting}
            title="Test all workspaces"
          >
            <IconFlask size={12} />
            <span>Test</span>
          </button>
        )}
      </div>
    </aside>
  );
};

import React from 'react';
import type { Repository } from './Sidebar';
import {
  IconGitBranch,
  IconAlertTriangle,
  IconGitMerge,
  IconDownload,
  IconSettings,
} from './Icons';

interface TopbarProps {
  selectedRepo: Repository | null;
  onPull: () => void;
  onCheckoutMain?: () => void;
  onOpenSettings: () => void;
  isPulling: boolean;
  isCheckingOutMain?: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({
  selectedRepo,
  onPull,
  onCheckoutMain,
  onOpenSettings,
  isPulling,
  isCheckingOutMain = false
}) => {
  const isDirty = selectedRepo?.modifiedFiles && selectedRepo.modifiedFiles.length > 0;
  const isDetached = selectedRepo?.isDetached;
  const branchName = selectedRepo?.branch || 'main';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h2 className="topbar-title">{selectedRepo ? selectedRepo.name : 'Workspace Overview'}</h2>
        {selectedRepo && (
          <>
            <span className="topbar-path-chip" title={selectedRepo.path}>
              {selectedRepo.path}
            </span>
            <span className={`branch-badge ${isDetached ? 'detached' : 'normal'}`}>
              <span className="branch-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                {isDetached ? (
                  <IconAlertTriangle size={11} color="#fca5a5" />
                ) : (
                  <IconGitBranch size={11} color="#6ee7b7" />
                )}
              </span>
              {branchName}
            </span>
            {selectedRepo.commitHash && (
              <span className="commit-badge" title={selectedRepo.commitMessage}>
                #{selectedRepo.commitHash}
              </span>
            )}
            {isDetached && onCheckoutMain && (
              <button
                className={`btn-fix-branch ${isCheckingOutMain ? 'loading' : ''}`}
                onClick={onCheckoutMain}
                disabled={isCheckingOutMain}
                title="Switch detached HEAD to main branch and pull latest"
              >
                <IconGitMerge size={11} />
                <span>Fix Main</span>
              </button>
            )}
          </>
        )}
      </div>

      <div className="topbar-actions">
        {selectedRepo && (
          <button
            className={`btn-topbar-action ${isPulling ? 'loading' : ''}`}
            onClick={onPull}
            disabled={isPulling}
            title="Pull Latest Changes"
          >
            <IconDownload size={13} />
            <span>Pull</span>
          </button>
        )}
        {selectedRepo && (
          <span className={`badge-compact ${isDirty ? 'dirty' : 'clean'}`}>
            {isDirty ? `${selectedRepo.modifiedFiles?.length} dirty` : 'Clean'}
          </span>
        )}
        <button
          className="btn-icon-topbar"
          onClick={onOpenSettings}
          title="Settings & LLM"
        >
          <IconSettings size={15} />
        </button>
      </div>
    </header>
  );
};

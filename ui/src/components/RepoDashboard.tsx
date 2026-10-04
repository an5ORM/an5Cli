import React, { useState, useEffect } from 'react';
import { ConsoleBox } from './ConsoleBox';
import { OpencodePanel } from './OpencodePanel';
import type { Repository } from './Sidebar';
import {
  IconSettings,
  IconUpload,
  IconDownload,
  IconSprout,
  IconTrash,
  IconRefresh,
  IconSearch,
  IconCheckCircle,
  IconCode,
  IconTerminal,
  IconCpu,
  IconHammer,
  IconFlask,
  IconZap,
  IconAlertTriangle,
  IconGitMerge,
  IconFileText,
  IconPlus,
  IconFolder,
  IconCheck,
  IconRocket,
  IconSparkles,
  IconX,
} from './Icons';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || '';

function api(path: string) {
  return `${API_BASE}${path}`;
}

interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in-progress' | 'reviewed' | 'done';
  file?: string;
  createdAt: string;
}

interface RepoAction {
  id: string;
  label: string;
  variant: 'primary' | 'accent' | 'success' | 'danger';
  endpoint: string;
  confirm?: string;
}

interface RepoActionsConfig {
  [repoName: string]: RepoAction[];
}

export function renderActionIcon(id: string) {
  switch (id) {
    case 'generate': return <IconSettings size={15} />;
    case 'db:push': return <IconUpload size={15} />;
    case 'db:pull': return <IconDownload size={15} />;
    case 'db:seed': return <IconSprout size={15} />;
    case 'db:cleanup': return <IconTrash size={15} />;
    case 'db:migrate': return <IconRefresh size={15} />;
    case 'rag:index': return <IconSearch size={15} />;
    case 'validate': return <IconCheckCircle size={15} />;
    case 'test:python': return <IconCode size={15} />;
    case 'test:dotnet': return <IconTerminal size={15} />;
    case 'test:go': return <IconCpu size={15} />;
    case 'build': return <IconHammer size={15} />;
    case 'test': return <IconFlask size={15} />;
    default: return <IconZap size={15} />;
  }
}

const REPO_ACTIONS: RepoActionsConfig = {
  an5Orm: [
    { id: 'generate', label: 'Generate ORM', variant: 'accent', endpoint: '/api/repo/run', confirm: 'Run code generator?' },
    { id: 'db:push', label: 'DB Push', variant: 'primary', endpoint: '/api/repo/run', confirm: 'Push schema to database?' },
    { id: 'db:pull', label: 'DB Pull', variant: 'primary', endpoint: '/api/repo/run', confirm: 'Pull schema from database?' },
    { id: 'db:seed', label: 'DB Seed', variant: 'success', endpoint: '/api/repo/run', confirm: 'Seed database?' },
    { id: 'db:cleanup', label: 'DB Cleanup', variant: 'danger', endpoint: '/api/repo/run', confirm: 'Cleanup database?' },
    { id: 'db:migrate', label: 'DB Migrate', variant: 'accent', endpoint: '/api/repo/run', confirm: 'Run migration?' },
  ],
  an5Agent: [
    { id: 'rag:index', label: 'RAG Index', variant: 'accent', endpoint: '/api/repo/run' },
  ],
  an5Schema: [
    { id: 'validate', label: 'Validate Schemas', variant: 'success', endpoint: '/api/repo/run' },
  ],
  an5Adapters: [
    { id: 'test:python', label: 'Test Python', variant: 'accent', endpoint: '/api/repo/run' },
    { id: 'test:dotnet', label: 'Test .NET', variant: 'primary', endpoint: '/api/repo/run' },
    { id: 'test:go', label: 'Test Go', variant: 'accent', endpoint: '/api/repo/run' },
  ],
  an5Client: [
    { id: 'test:python', label: 'Test Python Client', variant: 'accent', endpoint: '/api/repo/run' },
    { id: 'test:dotnet', label: 'Test .NET Client', variant: 'primary', endpoint: '/api/repo/run' },
    { id: 'test:go', label: 'Test Go Client', variant: 'accent', endpoint: '/api/repo/run' },
  ],
};

const COMMON_ACTIONS: RepoAction[] = [
  { id: 'build', label: 'Build', variant: 'primary', endpoint: '/api/repo/build' },
  { id: 'test', label: 'Run Tests', variant: 'accent', endpoint: '/api/repo/test' },
];

interface RepoDashboardProps {
  repo: Repository;
  onToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  onRefreshRepo?: () => void;
}

export function RepoDashboard({ repo, onToast, onRefreshRepo }: RepoDashboardProps) {
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ id: string; success: boolean; output: string } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'all' | 'todo' | 'in-progress' | 'done'>('all');
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newTaskFile, setNewTaskFile] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);
  const [openingTask, setOpeningTask] = useState<string | null>(null);


  // Branch checkout state
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Review state
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState('');
  const [reviewOutput, setReviewOutput] = useState('');

  // Release state
  const [commitMsg, setCommitMsg] = useState('');
  const [isMsgGenerating, setIsMsgGenerating] = useState(false);
  const [pushRemote, setPushRemote] = useState(false);
  const [releaseVersion, setReleaseVersion] = useState('');
  const [releaseTag, setReleaseTag] = useState('');
  const [updateReleaseDocs, setUpdateReleaseDocs] = useState(false);
  const [verifyPublishedRelease, setVerifyPublishedRelease] = useState(false);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseResult, setReleaseResult] = useState('');
  const [releaseConsole, setReleaseConsole] = useState('');
  const [releaseSuccess, setReleaseSuccess] = useState<boolean | null>(null);

  const repoActions = REPO_ACTIONS[repo.name] || [];
  const allActions = [...repoActions, ...COMMON_ACTIONS];

  const loadTasks = async () => {
    setTasksLoading(true);
    try {
      const res = await fetch(api(`/api/tasks?workspace=${encodeURIComponent(repo.path)}`));
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch {
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  };


  useEffect(() => { loadTasks(); }, [repo.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheckoutMain = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch(api('/api/repo/checkout-main'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repo.name })
      });
      const data = await res.json();
      if (data.success) {
        onToast?.(`Switched ${repo.name} to main branch!`, 'success');
        onRefreshRepo?.();
      } else {
        onToast?.(`Failed: ${data.logs || 'Unknown error'}`, 'error');
      }
    } catch {
      onToast?.('Connection error', 'error');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleRunAction = async (action: RepoAction) => {
    if (action.confirm && !confirm(action.confirm)) return;
    setRunningAction(action.id);
    setActionResult(null);
    try {
      const res = await fetch(api(action.endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repo.name, script: action.id }),
      });
      const data = await res.json();
      setActionResult({ id: action.id, success: data.success, output: data.logs || data.output || (data.success ? 'Done!' : 'Failed') });
      onToast?.(`${action.label}: ${data.success ? 'Success' : 'Failed'}`, data.success ? 'success' : 'error');
    } catch {
      setActionResult({ id: action.id, success: false, output: 'Connection error' });
      onToast?.(`${action.label}: Connection error`, 'error');
    } finally {
      setRunningAction(null);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setCreatingTask(true);
    try {
      const res = await fetch(api('/api/tasks/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: repo.path,
          title: newTaskTitle.trim(),
          description: newTaskDesc.trim(),
          priority: newTaskPriority,
          file: newTaskFile.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onToast?.('Task created successfully!', 'success');
        setNewTaskTitle('');
        setNewTaskDesc('');
        setNewTaskFile('');
        setShowNewTaskModal(false);
        loadTasks();
      } else {
        onToast?.('Failed to create task', 'error');
      }
    } catch {
      onToast?.('Connection error', 'error');
    } finally {
      setCreatingTask(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: string) => {
    try {
      const res = await fetch(api('/api/tasks/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: repo.path, taskId, status }),
      });
      const data = await res.json();
      if (data.success) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: status as any } : t));
        onToast?.(`Task status updated to ${status}`, 'success');
      }
    } catch {
      onToast?.('Failed to update task', 'error');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      const res = await fetch(api('/api/tasks/delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: repo.path, taskId }),
      });
      const data = await res.json();
      if (data.success) {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        onToast?.('Task deleted', 'info');
      }
    } catch {
      onToast?.('Failed to delete task', 'error');
    }
  };

  const handleOpenInOpencode = async (task: Task) => {
    setOpeningTask(task.id);
    try {
      const prompt = `Fix the following issue:\n\n**Task:** ${task.title}\n**Description:** ${task.description}\n${task.file ? `**File:** ${task.file}` : ''}\n\nAnalyze the codebase and fix this issue. When done, update tasks.json.`;
      const res = await fetch(api('/api/opencode/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: repo.path, prompt }),
      });
      const data = await res.json();
      if (data.success && data.url) {
        onToast?.('Opencode session started!', 'success');
        window.open(data.url, '_blank');
      } else {
        onToast?.(data.error || 'Failed to start opencode', 'error');
      }
    } catch {
      onToast?.('Connection error', 'error');
    } finally {
      setOpeningTask(null);
    }
  };

  const handleRunReview = async () => {
    setReviewLoading(true);
    setReviewResult('Analyzing changes with LLM...');
    setReviewOutput('');
    try {
      const res = await fetch(api('/api/review'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repo.name }),
      });
      const data = await res.json();
      if (data.success && data.review) {
        setReviewResult('Analysis complete!');
        setReviewOutput(data.review);
        loadTasks();
      } else {
        setReviewResult('Review failed.');
        setReviewOutput(data.error || 'Failed to communicate with LLM.');
      }
    } catch {
      setReviewResult('Request failed.');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleGenerateMsg = async () => {
    setIsMsgGenerating(true);
    try {
      const res = await fetch(api('/api/commit-msg'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repo.name }),
      });
      const data = await res.json();
      if (data.success && data.message) {
        setCommitMsg(data.message);
        onToast?.('Commit message generated!', 'success');
      } else {
        onToast?.('Failed to generate message', 'error');
      }
    } catch {
      onToast?.('Connection error', 'error');
    } finally {
      setIsMsgGenerating(false);
    }
  };

  const handleRelease = async () => {
    if (!commitMsg.trim()) {
      onToast?.('Enter a commit message first', 'info');
      return;
    }
    setReleaseLoading(true);
    setReleaseResult('Running delivery checks...');
    setReleaseConsole('');
    setReleaseSuccess(null);
    try {
      const res = await fetch(api('/api/release'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repo.name, message: commitMsg, push: pushRemote, version: releaseVersion || undefined, tag: releaseTag || undefined, updateDocs: updateReleaseDocs, verifyRelease: verifyPublishedRelease }),
      });
      const data = await res.json();
      setReleaseConsole(data.logs || '');
      if (data.success) {
        const outcome = data.published ? 'Release and publication verified.' : pushRemote ? 'Committed and pushed. Publication has not been verified.' : 'Changes committed locally.';
        setReleaseResult(outcome);
        setReleaseSuccess(true);
        onToast?.(outcome, 'success');
        onRefreshRepo?.();
      } else {
        setReleaseResult('Release failed.');
        setReleaseSuccess(false);
        onToast?.('Release failed', 'error');
      }
    } catch {
      setReleaseResult('Release request error.');
      setReleaseSuccess(false);
      onToast?.('Connection error', 'error');
    } finally {
      setReleaseLoading(false);
    }
  };

  const filteredTasks = tasks.filter(t => {
    if (taskFilter === 'all') return true;
    if (taskFilter === 'done') return t.status === 'done' || t.status === 'reviewed';
    return t.status === taskFilter;
  });

  return (
    <div className="repo-dashboard-container">
      {/* Detached HEAD Warning Banner */}
      {repo.isDetached && (
        <div className="detached-warning-banner">
          <div className="banner-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconAlertTriangle size={20} color="#fca5a5" />
          </div>
          <div className="banner-content">
            <h4>Detached HEAD Warning: Repo is not on a branch</h4>
            <p>
              This repository is pointing directly to commit <code>#{repo.commitHash}</code> instead of the <code>main</code> branch.
              Any commits created now will be orphaned.
            </p>
          </div>
          <button
            className={`btn-action-banner ${checkoutLoading ? 'loading' : ''}`}
            onClick={handleCheckoutMain}
            disabled={checkoutLoading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <IconGitMerge size={14} />
            {checkoutLoading ? 'Switching...' : 'Switch to main branch'}
          </button>
        </div>
      )}

      {/* Repo Meta Overview Bar - Compact Strip */}
      <div className="repo-meta-strip">
        <div className="meta-chip">
          <span className="meta-chip-label">Branch:</span>
          <span className={`meta-chip-val ${repo.isDetached ? 'detached' : ''}`}>
            {repo.isDetached ? '⚠️ ' : ''}{repo.branch || 'main'}
          </span>
        </div>
        <div className="meta-chip">
          <span className="meta-chip-label">Commit:</span>
          <span className="meta-chip-val font-mono" title={repo.commitMessage}>#{repo.commitHash || 'latest'}</span>
        </div>
        <div className="meta-chip">
          <span className="meta-chip-label">Tree:</span>
          <span className={`meta-chip-val ${repo.modifiedFiles && repo.modifiedFiles.length > 0 ? 'dirty-text' : 'clean-text'}`}>
            {repo.modifiedFiles && repo.modifiedFiles.length > 0 ? `${repo.modifiedFiles.length} modified` : 'Clean'}
          </span>
        </div>
      </div>

      {/* Action Scripts Section */}
      <div className="dashboard-section">
        <div className="section-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconZap size={18} color="var(--color-primary)" />
            Quick Scripts & Actions
          </h3>
          <span className="section-subtitle">Run builds, tests, generators & migrations</span>
        </div>
        <div className="action-buttons-grid">
          {allActions.map(action => (
            <button
              key={action.id}
              className={`btn-action-card variant-${action.variant} ${runningAction === action.id ? 'loading' : ''}`}
              onClick={() => handleRunAction(action)}
              disabled={runningAction !== null}
            >
              <span className="btn-action-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {renderActionIcon(action.id)}
              </span>
              <span className="btn-action-label">{action.label}</span>
            </button>
          ))}
        </div>

        {actionResult && (
          <div className="action-console-wrapper">
            <ConsoleBox
              title={`Script Output [${actionResult.id}]`}
              content={actionResult.output}
              success={actionResult.success}
              onClear={() => setActionResult(null)}
            />
          </div>
        )}
      </div>

      {/* Opencode Sessions Bar */}
      <OpencodePanel
        workspace={repo.path}
        onToast={onToast}
      />

      {/* Tasks Section */}
      <div className="dashboard-section">
        <div className="section-header flex-between">
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconFileText size={18} color="var(--color-accent)" />
              Tasks & Code Issues
            </h3>
            <span className="section-subtitle">Manage automated LLM review findings and developer todos</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowNewTaskModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <IconPlus size={14} /> New Task
          </button>
        </div>

        {/* Task Tabs */}
        <div className="task-filter-tabs">
          <button className={`tab-btn ${taskFilter === 'all' ? 'active' : ''}`} onClick={() => setTaskFilter('all')}>
            All ({tasks.length})
          </button>
          <button className={`tab-btn ${taskFilter === 'todo' ? 'active' : ''}`} onClick={() => setTaskFilter('todo')}>
            Todo ({tasks.filter(t => t.status === 'todo').length})
          </button>
          <button className={`tab-btn ${taskFilter === 'in-progress' ? 'active' : ''}`} onClick={() => setTaskFilter('in-progress')}>
            In Progress ({tasks.filter(t => t.status === 'in-progress').length})
          </button>
          <button className={`tab-btn ${taskFilter === 'done' ? 'active' : ''}`} onClick={() => setTaskFilter('done')}>
            Done ({tasks.filter(t => t.status === 'done' || t.status === 'reviewed').length})
          </button>
        </div>

        {tasksLoading ? (
          <div className="loading-box">Loading tasks...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="empty-tasks-box">
            <span style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <IconCheckCircle size={28} color="var(--color-success)" />
            </span>
            <p>No tasks in this view. Run LLM Code Review or click "+ New Task" to add one.</p>
          </div>
        ) : (
          <div className="task-list-grid">
            {filteredTasks.map(task => (
              <div key={task.id} className={`task-card priority-${task.priority} status-${task.status}`}>
                <div className="task-card-header">
                  <div className="task-badges">
                    <span className={`priority-badge ${task.priority}`}>{task.priority}</span>
                    <span className={`status-badge ${task.status}`}>{task.status}</span>
                  </div>
                  <button className="btn-icon-xs" onClick={() => handleDeleteTask(task.id)} title="Delete Task" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IconX size={12} />
                  </button>
                </div>
                <h4 className="task-title">{task.title}</h4>
                {task.description && <p className="task-desc">{task.description}</p>}
                {task.file && (
                  <div className="task-file" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <IconFolder size={12} /> {task.file}
                  </div>
                )}

                <div className="task-actions-row">
                  {task.status !== 'in-progress' && task.status !== 'done' && (
                    <button className="btn-task-action" onClick={() => handleUpdateTaskStatus(task.id, 'in-progress')}>
                      Start
                    </button>
                  )}
                  {task.status !== 'done' && (
                    <button className="btn-task-action btn-success" onClick={() => handleUpdateTaskStatus(task.id, 'done')} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <IconCheck size={12} /> Done
                    </button>
                  )}
                  {task.status === 'done' && (
                    <button className="btn-task-action" onClick={() => handleUpdateTaskStatus(task.id, 'todo')}>
                      Reopen
                    </button>
                  )}
                  <button
                    className={`btn-task-action btn-opencode ${openingTask === task.id ? 'loading' : ''}`}
                    onClick={() => handleOpenInOpencode(task)}
                    disabled={openingTask !== null}
                    title="Solve in Opencode Web AI"
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <IconRocket size={12} /> Opencode
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Code Review & Release Section */}
      <div className="dashboard-section">
        <div className="section-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconSparkles size={18} color="var(--color-primary)" />
            AI Code Review & Release
          </h3>
          <span className="section-subtitle">Analyze unstaged diff, generate commit messages and release</span>
        </div>

        <div className="review-and-release-grid">
          {/* AI Code Review Box */}
          <div className="glass-card review-card">
            <h4>1. Intelligent Code Review</h4>
            <p className="card-desc">Scan current diff with LLM to spot bugs, type errors, or breaking changes.</p>
            <button
              className={`btn btn-primary ${reviewLoading ? 'loading' : ''}`}
              onClick={handleRunReview}
              disabled={reviewLoading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <IconSearch size={14} />
              {reviewLoading ? 'Reviewing Code...' : 'Run LLM Code Review'}
            </button>

            {reviewResult && (
              <div className="review-result-box">
                <span className="review-status-label">{reviewResult}</span>
                {reviewOutput && <pre className="review-pre">{reviewOutput}</pre>}
              </div>
            )}
          </div>

          {/* Release Box */}
          <div className="glass-card release-card">
            <h4>2. Commit & Release</h4>
            <div className="commit-input-wrapper">
              <div className="input-header">
                <label>Commit Message</label>
                <button
                  className={`btn-text-action ${isMsgGenerating ? 'loading' : ''}`}
                  onClick={handleGenerateMsg}
                  disabled={isMsgGenerating}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <IconSparkles size={12} /> AI Suggest Message
                </button>
              </div>
              <textarea
                className="commit-textarea"
                rows={3}
                placeholder="feat(core): update runtime features..."
                value={commitMsg}
                onChange={e => setCommitMsg(e.target.value)}
              />
            </div>

            <div className="release-controls">
              <label>
                Version (optional)
                <input aria-label="Release version" value={releaseVersion} onChange={e => setReleaseVersion(e.target.value)} placeholder="1.0.1" disabled={releaseLoading} />
              </label>
              <label>
                Tag (optional)
                <input aria-label="Release tag" value={releaseTag} onChange={e => setReleaseTag(e.target.value)} placeholder="v1.0.1" disabled={releaseLoading} />
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={updateReleaseDocs} onChange={e => setUpdateReleaseDocs(e.target.checked)} disabled={releaseLoading} />
                Update documentation from code changes
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={verifyPublishedRelease} onChange={e => setVerifyPublishedRelease(e.target.checked)} disabled={releaseLoading || !pushRemote || !releaseTag} />
                Verify CI and published release
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={pushRemote}
                  onChange={e => { setPushRemote(e.target.checked); if (!e.target.checked) setVerifyPublishedRelease(false); }}
                />
                Push to remote ({repo.branch || 'main'})
              </label>

              <button
                className={`btn btn-success ${releaseLoading ? 'loading' : ''}`}
                onClick={handleRelease}
                disabled={releaseLoading || (verifyPublishedRelease && (!pushRemote || !releaseTag))}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <IconRocket size={14} />
                {releaseLoading ? 'Processing...' : verifyPublishedRelease ? 'Commit, Push & Verify Release' : pushRemote ? 'Commit & Push' : 'Commit Changes'}
              </button>
            </div>

            {releaseResult && (
              <div className={`release-status-box ${releaseSuccess === true ? 'success' : releaseSuccess === false ? 'error' : ''}`}>
                <span>{releaseResult}</span>
              </div>
            )}
            {releaseConsole && (
              <ConsoleBox title="Release Logs" content={releaseConsole} success={releaseSuccess} onClear={() => setReleaseConsole('')} />
            )}
          </div>
        </div>
      </div>

      {/* New Task Modal */}
      {showNewTaskModal && (
        <div className="modal-backdrop" onClick={() => setShowNewTaskModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Task</h3>
              <button className="modal-close" onClick={() => setShowNewTaskModal(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconX size={14} />
              </button>
            </div>
            <form onSubmit={handleCreateTask}>
              <div className="form-group">
                <label>Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Refactor relation client query executor"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows={3}
                  placeholder="Provide context, reproduction steps, or implementation details..."
                  value={newTaskDesc}
                  onChange={e => setNewTaskDesc(e.target.value)}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Priority</label>
                  <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value as any)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Target File (Optional)</label>
                  <input
                    type="text"
                    placeholder="src/index.ts"
                    value={newTaskFile}
                    onChange={e => setNewTaskFile(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewTaskModal(false)}>Cancel</button>
                <button type="submit" className={`btn btn-primary ${creatingTask ? 'loading' : ''}`} disabled={creatingTask}>
                  {creatingTask ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

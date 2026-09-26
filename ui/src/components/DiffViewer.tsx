import React, { useState, useMemo } from 'react';
import type { Repository } from './Sidebar';
import {
  IconCopy,
  IconFileText,
  IconCheck,
  IconX,
  IconFolder,
  IconFolderOpen,
  IconGitBranch,
} from './Icons';

interface DiffViewerProps {
  repo: Repository;
  selectedFile: string | null;
  onSelectFile: (file: string | null) => void;
  diff: string;
  onCopy: () => void;
}

interface TreeNode {
  name: string;
  fullPath: string;
  status: string;
  statusClass: string;
  children?: TreeNode[];
  isDir?: boolean;
}

function buildFileTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();

  const sorted = [...files].sort();

  for (const file of sorted) {
    // Porcelain v1: 2-char status (XY) + space + path, e.g. " M src/a.ts", "A  src/b.ts", "?? new.ts", "R  old -> new"
    const xy = file.slice(0, 2);
    let rawPath = file.slice(3).trim();
    // Renames carry "old -> new": the diff viewer works on the new path.
    if (rawPath.includes(' -> ')) {
      rawPath = rawPath.split(' -> ').pop()!.trim();
    }
    // Strip surrounding quotes git adds for paths with spaces.
    const cleanPath = rawPath.replace(/^"|"$/g, '');

    let status = 'M';
    let statusClass = 'modified';
    if (xy === '??') { status = 'U'; statusClass = 'untracked'; }
    else if (xy.includes('A')) { status = 'A'; statusClass = 'added'; }
    else if (xy.includes('D')) { status = 'D'; statusClass = 'deleted'; }
    else if (xy.includes('R') || xy.includes('C')) { status = 'R'; statusClass = 'renamed'; }

    const parts = cleanPath.split('/');

    if (parts.length === 1) {
      root.push({ name: parts[0] ?? cleanPath, fullPath: cleanPath, status, statusClass });
    } else {
      let currentLevel = root;
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        const segment = parts[i] ?? '';
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        let dir = dirMap.get(currentPath);
        if (!dir) {
          dir = { name: segment, fullPath: currentPath, status: '', statusClass: '', isDir: true, children: [] };
          dirMap.set(currentPath, dir);
          currentLevel.push(dir);
        }
        currentLevel = dir.children!;
      }
      currentLevel.push({
        name: parts[parts.length - 1] ?? cleanPath,
        fullPath: cleanPath,
        status,
        statusClass,
      });
    }
  }
  return root;
}

const TreeItem: React.FC<{
  node: TreeNode;
  depth: number;
  selectedFile: string | null;
  onSelectFile: (f: string) => void;
}> = ({ node, depth, selectedFile, onSelectFile }) => {
  const [open, setOpen] = useState(true);
  const isActive = selectedFile === node.fullPath;

  if (node.isDir) {
    return (
      <div>
        <button
          className="diff-tree-dir"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => setOpen(!open)}
        >
          {open ? <IconFolderOpen size={12} color="#6ee7b7" /> : <IconFolder size={12} color="#6ee7b7" />}
          <span className="diff-tree-dir-name">{node.name}</span>
        </button>
        {open && node.children?.map((child, i) => (
          <TreeItem key={i} node={child} depth={depth + 1} selectedFile={selectedFile} onSelectFile={onSelectFile} />
        ))}
      </div>
    );
  }

  return (
    <button
      className={`diff-tree-file ${isActive ? 'active' : ''}`}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
      onClick={() => onSelectFile(node.fullPath)}
      title={node.fullPath}
    >
      <span className={`diff-status-letter ${node.statusClass}`}>{node.status}</span>
      <span className="diff-tree-filename">{node.name}</span>
    </button>
  );
};

export const DiffViewer: React.FC<DiffViewerProps> = ({
  repo,
  selectedFile,
  onSelectFile,
  diff,
  onCopy
}) => {
  const [copied, setCopied] = useState(false);
  const [fileFilter, setFileFilter] = useState('');

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const modifiedFiles = repo.modifiedFiles || [];

  const filteredFiles = useMemo(() => {
    if (!fileFilter) return modifiedFiles;
    return modifiedFiles.filter(f => f.toLowerCase().includes(fileFilter.toLowerCase()));
  }, [modifiedFiles, fileFilter]);

  const fileTree = useMemo(() => buildFileTree(filteredFiles), [filteredFiles]);

  const stats = useMemo(() => {
    if (!diff) return { additions: 0, deletions: 0 };
    let add = 0, del = 0;
    const lines = diff.split('\n');
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) add++;
      else if (line.startsWith('-') && !line.startsWith('---')) del++;
    }
    return { additions: add, deletions: del };
  }, [diff]);

  const renderDiffLines = () => {
    if (!diff || diff === 'Loading git diff...') {
      return (
        <div className="diff-empty-state">
          <div className="diff-spinner" />
          <span>Loading diff...</span>
        </div>
      );
    }
    if (modifiedFiles.length === 0 || diff === 'No diff output or clean workspace.') {
      return (
        <div className="diff-empty-state clean">
          <IconCheck size={22} color="#10b981" />
          <span>Working tree is clean</span>
        </div>
      );
    }

    const lines = diff.split('\n');
    let oldNum = 0, newNum = 0;

    return lines.map((line, idx) => {
      let cls = 'diff-ctx';
      let oldStr = '', newStr = '';
      let prefix = ' ';

      if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
        cls = 'diff-meta';
        prefix = '';
      } else if (line.startsWith('@@')) {
        cls = 'diff-hunk-line';
        prefix = '';
        const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (m) { oldNum = parseInt(m[1]); newNum = parseInt(m[2]); }
      } else if (line.startsWith('+')) {
        cls = 'diff-add-line';
        prefix = '+';
        newStr = String(newNum++);
      } else if (line.startsWith('-')) {
        cls = 'diff-del-line';
        prefix = '-';
        oldStr = String(oldNum++);
      } else if (line.trim() !== '') {
        cls = 'diff-ctx';
        prefix = ' ';
        oldStr = oldNum > 0 ? String(oldNum++) : '';
        newStr = newNum > 0 ? String(newNum++) : '';
      }

      const content = (cls === 'diff-meta' || cls === 'diff-hunk-line') ? line : line.slice(1);

      return (
        <div key={idx} className={`dlr ${cls}`}>
          <span className="dl-num">{oldStr}</span>
          <span className="dl-num">{newStr}</span>
          <span className="dl-pfx">{prefix}</span>
          <span className="dl-txt">{content}</span>
        </div>
      );
    });
  };

  return (
    <section className="panel left-panel diff-panel">
      {/* Left: File Tree */}
      <div className="diff-files-sidebar">
        <div className="diff-files-header">
          <div className="diff-files-title">
            <IconFileText size={13} color="var(--color-primary)" />
            <span>Files</span>
            <span className="diff-file-count">{modifiedFiles.length}</span>
          </div>
          <div className="diff-file-search-wrap">
            <input
              className="diff-file-search"
              type="text"
              placeholder="Filter..."
              value={fileFilter}
              onChange={e => setFileFilter(e.target.value)}
            />
            {fileFilter && (
              <button className="diff-search-clear" onClick={() => setFileFilter('')}>
                <IconX size={10} />
              </button>
            )}
          </div>
        </div>

        <div className="diff-tree-scroll">
          {/* All Changes */}
          <button
            className={`diff-tree-file all-changes ${selectedFile === null ? 'active' : ''}`}
            style={{ paddingLeft: '8px' }}
            onClick={() => onSelectFile(null)}
          >
            <span className="diff-status-letter all">~</span>
            <span className="diff-tree-filename">All Changes</span>
          </button>

          {fileTree.map((node, i) => (
            <TreeItem
              key={i}
              node={node}
              depth={0}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      </div>

      {/* Right: Code Diff */}
      <div className="diff-code-viewer">
        <div className="diff-viewer-toolbar">
          <div className="diff-toolbar-left">
            <IconGitBranch size={12} color="var(--color-primary)" />
            <span className="diff-target-label">{selectedFile || 'All Modified Files'}</span>
            {(stats.additions > 0 || stats.deletions > 0) && (
              <div className="diff-stat-pills">
                <span className="diff-stat-add">+{stats.additions}</span>
                <span className="diff-stat-del">-{stats.deletions}</span>
              </div>
            )}
          </div>
          <button className={`btn-diff-copy ${copied ? 'copied' : ''}`} onClick={handleCopy}>
            {copied ? <IconCheck size={12} color="#10b981" /> : <IconCopy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <div className="diff-code-scroll">
          {renderDiffLines()}
        </div>
      </div>
    </section>
  );
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  FileDiff,
  FilePlus,
  FileText,
  FileX,
  GitBranch,
  GitCommit,
  GitPullRequest,
  RefreshCw,
  Upload,
  Download,
  Edit3,
  AlertCircle,
  Minus,
  Plus,
} from 'lucide-react';
import { requestJson } from '../utils/editorApi';

interface GitFile {
  path: string;
  previousPath?: string | null;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  staged: boolean;
  unstaged: boolean;
}

interface GitStatusResponse {
  currentBranch: string;
  branches: string[];
  remoteName?: string | null;
  files: GitFile[];
}

interface GitDiffResponse {
  filePath: string;
  staged: string;
  unstaged: string;
}

interface GitPanelProps {
  apiUrl: string;
  workspaceSessionId: string | null;
  repo: {
    owner: string;
    name: string;
    fullName: string;
    defaultBranch: string;
  };
  onFileClick: (path: string) => void;
  onWorkspaceRefresh?: () => void;
}

// ── Colour tokens (matches the app's navy palette) ────────────────────────────
const C = {
  bg:          '#151932',
  bgDeep:      '#0a0e27',
  surface:     '#1e2139',
  surfaceHover:'#252b47',
  border:      '#2a3f5f',
  borderSoft:  'rgba(42,63,95,0.5)',
  text:        '#e2e8f0',
  textMuted:   '#94a3b8',
  textFaint:   '#64748b',
  blue:        '#3b82f6',
  blueHover:   '#2563eb',
};

const statusConfig: Record<GitFile['status'], { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  modified:  { label: 'M', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: <Edit3   className="h-3.5 w-3.5" style={{ color: '#f59e0b' }} /> },
  added:     { label: 'A', color: '#10b981', bg: 'rgba(16,185,129,0.12)',  icon: <FilePlus className="h-3.5 w-3.5" style={{ color: '#10b981' }} /> },
  deleted:   { label: 'D', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   icon: <FileX   className="h-3.5 w-3.5" style={{ color: '#ef4444' }} /> },
  renamed:   { label: 'R', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  icon: <FileText className="h-3.5 w-3.5" style={{ color: '#60a5fa' }} /> },
  untracked: { label: 'U', color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', icon: <FileText className="h-3.5 w-3.5" style={{ color: '#94a3b8' }} /> },
};

// ── Diff line coloring ────────────────────────────────────────────────────────
const DiffViewer: React.FC<{ content: string }> = ({ content }) => (
  <pre
    style={{
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 11,
      lineHeight: '1.6',
      overflowX: 'auto',
      padding: '12px 0',
      margin: 0,
      whiteSpace: 'pre',
    }}
  >
    {content.split('\n').map((line, i) => {
      let bg = 'transparent';
      let color = C.textMuted;
      if (line.startsWith('+') && !line.startsWith('+++')) { bg = 'rgba(16,185,129,0.10)'; color = '#6ee7b7'; }
      else if (line.startsWith('-') && !line.startsWith('---')) { bg = 'rgba(239,68,68,0.10)'; color = '#fca5a5'; }
      else if (line.startsWith('@@')) { color = '#93c5fd'; }
      else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) { color = C.textFaint; }
      return (
        <span key={i} style={{ display: 'block', backgroundColor: bg, color, paddingLeft: 16, paddingRight: 16 }}>
          {line || ' '}
        </span>
      );
    })}
  </pre>
);

// ── File row ──────────────────────────────────────────────────────────────────
const FileRow: React.FC<{
  file: GitFile;
  isSelected: boolean;
  isBusy: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onStage: () => void;
  onUnstage: () => void;
}> = ({ file, isSelected, isBusy, onSelect, onOpen, onStage, onUnstage }) => {
  const cfg = statusConfig[file.status];
  const fileName = file.path.split('/').pop() ?? file.path;
  const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';

  return (
    <div
      style={{
        background: isSelected ? 'rgba(59,130,246,0.08)' : C.surface,
        border: `1px solid ${isSelected ? 'rgba(59,130,246,0.35)' : C.borderSoft}`,
        borderRadius: 10,
        padding: '8px 10px',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Top row: status dot · filename · badge */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Status badge */}
        <span
          style={{
            minWidth: 18,
            height: 18,
            borderRadius: 5,
            background: cfg.bg,
            color: cfg.color,
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            letterSpacing: '0.02em',
            flexShrink: 0,
          }}
        >
          {cfg.label}
        </span>

        {/* Filename */}
        <button
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName}
          </div>
          {dir && (
            <div style={{ fontSize: 10, color: C.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
              {dir}
            </div>
          )}
          {file.previousPath && (
            <div style={{ fontSize: 10, color: C.textFaint, marginTop: 1 }}>
              ← {file.previousPath.split('/').pop()}
            </div>
          )}
        </button>

        {/* Diff icon */}
        <button
          onClick={onSelect}
          title="View diff"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: isSelected ? C.blue : C.textFaint, flexShrink: 0 }}
        >
          <FileDiff className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Bottom row: stage/unstage */}
      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        {file.staged ? (
          <button
            onClick={onUnstage}
            disabled={isBusy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
              padding: '3px 10px', borderRadius: 20,
              border: `1px solid ${C.borderSoft}`,
              background: 'transparent', color: C.textMuted,
              cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = C.surfaceHover)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Minus className="h-2.5 w-2.5" /> Unstage
          </button>
        ) : (
          <button
            onClick={onStage}
            disabled={isBusy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
              padding: '3px 10px', borderRadius: 20,
              border: `1px solid ${C.borderSoft}`,
              background: 'transparent', color: C.textMuted,
              cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = C.surfaceHover)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Plus className="h-2.5 w-2.5" /> Stage
          </button>
        )}
      </div>
    </div>
  );
};

// ── Section label ─────────────────────────────────────────────────────────────
const SectionLabel: React.FC<{ label: string; count: number }> = ({ label, count }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: C.textFaint, textTransform: 'uppercase' }}>
      {label}
    </span>
    <span style={{ fontSize: 10, color: C.textFaint, background: C.surface, borderRadius: 10, padding: '1px 7px', border: `1px solid ${C.borderSoft}` }}>
      {count}
    </span>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const GitPanel: React.FC<GitPanelProps> = ({
  apiUrl,
  workspaceSessionId,
  repo,
  onFileClick,
  onWorkspaceRefresh,
}) => {
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedDiffPath, setSelectedDiffPath] = useState<string>('');
  const [diff, setDiff] = useState<GitDiffResponse | null>(null);
  const [branchDraft, setBranchDraft] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [showPrComposer, setShowPrComposer] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success' | 'info'; message: string } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const request = useCallback(async <T,>(pathname: string, init: RequestInit = {}, fallbackMessage = 'Request failed') =>
    requestJson<T>(`${apiUrl}${pathname}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    }, fallbackMessage), [apiUrl]);

  const changedFiles = useMemo(() => status?.files || [], [status?.files]);
  const stagedFiles   = useMemo(() => changedFiles.filter(f => f.staged),              [changedFiles]);
  const unstagedFiles = useMemo(() => changedFiles.filter(f => f.unstaged || !f.staged), [changedFiles]);

  const fetchStatus = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!workspaceSessionId) return;
    if (!options.silent) setIsRefreshing(true);
    try {
      const next = await request<GitStatusResponse>(`/workspace/${workspaceSessionId}/git/status`, {}, 'Failed to load git status');
      setStatus(next);
      if (!selectedDiffPath && next.files[0]?.path) setSelectedDiffPath(next.files[0].path);
      else if (selectedDiffPath && !next.files.some(f => f.path === selectedDiffPath)) setSelectedDiffPath(next.files[0]?.path || '');
    } catch (err) {
      setNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to load git status' });
    } finally {
      setIsRefreshing(false);
    }
  }, [request, selectedDiffPath, workspaceSessionId]);

  useEffect(() => { if (workspaceSessionId) void fetchStatus(); }, [fetchStatus, workspaceSessionId, repo.fullName]);

  useEffect(() => {
    if (!workspaceSessionId || !selectedDiffPath) { setDiff(null); return; }
    let cancelled = false;
    void (async () => {
      try {
        const d = await request<GitDiffResponse>(`/workspace/${workspaceSessionId}/git/diff?path=${encodeURIComponent(selectedDiffPath)}`, {}, 'Failed to load diff');
        if (!cancelled) setDiff(d);
      } catch { if (!cancelled) setDiff(null); }
    })();
    return () => { cancelled = true; };
  }, [request, selectedDiffPath, workspaceSessionId]);

  const runAction = async <T,>(action: () => Promise<T>, successMessage?: string) => {
    setIsBusy(true);
    setNotice(null);
    try {
      const result = await action();
      await fetchStatus({ silent: true });
      onWorkspaceRefresh?.();
      if (successMessage) setNotice({ tone: 'success', message: successMessage });
      return result;
    } catch (err) {
      setNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Git action failed' });
      throw err;
    } finally {
      setIsBusy(false);
    }
  };

  const switchBranch = async (branchName: string) => {
    const next = branchName.trim();
    if (!workspaceSessionId || !next) return;
    await runAction(
      () => request(`/workspace/${workspaceSessionId}/git/branch`, { method: 'POST', body: JSON.stringify({ branchName: next }) }, 'Failed to switch branch'),
      `Switched to ${next}`
    );
    setBranchDraft('');
    setShowBranchDropdown(false);
  };

  const createPullRequest = async () => {
    if (!workspaceSessionId) return;
    const title = prTitle.trim();
    if (!title) { setNotice({ tone: 'error', message: 'Pull request title is required' }); return; }
    const result = await runAction(
      () => request<{ url: string; number: number }>(
        `/workspace/${workspaceSessionId}/git/pull-request`,
        { method: 'POST', body: JSON.stringify({ title, body: prBody, baseBranch: repo.defaultBranch }) },
        'Failed to create pull request'
      ),
      'Pull request created'
    );
    if (result?.url) window.open(result.url, '_blank', 'noopener,noreferrer');
    setShowPrComposer(false);
    setPrBody('');
    setPrTitle('');
  };

  if (!workspaceSessionId) {
    return (
      <div style={{ background: C.bg, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'center' }}>
        <span style={{ color: C.textMuted, fontSize: 13 }}>Preparing the repository workspace…</span>
      </div>
    );
  }

  const diffContent = diff ? (diff.unstaged || diff.staged) : '';

  return (
    <div style={{ background: C.bg, height: '100%', display: 'flex', flexDirection: 'column', color: C.text, overflow: 'hidden' }}>

      {/* ── Top bar ──────────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 12px', background: C.surface }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {/* Branch pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <GitBranch style={{ width: 14, height: 14, color: C.blue, flexShrink: 0 }} />
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowBranchDropdown(v => !v)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: C.bg, border: `1px solid ${C.border}`,
                  borderRadius: 20, padding: '3px 10px 3px 10px',
                  fontSize: 12, fontWeight: 600, color: C.text,
                  cursor: 'pointer', transition: 'border-color 0.15s',
                }}
              >
                <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {status?.currentBranch || repo.defaultBranch}
                </span>
                <ChevronDown style={{ width: 12, height: 12 }} />
              </button>

              {showBranchDropdown && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 30, marginTop: 6,
                  width: 220, background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 12, padding: 8, boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                }}>
                  <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                    {(status?.branches || []).map(b => (
                      <button
                        key={b}
                        onClick={() => void switchBranch(b)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 8,
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 12, color: b === status?.currentBranch ? C.blue : C.text,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.surfaceHover)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b}</span>
                        {b === status?.currentBranch && <Check style={{ width: 12, height: 12, flexShrink: 0 }} />}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                    <input
                      value={branchDraft}
                      onChange={e => setBranchDraft(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && void switchBranch(branchDraft)}
                      placeholder="Create or switch…"
                      style={{
                        width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: '6px 10px', fontSize: 12, color: C.text,
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                    <button
                      onClick={() => void switchBranch(branchDraft)}
                      style={{
                        marginTop: 6, width: '100%', background: C.blue, border: 'none',
                        borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600,
                        color: '#fff', cursor: 'pointer', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.blueHover)}
                      onMouseLeave={e => (e.currentTarget.style.background = C.blue)}
                    >
                      Switch
                    </button>
                  </div>
                </div>
              )}
            </div>
            <span style={{ fontSize: 11, color: C.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {repo.fullName}
            </span>
          </div>

          {/* Action icons */}
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            {([
              { icon: <RefreshCw style={{ width: 13, height: 13 }} className={isRefreshing ? 'animate-spin' : ''} />, title: 'Refresh', onClick: () => void fetchStatus(), disabled: isRefreshing },
              { icon: <Download style={{ width: 13, height: 13 }} />, title: 'Pull', onClick: () => void runAction(() => request(`/workspace/${workspaceSessionId}/git/pull`, { method: 'POST' }, 'Pull failed'), 'Pulled latest changes'), disabled: isBusy },
              { icon: <Upload style={{ width: 13, height: 13 }} />,   title: 'Push', onClick: () => void runAction(() => request(`/workspace/${workspaceSessionId}/git/push`, { method: 'POST' }, 'Push failed'), 'Pushed changes'),       disabled: isBusy },
            ] as const).map(({ icon, title, onClick, disabled }, idx) => (
              <button
                key={idx}
                onClick={onClick}
                disabled={disabled}
                title={title}
                style={{
                  background: 'none', border: 'none', borderRadius: 7, padding: 6,
                  color: C.textMuted, cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
                  opacity: disabled ? 0.45 : 1,
                }}
                onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = C.bg; e.currentTarget.style.color = C.text; } }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = C.textMuted; }}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Notice banner ─────────────────────────────────────── */}
      {notice && (
        <div style={{
          margin: '8px 12px 0',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 12,
          border: `1px solid ${notice.tone === 'error' ? 'rgba(239,68,68,0.25)' : notice.tone === 'success' ? 'rgba(16,185,129,0.25)' : C.borderSoft}`,
          background: notice.tone === 'error' ? 'rgba(239,68,68,0.08)' : notice.tone === 'success' ? 'rgba(16,185,129,0.08)' : C.surface,
          color: notice.tone === 'error' ? '#fca5a5' : notice.tone === 'success' ? '#6ee7b7' : C.text,
        }}>
          {notice.message}
        </div>
      )}

      {/* ── Commit area ───────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 12px' }}>
        <textarea
          value={commitMessage}
          onChange={e => setCommitMessage(e.target.value)}
          placeholder="Commit message…"
          rows={2}
          style={{
            width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '8px 10px', fontSize: 12, color: C.text,
            outline: 'none', resize: 'vertical', boxSizing: 'border-box',
            fontFamily: 'inherit', lineHeight: 1.5, transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.target.style.borderColor = C.blue)}
          onBlur={e => (e.target.style.borderColor = C.border)}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
          {[
            { label: 'Stage All',   disabled: isBusy || changedFiles.length === 0, action: () => request(`/workspace/${workspaceSessionId}/git/stage-all`,   { method: 'POST' }, 'Failed to stage all'),   success: 'Staged all' },
            { label: 'Unstage All', disabled: isBusy || stagedFiles.length === 0,  action: () => request(`/workspace/${workspaceSessionId}/git/unstage-all`, { method: 'POST' }, 'Failed to unstage all'), success: 'Unstaged all' },
          ].map(({ label, disabled, action, success }) => (
            <button
              key={label}
              onClick={() => void runAction(action, success)}
              disabled={disabled}
              style={{
                fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
                border: `1px solid ${C.border}`, background: 'transparent', color: C.textMuted,
                cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = C.surfaceHover; e.currentTarget.style.color = C.text; } }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted; }}
            >
              {label}
            </button>
          ))}

          <button
            onClick={() => void runAction(async () => {
              const r = await request<{ commitSha: string }>(
                `/workspace/${workspaceSessionId}/git/commit`,
                { method: 'POST', body: JSON.stringify({ message: commitMessage }) },
                'Failed to commit'
              );
              setCommitMessage('');
              return r;
            }, 'Commit created')}
            disabled={isBusy || !commitMessage.trim() || stagedFiles.length === 0}
            style={{
              marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 20,
              border: 'none', background: C.blue, color: '#fff',
              cursor: (isBusy || !commitMessage.trim() || stagedFiles.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (isBusy || !commitMessage.trim() || stagedFiles.length === 0) ? 0.45 : 1,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = C.blueHover; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.blue; }}
          >
            <GitCommit style={{ width: 12, height: 12 }} /> Commit
          </button>
        </div>
      </div>

      {/* ── File list + diff ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateRows: 'minmax(0,1.3fr) minmax(0,1fr)', overflow: 'hidden' }}>

        {/* File list */}
        <div style={{ overflowY: 'auto', borderBottom: `1px solid ${C.border}`, padding: '10px 12px' }}>
          {changedFiles.length === 0 ? (
            <div style={{
              border: `1px dashed ${C.borderSoft}`, borderRadius: 10,
              padding: '24px 16px', textAlign: 'center', color: C.textFaint, fontSize: 12,
            }}>
              Working tree is clean
            </div>
          ) : (
            <>
              {stagedFiles.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <SectionLabel label="Staged" count={stagedFiles.length} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {stagedFiles.map(f => (
                      <FileRow
                        key={f.path}
                        file={f}
                        isSelected={selectedDiffPath === f.path}
                        isBusy={isBusy}
                        onSelect={() => setSelectedDiffPath(f.path)}
                        onOpen={() => onFileClick(f.path)}
                        onStage={() => void runAction(() => request(`/workspace/${workspaceSessionId}/git/stage`,   { method: 'POST', body: JSON.stringify({ path: f.path }) }, `Failed to stage ${f.path}`),   `${f.path} staged`)}
                        onUnstage={() => void runAction(() => request(`/workspace/${workspaceSessionId}/git/unstage`, { method: 'POST', body: JSON.stringify({ path: f.path }) }, `Failed to unstage ${f.path}`), `${f.path} unstaged`)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {unstagedFiles.length > 0 && (
                <div>
                  <SectionLabel label="Changes" count={unstagedFiles.length} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {unstagedFiles.map(f => (
                      <FileRow
                        key={f.path}
                        file={f}
                        isSelected={selectedDiffPath === f.path}
                        isBusy={isBusy}
                        onSelect={() => setSelectedDiffPath(f.path)}
                        onOpen={() => onFileClick(f.path)}
                        onStage={() => void runAction(() => request(`/workspace/${workspaceSessionId}/git/stage`,   { method: 'POST', body: JSON.stringify({ path: f.path }) }, `Failed to stage ${f.path}`),   `${f.path} staged`)}
                        onUnstage={() => void runAction(() => request(`/workspace/${workspaceSessionId}/git/unstage`, { method: 'POST', body: JSON.stringify({ path: f.path }) }, `Failed to unstage ${f.path}`), `${f.path} unstaged`)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {status && (
                <div style={{
                  marginTop: 10, display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: 8,
                  background: C.surface, border: `1px solid ${C.borderSoft}`,
                  fontSize: 11, color: C.textFaint,
                }}>
                  <AlertCircle style={{ width: 12, height: 12, flexShrink: 0 }} />
                  {stagedFiles.length} staged · {unstagedFiles.length} unstaged
                </div>
              )}
            </>
          )}
        </div>

        {/* Diff + PR */}
        <div style={{ overflowY: 'auto', padding: '10px 12px' }}>
          {/* Diff header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: C.textFaint, textTransform: 'uppercase' }}>
              Diff Preview
            </span>
            {selectedDiffPath && (
              <span style={{ fontSize: 10, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                {selectedDiffPath.split('/').pop()}
              </span>
            )}
          </div>

          {/* Diff content */}
          <div style={{
            background: C.bgDeep, border: `1px solid ${C.border}`,
            borderRadius: 10, overflow: 'hidden',
          }}>
            {diffContent ? (
              <DiffViewer content={diffContent} />
            ) : (
              <div style={{ padding: '16px', fontSize: 12, color: C.textFaint }}>
                {selectedDiffPath ? 'No diff available.' : 'Select a changed file to inspect the diff.'}
              </div>
            )}
          </div>

          {/* PR section */}
          <div style={{
            marginTop: 12, background: C.surface, border: `1px solid ${C.borderSoft}`,
            borderRadius: 10, padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: 0 }}>Open Pull Request</p>
                <p style={{ fontSize: 11, color: C.textFaint, margin: '3px 0 0', lineHeight: 1.4 }}>
                  Push first, then create a GitHub PR from this branch.
                </p>
              </div>
              <button
                onClick={() => setShowPrComposer(v => !v)}
                style={{
                  flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
                  border: `1px solid ${C.border}`, background: 'transparent', color: C.textMuted,
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; e.currentTarget.style.color = C.text; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textMuted; }}
              >
                <GitPullRequest style={{ width: 12, height: 12 }} />
                {showPrComposer ? 'Hide' : 'Compose'}
              </button>
            </div>

            {showPrComposer && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={prTitle}
                  onChange={e => setPrTitle(e.target.value)}
                  placeholder="Pull request title"
                  style={{
                    width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: '7px 10px', fontSize: 12, color: C.text,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.target.style.borderColor = C.blue)}
                  onBlur={e => (e.target.style.borderColor = C.border)}
                />
                <textarea
                  value={prBody}
                  onChange={e => setPrBody(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                  style={{
                    width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: '7px 10px', fontSize: 12, color: C.text,
                    outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                  onFocus={e => (e.target.style.borderColor = C.blue)}
                  onBlur={e => (e.target.style.borderColor = C.border)}
                />
                <button
                  onClick={() => void createPullRequest()}
                  disabled={isBusy}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 11, fontWeight: 700, padding: '6px 16px', borderRadius: 20,
                    border: 'none', background: C.blue, color: '#fff',
                    cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.5 : 1,
                    transition: 'background 0.15s', alignSelf: 'flex-start',
                  }}
                  onMouseEnter={e => { if (!isBusy) e.currentTarget.style.background = C.blueHover; }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.blue; }}
                >
                  <GitPullRequest style={{ width: 12, height: 12 }} /> Create Pull Request
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GitPanel;

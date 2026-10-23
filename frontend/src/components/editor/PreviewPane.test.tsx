import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PreviewPane from './PreviewPane';

const MonacoStub = () => <div data-testid="monaco" />;

type Props = ComponentProps<typeof PreviewPane>;

const baseProps: Props = {
  compilationMode: 'repository',
  activeTab: { language: 'xml', content: '<p/>' },
  editorWidth: 50,
  onEditorResizeStart: vi.fn(),
  onEditorDidMount: vi.fn(),
  onEditorChange: vi.fn(),
  MonacoEditor: MonacoStub,
  srcDocContent: null,
  compiling: false,
  collaborationEnabled: false,
  collaborators: [],
  collaborationStatus: '',
  getParticipantName: () => 'someone',
  getParticipantInitials: () => 'S',
  compileRepository: vi.fn(),
  jumpToRelatedPreview: vi.fn(async () => undefined),
  setEditorWidth: vi.fn(),
  previewUrl: null,
  previewFrameKey: 0,
  compiledOutput: '',
  sessionId: null,
  apiUrl: 'http://api.test',
  previewHistory: [],
  previewDiffEnabled: false,
  previewBaseSnapshotId: null,
  onTogglePreviewDiff: vi.fn(),
  onSelectPreviewBaseSnapshot: vi.fn(),
  splitView: true,
  compilerRuntime: 'wasm',
  onChangeCompilerRuntime: vi.fn(),
};

const renderPane = (props: Partial<Props> = {}) => render(<PreviewPane {...baseProps} {...props} />);

describe('PreviewPane layout', () => {
  it('shows the editor beside the preview in repository mode', () => {
    renderPane();
    expect(screen.getByTestId('monaco')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('keeps the draft preview beside the editor after a file is opened (file mode)', () => {
    renderPane({ compilationMode: 'file', srcDocContent: '<html><body>Hello</body></html>' });
    expect(screen.getByTestId('monaco')).toBeInTheDocument();
    expect(screen.getByTitle('Build Preview')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('gives the editor the whole width in file mode when there is no draft to show', () => {
    renderPane({ compilationMode: 'file', srcDocContent: null, activeTab: { language: 'javascript', content: '' } });
    expect(screen.getByTestId('monaco')).toBeInTheDocument();
    expect(screen.queryByText('Preview')).toBeNull();
  });

  it('gives the editor the whole width when split view is switched off', () => {
    renderPane({ splitView: false, srcDocContent: '<p>draft</p>' });
    expect(screen.queryByText('Preview')).toBeNull();
  });
});

describe('PreviewPane empty state', () => {
  it('invites the author to open a file when none is open, keeping the editor mounted', () => {
    renderPane({ activeTab: null });
    expect(screen.getByTestId('editor-empty-state')).toHaveTextContent('No file open');
    expect(screen.getByTestId('monaco')).toBeInTheDocument();
  });

  it('shows no empty state once a file is open', () => {
    renderPane();
    expect(screen.queryByTestId('editor-empty-state')).toBeNull();
  });
});

describe('PreviewPane toolbar', () => {
  const history = [
    { snapshotId: 'a', entryFile: 'index.html', label: 'Latest', createdAt: '2026-01-01T00:00:00Z', excerpt: '', textLength: 10 },
    { snapshotId: 'b', entryFile: 'index.html', label: 'Earlier', createdAt: '2025-12-31T00:00:00Z', excerpt: '', textLength: 9 },
  ];
  const builtProps = { sessionId: '0123456789abcdef', previewUrl: '/preview/x/index.html', previewHistory: history };

  it('keeps the bar short: three controls and a More menu, every one named', () => {
    renderPane(builtProps);
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(expect.arrayContaining([
      'Open the preview page for this file',
      'Rebuild preview',
      'More preview actions',
    ]));
    expect(screen.getByRole('combobox', { name: 'Preview engine' })).toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('aria-label') || button.textContent, 'every button has a name').toBeTruthy();
    }
    // The secondary actions live in the menu, which starts closed.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lists the secondary actions, with readable labels, in the More menu', async () => {
    renderPane(builtProps);
    const more = screen.getByRole('button', { name: 'More preview actions' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(more);

    expect(more).toHaveAttribute('aria-expanded', 'true');
    const labels = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(labels).toEqual([
      'Compare with an earlier build',
      'Copy review link (read-only, no login)',
      'Copy share link (valid 7 days)',
      'Download the built site as a ZIP',
      'Reset the split to 50/50',
    ]);
  });

  it('offers only what applies: no build yet means no links, ZIP or comparison', async () => {
    renderPane();
    await userEvent.click(screen.getByRole('button', { name: 'More preview actions' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Reset the split to 50/50']);
  });

  it('runs a menu action and closes the menu', async () => {
    const setEditorWidth = vi.fn();
    const onTogglePreviewDiff = vi.fn();
    renderPane({ ...builtProps, setEditorWidth, onTogglePreviewDiff });

    await userEvent.click(screen.getByRole('button', { name: 'More preview actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reset the split to 50/50' }));
    expect(setEditorWidth).toHaveBeenCalledWith(50);
    expect(screen.queryByRole('menu')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'More preview actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Compare with an earlier build' }));
    expect(onTogglePreviewDiff).toHaveBeenCalled();
  });

  it('closes the menu on Escape and on a click elsewhere', async () => {
    renderPane(builtProps);
    await userEvent.click(screen.getByRole('button', { name: 'More preview actions' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'More preview actions' }));
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('switches the engine and rebuilds from the toolbar', async () => {
    const onChangeCompilerRuntime = vi.fn();
    const compileRepository = vi.fn();
    renderPane({ onChangeCompilerRuntime, compileRepository });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Preview engine' }), 'docker');
    expect(onChangeCompilerRuntime).toHaveBeenCalledWith('docker');

    await userEvent.click(screen.getByRole('button', { name: 'Rebuild preview' }));
    expect(compileRepository).toHaveBeenCalled();
  });

  it('keeps the e2e hook: the engine select title still names the WASM sandbox', () => {
    renderPane();
    expect(document.querySelector('select[title*="WASM Sandbox"]')).not.toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkspaceNoticeBanner from './WorkspaceNoticeBanner';

const notice = { tone: 'error' as const, title: 'Build failed', actionLabel: 'Build again' };

describe('WorkspaceNoticeBanner', () => {
  it('shows a secondary action next to the main one', async () => {
    const onAction = vi.fn();
    const onSecondaryAction = vi.fn();
    render(
      <WorkspaceNoticeBanner
        notice={notice}
        onAction={onAction}
        onDismiss={vi.fn()}
        secondaryActionLabel="Explain this error"
        onSecondaryAction={onSecondaryAction}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /explain this error/i }));
    expect(onSecondaryAction).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Build again' })).toBeInTheDocument();
  });

  it('leaves the secondary action out when it has no label', () => {
    render(<WorkspaceNoticeBanner notice={notice} onAction={vi.fn()} onDismiss={vi.fn()} onSecondaryAction={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /explain/i })).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SaveReviewDialog from './SaveReviewDialog';

const setup = (overrides = {}) => {
  const props = { isOpen: true, changes: [], isSaving: false, onClose: vi.fn(), onConfirm: vi.fn(), ...overrides };
  render(<SaveReviewDialog {...props} />);
  return props;
};

describe('SaveReviewDialog', () => {
  it('is an accessible modal dialog named by its heading', () => {
    setup();
    expect(screen.getByRole('dialog', { name: /confirm the changes/i })).toHaveAttribute('aria-modal', 'true');
  });

  it('closes on Escape', async () => {
    const props = setup();
    await userEvent.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('ignores Escape while a save is in flight', async () => {
    const props = setup({ isSaving: true });
    await userEvent.keyboard('{Escape}');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('close button has an accessible name', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Close review' })).toBeInTheDocument();
  });
});

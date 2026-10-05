import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileOperationDialog from './FileOperationDialog';

const renderDialog = (overrides = {}) => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'New file',
    placeholder: 'file.ptx',
    ...overrides,
  };
  render(<FileOperationDialog {...props} />);
  return props;
};

describe('FileOperationDialog', () => {
  it('exposes an accessible modal dialog named by its title', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'New file' })).toHaveAttribute('aria-modal', 'true');
  });

  it('has a labelled close button', async () => {
    const props = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const props = renderDialog();
    await userEvent.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('does not render or listen for Escape when closed', async () => {
    const props = renderDialog({ isOpen: false });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('rejects an empty name', async () => {
    const props = renderDialog();
    await userEvent.clear(screen.getByPlaceholderText('file.ptx'));
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText('Name cannot be empty')).toBeInTheDocument();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});

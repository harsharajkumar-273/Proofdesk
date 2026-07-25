import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CommandPalette from './CommandPalette';
import type { PaletteCommand } from '../../utils/commandPalette';

const makeCommands = (): PaletteCommand[] => [
  { id: 'c1', title: 'Compile Repository', group: 'Build', run: vi.fn() },
  { id: 'c2', title: 'Toggle Split View', group: 'Layout', run: vi.fn() },
  { id: 'c3', title: 'Insert Theorem', group: 'Snippet', hint: 'scaffold', run: vi.fn() },
  { id: 'c4', title: 'Export PDF', group: 'Build', enabled: false, run: vi.fn() },
];

const setup = (overrides: Partial<React.ComponentProps<typeof CommandPalette>> = {}) => {
  const commands = overrides.commands ?? makeCommands();
  const onClose = overrides.onClose ?? vi.fn();
  const utils = render(
    <CommandPalette open onClose={onClose} commands={commands} {...overrides} />,
  );
  return { ...utils, commands, onClose };
};

const dialog = () => screen.getByRole('dialog');

describe('CommandPalette — visibility', () => {
  it('renders nothing when closed', () => {
    render(<CommandPalette open={false} onClose={vi.fn()} commands={makeCommands()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists every command when open with an empty query', () => {
    setup();
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('shows each command group label', () => {
    setup();
    expect(screen.getByText('Layout')).toBeInTheDocument();
    expect(screen.getByText('Snippet')).toBeInTheDocument();
  });

  it('shows a command hint when present', () => {
    setup();
    expect(screen.getByText('scaffold')).toBeInTheDocument();
  });
});

describe('CommandPalette — filtering', () => {
  it('narrows the list as the query is typed', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: 'split' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('Toggle Split View');
  });

  it('matches on a subsequence, not just a prefix', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: 'cr' } });
    expect(screen.getAllByRole('option')[0].textContent).toContain('Compile Repository');
  });

  it('reports when nothing matches', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: 'zzzzq' } });
    expect(screen.getByText('No matching commands')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('finds snippets by keyword through the palette', () => {
    const commands: PaletteCommand[] = [
      { id: 's', title: 'Insert Theorem', group: 'Snippet', keywords: ['thm'], run: vi.fn() },
      { id: 'o', title: 'Something Else', group: 'Build', run: vi.fn() },
    ];
    setup({ commands });
    fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: 'thm' } });
    expect(screen.getAllByRole('option')[0].textContent).toContain('Insert Theorem');
  });
});

describe('CommandPalette — keyboard', () => {
  it('selects the first command by default', () => {
    setup();
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('moves the selection with arrow keys', () => {
    setup();
    fireEvent.keyDown(dialog(), { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('wraps the selection past the end', () => {
    setup();
    for (let i = 0; i < 4; i += 1) fireEvent.keyDown(dialog(), { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('wraps backwards from the first item', () => {
    setup();
    fireEvent.keyDown(dialog(), { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[3]).toHaveAttribute('aria-selected', 'true');
  });

  it('runs the selected command on Enter and closes', () => {
    const { commands, onClose } = setup();
    fireEvent.keyDown(dialog(), { key: 'Enter' });
    expect(commands[0].run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('runs the command the arrows landed on', () => {
    const { commands } = setup();
    fireEvent.keyDown(dialog(), { key: 'ArrowDown' });
    fireEvent.keyDown(dialog(), { key: 'Enter' });
    expect(commands[1].run).toHaveBeenCalledTimes(1);
    expect(commands[0].run).not.toHaveBeenCalled();
  });

  it('closes on Escape without running anything', () => {
    const { commands, onClose } = setup();
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    for (const command of commands) expect(command.run).not.toHaveBeenCalled();
  });

  it('does not run a disabled command', () => {
    const commands: PaletteCommand[] = [
      { id: 'off', title: 'Export PDF', group: 'Build', enabled: false, run: vi.fn() },
    ];
    const { onClose } = setup({ commands });
    fireEvent.keyDown(dialog(), { key: 'Enter' });
    expect(commands[0].run).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('marks a disabled command as aria-disabled', () => {
    setup();
    const disabled = screen.getAllByRole('option').find((o) => o.textContent?.includes('Export PDF'));
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
  });

  it('does nothing on Enter when the list is empty', () => {
    const { commands, onClose } = setup();
    fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: 'zzzzq' } });
    fireEvent.keyDown(dialog(), { key: 'Enter' });
    for (const command of commands) expect(command.run).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the selection in range after filtering shrinks the list', () => {
    setup();
    fireEvent.keyDown(dialog(), { key: 'ArrowDown' });
    fireEvent.keyDown(dialog(), { key: 'ArrowDown' });
    fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: 'split' } });

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });
});

describe('CommandPalette — mouse', () => {
  it('runs a command on click', () => {
    const { commands, onClose } = setup();
    fireEvent.click(screen.getAllByRole('option')[1]);
    expect(commands[1].run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not run a disabled command on click', () => {
    const { commands, onClose } = setup();
    const disabled = screen.getAllByRole('option').find((o) => o.textContent?.includes('Export PDF'))!;
    fireEvent.click(disabled);
    expect(commands[3].run).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when the backdrop is clicked', () => {
    const { onClose, container } = setup();
    const backdrop = container.querySelector('[role="presentation"]')!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close when the dialog itself is clicked', () => {
    const { onClose } = setup();
    fireEvent.click(dialog());
    expect(onClose).not.toHaveBeenCalled();
  });
});

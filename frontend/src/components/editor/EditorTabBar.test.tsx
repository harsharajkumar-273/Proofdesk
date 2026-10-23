import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditorTabBar from './EditorTabBar';

const tabs = [
  { id: 't1', name: 'course.xml', path: 'course.xml', hasUnsavedChanges: false },
  { id: 't2', name: 'Styles.CSS', path: 'Styles.CSS', hasUnsavedChanges: true },
];

const renderBar = (props = {}) =>
  render(
    <EditorTabBar tabs={tabs} activeTabId="t1" setActiveTabId={vi.fn()} closeTab={vi.fn()} closeOtherTabs={vi.fn()} closeAllTabs={vi.fn()} {...props} />,
  );

describe('EditorTabBar', () => {
  it('shows file names exactly as they are, since file names are case-sensitive', () => {
    renderBar();
    for (const name of ['course.xml', 'Styles.CSS']) {
      const label = screen.getByText(name);
      expect(label.parentElement?.className).not.toMatch(/uppercase/);
    }
  });

  it('switches tabs and closes them by name', async () => {
    const setActiveTabId = vi.fn();
    const closeTab = vi.fn();
    renderBar({ setActiveTabId, closeTab });
    await userEvent.click(screen.getByText('Styles.CSS'));
    expect(setActiveTabId).toHaveBeenCalledWith('t2');
    await userEvent.click(screen.getByRole('button', { name: 'Close course.xml' }));
    expect(closeTab).toHaveBeenCalledWith('t1');
  });

  it('says plainly when no file is open', () => {
    renderBar({ tabs: [], activeTabId: null });
    expect(screen.getByText('No files open')).toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import { summarizeTextChanges, summarizeUnsavedTabs } from './editorDiff';

describe('editorDiff helpers', () => {
  it('summarizes line-level changes for save review', () => {
    const summary = summarizeTextChanges(
      'line one\nline two\nline three',
      'line one\nline two updated\nline three\nline four'
    );

    expect(summary.changedLines).toBe(2);
    expect(summary.addedLines).toBe(2);
    expect(summary.removedLines).toBe(1);
    expect(summary.preview).toContain('line two updated');
  });

  it('returns only unsaved tabs in the save-review summary', () => {
    const changes = summarizeUnsavedTabs([
      {
        id: '1',
        path: 'course.xml',
        name: 'course.xml',
        content: '<course>Updated</course>',
        originalContent: '<course>Original</course>',
        hasUnsavedChanges: true,
      },
      {
        id: '2',
        path: 'styles.css',
        name: 'styles.css',
        content: 'body { color: blue; }',
        originalContent: 'body { color: blue; }',
        hasUnsavedChanges: false,
      },
    ]);

    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('course.xml');
    expect(changes[0].changedLines).toBeGreaterThan(0);
  });
});

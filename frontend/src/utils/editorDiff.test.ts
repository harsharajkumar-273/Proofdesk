import { describe, expect, it } from 'vitest';
import { summarizeTextChanges, summarizeUnsavedTabs } from './editorDiff';

describe('editorDiff helpers', () => {
  describe('summarizeTextChanges', () => {
    it('returns zero changes for identical content', () => {
      const summary = summarizeTextChanges('line one\nline two', 'line one\nline two');
      expect(summary.changedLines).toBe(0);
      expect(summary.addedLines).toBe(0);
      expect(summary.removedLines).toBe(0);
      expect(summary.preview).toBe('');
    });

    it('summarizes line-level modifications and captures preview', () => {
      const summary = summarizeTextChanges(
        'line one\nline two\nline three',
        'line one\nline two updated\nline three\nline four'
      );

      expect(summary.changedLines).toBe(2);
      expect(summary.addedLines).toBe(2);
      expect(summary.removedLines).toBe(1);
      expect(summary.preview).toBe('line two updated');
    });

    it('handles lines removed from the end', () => {
      const summary = summarizeTextChanges('line one\nline two\nline three', 'line one');
      expect(summary.changedLines).toBe(2);
      expect(summary.addedLines).toBe(0);
      expect(summary.removedLines).toBe(2);
      expect(summary.preview).toBe('line two');
    });

    it('normalizes preview line whitespace and truncates long lines', () => {
      const longLine = '   word   '.repeat(50);
      const summary = summarizeTextChanges('', longLine);

      expect(summary.changedLines).toBe(1);
      expect(summary.addedLines).toBe(1);
      expect(summary.preview.length).toBeLessThanOrEqual(120);
      expect(summary.preview).not.toMatch(/\s{2,}/);
    });
  });

  describe('summarizeUnsavedTabs', () => {
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

    it('returns empty array when no tabs have unsaved changes', () => {
      const changes = summarizeUnsavedTabs([
        {
          id: '1',
          path: 'chapter.xml',
          name: 'chapter.xml',
          content: 'same',
          originalContent: 'same',
          hasUnsavedChanges: false,
        },
      ]);

      expect(changes).toEqual([]);
    });
  });
});

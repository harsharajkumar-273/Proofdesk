import { beforeEach, describe, expect, it } from 'vitest';
import {
  getReviewMarkerLabel,
  pushRecentFile,
  readRecentFiles,
  readReviewMarkers,
  removeReviewMarker,
  resolvePreviewTarget,
  upsertReviewMarker,
} from './editorWorkspace';

describe('editorWorkspace helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('recent files', () => {
    it('returns empty array when repoFullName is null', () => {
      expect(readRecentFiles(null)).toEqual([]);
    });

    it('stores recent files newest-first without duplicates', () => {
      pushRecentFile('demo/course-demo', { path: 'course.xml', name: 'course.xml' });
      pushRecentFile('demo/course-demo', { path: 'styles.css', name: 'styles.css' });
      pushRecentFile('demo/course-demo', { path: 'course.xml', name: 'course.xml' });

      const recent = readRecentFiles('demo/course-demo');
      expect(recent).toHaveLength(2);
      expect(recent[0].path).toBe('course.xml');
      expect(recent[1].path).toBe('styles.css');
    });

    it('enforces recent files limit of 8 entries', () => {
      for (let i = 1; i <= 10; i += 1) {
        pushRecentFile('demo/course-demo', { path: `file${i}.xml`, name: `file${i}.xml` });
      }

      const recent = readRecentFiles('demo/course-demo');
      expect(recent).toHaveLength(8);
      expect(recent[0].path).toBe('file10.xml');
    });
  });

  describe('review markers', () => {
    it('stores review markers keyed by file path', () => {
      upsertReviewMarker('demo/course-demo', {
        path: 'chapters/vectors.xml',
        status: 'verify-preview',
        note: 'Check the theorem figure placement.',
        threads: [
          {
            id: 'thread-1',
            lineNumber: 18,
            status: 'open',
            updatedAt: '2026-01-01T00:00:00.000Z',
            comments: [
              {
                id: 'comment-1',
                author: 'Professor',
                message: 'Verify this derivation.',
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
        ],
      });

      const markers = readReviewMarkers('demo/course-demo');
      expect(markers['chapters/vectors.xml'].status).toBe('verify-preview');
      expect(markers['chapters/vectors.xml'].threads?.[0].lineNumber).toBe(18);
      expect(getReviewMarkerLabel(markers['chapters/vectors.xml'].status)).toBe('Verify preview');
    });

    it('removes review marker by file path', () => {
      upsertReviewMarker('demo/course-demo', {
        path: 'chapters/intro.xml',
        status: 'needs-review',
        note: 'Initial draft',
      });

      removeReviewMarker('demo/course-demo', 'chapters/intro.xml');
      const markers = readReviewMarkers('demo/course-demo');
      expect(markers['chapters/intro.xml']).toBeUndefined();
    });
  });

  describe('resolvePreviewTarget', () => {
    it('returns html file path directly if active file is already HTML', () => {
      const target = resolvePreviewTarget({
        activeFilePath: 'docs/index.html',
        previewEntryFile: 'main.html',
      });
      expect(target).toBe('docs/index.html');
    });

    it('maps a source file to the most relevant preview target by stem match', () => {
      const previewTarget = resolvePreviewTarget({
        activeFilePath: 'chapters/systems-of-eqns.xml',
        previewEntryFile: 'overview.html',
        artifacts: [
          { path: 'overview.html' },
          { path: 'systems-of-eqns.html' },
        ],
      });

      expect(previewTarget).toBe('systems-of-eqns.html');
    });

    it('falls back to preview entry file if no matching HTML artifact exists', () => {
      const target = resolvePreviewTarget({
        activeFilePath: 'unknown.xml',
        previewEntryFile: 'main.html',
        artifacts: [],
      });
      expect(target).toBe('main.html');
    });
  });

  describe('getReviewMarkerLabel', () => {
    it('returns human readable status labels', () => {
      expect(getReviewMarkerLabel('needs-review')).toBe('Needs review');
      expect(getReviewMarkerLabel('changes-requested')).toBe('Changes requested');
      expect(getReviewMarkerLabel('verify-preview')).toBe('Verify preview');
      expect(getReviewMarkerLabel('approved')).toBe('Approved');
      expect(getReviewMarkerLabel('ready')).toBe('Approved');
    });
  });
});

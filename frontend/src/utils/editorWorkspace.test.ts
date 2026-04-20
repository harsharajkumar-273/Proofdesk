import { beforeEach, describe, expect, it } from 'vitest';
import {
  getReviewMarkerLabel,
  pushRecentFile,
  readRecentFiles,
  readReviewMarkers,
  resolvePreviewTarget,
  upsertReviewMarker,
} from './editorWorkspace';

describe('editorWorkspace helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
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

  it('stores review markers keyed by file path', () => {
    upsertReviewMarker('demo/course-demo', {
      path: 'chapters/vectors.xml',
      status: 'verify-preview',
      note: 'Check the theorem figure placement.',
    });

    const markers = readReviewMarkers('demo/course-demo');
    expect(markers['chapters/vectors.xml'].status).toBe('verify-preview');
    expect(getReviewMarkerLabel(markers['chapters/vectors.xml'].status)).toBe('Verify preview');
  });

  it('maps a source file to the most relevant preview target', () => {
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
});

import { describe, expect, it } from 'vitest';
import { isPreTeXtFile, pretexToHtml } from './pretexPreview';

describe('pretexPreview', () => {
  it('uses the local backend MathJax asset in generated previews', () => {
    const html = pretexToHtml('<book><chapter><title>Demo</title><p><m>x+y</m></p></chapter></book>');

    expect(html).toContain('http://localhost:4000/assets/mathjax/tex-svg.js');
    expect(html).toContain('\\(x+y\\)');
  });

  it('detects PreTeXt-like source files by extension', () => {
    expect(isPreTeXtFile('chapter.xml')).toBe(true);
    expect(isPreTeXtFile('chapter.ptx')).toBe(true);
    expect(isPreTeXtFile('chapter.pretext')).toBe(true);
    expect(isPreTeXtFile('chapter.html')).toBe(false);
  });
});

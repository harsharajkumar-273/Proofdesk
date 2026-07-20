import { describe, expect, it } from 'vitest';
import { isPreTeXtFile, pretexToHtml } from './pretexPreview';

describe('pretexPreview', () => {
  it('uses the local backend MathJax asset in generated previews', () => {
    const html = pretexToHtml('<book><chapter><title>Demo</title><p><m>x+y</m></p></chapter></book>');

    expect(html).toContain('http://localhost:4000/assets/mathjax/tex-svg.js');
    expect(html).toContain('\\(x+y\\)');
    expect(html).toContain('id="proofdesk-pretex-layout-fix"');
    expect(html).toContain('id="proofdesk-pretex-layout-guard"');
    expect(html).toContain('data-proofdesk-pretex-layout-version="2026-04-21-display-math-reserve-v5"');
    expect(html).toContain('getSvgVisualHeight');
  });

  it('converts PreTeXt syseq math with nested subscripts into valid aligned MathJax', () => {
    const html = pretexToHtml(String.raw`<book><p><me>
\syseq{
  \. \+ 6y_{2016} + 8z_{2016} = x_{2017};
  \frac 12x_{2016} \+ \. \+ \. = y_{2017};
  \. \+ \frac 12y_{2016} \+ \. = z_{2017}\rlap.
}
    </me></p></book>`);

    expect(html).toContain(String.raw`\begin{aligned}`);
    expect(html).toContain(String.raw`6y_{2016} + 8z_{2016} &= x_{2017}`);
    expect(html).toContain(String.raw`\end{aligned}`);
    expect(html).not.toContain(String.raw`\syseq`);
  });

  it('expands \\def/\\edef macros before syseq processing', () => {
    const html = pretexToHtml(String.raw`<book><p><men>
\def\eqline#1#2{(#1)^2 + B(#2)^2 + C(#1)(#2) + D(#1) + E(#2) + F = 0}
\edef\eqs{\eqline02;
  \eqline21;
  \eqline1{-1};
  \eqline{-1}{-2};
  \eqline{-3}1;
  \eqline{-1}{-1}
}
\spalignsysdelims..
\expandafter\syseq\expandafter{\eqs\rlap.}
    </men></p></book>`);

    expect(html).toContain(String.raw`\begin{aligned}`);
    expect(html).toContain('(0)^2 + B(2)^2');
    expect(html).toContain('(-3)^2 + B(1)^2');
    expect(html).not.toContain(String.raw`\edef`);
    expect(html).not.toContain(String.raw`\eqs`);
  });

  it('detects PreTeXt-like source files by extension', () => {
    expect(isPreTeXtFile('chapter.xml')).toBe(true);
    expect(isPreTeXtFile('chapter.ptx')).toBe(true);
    expect(isPreTeXtFile('chapter.pretext')).toBe(true);
    expect(isPreTeXtFile('chapter.html')).toBe(false);
  });
});

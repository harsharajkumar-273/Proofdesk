/**
 * pretexPreview.ts
 *
 * Lightweight PreTeXt XML → HTML converter for live preview.
 * Runs entirely in the browser — zero backend latency.
 *
 * Not pixel-perfect (that's what the full build is for), but shows
 * text content, structure, and equations (via MathJax) instantly.
 *
 * Covers the elements used in a typical linear-algebra textbook:
 * theorems, definitions, examples, proofs, equations, lists, figures, etc.
 */

// ─── Counters for auto-numbering ─────────────────────────────────────────────

interface Counters {
  theorem: number;
  definition: number;
  example: number;
  exercise: number;
  figure: number;
  equation: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function children(el: Element, counters: Counters): string {
  return Array.from(el.childNodes).map(n => convertNode(n, counters)).join('');
}

function childrenSkipping(el: Element, counters: Counters, ...skipTags: string[]): string {
  return Array.from(el.childNodes)
    .filter(n => !(n.nodeType === Node.ELEMENT_NODE &&
                   skipTags.includes((n as Element).tagName.toLowerCase())))
    .map(n => convertNode(n, counters))
    .join('');
}

function titleOf(el: Element, counters: Counters): string {
  const t = el.querySelector(':scope > title');
  return t ? children(t, counters) : '';
}

/** Grab raw math content — preserve LaTeX exactly for MathJax */
function math(el: Element): string {
  return preprocessLatexForPreview(el.textContent ?? '');
}

function splitTopLevel(text: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '\\') {
      i++;
      continue;
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
    } else if (ch === delimiter && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(text.slice(start));
  return parts;
}

function findMatchingBrace(text: string, openIndex: number): number {
  let depth = 0;

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];

    if (ch === '\\') {
      i++;
      continue;
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function formatSyseqRow(row: string): string {
  let next = row
    .replace(/\\amp/g, '&')
    .replace(/\\\./g, '{}')
    .replace(/\\\+/g, '+')
    .replace(/\\rlap\{([^}]*)\}/g, '$1')
    .replace(/\\rlap\./g, '.')
    .replace(/\\[rb]\b/g, '')
    .trim();

  if (!next) return '';

  if (!next.includes('&')) {
    next = next.replace(/\s*=\s*/, ' &= ');
  }

  return next;
}

function convertSyseq(inner: string): string {
  const rows = splitTopLevel(inner, ';')
    .map(formatSyseqRow)
    .filter(Boolean);

  if (rows.length === 0) return '';

  return `\\begin{aligned}${rows.join('\\\\\n')}\\end{aligned}`;
}

function replaceDelimitedCommands(
  text: string,
  commandNames: string[],
  replacer: (inner: string) => string
): string {
  let result = '';
  let index = 0;

  while (index < text.length) {
    const command = commandNames.find((name) => text.startsWith(`\\${name}{`, index));

    if (!command) {
      result += text[index];
      index++;
      continue;
    }

    const openIndex = index + command.length + 1;
    const closeIndex = findMatchingBrace(text, openIndex);

    if (closeIndex < 0) {
      result += text.slice(index);
      break;
    }

    result += replacer(text.slice(openIndex + 1, closeIndex));
    index = closeIndex + 1;
  }

  return result;
}

function preprocessLatexForPreview(tex: string): string {
  let next = tex
    .replace(/\$([^$]*)\$/g, '$1')
    .replace(/\\expandafter\\(syseq|spalignsys)\\expandafter\s*\{/g, '\\$1{')
    .replace(/\\spalignsysdelims\s*(?:\\\{|\(|\[|\.)?(?:\\\}|\)|\]|\.)?/g, '')
    .replace(/\\spalignsystabspace\s*=\s*[^\\\s]+/g, '')
    .replace(/\\hfil[lr]?\b/g, '')
    .replace(/\}%\s*$/gm, '}');

  next = replaceDelimitedCommands(next, ['syseq', 'spalignsys'], convertSyseq);
  next = next.replace(/\\\./g, '{}').replace(/\\\+/g, '+');

  return next;
}

function convertNode(node: Node, counters: Counters): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType === Node.ELEMENT_NODE) return convertEl(node as Element, counters);
  return '';
}

// ─── Element converter ────────────────────────────────────────────────────────

function convertEl(el: Element, c: Counters): string {
  // Strip XML namespace prefix (e.g. xi:include → include)
  const tag = el.tagName.replace(/^[^:]+:/, '').toLowerCase();
  const ch  = () => children(el, c);
  const chx = (...skip: string[]) => childrenSkipping(el, c, ...skip);
  const ttl = () => titleOf(el, c);

  switch (tag) {
    // ── Root wrappers ────────────────────────────────────────────────────────
    case 'pretext':
    case 'mathbook':
      return ch();

    case 'book':
    case 'article': {
      const t = ttl();
      return `<div class="ptx-book">${t ? `<h1 class="ptx-title">${t}</h1>` : ''}${chx('title')}</div>`;
    }

    // ── Structural ───────────────────────────────────────────────────────────
    case 'chapter': {
      const t = ttl();
      return `<section class="ptx-chapter">${t ? `<h2>${t}</h2>` : ''}${chx('title')}</section>`;
    }
    case 'section': {
      const t = ttl();
      return `<section class="ptx-section">${t ? `<h3>${t}</h3>` : ''}${chx('title')}</section>`;
    }
    case 'subsection': {
      const t = ttl();
      return `<section class="ptx-subsection">${t ? `<h4>${t}</h4>` : ''}${chx('title')}</section>`;
    }
    case 'subsubsection': {
      const t = ttl();
      return `<section class="ptx-subsubsection">${t ? `<h5>${t}</h5>` : ''}${chx('title')}</section>`;
    }
    case 'introduction':
    case 'conclusion':
    case 'objectives':
    case 'outcomes':
      return `<div class="ptx-${tag}">${ch()}</div>`;

    case 'paragraphs': {
      const t = ttl();
      return `<div class="ptx-paragraphs">${t ? `<p class="ptx-paragraphs-title"><strong>${t}</strong></p>` : ''}${chx('title')}</div>`;
    }

    case 'title':
      return ''; // always handled by the parent

    // ── Block text ───────────────────────────────────────────────────────────
    case 'p':
      return `<p>${ch()}</p>`;
    case 'blockquote':
      return `<blockquote>${ch()}</blockquote>`;

    // ── Math ─────────────────────────────────────────────────────────────────
    case 'm':
      return `\\(${math(el)}\\)`;

    case 'me':
      return `<div class="ptx-equation">\\[${math(el)}\\]</div>`;

    case 'men': {
      c.equation++;
      return `<div class="ptx-equation">\\[${math(el)} \\tag{${c.equation}}\\]</div>`;
    }

    case 'md':
    case 'mdn': {
      const rows = Array.from(el.querySelectorAll(':scope > mrow'))
        .map(r => math(r))
        .join(' \\\\\n');
      const env = tag === 'mdn' ? 'align' : 'align*';
      return `<div class="ptx-equation">\\[\\begin{${env}}\n${rows}\n\\end{${env}}\\]</div>`;
    }

    case 'mrow':
      return ''; // consumed by md/mdn above

    // ── Theorem-like ─────────────────────────────────────────────────────────
    case 'theorem':
    case 'lemma':
    case 'proposition':
    case 'corollary':
    case 'claim':
    case 'identity': {
      c.theorem++;
      const t   = ttl();
      const lbl = tag.charAt(0).toUpperCase() + tag.slice(1);
      return `<div class="ptx-thmlike ptx-${tag}">
        <span class="ptx-label">${lbl} ${c.theorem}${t ? ` (${t})` : ''}</span>
        ${chx('title')}
      </div>`;
    }

    case 'proof':
      return `<div class="ptx-proof"><span class="ptx-proof-title">Proof.</span> ${ch()} <span class="ptx-qed">∎</span></div>`;

    case 'definition': {
      c.definition++;
      const t = ttl();
      return `<div class="ptx-thmlike ptx-definition">
        <span class="ptx-label">Definition ${c.definition}${t ? ` (${t})` : ''}</span>
        ${chx('title')}
      </div>`;
    }

    case 'example':
    case 'question':
    case 'problem': {
      c.example++;
      const t   = ttl();
      const lbl = tag.charAt(0).toUpperCase() + tag.slice(1);
      return `<div class="ptx-thmlike ptx-${tag}">
        <span class="ptx-label">${lbl} ${c.example}${t ? ` (${t})` : ''}</span>
        ${chx('title')}
      </div>`;
    }

    case 'exercise': {
      c.exercise++;
      const t = ttl();
      return `<div class="ptx-thmlike ptx-exercise">
        <span class="ptx-label">Exercise ${c.exercise}${t ? ` (${t})` : ''}</span>
        ${chx('title')}
      </div>`;
    }

    case 'remark':
    case 'note':
    case 'observation':
    case 'warning':
    case 'fact':
    case 'convention':
    case 'insight':
    case 'assumption': {
      const t   = ttl();
      const lbl = tag.charAt(0).toUpperCase() + tag.slice(1);
      return `<div class="ptx-thmlike ptx-${tag}">
        <span class="ptx-label">${lbl}${t ? ` (${t})` : ''}</span>
        ${chx('title')}
      </div>`;
    }

    case 'statement':
      return `<div class="ptx-statement">${ch()}</div>`;

    case 'hint':
    case 'answer':
    case 'solution': {
      const lbl = tag.charAt(0).toUpperCase() + tag.slice(1);
      return `<details class="ptx-${tag}"><summary>${lbl}</summary>${ch()}</details>`;
    }

    // ── Lists ─────────────────────────────────────────────────────────────────
    case 'ol':
      return `<ol>${ch()}</ol>`;
    case 'ul':
      return `<ul>${ch()}</ul>`;
    case 'li': {
      const t = ttl();
      return `<li>${t ? `<em class="ptx-li-title">${t}</em> ` : ''}${chx('title')}</li>`;
    }
    case 'dl':
      return `<dl>${ch()}</dl>`;
    case 'dt':
      return `<dt>${ch()}</dt>`;
    case 'dd':
      return `<dd>${ch()}</dd>`;

    // ── Figure / media ────────────────────────────────────────────────────────
    case 'figure': {
      c.figure++;
      const cap = el.querySelector(':scope > caption');
      return `<figure class="ptx-figure">
        <div class="ptx-figure-body">${chx('caption')}</div>
        ${cap ? `<figcaption>Figure ${c.figure}: ${children(cap, c)}</figcaption>` : ''}
      </figure>`;
    }
    case 'caption':
      return '';

    case 'image': {
      const src = el.getAttribute('source') || el.getAttribute('href') || '';
      const alt = el.querySelector('description')?.textContent || '';
      if (!src) return `<span class="ptx-placeholder">[Image: ${alt || 'no source'}]</span>`;
      return `<img src="${src}" alt="${alt}" style="max-width:100%;height:auto">`;
    }

    case 'video':
      return `<div class="ptx-placeholder">[Video]</div>`;

    case 'interactive':
      return `<div class="ptx-placeholder">[Interactive element — view in full build]</div>`;

    // ── Code ──────────────────────────────────────────────────────────────────
    case 'c':
      return `<code>${el.textContent}</code>`;
    case 'cd':
    case 'pre':
      return `<pre><code>${el.textContent}</code></pre>`;
    case 'program':
    case 'console': {
      const lang = el.getAttribute('language') || '';
      const code = el.querySelector('input, code')?.textContent ?? el.textContent ?? '';
      return `<pre><code class="language-${lang}">${escHtml(code)}</code></pre>`;
    }
    case 'sage':
      return `<pre class="ptx-sage"><code>${el.textContent}</code></pre>`;

    // ── Inline ────────────────────────────────────────────────────────────────
    case 'em':
      return `<em>${ch()}</em>`;
    case 'alert':
      return `<strong class="ptx-alert">${ch()}</strong>`;
    case 'term':
      return `<em class="ptx-term">${ch()}</em>`;
    case 'q':
      return `\u201c${ch()}\u201d`;
    case 'sq':
      return `\u2018${ch()}\u2019`;
    case 'url': {
      const href = el.getAttribute('href') || ch();
      const vis  = ch() || href;
      return `<a href="${href}" target="_blank" rel="noopener">${vis}</a>`;
    }
    case 'email':
      return `<a href="mailto:${ch()}">${ch()}</a>`;
    case 'fn':
      return `<sup title="${el.textContent?.trim()}" style="cursor:help;color:#2c7be5">[fn]</sup>`;
    case 'xref':
      return `<span class="ptx-xref">[ref]</span>`;

    // ── Side-by-side ──────────────────────────────────────────────────────────
    case 'sidebyside': {
      const panels = Array.from(el.children)
        .map(child => `<div class="ptx-sbspanel">${convertEl(child, c)}</div>`)
        .join('');
      return `<div class="ptx-sidebyside">${panels}</div>`;
    }
    case 'stack':
      return `<div class="ptx-stack">${ch()}</div>`;

    // ── Tables ────────────────────────────────────────────────────────────────
    case 'tabular':
      return `<table class="ptx-table">${ch()}</table>`;
    case 'row':
      return `<tr>${ch()}</tr>`;
    case 'cell':
      return `<td>${ch()}</td>`;

    // ── Metadata / skipped ────────────────────────────────────────────────────
    case 'index':
    case 'idx':
    case 'notation':
    case 'biblio':
    case 'references':
      return '';

    // ── Includes (show as placeholder) ────────────────────────────────────────
    case 'include': {
      const href = el.getAttribute('href') || '?';
      return `<div class="ptx-placeholder">[Included file: <code>${href}</code>]</div>`;
    }

    // ── Fallback: render children so content is never swallowed ───────────────
    default:
      return ch();
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Styles injected into every preview ──────────────────────────────────────

const CSS = `
body {
  font-family: Georgia, 'Times New Roman', serif;
  max-width: 760px; margin: 0 auto; padding: 1.5rem 2rem;
  font-size: 1rem; line-height: 1.7; color: #1a1a1a; background: #fff;
}
h1.ptx-title { font-size: 1.9rem; border-bottom: 2px solid #333; padding-bottom: .4rem; margin-bottom: 1.5rem; }
h2 { font-size: 1.5rem; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: .2rem; }
h3 { font-size: 1.25rem; margin-top: 1.75rem; }
h4, h5 { font-size: 1.05rem; margin-top: 1.5rem; }
p  { margin: .7rem 0; }

/* Theorem-like boxes */
.ptx-thmlike {
  border-left: 4px solid #4a90d9;
  background: #f0f5ff;
  padding: .75rem 1rem;
  margin: 1.1rem 0;
  border-radius: 0 4px 4px 0;
}
.ptx-definition  { border-color: #00a86b; background: #f0fff8; }
.ptx-example,
.ptx-question,
.ptx-problem     { border-color: #e08e00; background: #fffdf0; }
.ptx-exercise    { border-color: #7c3aed; background: #faf5ff; }
.ptx-remark,
.ptx-note,
.ptx-observation { border-color: #888;    background: #f9f9f9; }
.ptx-warning     { border-color: #e53e3e; background: #fff5f5; }
.ptx-fact,
.ptx-convention  { border-color: #0891b2; background: #f0faff; }
.ptx-label {
  font-weight: bold; display: block;
  margin-bottom: .3rem; font-family: sans-serif; font-size: .95rem;
}

/* Proof */
.ptx-proof { margin: .75rem 0 .75rem 1.5rem; }
.ptx-proof-title { font-weight: bold; }
.ptx-qed { float: right; }

/* Equations */
.ptx-equation { display: flow-root; clear: both; text-align: center; margin: 1rem 0; max-width: 100%; overflow-x: auto; overflow-y: visible; }

/* MathJax SVG — prevent display math from overlapping surrounding text */
mjx-container {
  line-height: normal;
  overflow-x: auto;
  overflow-y: visible;
  max-width: 100%;
}
mjx-container[display="true"] {
  display: block !important;
  clear: both;
  text-align: center;
  margin: 0.75em 0 !important;
  overflow-x: auto;
  overflow-y: visible;
  padding: 0.25em 0;
}
mjx-container[display="true"] > svg {
  display: block;
  margin: 0 auto;
  max-width: 100%;
}

/* Figures */
figure.ptx-figure { margin: 1.5rem 0; text-align: center; }
figcaption { font-size: .9em; color: #555; margin-top: .4rem; }

/* Lists */
ol, ul { margin: .5rem 0 .5rem 1.5rem; }
li { margin: .25rem 0; }
.ptx-li-title { font-style: normal; font-weight: bold; }

/* Code */
code, pre { font-family: 'Fira Code', Consolas, monospace; font-size: .88em; }
pre { background: #f4f4f4; padding: .75rem 1rem; border-radius: 4px; overflow-x: auto; margin: .75rem 0; }
.ptx-sage { background: #fffbe6; border: 1px solid #e6c200; }

/* Side-by-side */
.ptx-sidebyside { display: flex; gap: 1.25rem; align-items: flex-start; margin: 1rem 0; }
.ptx-sbspanel   { flex: 1; }
.ptx-stack > * + * { margin-top: .75rem; }

/* Tables */
.ptx-table { border-collapse: collapse; margin: 1rem 0; }
.ptx-table td, .ptx-table th { border: 1px solid #ccc; padding: .35rem .65rem; }

/* Collapsible hints/solutions */
details.ptx-hint, details.ptx-solution, details.ptx-answer {
  margin: .5rem 0;
  border: 1px solid #ddd; border-radius: 4px; padding: .35rem .75rem;
}
details summary { cursor: pointer; font-weight: bold; color: #2c7be5; font-family: sans-serif; }

/* Misc inline */
.ptx-term  { font-style: italic; font-weight: bold; }
.ptx-alert { color: #c0392b; font-weight: bold; }
.ptx-xref  { color: #2c7be5; }
.ptx-paragraphs-title { margin-bottom: 0; }

/* Placeholders for media / includes */
.ptx-placeholder {
  padding: .5rem .75rem; border: 1px dashed #bbb;
  color: #777; font-size: .85em; text-align: center;
  margin: .5rem 0; border-radius: 3px; background: #fafafa;
  font-family: sans-serif;
}

/* Blockquote */
blockquote { border-left: 3px solid #ccc; margin: 1rem 0 1rem 1rem; padding-left: 1rem; color: #444; }

/* Links */
a { color: #2c7be5; }
a:hover { text-decoration: underline; }
`;

const PROOFDESK_PRETEX_LAYOUT_FIX_VERSION = '2026-04-21-display-math-reserve';

const DISPLAY_MATH_LAYOUT_GUARD = `
<style id="proofdesk-pretex-layout-fix" data-proofdesk-pretex-layout-version="${PROOFDESK_PRETEX_LAYOUT_FIX_VERSION}">
.ptx-equation,
.pretex-display {
  display: flow-root !important;
  clear: both !important;
  position: relative !important;
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  min-height: var(--proofdesk-pretex-display-height, 0);
  margin: 1em 0 !important;
  padding: 0.2em 0 !important;
  line-height: normal !important;
  text-align: center !important;
  text-indent: 0 !important;
  float: none !important;
  overflow-x: auto !important;
  overflow-y: auto !important;
  isolation: isolate !important;
}
.ptx-equation + *,
.pretex-display + * {
  clear: both !important;
}
.pretex-display > svg.pretex {
  display: block !important;
  position: static !important;
  float: none !important;
  max-width: 100% !important;
  height: auto !important;
  margin: 0 auto !important;
  vertical-align: baseline !important;
  overflow: visible !important;
}
mjx-container {
  max-width: 100% !important;
  line-height: normal !important;
  overflow-x: auto !important;
  overflow-y: auto !important;
}
mjx-container[display="true"] {
  display: block !important;
  clear: both !important;
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  min-height: var(--proofdesk-mathjax-display-height, 0);
  margin: 0.85em auto !important;
  padding: 0.25em 0 !important;
  line-height: normal !important;
  text-align: center !important;
  overflow-x: auto !important;
  overflow-y: auto !important;
}
mjx-container[display="true"] > svg {
  display: block !important;
  max-width: 100% !important;
  height: auto !important;
  margin: 0 auto !important;
}
</style>
<script id="proofdesk-pretex-layout-guard">
(function () {
  'use strict';

  function toPx(value, context) {
    if (!value) return 0;
    const match = String(value).trim().match(/^([0-9]*\\.?[0-9]+)(px|em|rem)?$/);
    if (!match) return 0;
    const n = Number.parseFloat(match[1]);
    const unit = match[2] || 'px';
    if (unit === 'px') return n;
    let basis = 16;
    if (unit === 'em' && context) {
      basis = Number.parseFloat(window.getComputedStyle(context).fontSize) || basis;
    } else if (unit === 'rem') {
      basis = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || basis;
    }
    return n * basis;
  }

  function getViewBox(svg) {
    const base = svg.viewBox && svg.viewBox.baseVal;
    if (base && base.width && base.height) {
      return { x: base.x || 0, y: base.y || 0, width: base.width, height: base.height };
    }
    const attr = svg.getAttribute('viewBox');
    if (!attr) return null;
    const parts = attr.trim().split(/[\\s,]+/).map(Number.parseFloat);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  }

  function getSvgVisualHeight(svg, context) {
    const rect = svg.getBoundingClientRect();
    const attrHeight = toPx(svg.getAttribute('height'), context);
    let height = Math.max(rect.height || 0, attrHeight || 0);

    try {
      const box = svg.getBBox();
      const viewBox = getViewBox(svg);
      if (box && viewBox && viewBox.height) {
        const basis = rect.height || attrHeight || viewBox.height;
        const scaleY = basis / viewBox.height;
        height = Math.max(height, Math.ceil(box.height * scaleY));
      }
    } catch {
      // Some SVGs cannot compute a bbox until fonts load; scheduled retries handle them.
    }

    return height;
  }

  function reserveSvg(display, svg) {
    svg.style.display = 'block';
    svg.style.position = 'static';
    svg.style.float = 'none';
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
    svg.style.marginLeft = 'auto';
    svg.style.marginRight = 'auto';
    svg.style.verticalAlign = 'baseline';
    svg.style.overflow = 'visible';

    const height = getSvgVisualHeight(svg, display);
    if (height > 1) {
      display.style.setProperty('--proofdesk-pretex-display-height', Math.ceil(height) + 'px');
    }
  }

  function reserveDisplayMath(root) {
    const scope = root && root.querySelectorAll ? root : document;

    const displays = Array.from(scope.querySelectorAll('.pretex-display'));
    if (scope.classList && scope.classList.contains('pretex-display')) displays.unshift(scope);
    displays.forEach((display) => {
      display.style.display = 'flow-root';
      display.style.clear = 'both';
      display.style.position = 'relative';
      display.style.width = '100%';
      display.style.maxWidth = '100%';
      display.style.boxSizing = 'border-box';
      display.style.lineHeight = 'normal';
      display.style.textAlign = 'center';
      display.style.textIndent = '0';
      display.style.float = 'none';
      display.style.overflowX = 'auto';
      display.style.overflowY = 'auto';

      Array.from(display.children).forEach((child) => {
        if (child.matches && child.matches('svg.pretex')) reserveSvg(display, child);
      });
    });

    Array.from(scope.querySelectorAll('mjx-container[display="true"]')).forEach((math) => {
      math.style.display = 'block';
      math.style.clear = 'both';
      math.style.width = '100%';
      math.style.maxWidth = '100%';
      math.style.boxSizing = 'border-box';
      math.style.lineHeight = 'normal';
      math.style.textAlign = 'center';
      math.style.overflowX = 'auto';
      math.style.overflowY = 'auto';

      const svg = math.querySelector(':scope > svg');
      if (svg) {
        svg.style.display = 'block';
        svg.style.maxWidth = '100%';
        svg.style.height = 'auto';
        svg.style.marginLeft = 'auto';
        svg.style.marginRight = 'auto';
        const height = getSvgVisualHeight(svg, math);
        if (height > 1) {
          math.style.setProperty('--proofdesk-mathjax-display-height', Math.ceil(height) + 'px');
        }
      }
    });
  }

  function schedule(root) {
    reserveDisplayMath(root);
    window.requestAnimationFrame(() => reserveDisplayMath(root));
    window.setTimeout(() => reserveDisplayMath(root), 100);
    window.setTimeout(() => reserveDisplayMath(root), 500);
    window.setTimeout(() => reserveDisplayMath(root), 1200);
  }

  function init() {
    schedule(document);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) schedule(node);
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
</script>
`;

const getMathJaxSnippet = () => `
<script>
window.MathJax = {
  tex: {
    inlineMath:  [['\\\\(','\\\\)']],
    displayMath: [['\\\\[','\\\\]']],
    packages: {'[+]': ['noerrors', 'ams']},
    tags: 'ams',
    macros: {
      R:       '\\\\mathbb{R}',
      C:       '\\\\mathbb{C}',
      N:       '\\\\mathbb{N}',
      Z:       '\\\\mathbb{Z}',
      Span:    '\\\\operatorname{Span}',
      Nul:     '\\\\operatorname{Nul}',
      Col:     '\\\\operatorname{Col}',
      Row:     '\\\\operatorname{Row}',
      rank:    '\\\\operatorname{rank}',
      nullity: '\\\\operatorname{nullity}',
      vol:     '\\\\operatorname{vol}',
      dist:    '\\\\operatorname{dist}',
      vec:     ['\\\\mathbf{#1}', 1],
      mat:     ['\\\\begin{pmatrix}#1\\\\end{pmatrix}', 1],
      lt:      '<',
      gt:      '>'
    }
  },
  startup: { typeset: true }
};
</script>
<script async src="${getMathJaxScriptUrl()}"></script>
`;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a PreTeXt/MathBook XML string to a full HTML document.
 * Runs synchronously in the browser — no network calls, no backend.
 *
 * @param xml  Raw XML content from the editor
 * @returns    Complete HTML string ready for use as an iframe srcDoc
 */
export function pretexToHtml(xml: string): string {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(xml, 'application/xml');

  // If the XML is syntactically broken (user is mid-edit), show a friendly warning
  // instead of a blank screen.
  const err = doc.querySelector('parsererror');
  if (err) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: sans-serif; padding: 1.5rem 2rem; background: #1e1e1e; color: #ccc; }
  .warn { background: #2d2000; border: 1px solid #a07000; color: #ffd; padding: .75rem 1rem;
          border-radius: 4px; font-size: .9em; margin-bottom: 1.25rem; }
  pre   { white-space: pre-wrap; word-break: break-all; font-size: .82em;
          background: #111; padding: 1rem; border-radius: 4px; color: #bbb; }
</style>
</head><body>
<div class="warn">⚠ XML not yet valid — preview will update once the syntax is complete.</div>
<pre>${escHtml(xml)}</pre>
</body></html>`;
  }

  const counters: Counters = {
    theorem: 0, definition: 0, example: 0,
    exercise: 0, figure: 0, equation: 0,
  };

  const body = convertEl(doc.documentElement, counters);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Live Preview</title>
  <style>${CSS}</style>
  ${DISPLAY_MATH_LAYOUT_GUARD}
  ${getMathJaxSnippet()}
</head>
<body>${body}</body>
</html>`;
}

/** Returns true if a filename should use PreTeXt live preview */
export function isPreTeXtFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'xml' || ext === 'ptx' || ext === 'pretext';
}
import { getMathJaxScriptUrl } from './mathJax';

import { getMathJaxScriptUrl } from './mathJax';

const PREVIEW_SHARED_ROOT_DIRS = [
  'images',
  'figure-images',
  'fonts',
  'mathbook-assets',
  'static',
  'theme',
  'theme-duke',
  'theme-gt',
  'theme-vanderbilt',
];

const PREVIEW_SKIP_URL_PATTERN = /^(?:[a-zA-Z][a-zA-Z\d+.-]*:|\/|#|\?|\.\.?\/)/;

const preTeXtPreviewFixes = `
<style id="pretex-preview-fixes">
.mathbook-content .preface .definition-like > .heading .title,
.mathbook-content .preface .theorem-like > .heading .title,
.mathbook-content .preface .remark-like > .heading .title,
.mathbook-content .preface .example-like > .heading .title,
.mathbook-content .preface .exercise-like > .heading .title,
.mathbook-content .preface .aside-like > .heading .title,
.mathbook-content .preface .definition-like > header > .heading .title,
.mathbook-content .preface .theorem-like > header > .heading .title,
.mathbook-content .preface .remark-like > header > .heading .title,
.mathbook-content .preface .example-like > header > .heading .title,
.mathbook-content .preface .exercise-like > header > .heading .title,
.mathbook-content .preface .aside-like > header > .heading .title {
  margin: 0 !important;
  font-size: inherit !important;
  font-weight: inherit !important;
  color: inherit !important;
}

.mathbook-content .knowl-output .knowl-footer {
  display: none !important;
}

.mathbook-content .knowl-output .incontext {
  margin-bottom: 0 !important;
}

.mathbook-content .pretex-display,
.pretex-display {
  display: flow-root !important;
  clear: both;
  position: relative;
  max-width: 100%;
  margin: 1em 0 !important;
  padding: 0.15em 0;
  text-align: center;
  overflow-x: auto;
  overflow-y: visible;
}

.mathbook-content .pretex-display > svg.pretex,
.pretex-display > svg.pretex {
  display: block !important;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.mathbook-content li > .pretex-display {
  margin: 0.75em 0 !important;
}

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
</style>`;

const PROOFDESK_PRETEX_LAYOUT_FIX_VERSION = '2026-04-21-display-math-reserve';

const proofdeskPreTeXtLayoutFix = `
<style id="proofdesk-pretex-layout-fix" data-proofdesk-pretex-layout-version="${PROOFDESK_PRETEX_LAYOUT_FIX_VERSION}">
.mathbook-content .pretex-display,
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
.mathbook-content li > .pretex-display,
li > .pretex-display {
  margin: 0.85em 0 !important;
}
.mathbook-content .pretex-display + *,
.pretex-display + * {
  clear: both !important;
}
.pretex-display::after {
  content: "";
  display: block;
  clear: both;
}
.mathbook-content .pretex-display > svg.pretex,
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
.pretex-bind {
  display: inline-block !important;
  vertical-align: middle !important;
  line-height: 0;
}
.pretex-inline {
  display: inline-block !important;
  vertical-align: middle !important;
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
</script>`;

const mathBoxPreviewFixes = `
<style id="mathbox-loader-preview-fix">
.mathbox-loader.proofdesk-loader-hidden {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
</style>
<script>
(function () {
  'use strict';
  let loaderObserverStarted = false;

  function hasVisibleCanvas() {
    return Array.from(document.querySelectorAll('canvas')).some((canvas) => {
      const style = window.getComputedStyle(canvas);
      return canvas.clientWidth > 80 &&
        canvas.clientHeight > 80 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0';
    });
  }

  function hideMathBoxLoaders() {
    const loaders = Array.from(document.querySelectorAll('.mathbox-loader'));
    if (!loaders.length || !hasVisibleCanvas()) {
      return false;
    }

    loaders.forEach((loader) => {
      if (loader.dataset.proofdeskHidden === 'true') {
        return;
      }

      loader.dataset.proofdeskHidden = 'true';
      loader.classList.add('proofdesk-loader-hidden', 'mathbox-exit');
      window.setTimeout(() => {
        loader.style.display = 'none';
      }, 180);
    });

    return true;
  }

  function monitorMathBoxLoaders() {
    if (loaderObserverStarted) {
      return;
    }

    loaderObserverStarted = true;
    const deadline = Date.now() + 10000;

    const tick = () => {
      hideMathBoxLoaders();
      if (Date.now() < deadline) {
        window.requestAnimationFrame(tick);
      }
    };

    window.requestAnimationFrame(tick);
    window.setTimeout(hideMathBoxLoaders, 250);
    window.setTimeout(hideMathBoxLoaders, 1000);
    window.setTimeout(hideMathBoxLoaders, 2500);

    const observer = new MutationObserver(() => {
      hideMathBoxLoaders();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', monitorMathBoxLoaders, { once: true });
  } else {
    monitorMathBoxLoaders();
  }
})();
</script>`;

const rewriteAbsolutePreviewUrls = (html: string, baseHref: string) =>
  html
    .replace(/(href|src|action)="\//g, `$1="${baseHref}`)
    .replace(/url\(\//g, `url(${baseHref}`)
    .replace(/url\('\//g, `url('${baseHref}`)
    .replace(/url\("\//g, `url("${baseHref}`)
    .replace(/@import url\("\//g, `@import url("${baseHref}`);

const rewriteBareRelativeAttributes = (html: string, baseHref: string) =>
  html.replace(
    /((?:href|src|action|poster)=["'])([^"']+)(["'])/g,
    (match, prefix, url, suffix) => {
      if (PREVIEW_SKIP_URL_PATTERN.test(url)) {
        return match;
      }

      return `${prefix}${baseHref}${url}${suffix}`;
    }
  );

const rewriteCssUrls = (html: string, baseHref: string, allowedRelativeDirs: string[]) =>
  html.replace(/url\((['"]?)([^)"']+)\1\)/g, (match, quote, url) => {
    if (url.startsWith(baseHref)) {
      return match;
    }

    if (PREVIEW_SKIP_URL_PATTERN.test(url)) {
      if (!url.startsWith('/')) {
        return match;
      }

      return `url(${quote}${baseHref}${url.slice(1)}${quote})`;
    }

    if (!allowedRelativeDirs.some((dir) => url.startsWith(`${dir}/`))) {
      return match;
    }

    return `url(${quote}${baseHref}${url}${quote})`;
  });

const PROOFDESK_LAYOUT_STYLE_PATTERN = /\s*<style\b[^>]*\bid=["']proofdesk-pretex-layout-fix["'][^>]*>[\s\S]*?<\/style>/gi;
const PROOFDESK_LAYOUT_SCRIPT_PATTERN = /\s*<script\b[^>]*\bid=["']proofdesk-pretex-layout-guard["'][^>]*>[\s\S]*?<\/script>/gi;

const injectLatestPreTeXtLayoutFix = (html: string) => {
  const cleaned = html
    .replace(PROOFDESK_LAYOUT_STYLE_PATTERN, '')
    .replace(PROOFDESK_LAYOUT_SCRIPT_PATTERN, '');

  if (cleaned.includes('</head>')) {
    return cleaned.replace('</head>', `${proofdeskPreTeXtLayoutFix}\n</head>`);
  }

  return `${proofdeskPreTeXtLayoutFix}\n${cleaned}`;
};

const getDocumentBaseHref = (sessionBaseHref: string | undefined, previewFilePath: string) => {
  if (!sessionBaseHref) {
    return '';
  }

  const normalizedPath = previewFilePath.replace(/^\/+/, '');
  const lastSlashIndex = normalizedPath.lastIndexOf('/');

  if (lastSlashIndex < 0) {
    return sessionBaseHref;
  }

  const directoryPath = normalizedPath.slice(0, lastSlashIndex + 1);

  try {
    return new URL(directoryPath, sessionBaseHref).toString();
  } catch {
    return `${sessionBaseHref}${directoryPath}`;
  }
};

export const prepareHtmlForSrcDoc = (
  content: string,
  baseHref?: string,
  previewFilePath = ''
): string => {
  let html = content;
  const documentBaseHref = getDocumentBaseHref(baseHref, previewFilePath);
  const baseTag = documentBaseHref ? `<base href="${documentBaseHref}">` : '';
  const isKnowlPreview = previewFilePath.startsWith('knowl/');
  const isPreTeXtDocument = /mathbook-content|js\/ila\.js|class="pretex|class="mathbook-/.test(html);
  const mathJaxScriptUrl = getMathJaxScriptUrl(documentBaseHref || baseHref);
  const preTeXtAssetLink = baseHref && isPreTeXtDocument && !html.includes('ila-add-on.css')
    ? `<link rel="stylesheet" href="${baseHref}css/ila-add-on.css" type="text/css">`
    : '';

  const mathJaxSnippet = `<script>
window.MathJax = {
  tex: {
    inlineMath: [['\\\\(', '\\\\)']],
    displayMath: [['\\\\[', '\\\\]']],
    packages: {'[+]': ['noerrors']},
    macros: {
      R:'\\\\mathbb{R}',C:'\\\\mathbb{C}',N:'\\\\mathbb{N}',Z:'\\\\mathbb{Z}',
      Span:'\\\\operatorname{Span}',Nul:'\\\\operatorname{Nul}',
      Col:'\\\\operatorname{Col}',Row:'\\\\operatorname{Row}',
      rank:'\\\\operatorname{rank}',nullity:'\\\\operatorname{nullity}',
      vol:'\\\\operatorname{vol}',dist:'\\\\operatorname{dist}'
    }
  },
  startup: { typeset: true }
};
</script>
<script async src="${mathJaxScriptUrl}"></script>`;

  const needsMathJax = !html.includes('MathJax') && !html.includes('katex');

  if (!html.trim().toLowerCase().startsWith('<!doctype') && !html.includes('<html')) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${baseTag}
${preTeXtAssetLink}
${isPreTeXtDocument ? preTeXtPreviewFixes : ''}
${isPreTeXtDocument ? proofdeskPreTeXtLayoutFix : ''}
${mathBoxPreviewFixes}
${needsMathJax ? mathJaxSnippet : ''}
<style>body{font-family:Georgia,serif;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.6;}</style>
</head><body>${html}</body></html>`;
  }

  if (baseHref) {
    html = rewriteAbsolutePreviewUrls(html, baseHref);
    if (isKnowlPreview) {
      html = rewriteBareRelativeAttributes(html, baseHref);
      html = rewriteCssUrls(html, baseHref, PREVIEW_SHARED_ROOT_DIRS);
    }
  }

  if (baseTag && !html.includes('<base ')) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n${baseTag}`);
  }
  if (preTeXtAssetLink && !html.includes('ila-add-on.css')) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n${preTeXtAssetLink}`);
  }
  if (isPreTeXtDocument && !html.includes('pretex-preview-fixes')) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n${preTeXtPreviewFixes}`);
  }
  if (!html.includes('mathbox-loader-preview-fix')) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n${mathBoxPreviewFixes}`);
  }
  if (needsMathJax) {
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${mathJaxSnippet}\n</head>`);
    } else {
      html = `${mathJaxSnippet}\n${html}`;
    }
  }
  if (isPreTeXtDocument) {
    html = injectLatestPreTeXtLayoutFix(html);
  }

  return html;
};

export const getLanguageFromFilename = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    kt: 'kotlin',
    swift: 'swift',
    m: 'objective-c',
    scala: 'scala',
    sh: 'shell',
    ps1: 'powershell',
    bash: 'shell',
    zsh: 'shell',
    fish: 'shell',
    powershell: 'powershell',
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    cfg: 'ini',
    conf: 'ini',
    sql: 'sql',
    mysql: 'mysql',
    pgsql: 'pgsql',
    sqlite: 'sql',
    dockerfile: 'dockerfile',
    docker: 'dockerfile',
    makefile: 'makefile',
    mk: 'makefile',
    make: 'makefile',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    md: 'markdown',
    markdown: 'markdown',
    rst: 'restructuredtext',
    adoc: 'asciidoc',
    tex: 'latex',
    r: 'r',
    R: 'r',
    matlab: 'matlab',
    lua: 'lua',
    perl: 'perl',
    pl: 'perl',
  };

  return languageMap[ext || ''] || 'plaintext';
};

export const getPreviewBaseHref = (previewUrl: string | null, apiUrl: string) => {
  try {
    if (previewUrl) {
      const url = new URL(previewUrl);
      url.search = '';
      url.hash = '';
      url.pathname = url.pathname.replace(/[^/]*$/, '');
      return url.toString();
    }
  } catch {
    // fall through to API URL handling
  }

  try {
    const api = new URL(apiUrl);
    api.search = '';
    api.hash = '';
    if (!api.pathname.endsWith('/')) {
      api.pathname = `${api.pathname}/`;
    }
    return api.toString();
  } catch {
    return apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
  }
};

let previewRequestNonce = 0;

export const buildPreviewHref = (apiUrl: string, sessionId: string, entryFile: string) => {
  previewRequestNonce += 1;
  return `${apiUrl}/preview/${sessionId}/${entryFile}?t=${Date.now()}-${previewRequestNonce}`;
};

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
</style>`;

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

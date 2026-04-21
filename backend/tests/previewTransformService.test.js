import assert from 'node:assert/strict';
import test from 'node:test';
import { transformPreviewFile } from '../src/services/previewTransformService.js';

test('injects resilient PreTeXt math layout fixes into preview HTML', () => {
  const html = transformPreviewFile(
    'overview.html',
    '<!DOCTYPE html><html><head><title>Overview</title></head><body class="mathbook-book"><main class="mathbook-content"><div class="pretex-display"><svg class="pretex" height="4em" viewBox="0 0 100 40"></svg></div></main></body></html>',
    '1111111111111111'
  );

  assert.match(html, /id="proofdesk-pretex-layout-fix"/);
  assert.match(html, /id="proofdesk-pretex-layout-guard"/);
  assert.match(html, /\.pretex-display>svg\.pretex\{/);
  assert.match(html, /display:block!important;/);
  assert.match(html, /mjx-container\[display="true"\]\{/);
  assert.match(html, /width:100%!important;/);
  assert.match(html, /--proofdesk-pretex-display-height/);
  assert.match(html, /data-proofdesk-pretex-layout-version="2026-04-21-display-math-reserve"/);
  assert.match(html, /getSvgVisualHeight/);
});

test('ships a brace-aware syseq fallback for MathJax previews', () => {
  const html = transformPreviewFile(
    'overview.html',
    '<!DOCTYPE html><html><head><title>Overview</title></head><body><script type="text/x-latex-display">\\syseq{x_{2016}=y_{2017}; x=1}</script></body></html>',
    '1111111111111111'
  );

  assert.match(html, /function findMatchingBrace/);
  assert.match(html, /replaceDelimitedCommands\(tex, \['syseq','spalignsys'\], convertSpAlign\)/);
  assert.equal(html.includes('([\\\\s\\\\S]*?)'), false);
});

test('places the final PreTeXt layout guard after generated textbook styles', () => {
  const html = transformPreviewFile(
    'overview.html',
    '<!DOCTYPE html><html><head><style id="pretex-style">svg.pretex{display:inline-block;}</style></head><body><div class="pretex-display"><svg class="pretex" height="4em" viewBox="0 0 100 40"></svg></div></body></html>',
    '1111111111111111'
  );

  assert.ok(html.indexOf('id="proofdesk-pretex-layout-fix"') > html.indexOf('id="pretex-style"'));
});

test('replaces stale PreTeXt layout guards before reinserting the latest one', () => {
  const html = transformPreviewFile(
    'overview.html',
    '<!DOCTYPE html><html><head><style id="proofdesk-pretex-layout-fix">.pretex-display{display:inline}</style><script id="proofdesk-pretex-layout-guard">window.oldGuard=true</script><style id="pretex-style">svg.pretex{display:inline-block;}</style></head><body><div class="pretex-display"><svg class="pretex" height="4em" viewBox="0 0 100 40"></svg></div></body></html>',
    '1111111111111111'
  );

  assert.equal(html.match(/id="proofdesk-pretex-layout-fix"/g).length, 1);
  assert.equal(html.match(/id="proofdesk-pretex-layout-guard"/g).length, 1);
  assert.equal(html.includes('window.oldGuard'), false);
  assert.equal(html.includes('.pretex-display{display:inline}'), false);
  assert.ok(html.indexOf('id="proofdesk-pretex-layout-fix"') > html.indexOf('id="pretex-style"'));
});

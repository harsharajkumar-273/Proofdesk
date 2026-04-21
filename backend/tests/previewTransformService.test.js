import assert from 'node:assert/strict';
import test from 'node:test';
import { transformPreviewFile } from '../src/services/previewTransformService.js';

test('injects resilient PreTeXt math layout fixes into preview HTML', () => {
  const html = transformPreviewFile(
    'overview.html',
    '<!DOCTYPE html><html><head><title>Overview</title></head><body class="mathbook-book"><main class="mathbook-content"><div class="pretex-display"><svg class="pretex" height="4em" viewBox="0 0 100 40"></svg></div></main></body></html>',
    '1111111111111111'
  );

  assert.match(html, /id="pretex-layout-fix"/);
  assert.match(html, /\.pretex-display > svg\.pretex\{display:block!important;max-width:100%;height:auto;margin:0 auto;\}/);
  assert.match(html, /mjx-container\[display="true"\]\{display:block!important;clear:both;/);
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

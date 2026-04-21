import { describe, expect, it } from 'vitest';
import { getPreviewBaseHref, prepareHtmlForSrcDoc } from './editorPreview';

describe('editorPreview', () => {
  it('derives a session-scoped base href from the preview file URL', () => {
    expect(
      getPreviewBaseHref(
        'http://127.0.0.1:4002/preview/1111111111111111/systems-of-eqns.html?t=123',
        'http://127.0.0.1:4002'
      )
    ).toBe('http://127.0.0.1:4002/preview/1111111111111111/');
  });

  it('injects the provided base href into srcDoc content', () => {
    const html = prepareHtmlForSrcDoc(
      '<!DOCTYPE html><html><head><title>Test</title></head><body><iframe src="demos/plane.html"></iframe></body></html>',
      'http://127.0.0.1:4002/preview/1111111111111111/'
    );

    expect(html).toContain('<base href="http://127.0.0.1:4002/preview/1111111111111111/">');
    expect(html).toContain('src="demos/plane.html"');
  });

  it('uses the nested file directory as the srcDoc base href', () => {
    const html = prepareHtmlForSrcDoc(
      '<!DOCTYPE html><html><head><title>Demo</title></head><body><script src="js/demo.js"></script></body></html>',
      'http://127.0.0.1:4002/preview/1111111111111111/',
      'demos/bestfit-implicit.html'
    );

    expect(html).toContain('<base href="http://127.0.0.1:4002/preview/1111111111111111/demos/">');
    expect(html).toContain('src="js/demo.js"');
  });

  it('injects the MathBox loader cleanup into demo previews', () => {
    const html = prepareHtmlForSrcDoc(
      '<!DOCTYPE html><html><head><title>Demo</title></head><body><div class="mathbox-wrapper"><div id="mathbox1"></div></div><script src="js/demo.js"></script></body></html>',
      'http://127.0.0.1:4002/preview/1111111111111111/',
      'demos/bestfit.html'
    );

    expect(html).toContain('id="mathbox-loader-preview-fix"');
    expect(html).toContain('proofdesk-loader-hidden');
    expect(html).toContain('hideMathBoxLoaders');
  });

  it('rewrites root-relative preview assets and injects PreTeXt preview fixes', () => {
    const html = prepareHtmlForSrcDoc(
      '<!DOCTYPE html><html><head><title>Overview</title><link href="/static/site.css" rel="stylesheet"></head><body class="mathbook-book"><main class="mathbook-content"><section class="preface"><article class="example-like"><h5 class="heading"><span class="type">Example</span><span class="title">(Biology)</span></h5></article></section></main></body></html>',
      'http://127.0.0.1:4002/preview/1111111111111111/'
    );

    expect(html).toContain('href="http://127.0.0.1:4002/preview/1111111111111111/static/site.css"');
    expect(html).toContain('href="http://127.0.0.1:4002/preview/1111111111111111/css/ila-add-on.css"');
    expect(html).toContain('id="pretex-preview-fixes"');
    expect(html).toContain('id="proofdesk-pretex-layout-fix"');
    expect(html).toContain('id="proofdesk-pretex-layout-guard"');
    expect(html).toContain('.mathbook-content .knowl-output .knowl-footer');
    expect(html).toContain('src="http://127.0.0.1:4002/assets/mathjax/tex-svg.js"');
  });

  it('places the final PreTeXt layout fix after generated textbook styles', () => {
    const html = prepareHtmlForSrcDoc(
      '<!DOCTYPE html><html><head><style id="pretex-style">svg.pretex{display:inline-block;}</style></head><body class="mathbook-book"><main class="mathbook-content"><div class="pretex-display"><svg class="pretex" height="4em"></svg></div></main></body></html>',
      'http://127.0.0.1:4002/preview/1111111111111111/'
    );

    expect(html.indexOf('id="proofdesk-pretex-layout-fix"')).toBeGreaterThan(html.indexOf('id="pretex-style"'));
  });

  it('rewrites nested knowl assets back to the preview root', () => {
    const html = prepareHtmlForSrcDoc(
      '<!DOCTYPE html><html><head><title>Knowl</title></head><body><img src="images/important.svg"><svg><image href="figure-images/example.png"></image></svg><a href="dimension.html#dimension-defn-basis">in-context</a></body></html>',
      'http://127.0.0.1:4002/preview/1111111111111111/',
      'knowl/dimension-defn-basis.html'
    );

    expect(html).toContain('src="http://127.0.0.1:4002/preview/1111111111111111/images/important.svg"');
    expect(html).toContain('href="http://127.0.0.1:4002/preview/1111111111111111/figure-images/example.png"');
    expect(html).toContain('href="http://127.0.0.1:4002/preview/1111111111111111/dimension.html#dimension-defn-basis"');
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compilePretextXmlWasm } from './wasmCompiler';
import { loadPyodideRuntime } from './pyodideLoader';

// Mock pyodide load runtime function
vi.mock('./pyodideLoader', () => ({
  loadPyodideRuntime: vi.fn(),
}));

describe('WebAssembly PreTeXt Compiler Runtime', () => {
  let mockGlobals: Record<string, any> = {};

  const mockPyodide = {
    runPython: vi.fn((script: string) => {
      // Intercept and mock python's pretext_to_html execution
      if (script === 'pretext_to_html(xml_to_compile)') {
        const xml = mockGlobals['xml_to_compile'] || '';
        
        if (xml.includes('<invalid>')) {
          throw new Error('Python traceback:\nxml.etree.ElementTree.ParseError: mismatched tag: line 5, column 12');
        }
        if (xml.includes('<theorem name="Pythagoras">')) {
          return "<div class='theorem-box border-indigo-500'>Theorem (Pythagoras)</div>";
        }
        if (xml.includes('<proof>')) {
          return "<details class='proof-details'>Proof</details>";
        }
        return "<article class='pretext-content'>Simple XML Content</article>";
      }
      return '';
    }),
    globals: {
      set: vi.fn((key: string, val: any) => {
        mockGlobals[key] = val;
      }),
      get: vi.fn((key: string) => mockGlobals[key]),
    },
  };

  beforeEach(() => {
    mockGlobals = {};
    vi.clearAllMocks();
    vi.mocked(loadPyodideRuntime).mockResolvedValue(mockPyodide);
  });

  it('compiles standard PreTeXt XML markup via mock WebAssembly runtime', async () => {
    const xml = `
      <pretext>
        <article>
          <title>Simple Book</title>
          <p>This is a paragraph.</p>
        </article>
      </pretext>
    `;

    const html = await compilePretextXmlWasm(xml);

    expect(loadPyodideRuntime).toHaveBeenCalled();
    expect(mockPyodide.runPython).toHaveBeenCalledWith('pretext_to_html(xml_to_compile)');
    expect(html).toContain('Simple XML Content');
    expect(html).toContain('katex.min.css');
    expect(html).toContain('tailwindcss.com');
  });

  it('compiles theorem elements correctly', async () => {
    const xml = `
      <theorem name="Pythagoras">
        <p>a^2 + b^2 = c^2</p>
      </theorem>
    `;

    const html = await compilePretextXmlWasm(xml);

    expect(html).toContain("Theorem (Pythagoras)");
    expect(html).toContain("class='theorem-box");
  });

  it('compiles proof collapsible elements correctly', async () => {
    const xml = `
      <proof>
        <p>Simple math proof lines.</p>
      </proof>
    `;

    const html = await compilePretextXmlWasm(xml);

    expect(html).toContain("class='proof-details'");
  });

  it('throws clean XML Parse Error when XML parsing fails', async () => {
    const xml = `<invalid>bad XML`;
    await expect(compilePretextXmlWasm(xml)).rejects.toThrow('XML Parse Error: mismatched tag: line 5, column 12');
  });
});

describe('WASM preview: local workspace assets (issue #16)', () => {
  let mockGlobals: Record<string, any> = {};
  const mockPyodide = {
    runPython: vi.fn((script: string) =>
      script === 'pretext_to_html(xml_to_compile)' ? '<article>Body</article>' : '',
    ),
    globals: {
      set: vi.fn((key: string, val: any) => { mockGlobals[key] = val; }),
      get: vi.fn((key: string) => mockGlobals[key]),
    },
  };

  beforeEach(() => {
    mockGlobals = {};
    vi.clearAllMocks();
    vi.mocked(loadPyodideRuntime).mockResolvedValue(mockPyodide);
  });

  const XML = '<pretext><article><p>Hi</p></article></pretext>';

  it('renders unchanged when no assets are supplied (existing callers keep working)', async () => {
    const html = await compilePretextXmlWasm(XML);
    expect(html).toContain('<article>Body</article>');
    expect(html).not.toContain('data-proofdesk-asset');
  });

  it('inlines a workspace stylesheet into the head', async () => {
    const html = await compilePretextXmlWasm(XML, [
      { path: 'styles.css', content: '.badge { color: rebeccapurple; }' },
    ]);
    expect(html).toContain('.badge { color: rebeccapurple; }');
    expect(html).toContain('data-proofdesk-asset="styles.css"');
    // must land before </head> so it can cascade over the defaults
    expect(html.indexOf('rebeccapurple')).toBeLessThan(html.indexOf('</head>'));
  });

  it('inlines a workspace script after the body content', async () => {
    const html = await compilePretextXmlWasm(XML, [
      { path: 'interactive.js', content: 'window.__ready = true;' },
    ]);
    expect(html).toContain('window.__ready = true;');
    // must come after the compiled body, so the DOM it touches exists
    expect(html.indexOf('window.__ready')).toBeGreaterThan(html.indexOf('<article>Body</article>'));
  });

  it('ignores assets that are neither CSS nor JS', async () => {
    const html = await compilePretextXmlWasm(XML, [
      { path: 'notes.md', content: '# not an asset' },
      { path: 'diagram.svg', content: '<svg/>' },
    ]);
    expect(html).not.toContain('not an asset');
    expect(html).not.toContain('data-proofdesk-asset');
  });

  it('preserves the order assets are given in', async () => {
    const html = await compilePretextXmlWasm(XML, [
      { path: 'a.css', content: '.a{}' },
      { path: 'b.css', content: '.b{}' },
    ]);
    expect(html.indexOf('.a{}')).toBeLessThan(html.indexOf('.b{}'));
  });

  it('handles both CSS and JS together', async () => {
    const html = await compilePretextXmlWasm(XML, [
      { path: 'styles.css', content: '.x{}' },
      { path: 'interactive.js', content: 'const y = 1;' },
    ]);
    expect(html).toContain('.x{}');
    expect(html).toContain('const y = 1;');
    expect(html.indexOf('.x{}')).toBeLessThan(html.indexOf('const y = 1;'));
  });

  it('stops a script containing "</script>" from terminating the block early', async () => {
    // A JS file with this sequence in a template or regex would otherwise close
    // the <script> element and dump the remainder of the file as live markup.
    const html = await compilePretextXmlWasm(XML, [
      { path: 'evil.js', content: 'const t = "</script><h1>injected</h1>";' },
    ]);
    // The terminator is neutralised, so the payload stays inside the JS string
    // rather than becoming real markup.
    expect(html).toContain('<\\/script>');
    const blockStart = html.indexOf('data-proofdesk-asset="evil.js"');
    expect(html.indexOf('<h1>injected</h1>')).toBeLessThan(
      html.indexOf('</script>', blockStart),
    );
  });

  it('stops a stylesheet containing "</style>" from terminating the block early', async () => {
    const html = await compilePretextXmlWasm(XML, [
      { path: 'evil.css', content: '/* </style><h1>injected</h1> */' },
    ]);
    expect(html).toContain('<\\/style>');
    const blockStart = html.indexOf('data-proofdesk-asset="evil.css"');
    expect(html.indexOf('<h1>injected</h1>')).toBeLessThan(
      html.indexOf('</style>', blockStart),
    );
  });

  it('escapes the asset path used in the data attribute', async () => {
    // The path is attacker-shaped but must still carry a real asset extension,
    // otherwise it is filtered out before it reaches the attribute.
    const html = await compilePretextXmlWasm(XML, [
      { path: 'a" onload="alert(1).css', content: '.z{}' },
    ]);
    expect(html).not.toContain('onload="alert(1)');
    expect(html).toContain('&quot;');
  });

  it('tolerates an empty asset list and empty contents', async () => {
    const html = await compilePretextXmlWasm(XML, [{ path: 'empty.css', content: '' }]);
    expect(html).toContain('data-proofdesk-asset="empty.css"');
    expect(html).toContain('<article>Body</article>');
  });
});

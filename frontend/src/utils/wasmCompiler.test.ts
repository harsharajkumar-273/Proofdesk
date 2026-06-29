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

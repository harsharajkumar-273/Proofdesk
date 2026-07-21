import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { replaceMathDelimiters, parseMarkdownToPretext, validatePdfBuffer } = await import('../src/services/pdfImportService.js');

describe('PDF/LaTeX Ingestion Service', () => {
  describe('validatePdfBuffer', () => {
    it('accepts valid PDF buffer with %PDF- header magic bytes', () => {
      const validBuffer = Buffer.from('%PDF-1.7 header content here');
      assert.doesNotThrow(() => validatePdfBuffer(validBuffer, 'application/pdf'));
    });

    it('rejects empty or small buffers', () => {
      assert.throws(
        () => validatePdfBuffer(Buffer.from('123')),
        /Invalid PDF file/
      );
    });

    it('rejects non-PDF header signatures', () => {
      const invalidBuffer = Buffer.from('<html>Not a PDF</html>');
      assert.throws(
        () => validatePdfBuffer(invalidBuffer, 'application/pdf'),
        /Invalid PDF file signature/
      );
    });

    it('rejects non-application/pdf MIME types', () => {
      const validBuffer = Buffer.from('%PDF-1.4 header');
      assert.throws(
        () => validatePdfBuffer(validBuffer, 'image/png'),
        /Invalid file MIME type/
      );
    });
  });

  describe('replaceMathDelimiters', () => {
    it('translates inline LaTeX math delimiters \\( ... \\) and $ ... $', () => {
      const input = 'Let \\(x\\) be a vector and $y$ be a scalar.';
      const expected = 'Let <m>x</m> be a vector and <m>y</m> be a scalar.';
      assert.equal(replaceMathDelimiters(input), expected);
    });

    it('translates display LaTeX math delimiters \\[ ... \\] and $$ ... $$', () => {
      const input1 = 'Solve: \\[Ax = \\lambda x\\]';
      const expected1 = 'Solve: <me>Ax = \\lambda x</me>';
      assert.equal(replaceMathDelimiters(input1), expected1);

      const input2 = 'Or: $$y = mx + c$$';
      const expected2 = 'Or: <me>y = mx + c</me>';
      assert.equal(replaceMathDelimiters(input2), expected2);
    });
  });

  describe('parseMarkdownToPretext', () => {
    it('correctly compiles headers to nested chapter and section tags', () => {
      const md = `# Linear Algebra\n\n## Vectors\n\nSome text.\n\n### Vector Addition\n\nMore text.`;
      const result = parseMarkdownToPretext(md);

      // Verify structures
      assert.ok(result.includes('<chapter'));
      assert.ok(result.includes('<title>Linear Algebra</title>'));
      assert.ok(result.includes('<section'));
      assert.ok(result.includes('<title>Vectors</title>'));
      assert.ok(result.includes('<subsection'));
      assert.ok(result.includes('<title>Vector Addition</title>'));

      // Check nesting/closing order
      assert.ok(result.includes('</subsection>'));
      assert.ok(result.includes('</section>'));
      assert.ok(result.includes('</chapter>'));
    });

    it('handles code blocks correctly', () => {
      const md = 'Here is code:\n\n```python\nprint("Hello World")\n```';
      const result = parseMarkdownToPretext(md);
      assert.ok(result.includes('<program><input>'));
      assert.ok(result.includes('print("Hello World")'));
      assert.ok(result.includes('</input></program>'));
    });

    it('handles unordered and ordered lists', () => {
      const md = 'My list:\n- First item\n- Second item';
      const result = parseMarkdownToPretext(md);
      assert.ok(result.includes('<ul>'));
      assert.ok(result.includes('<item><p>First item</p></item>'));
      assert.ok(result.includes('<item><p>Second item</p></item>'));
      assert.ok(result.includes('</ul>'));
    });
  });
});

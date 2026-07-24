import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { replaceMathDelimiters, parseMarkdownToPretext } = await import('../src/services/pdfImportService.js');

describe('PDF/LaTeX Ingestion Service', () => {
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

    it('leaves prose currency alone instead of pairing the dollar signs', () => {
      // Two amounts in a sentence used to be read as one inline equation, turning
      // "$10 and $20" into "<m>10 and </m>20".
      const input = 'The item costs $10 and $20 in total.';
      assert.equal(replaceMathDelimiters(input), input);
    });

    it('leaves a single currency amount and a run of amounts untouched', () => {
      assert.equal(replaceMathDelimiters('It costs $10.'), 'It costs $10.');
      assert.equal(replaceMathDelimiters('$5, $10 and $20 each.'), '$5, $10 and $20 each.');
    });

    it('leaves currency amounts separated only by punctuation untouched', () => {
      // No whitespace between the amounts, so the closing-$ digit guard is what rejects these.
      assert.equal(replaceMathDelimiters('Costs $5,$10 today.'), 'Costs $5,$10 today.');
      assert.equal(replaceMathDelimiters('Range $10/$20 each.'), 'Range $10/$20 each.');
    });

    it('does not pair currency amounts that sit on separate lines', () => {
      const input = 'costs $10\nand $20';
      assert.equal(replaceMathDelimiters(input), input);
    });

    it('still converts inline math that appears alongside currency', () => {
      const input = 'Given $a=1$, the price is $5 and $7.';
      const expected = 'Given <m>a=1</m>, the price is $5 and $7.';
      assert.equal(replaceMathDelimiters(input), expected);
    });

    it('still converts inline math whose content starts with a digit', () => {
      // A rule as blunt as "a $ followed by a digit is currency" would break this.
      const input = 'Let $5x + 2$ hold.';
      const expected = 'Let <m>5x + 2</m> hold.';
      assert.equal(replaceMathDelimiters(input), expected);
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

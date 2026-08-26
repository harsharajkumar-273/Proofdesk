import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  replaceMathDelimiters,
  parseMarkdownToPretext,
  importPdf,
  importTimeoutMs,
  importHttpTimeoutMs,
  isAbortError,
  ImportAbortedError,
} = await import('../src/services/pdfImportService.js');

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
      // Code block content is XML-escaped (it has to be valid XML), so the
      // quotes come out as &quot; rather than literal ".
      assert.ok(result.includes('print(&quot;Hello World&quot;)'));
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

describe('import cancellation and timeouts (issue #15)', () => {
  const originalTimeout = process.env.PROOFDESK_IMPORT_TIMEOUT_MS;
  const originalMathpixId = process.env.MATHPIX_APP_ID;
  const originalMathpixKey = process.env.MATHPIX_APP_KEY;

  const clearMathPix = () => {
    delete process.env.MATHPIX_APP_ID;
    delete process.env.MATHPIX_APP_KEY;
  };

  const restore = () => {
    if (originalTimeout === undefined) delete process.env.PROOFDESK_IMPORT_TIMEOUT_MS;
    else process.env.PROOFDESK_IMPORT_TIMEOUT_MS = originalTimeout;
    if (originalMathpixId === undefined) delete process.env.MATHPIX_APP_ID;
    else process.env.MATHPIX_APP_ID = originalMathpixId;
    if (originalMathpixKey === undefined) delete process.env.MATHPIX_APP_KEY;
    else process.env.MATHPIX_APP_KEY = originalMathpixKey;
  };

  it('defaults to a 60s overall budget and a 20s per-request budget', () => {
    delete process.env.PROOFDESK_IMPORT_TIMEOUT_MS;
    delete process.env.PROOFDESK_IMPORT_HTTP_TIMEOUT_MS;
    assert.equal(importTimeoutMs(), 60_000);
    assert.equal(importHttpTimeoutMs(), 20_000);
    restore();
  });

  it('honours PROOFDESK_IMPORT_TIMEOUT_MS when set', () => {
    process.env.PROOFDESK_IMPORT_TIMEOUT_MS = '1234';
    assert.equal(importTimeoutMs(), 1234);
    restore();
  });

  it('classifies abort-shaped errors, and leaves genuine failures alone', () => {
    assert.equal(isAbortError(new ImportAbortedError('timeout', 'x')), true);
    assert.equal(isAbortError({ code: 'ERR_CANCELED' }), true);       // axios abort
    assert.equal(isAbortError({ code: 'ECONNABORTED' }), true);       // axios timeout
    assert.equal(isAbortError({ name: 'CanceledError' }), true);
    assert.equal(isAbortError(new Error('MathPix returned 500')), false);
  });

  it('completes normally when it is not cancelled', async () => {
    clearMathPix();
    const xml = await importPdf(Buffer.from('%PDF-1.4'), 'sample.pdf');
    assert.match(xml, /<chapter/);
    restore();
  });

  it('aborts when the caller cancels, rather than running to completion', async () => {
    clearMathPix();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);

    await assert.rejects(
      () => importPdf(Buffer.from('%PDF-1.4'), 'sample.pdf', { signal: controller.signal }),
      (error) => {
        assert.equal(error instanceof ImportAbortedError, true);
        assert.equal(error.reason, 'client-abort');
        return true;
      },
    );
    restore();
  });

  it('reports a timeout, distinctly from a client cancellation, when the budget expires', async () => {
    clearMathPix();
    process.env.PROOFDESK_IMPORT_TIMEOUT_MS = '20'; // shorter than the mock path's own delay

    await assert.rejects(
      () => importPdf(Buffer.from('%PDF-1.4'), 'sample.pdf'),
      (error) => {
        assert.equal(error instanceof ImportAbortedError, true);
        assert.equal(error.reason, 'timeout');
        assert.match(error.message, /exceeded/i);
        return true;
      },
    );
    restore();
  });

  it('returns promptly on cancellation instead of waiting out the remaining delay', async () => {
    clearMathPix();
    const controller = new AbortController();
    const startedAt = Date.now();
    setTimeout(() => controller.abort(), 10);

    await assert.rejects(() =>
      importPdf(Buffer.from('%PDF-1.4'), 'sample.pdf', { signal: controller.signal }),
    );

    // The mock path sleeps 800ms; aborting must not wait that out.
    assert.ok(Date.now() - startedAt < 400, 'cancellation should short-circuit the pending delay');
    restore();
  });

  it('treats an already-aborted signal as a cancellation without doing work', async () => {
    clearMathPix();
    const controller = new AbortController();
    controller.abort(); // aborted BEFORE the call — the event will never fire

    await assert.rejects(
      () => importPdf(Buffer.from('%PDF-1.4'), 'sample.pdf', { signal: controller.signal }),
      (error) => {
        assert.equal(error instanceof ImportAbortedError, true);
        assert.equal(error.reason, 'client-abort');
        return true;
      },
    );
    restore();
  });

  it('classifies a stalled upstream request as a timeout, not a cancellation', async () => {
    // axios reports a socket timeout as ECONNABORTED, which is abort-shaped.
    // Misreading it as 'client-abort' would make the controller answer 500
    // instead of the 504 this feature exists to produce.
    const axiosTimeout = Object.assign(new Error('timeout of 20000ms exceeded'), {
      code: 'ECONNABORTED',
    });
    assert.equal(isAbortError(axiosTimeout), true, 'still recognised as abort-shaped');

    // With no caller signal and no overall-deadline expiry, this must surface
    // as a timeout so the 504 path is taken.
    clearMathPix();
    process.env.PROOFDESK_IMPORT_TIMEOUT_MS = '20';
    await assert.rejects(
      () => importPdf(Buffer.from('%PDF-1.4'), 'sample.pdf'),
      (error) => {
        assert.equal(error.reason, 'timeout');
        return true;
      },
    );
    restore();
  });
});

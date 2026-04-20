import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFailurePayload, terminalFailurePayload } from '../src/utils/buildDiagnostics.js';

describe('build diagnostics helpers', () => {
  it('maps XML build errors to professor-facing guidance', () => {
    const payload = buildFailurePayload('Build failed', 'Traceback: XML parserError on line 42');

    assert.equal(payload.code, 'course_source_invalid');
    assert.match(payload.advice, /xml|course source/i);
  });

  it('maps terminal authentication issues to reconnection guidance', () => {
    const payload = terminalFailurePayload('Authentication token is required');

    assert.equal(payload.code, 'terminal_auth_required');
    assert.match(payload.advice, /signing in again|shell/i);
  });
});

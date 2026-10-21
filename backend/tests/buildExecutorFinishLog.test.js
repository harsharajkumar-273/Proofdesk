import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildExecutor } from '../src/services/buildExecutor.ts';

describe('buildExecutor finished build log', () => {
  it('attaches the keyword hint to a failed result and keeps the log for the explainer', () => {
    const sessionId = 'aaaaaaaaaaaaaaa1';
    const events = [];
    buildExecutor._initLog(sessionId);
    buildExecutor.subscribeToLogs(sessionId, (event) => events.push(event));
    buildExecutor._appendLog(sessionId, 'source/ch1.xml:4: parser error : Opening and ending tag mismatch', 'stderr');
    assert.equal(buildExecutor.getFinishedBuildLog(sessionId), null);

    buildExecutor._finishLog(sessionId, { success: false, error: 'Build failed' });

    const done = events.find((e) => e.type === 'done');
    assert.equal(done.result.code, 'course_source_invalid');
    assert.match(done.result.advice, /XML/);
    const finished = buildExecutor.getFinishedBuildLog(sessionId);
    assert.match(finished.text, /tag mismatch/);
    assert.equal(finished.result.advice, done.result.advice);
    buildExecutor.buildLogs.delete(sessionId);
  });

  it('leaves successful results and existing advice untouched', () => {
    const sessionId = 'aaaaaaaaaaaaaaa2';
    buildExecutor._initLog(sessionId);
    buildExecutor._finishLog(sessionId, { success: true });
    assert.deepEqual(buildExecutor.getFinishedBuildLog(sessionId).result, { success: true });

    buildExecutor._initLog('aaaaaaaaaaaaaaa3');
    buildExecutor._finishLog('aaaaaaaaaaaaaaa3', { success: false, advice: 'custom', code: 'x' });
    assert.deepEqual(buildExecutor.getFinishedBuildLog('aaaaaaaaaaaaaaa3').result, { success: false, advice: 'custom', code: 'x' });
    buildExecutor.buildLogs.delete(sessionId);
    buildExecutor.buildLogs.delete('aaaaaaaaaaaaaaa3');
  });
});

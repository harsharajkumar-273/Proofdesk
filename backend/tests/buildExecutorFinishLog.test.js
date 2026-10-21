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

describe('buildExecutor rebuild logs', () => {
  it('starts a fresh log for each build so a rebuild never reports the previous result', async () => {
    const sessionId = 'aaaaaaaaaaaaaaa4';
    buildExecutor._initLog(sessionId);
    buildExecutor._appendLog(sessionId, 'first build output');
    buildExecutor._finishLog(sessionId, { success: true });

    await buildExecutor._startLog(sessionId);
    assert.equal(buildExecutor.isBuildLogOpen(sessionId), true);
    assert.equal(buildExecutor.getFinishedBuildLog(sessionId), null);

    // A subscriber that joins mid-rebuild waits for the rebuild instead of
    // being told at once that the first build finished.
    const events = [];
    buildExecutor.subscribeToLogs(sessionId, (event) => events.push(event));
    assert.deepEqual(events, []);

    buildExecutor._appendLog(sessionId, 'source/ch1.xml:3: parser error', 'stderr');
    const result = buildExecutor._finishLog(sessionId, { success: false, error: 'Build failed' });

    assert.equal(result.code, 'course_source_invalid');
    assert.deepEqual(events.map((e) => e.type), ['line', 'done']);
    const finished = buildExecutor.getFinishedBuildLog(sessionId);
    assert.doesNotMatch(finished.text, /first build output/);
    assert.equal(finished.result.success, false);
    buildExecutor.buildLogs.delete(sessionId);
  });

  it('records a foreground rebuild, including one that throws', async () => {
    const sessionId = 'aaaaaaaaaaaaaaa5';
    const originalBuild = buildExecutor.build;
    try {
      buildExecutor.build = async () => ({ success: false, error: 'Build failed', stderr: 'Undefined control sequence' });
      await buildExecutor._startLog(sessionId);
      const result = await buildExecutor._buildAndFinishLog(sessionId);
      assert.equal(result.code, 'latex_source_invalid');
      assert.equal(buildExecutor.getFinishedBuildLog(sessionId).result.code, 'latex_source_invalid');

      buildExecutor.build = async () => { throw Object.assign(new Error('docker died'), { stderr: 'boom' }); };
      await buildExecutor._startLog(sessionId);
      await assert.rejects(() => buildExecutor._buildAndFinishLog(sessionId), /docker died/);
      assert.equal(buildExecutor.getFinishedBuildLog(sessionId).result.error, 'docker died');
    } finally {
      buildExecutor.build = originalBuild;
      buildExecutor.buildLogs.delete(sessionId);
    }
  });
});

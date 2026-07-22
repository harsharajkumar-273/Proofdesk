import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TerminalServer, DEFAULT_IDLE_TIMEOUT_MS, getTerminalIdleTimeoutMs } from '../src/services/terminalServer.js';

describe('Web Terminal Server & Idle Inactivity Timeout', () => {
  it('defaults to 30 minutes idle timeout', () => {
    assert.equal(DEFAULT_IDLE_TIMEOUT_MS, 30 * 60 * 1000);
    assert.equal(getTerminalIdleTimeoutMs(), 30 * 60 * 1000);
  });

  it('triggers idle timeout and terminates inactive session', async () => {
    const server = new TerminalServer({ idleTimeoutMs: 50 });

    let closedReason = '';
    let killed = false;

    const mockWs = {
      readyState: 1, // OPEN
      send: (msg) => {},
      close: (code, reason) => {
        closedReason = reason;
      },
      on: () => {},
    };

    const mockPty = {
      kill: () => {
        killed = true;
      },
    };

    const session = {
      ws: mockWs,
      ptyProcess: mockPty,
      idleTimer: null,
      lastActivityTime: Date.now(),
    };

    server.sessions.set(mockWs, session);
    server.resetIdleTimer(session);

    // Wait for idle timeout (50ms)
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(killed, true);
    assert.equal(closedReason, 'Idle inactivity timeout');
    assert.equal(server.sessions.has(mockWs), false);
  });

  it('resets idle inactivity timer when user sends input message', async () => {
    const server = new TerminalServer({ idleTimeoutMs: 100 });

    let killed = false;
    const mockWs = {
      readyState: 1,
      send: () => {},
      close: () => {},
      on: () => {},
    };

    const mockPty = {
      kill: () => {
        killed = true;
      },
    };

    const session = {
      ws: mockWs,
      ptyProcess: mockPty,
      idleTimer: null,
      lastActivityTime: Date.now(),
    };

    server.sessions.set(mockWs, session);
    server.resetIdleTimer(session);

    // Simulate user input activity at 60ms
    await new Promise((resolve) => setTimeout(resolve, 60));
    server.resetIdleTimer(session);

    // At 110ms total time, timeout should NOT have fired yet because timer was reset at 60ms
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(killed, false);
    assert.equal(server.sessions.has(mockWs), true);

    // Cleanup
    server.closeSession(session, 'test_cleanup');
    assert.equal(killed, true);
  });
});

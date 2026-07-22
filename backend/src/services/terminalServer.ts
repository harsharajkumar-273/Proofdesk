import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import logger from '../utils/logger.js';

export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const getTerminalIdleTimeoutMs = (): number => {
  const envVal = Number(process.env.TERMINAL_IDLE_TIMEOUT_MS);
  if (!isNaN(envVal) && envVal > 0) {
    return envVal;
  }
  return DEFAULT_IDLE_TIMEOUT_MS;
};

export interface TerminalSession {
  ws: WebSocket;
  ptyProcess: any;
  idleTimer: NodeJS.Timeout | null;
  lastActivityTime: number;
}

export class TerminalServer {
  public wss: WebSocketServer;
  public sessions: Map<WebSocket, TerminalSession>;
  public idleTimeoutMs: number;

  constructor(options: { idleTimeoutMs?: number } = {}) {
    this.wss = new WebSocketServer({ noServer: true });
    this.sessions = new Map();
    this.idleTimeoutMs = options.idleTimeoutMs || getTerminalIdleTimeoutMs();

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });
  }

  public handleConnection(ws: WebSocket, req: IncomingMessage): void {
    logger.info(`[Terminal] New terminal WebSocket connection established from ${req.socket.remoteAddress}`);

    let ptyProcess: any = null;

    try {
      // Dynamic import or fallback for node-pty
      const pty = require('node-pty');
      const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : 'bash');
      ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
      });
    } catch (err: any) {
      logger.warn(`[Terminal] node-pty not available or failed to spawn: ${err.message}. Using mock terminal.`);
      ptyProcess = {
        onData: (cb: (data: string) => void) => {
          ws.send('\r\n[Proofdesk Virtual Shell Ready]\r\n$ ');
        },
        write: (data: string) => {
          if (data === '\r' || data === '\n') {
            ws.send('\r\n$ ');
          } else {
            ws.send(data);
          }
        },
        resize: () => {},
        kill: () => {},
      };
    }

    const session: TerminalSession = {
      ws,
      ptyProcess,
      idleTimer: null,
      lastActivityTime: Date.now(),
    };

    this.sessions.set(ws, session);
    this.resetIdleTimer(session);

    if (ptyProcess.onData) {
      ptyProcess.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
    }

    ws.on('message', (message: any) => {
      this.resetIdleTimer(session);

      const str = message.toString();
      try {
        const parsed = JSON.parse(str);
        if (parsed && parsed.type === 'resize' && typeof parsed.cols === 'number' && typeof parsed.rows === 'number') {
          if (typeof ptyProcess.resize === 'function') {
            ptyProcess.resize(parsed.cols, parsed.rows);
          }
          return;
        }
      } catch {
        // Not JSON resize message, treat as raw PTY input
      }

      if (typeof ptyProcess.write === 'function') {
        ptyProcess.write(str);
      }
    });

    const cleanup = () => {
      this.closeSession(session, 'connection_closed');
    };

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  }

  public resetIdleTimer(session: TerminalSession): void {
    session.lastActivityTime = Date.now();

    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
    }

    session.idleTimer = setTimeout(() => {
      this.handleIdleTimeout(session);
    }, this.idleTimeoutMs);
  }

  public handleIdleTimeout(session: TerminalSession): void {
    logger.warn(`[Terminal] Session idle timeout reached (${this.idleTimeoutMs}ms). Terminating PTY process.`);

    if (session.ws.readyState === WebSocket.OPEN) {
      try {
        session.ws.send('\r\n\r\n[Terminal connection closed due to inactivity]\r\n');
        session.ws.close(1000, 'Idle inactivity timeout');
      } catch (e) {
        // Ignore send errors during shutdown
      }
    }

    this.closeSession(session, 'idle_timeout');
  }

  public closeSession(session: TerminalSession, reason: string): void {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }

    if (session.ptyProcess && typeof session.ptyProcess.kill === 'function') {
      try {
        session.ptyProcess.kill();
      } catch (e) {
        // Ignore kill errors
      }
    }

    this.sessions.delete(session.ws);
    logger.info(`[Terminal] Closed session (reason: ${reason})`);
  }

  public closeAll(): void {
    for (const session of this.sessions.values()) {
      this.closeSession(session, 'server_shutdown');
    }
  }
}

let terminalServerInstance: TerminalServer | null = null;

export const attachTerminalServer = (options: { idleTimeoutMs?: number } = {}): TerminalServer => {
  if (!terminalServerInstance) {
    terminalServerInstance = new TerminalServer(options);
  }
  return terminalServerInstance;
};

export default attachTerminalServer;

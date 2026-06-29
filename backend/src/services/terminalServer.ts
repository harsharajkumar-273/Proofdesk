import fs from 'fs';
import os from 'os';
import path from 'path';
import fsPromises from 'fs/promises';
import { spawn } from 'child_process';
import * as pty from 'node-pty';
import { WebSocket, WebSocketServer } from 'ws';
import authSessionStore from './authSessionStore.js';
import buildExecutor from './buildExecutor.js';
import localTestRepoService from './localTestRepoService.js';
import { recordMonitoringEvent } from './monitoringService.js';
import { terminalFailurePayload } from '../utils/buildDiagnostics.js';
import { getProofdeskDataPath } from '../utils/dataPaths.js';
import { websocketActiveConnections } from './metricsService.js';
import { IncomingMessage, Server } from 'http';

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;
const DEFAULT_PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
const TERMINAL_MODE_RESTRICTED = 'restricted';
const TERMINAL_MODE_FULL = 'full';
const TERMINAL_RUNTIME_PROCESS = 'process';
const TERMINAL_RUNTIME_CONTAINER = 'container';

interface TerminalInstance {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number; signal?: string | number }) => void): void;
}

const clampDimension = (value: any, fallback: number, min: number, max: number): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numericValue)));
};

const isValidBuildSessionId = (value: any): boolean =>
  typeof value === 'string' && /^[0-9a-f]{16}$/.test(value);

const parseRepoDetails = (owner: any, repo: any): { owner: string; repo: string } | null => {
  if (!owner || !repo) return null;
  return {
    owner: String(owner).trim(),
    repo: String(repo).trim(),
  };
};

const getPreferredShell = (): string => {
  const candidates = [
    process.env.SHELL,
    '/bin/zsh',
    '/bin/bash',
    '/bin/sh',
    'sh',
  ].filter(Boolean) as string[];
  let fallbackShell = 'sh';

  for (const candidate of candidates) {
    if (!candidate.startsWith('/')) {
      fallbackShell = candidate;
      continue;
    }

    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return fallbackShell;
};

const getTerminalMode = (): string =>
  String(process.env.PROOFDESK_TERMINAL_MODE || TERMINAL_MODE_RESTRICTED).trim().toLowerCase() === TERMINAL_MODE_FULL
    ? TERMINAL_MODE_FULL
    : TERMINAL_MODE_RESTRICTED;

export const getTerminalRuntime = (): string => {
  if (process.env.NODE_ENV === 'production') {
    return TERMINAL_RUNTIME_CONTAINER;
  }
  return String(process.env.PROOFDESK_TERMINAL_RUNTIME || TERMINAL_RUNTIME_PROCESS).trim().toLowerCase() === TERMINAL_RUNTIME_CONTAINER
    ? TERMINAL_RUNTIME_CONTAINER
    : TERMINAL_RUNTIME_PROCESS;
};

const getRestrictedShellSpec = (): { shell: string; args: string[]; restricted: boolean } => {
  if (process.platform === 'win32') {
    return { shell: 'powershell.exe', args: ['-NoLogo'], restricted: false };
  }

  if (fs.existsSync('/bin/rbash')) {
    return { shell: '/bin/rbash', args: ['-i'], restricted: true };
  }

  if (fs.existsSync('/bin/bash')) {
    return {
      shell: '/bin/bash',
      args: ['--noprofile', '--norc', '--restricted', '-i'],
      restricted: true,
    };
  }

  if (fs.existsSync('/bin/zsh')) {
    return { shell: '/bin/zsh', args: ['-f', '-r', '-i'], restricted: true };
  }

  return { shell: getPreferredShell(), args: ['-i'], restricted: false };
};

export const getTerminalShellSpec = (): { shell: string; args: string[]; restricted: boolean } => {
  if (getTerminalMode() === TERMINAL_MODE_FULL) {
    const shell = process.platform === 'win32' ? 'powershell.exe' : getPreferredShell();
    return { shell, args: process.platform === 'win32' ? ['-NoLogo'] : ['-i'], restricted: false };
  }

  return getRestrictedShellSpec();
};

const sanitizeRepoSegment = (value: any): string =>
  String(value || 'workspace')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'workspace';

const ensureTerminalHomeDir = async (sessionId: string | undefined, repoFullName: string | undefined): Promise<string> => {
  const sessionSegment = sanitizeRepoSegment(sessionId || 'session');
  const repoSegment = sanitizeRepoSegment(repoFullName || 'workspace');
  const homeDir = getProofdeskDataPath('terminal-home', sessionSegment, repoSegment);
  await fsPromises.mkdir(homeDir, { recursive: true });
  return homeDir;
};

export const createTerminalEnvironment = ({
  shell,
  homeDir,
  workspace,
}: {
  shell: string;
  homeDir: string;
  workspace: { cwd: string; repoFullName: string; buildSessionId: string | null };
}): Record<string, string> => ({
  HOME: homeDir,
  SHELL: shell,
  PATH: process.env.PATH || DEFAULT_PATH,
  LANG: process.env.LANG || 'en_US.UTF-8',
  LC_ALL: process.env.LC_ALL || '',
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  TERM_PROGRAM: 'proofdesk',
  TMPDIR: process.env.TMPDIR || os.tmpdir(),
  USER: process.env.USER || 'proofdesk',
  LOGNAME: process.env.LOGNAME || process.env.USER || 'proofdesk',
  PWD: workspace.cwd,
  HISTFILE: path.join(homeDir, '.proofdesk_history'),
  GIT_PAGER: 'cat',
  GIT_EDITOR: 'true',
  MRA_REPO_FULL_NAME: workspace.repoFullName || '',
  MRA_BUILD_SESSION_ID: workspace.buildSessionId || '',
});

const createContainerTerminalEnvironment = ({ shell }: { shell: string }): Record<string, string> => ({
  HOME: '/home/proofdesk',
  SHELL: shell,
  PATH: DEFAULT_PATH,
  LANG: process.env.LANG || 'en_US.UTF-8',
  LC_ALL: process.env.LC_ALL || '',
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  TERM_PROGRAM: 'proofdesk',
  USER: 'proofdesk',
  LOGNAME: 'proofdesk',
  PWD: '/workspace',
  HISTFILE: '/home/proofdesk/.proofdesk_history',
  GIT_PAGER: 'cat',
  GIT_EDITOR: 'true',
});

const createSpawnFallbackTerminal = ({
  shell,
  args,
  cwd,
  env,
}: {
  shell: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}): TerminalInstance => {
  const fallbackShell = fs.existsSync('/bin/sh') ? '/bin/sh' : shell;
  const fallbackArgs = fallbackShell === shell ? args : ['-i'];
  const child = spawn(fallbackShell, fallbackArgs, {
    cwd,
    env,
    stdio: 'pipe',
  });
  const dataListeners = new Set<(data: string) => void>();
  const exitListeners = new Set<(event: { exitCode: number; signal?: string }) => void>();

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  const emitData = (chunk: string) => {
    for (const listener of dataListeners) {
      listener(chunk);
    }
  };

  const emitExit = (exitCode: number | null, signal: NodeJS.Signals | null) => {
    for (const listener of exitListeners) {
      listener({ exitCode: exitCode ?? 0, signal: signal || undefined });
    }
  };

  child.stdout.on('data', emitData);
  child.stderr.on('data', emitData);
  child.on('exit', emitExit);

  return {
    write(data: string) {
      child.stdin.write(data);
    },
    resize() {
      // Plain shell fallback does not expose PTY resizing.
    },
    kill(signal = 'SIGTERM') {
      if (signal === 'SIGINT') {
        child.stdin.write('\u0003');
        return;
      }
      child.kill(signal as any);
    },
    onData(listener: (data: string) => void) {
      dataListeners.add(listener);
    },
    onExit(listener: (event: { exitCode: number; signal?: string }) => void) {
      exitListeners.add(listener);
    },
  };
};

export const buildContainerTerminalInvocation = ({
  shell,
  args,
  workspace,
  homeDir,
}: {
  shell: string;
  args: string[];
  workspace: { cwd: string; repoFullName: string; buildSessionId: string | null };
  homeDir: string;
}): { command: string; args: string[] } => {
  const containerEnv = createContainerTerminalEnvironment({ shell });

  return {
    command: 'docker',
    args: [
      'run',
      '--rm',
      '-i',
      '--network',
      'none',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--pids-limit',
      process.env.PROOFDESK_TERMINAL_PIDS || '64',
      '--memory',
      process.env.PROOFDESK_TERMINAL_MEMORY || '512m',
      '-w',
      '/workspace',
      '-v',
      `${workspace.cwd}:/workspace`,
      '-v',
      `${homeDir}:/home/proofdesk`,
      '-e',
      `HOME=${containerEnv.HOME}`,
      '-e',
      `SHELL=${containerEnv.SHELL}`,
      '-e',
      `PATH=${containerEnv.PATH}`,
      '-e',
      `LANG=${containerEnv.LANG}`,
      '-e',
      `LC_ALL=${containerEnv.LC_ALL}`,
      '-e',
      `TERM=${containerEnv.TERM}`,
      '-e',
      `COLORTERM=${containerEnv.COLORTERM}`,
      '-e',
      `TERM_PROGRAM=${containerEnv.TERM_PROGRAM}`,
      '-e',
      `USER=${containerEnv.USER}`,
      '-e',
      `LOGNAME=${containerEnv.LOGNAME}`,
      '-e',
      `PWD=${containerEnv.PWD}`,
      '-e',
      `HISTFILE=${containerEnv.HISTFILE}`,
      '-e',
      `GIT_PAGER=${containerEnv.GIT_PAGER}`,
      '-e',
      `GIT_EDITOR=${containerEnv.GIT_EDITOR}`,
      '-e',
      `MRA_REPO_FULL_NAME=${workspace.repoFullName || ''}`,
      '-e',
      `MRA_BUILD_SESSION_ID=${workspace.buildSessionId || ''}`,
      buildExecutor.image,
      shell,
      ...args,
    ],
  };
};

const createContainerTerminal = async ({
  shell,
  args,
  cwd,
  homeDir,
  workspace,
  cols,
  rows,
}: {
  shell: string;
  args: string[];
  cwd: string;
  homeDir: string;
  workspace: { cwd: string; repoFullName: string; buildSessionId: string | null };
  cols: number;
  rows: number;
}): Promise<TerminalInstance> => {
  await buildExecutor.ensureImageAvailable();
  const invocation = buildContainerTerminalInvocation({
    shell,
    args,
    workspace,
    homeDir,
  });

  try {
    const ptyProcess = pty.spawn(invocation.command, invocation.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        PATH: process.env.PATH || DEFAULT_PATH,
      } as Record<string, string>,
    });

    return {
      write: (data) => ptyProcess.write(data),
      resize: (c, r) => ptyProcess.resize(c, r),
      kill: (sig) => ptyProcess.kill(sig),
      onData: (listener) => ptyProcess.onData(listener),
      onExit: (listener) => ptyProcess.onExit((e) => listener({ exitCode: e.exitCode, signal: e.signal })),
    };
  } catch (ptyError: any) {
    console.warn(`[Terminal] Container PTY unavailable, falling back to docker shell pipes: ${ptyError.message}`);
    return createSpawnFallbackTerminal({
      shell: invocation.command,
      args: invocation.args,
      cwd,
      env: {
        ...process.env,
        PATH: process.env.PATH || DEFAULT_PATH,
      } as Record<string, string>,
    });
  }
};

export const resolveTerminalWorkspace = async ({
  token,
  owner,
  repo,
  buildSessionId,
}: {
  token: string;
  owner?: string | null;
  repo?: string | null;
  buildSessionId?: string | null;
}): Promise<{ cwd: string; buildSessionId: string | null; repoFullName: string }> => {
  if (isValidBuildSessionId(buildSessionId)) {
    const existingSession = buildExecutor.sessions.get(buildSessionId!);
    if (existingSession?.repoPath) {
      return {
        cwd: existingSession.repoPath,
        buildSessionId: buildSessionId!,
        repoFullName: `${existingSession.owner}/${existingSession.repo}`,
      };
    }
  }

  const repoDetails = parseRepoDetails(owner, repo);
  if (repoDetails) {
    if (
      localTestRepoService.isLocalTestToken(token) &&
      localTestRepoService.matchesRepo(repoDetails.owner, repoDetails.repo)
    ) {
      return {
        cwd: localTestRepoService.getRepoPath(),
        buildSessionId: null,
        repoFullName: `${repoDetails.owner}/${repoDetails.repo}`,
      };
    }

    const prepared = await buildExecutor.prepareRepository(
      repoDetails.owner,
      repoDetails.repo,
      token,
      { preferSeed: true }
    );

    return {
      cwd: prepared.repoPath,
      buildSessionId: prepared.sessionId,
      repoFullName: `${repoDetails.owner}/${repoDetails.repo}`,
    };
  }

  if (localTestRepoService.isLocalTestToken(token)) {
    return {
      cwd: localTestRepoService.getRepoPath(),
      buildSessionId: null,
      repoFullName: localTestRepoService.getRepoFullName(),
    };
  }

  throw new Error('Open a repository workspace before starting the terminal.');
};

const sendJson = (connection: WebSocket, payload: any): void => {
  if (connection.readyState !== connection.OPEN) return;
  connection.send(JSON.stringify(payload));
};

export const attachTerminalServer = (server?: Server): WebSocketServer => {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', async (connection: WebSocket, request: IncomingMessage) => {
    websocketActiveConnections.inc({ type: 'terminal' });
    let decDone = false;
    const decrementConn = () => {
      if (!decDone) {
        websocketActiveConnections.dec({ type: 'terminal' });
        decDone = true;
      }
    };
    const requestUrl = new URL(request.url || '', 'http://localhost');
    const owner = requestUrl.searchParams.get('owner') || '';
    const repo = requestUrl.searchParams.get('repo') || '';
    const buildSessionId = requestUrl.searchParams.get('buildSessionId') || '';
    const initialCols = clampDimension(
      requestUrl.searchParams.get('cols'),
      DEFAULT_COLS,
      40,
      240
    );
    const initialRows = clampDimension(
      requestUrl.searchParams.get('rows'),
      DEFAULT_ROWS,
      10,
      80
    );

    const authSession = await authSessionStore.getSessionFromRequest({
      headers: request.headers as Record<string, string>,
    });
    const token =
      authSession?.accessToken ||
      (process.env.NODE_ENV === 'test' ? requestUrl.searchParams.get('token') || '' : '');

    if (!token) {
      sendJson(connection, {
        type: 'error',
        message: 'An authenticated Proofdesk session is required.',
        ...terminalFailurePayload('authenticated session is required'),
      });
      connection.close(1008, 'session required');
      return;
    }

    let terminal: TerminalInstance | null = null;

    try {
      const workspace = await resolveTerminalWorkspace({
        token,
        owner,
        repo,
        buildSessionId,
      });
      const { shell, args, restricted } = getTerminalShellSpec();
      const homeDir = await ensureTerminalHomeDir(authSession?.id, workspace.repoFullName);
      const env = createTerminalEnvironment({ shell, homeDir, workspace });

      let mode = 'pty';
      const terminalRuntime = getTerminalRuntime();
      if (terminalRuntime === TERMINAL_RUNTIME_CONTAINER) {
        terminal = await createContainerTerminal({
          shell,
          args,
          cwd: workspace.cwd,
          homeDir,
          workspace,
          cols: initialCols,
          rows: initialRows,
        });
        mode = 'container';
      } else {
        try {
          const ptyProcess = pty.spawn(shell, args, {
            name: 'xterm-256color',
            cols: initialCols,
            rows: initialRows,
            cwd: workspace.cwd,
            env,
          });

          terminal = {
            write: (data) => ptyProcess.write(data),
            resize: (c, r) => ptyProcess.resize(c, r),
            kill: (sig) => ptyProcess.kill(sig),
            onData: (listener) => ptyProcess.onData(listener),
            onExit: (listener) => ptyProcess.onExit((e) => listener({ exitCode: e.exitCode, signal: e.signal })),
          };
        } catch (ptyError: any) {
          console.warn(`[Terminal] PTY unavailable, falling back to shell pipes: ${ptyError.message}`);
          terminal = createSpawnFallbackTerminal({
            shell,
            args,
            cwd: workspace.cwd,
            env,
          });
          mode = 'shell-fallback';
        }
      }

      sendJson(connection, {
        type: 'ready',
        cwd: workspace.cwd,
        shell: path.basename(shell),
        buildSessionId: workspace.buildSessionId,
        repoFullName: workspace.repoFullName,
        mode,
        restricted,
        runtime: terminalRuntime,
      });

      terminal.onData((data) => {
        sendJson(connection, { type: 'output', data });
      });

      terminal.onExit(({ exitCode, signal }) => {
        if ((exitCode ?? 0) !== 0) {
          void recordMonitoringEvent({
            source: 'backend',
            level: 'warn',
            category: 'terminal_exit_nonzero',
            message: `Terminal exited with code ${exitCode ?? 0}${signal ? ` (${signal})` : ''}.`,
            route: '/terminal/ws',
            method: 'WS',
            userAgent: request.headers['user-agent'] || '',
            metadata: {
              owner,
              repo,
              buildSessionId,
              exitCode: exitCode ?? 0,
              signal: signal || '',
            },
          });
        }

        sendJson(connection, { type: 'exit', exitCode, signal });
        if (connection.readyState === connection.OPEN) {
          connection.close();
        }
      });
    } catch (error: any) {
      console.error('[Terminal] Failed to start terminal:', error.message);
      await recordMonitoringEvent({
        source: 'backend',
        level: 'error',
        category: 'terminal_start_failure',
        message: error.message || 'Failed to start terminal session.',
        route: '/terminal/ws',
        method: 'WS',
        userAgent: request.headers['user-agent'] || '',
        metadata: {
          owner,
          repo,
          buildSessionId,
        },
      });
      const diagnostics = terminalFailurePayload(error.message);
      sendJson(connection, {
        type: 'error',
        message: error.message || 'Failed to start terminal session.',
        ...diagnostics,
      });
      connection.close(1011, 'terminal startup failed');
      return;
    }

    connection.on('message', (rawMessage: any, isBinary: boolean) => {
      if (isBinary || !terminal) return;

      try {
        const message = JSON.parse(rawMessage.toString());

        switch (message.type) {
          case 'input':
            if (typeof message.data === 'string') {
              terminal.write(message.data);
            }
            break;

          case 'resize':
            terminal.resize(
              clampDimension(message.cols, DEFAULT_COLS, 40, 240),
              clampDimension(message.rows, DEFAULT_ROWS, 10, 80)
            );
            break;

          case 'signal':
            if (message.signal === 'SIGINT') {
              terminal.write('\u0003');
            } else {
              terminal.kill(message.signal || 'SIGTERM');
            }
            break;

          default:
            break;
        }
      } catch (error: any) {
        console.error('[Terminal] Message handling error:', error.message);
        void recordMonitoringEvent({
          source: 'backend',
          level: 'warn',
          category: 'terminal_message_error',
          message: error.message || 'Failed to process a terminal websocket message.',
          route: '/terminal/ws',
          method: 'WS',
          userAgent: request.headers['user-agent'] || '',
          metadata: {
            owner,
            repo,
            buildSessionId,
          },
        });
      }
    });

    const closeTerminal = () => {
      decrementConn();
      if (!terminal) return;
      try {
        terminal.kill();
      } catch {
        // Ignore shutdown errors from already-closed terminals.
      }
      terminal = null;
    };

    connection.on('close', closeTerminal);
    connection.on('error', closeTerminal);
  });

  return wss;
};

export const getDefaultTerminalShell = (): string =>
  os.platform() === 'win32' ? 'powershell.exe' : getPreferredShell();

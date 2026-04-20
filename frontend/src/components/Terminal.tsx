import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Play,
  Square,
  Terminal as TerminalIcon,
  Trash2,
  X,
} from 'lucide-react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalRepository {
  owner: string;
  name: string;
  fullName: string;
}

interface TerminalProps {
  apiUrl: string;
  repo: TerminalRepository | null;
  buildSessionId: string | null;
  isOpen: boolean;
  onBuildSessionReady?: (sessionId: string) => void;
  onClose: () => void;
  onToggleMaximize: () => void;
  isMaximized: boolean;
}

type ConnectionState = 'connecting' | 'ready' | 'error' | 'closed';

const statusClassNames: Record<ConnectionState, string> = {
  connecting: 'text-amber-300',
  ready: 'text-emerald-300',
  error: 'text-rose-300',
  closed: 'text-slate-400',
};

const Terminal: React.FC<TerminalProps> = ({
  apiUrl,
  repo,
  buildSessionId,
  isOpen,
  onBuildSessionReady,
  onClose,
  onToggleMaximize,
  isMaximized,
}) => {
  const terminalHostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const activeBuildSessionIdRef = useRef<string | null>(buildSessionId);
  const reconnectTimerRef = useRef<number | null>(null);
  const onBuildSessionReadyRef = useRef(onBuildSessionReady);

  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [statusMessage, setStatusMessage] = useState<string>('Connecting to workspace shell…');
  const [statusAdvice, setStatusAdvice] = useState<string>('');
  const [cwd, setCwd] = useState<string>('');
  const [repoLabel, setRepoLabel] = useState<string>(repo?.fullName || '');

  useEffect(() => {
    activeBuildSessionIdRef.current = buildSessionId;
  }, [buildSessionId]);

  useEffect(() => {
    onBuildSessionReadyRef.current = onBuildSessionReady;
  }, [onBuildSessionReady]);

  useEffect(() => {
    if (!repo?.fullName) return;
    setRepoLabel(repo.fullName);
  }, [repo?.fullName]);

  useEffect(() => {
    if (!isOpen || !terminalHostRef.current) return;

    const terminal = new XTerm({
      cursorBlink: true,
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', Consolas, 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 3000,
      convertEol: true,
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#93c5fd',
        cursorAccent: '#0f172a',
        selectionBackground: '#1d4ed8',
        black: '#0f172a',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e2e8f0',
        brightBlack: '#475569',
        brightRed: '#fca5a5',
        brightGreen: '#6ee7b7',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalHostRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const fitTerminal = () => {
      try {
        fitAddon.fit();
      } catch {
        return;
      }

      const dimensions = fitAddon.proposeDimensions();
      if (
        !dimensions
        || !socketRef.current
        || socketRef.current.readyState !== WebSocket.OPEN
      ) {
        return;
      }

      socketRef.current.send(
        JSON.stringify({
          type: 'resize',
          cols: dimensions.cols,
          rows: dimensions.rows,
        })
      );
    };

    const connectTerminal = () => {
      setConnectionState('connecting');
      setStatusMessage('Connecting to workspace shell…');
      setStatusAdvice('');

      const baseUrl = new URL(apiUrl);
      baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      baseUrl.pathname = '/terminal/ws';

      if (repo?.owner) baseUrl.searchParams.set('owner', repo.owner);
      if (repo?.name) baseUrl.searchParams.set('repo', repo.name);
      if (activeBuildSessionIdRef.current) {
        baseUrl.searchParams.set('buildSessionId', activeBuildSessionIdRef.current);
      }

      const dimensions = fitAddon.proposeDimensions();
      if (dimensions) {
        baseUrl.searchParams.set('cols', String(dimensions.cols));
        baseUrl.searchParams.set('rows', String(dimensions.rows));
      }

      const socket = new WebSocket(baseUrl.toString());
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        terminal.focus();
      });

      socket.addEventListener('message', (event) => {
        if (socketRef.current !== socket) return;

        try {
          const message = JSON.parse(String(event.data));

          if (message.type === 'ready') {
            setConnectionState('ready');
            setStatusMessage('Workspace shell connected');
            setStatusAdvice('');
            setCwd(message.cwd || '');
            setRepoLabel(message.repoFullName || repo?.fullName || '');

            if (message.buildSessionId) {
              activeBuildSessionIdRef.current = message.buildSessionId;
              onBuildSessionReadyRef.current?.(message.buildSessionId);
            }

            terminal.writeln('\x1b[1;36mWorkspace shell ready.\x1b[0m');
            if (message.cwd) {
              terminal.writeln(`\x1b[90m${message.cwd}\x1b[0m`);
            }
            terminal.writeln('');
            fitTerminal();
            return;
          }

          if (message.type === 'output' && typeof message.data === 'string') {
            terminal.write(message.data);
            return;
          }

          if (message.type === 'error') {
            setConnectionState('error');
            setStatusMessage(message.message || 'Terminal connection failed');
            setStatusAdvice(message.advice || '');
            terminal.writeln(`\r\n\x1b[31m${message.message || 'Terminal connection failed'}\x1b[0m`);
            if (message.advice) {
              terminal.writeln(`\x1b[90m${message.advice}\x1b[0m`);
            }
            return;
          }

          if (message.type === 'exit') {
            setConnectionState('closed');
            setStatusMessage('Shell exited');
            terminal.writeln('\r\n\x1b[90mShell exited.\x1b[0m');
          }
        } catch (error) {
          console.error('Terminal message parse error:', error);
        }
      });

      socket.addEventListener('close', () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;

        setConnectionState((currentState) => currentState === 'error' ? currentState : 'closed');
        setStatusMessage((currentMessage) =>
          currentMessage === 'Terminal connection failed'
            ? currentMessage
            : 'Connection closed'
        );
      });

      socket.addEventListener('error', () => {
        if (socketRef.current !== socket) return;
        setConnectionState('error');
        setStatusMessage('Terminal connection failed');
        setStatusAdvice('Retry the terminal or rebuild the repository workspace once before reconnecting.');
        terminal.writeln('\r\n\x1b[31mUnable to connect to the workspace shell.\x1b[0m');
      });
    };

    fitTerminal();
    connectTerminal();

    const dataDisposable = terminal.onData((data) => {
      if (socketRef.current?.readyState !== WebSocket.OPEN) return;
      socketRef.current.send(JSON.stringify({ type: 'input', data }));
    });

    const focusDisposable = terminal.onKey(() => {
      terminal.focus();
    });

    resizeObserverRef.current = new ResizeObserver(() => {
      window.clearTimeout(reconnectTimerRef.current || undefined);
      reconnectTimerRef.current = window.setTimeout(() => {
        fitTerminal();
      }, 30);
    });
    resizeObserverRef.current.observe(terminalHostRef.current);

    const handleWindowResize = () => fitTerminal();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      window.removeEventListener('resize', handleWindowResize);
      dataDisposable.dispose();
      focusDisposable.dispose();
      socketRef.current?.close();
      socketRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [apiUrl, isOpen, repo?.fullName, repo?.name, repo?.owner]);

  useEffect(() => {
    if (!isOpen) return;

    const fitLater = window.setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
      } catch {
        // Ignore fitting issues during layout transitions.
      }
    }, 40);

    return () => window.clearTimeout(fitLater);
  }, [isMaximized, isOpen]);

  const reconnect = () => {
    terminalRef.current?.reset();
    setConnectionState('connecting');
    setStatusMessage('Reconnecting to workspace shell…');
    setStatusAdvice('');
    socketRef.current?.close();
    window.setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
      } catch {
        // Ignore layout timing issues while reconnecting.
      }

      const baseUrl = new URL(apiUrl);
      baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      baseUrl.pathname = '/terminal/ws';
      if (repo?.owner) baseUrl.searchParams.set('owner', repo.owner);
      if (repo?.name) baseUrl.searchParams.set('repo', repo.name);
      if (activeBuildSessionIdRef.current) {
        baseUrl.searchParams.set('buildSessionId', activeBuildSessionIdRef.current);
      }

      const dimensions = fitAddonRef.current?.proposeDimensions();
      if (dimensions) {
        baseUrl.searchParams.set('cols', String(dimensions.cols));
        baseUrl.searchParams.set('rows', String(dimensions.rows));
      }

      const socket = new WebSocket(baseUrl.toString());
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        terminalRef.current?.focus();
      });

      socket.addEventListener('message', (event) => {
        if (socketRef.current !== socket) return;

        try {
          const message = JSON.parse(String(event.data));
          if (message.type === 'ready') {
            setConnectionState('ready');
            setStatusMessage('Workspace shell connected');
            setCwd(message.cwd || '');
            setRepoLabel(message.repoFullName || repo?.fullName || '');
            if (message.buildSessionId) {
              activeBuildSessionIdRef.current = message.buildSessionId;
              onBuildSessionReadyRef.current?.(message.buildSessionId);
            }
            terminalRef.current?.writeln('\x1b[1;36mWorkspace shell ready.\x1b[0m');
            terminalRef.current?.writeln('');
            return;
          }
          if (message.type === 'output' && typeof message.data === 'string') {
            terminalRef.current?.write(message.data);
            return;
          }
          if (message.type === 'error') {
            setConnectionState('error');
            setStatusMessage(message.message || 'Terminal connection failed');
            terminalRef.current?.writeln(`\r\n\x1b[31m${message.message || 'Terminal connection failed'}\x1b[0m`);
            return;
          }
          if (message.type === 'exit') {
            setConnectionState('closed');
            setStatusMessage('Shell exited');
            terminalRef.current?.writeln('\r\n\x1b[90mShell exited.\x1b[0m');
          }
        } catch (error) {
          console.error('Terminal message parse error:', error);
        }
      });

      socket.addEventListener('close', () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        setConnectionState((currentState) => currentState === 'error' ? currentState : 'closed');
      });

      socket.addEventListener('error', () => {
        if (socketRef.current !== socket) return;
        setConnectionState('error');
        setStatusMessage('Terminal connection failed');
        terminalRef.current?.writeln('\r\n\x1b[31mUnable to connect to the workspace shell.\x1b[0m');
      });
    }, 30);
  };

  const interruptProcess = () => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: 'signal', signal: 'SIGINT' }));
  };

  const clearTerminal = () => {
    terminalRef.current?.clear();
  };

  if (!isOpen) return null;

  return (
    <div
      className={`flex flex-col border-t border-slate-700 bg-slate-950 ${
        isMaximized ? 'fixed inset-0 z-50' : 'h-full'
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-4 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TerminalIcon className="h-4 w-4 text-slate-300" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
              Integrated Terminal
            </span>
            <span className={`text-xs ${statusClassNames[connectionState]}`}>
              {statusMessage}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            {repoLabel && <span>{repoLabel}</span>}
            {cwd && <span className="truncate">{cwd}</span>}
            {statusAdvice && <span className="text-amber-300">{statusAdvice}</span>}
          </div>
        </div>

        <div className="ml-4 flex items-center gap-1">
          <button
            onClick={reconnect}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Reconnect terminal"
          >
            <Play className="h-3 w-3" />
          </button>
          <button
            onClick={interruptProcess}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Send Ctrl+C"
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            onClick={clearTerminal}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Clear terminal"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button
            onClick={onToggleMaximize}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            title={isMaximized ? 'Restore terminal' : 'Maximize terminal'}
          >
            {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Close terminal"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-slate-950 px-2 py-2">
        <div
          ref={terminalHostRef}
          className="h-full w-full rounded-md border border-slate-800 bg-slate-950 px-2 py-2"
          data-testid="integrated-terminal"
        />
      </div>
    </div>
  );
};

export default Terminal;

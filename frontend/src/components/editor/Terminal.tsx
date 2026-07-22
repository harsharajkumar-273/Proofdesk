import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Terminal as TerminalIcon, X, Trash2, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';

interface TerminalProps {
  onClose?: () => void;
}

export const Terminal: React.FC<TerminalProps> = ({ onClose }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      theme: {
        background: '#090d16',
        foreground: '#f3f4f6',
        cursor: '#818cf8',
        selectionBackground: '#3730a3',
        black: '#1f2937',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#8b5cf6',
        cyan: '#06b6d4',
        white: '#f9fafb',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const wsUrl = backendUrl.replace(/^http/, 'ws') + '/terminal/ws';

    const connectWebSocket = () => {
      setStatus('connecting');
      term.write('\r\n\x1b[33mConnecting to Web Terminal backend...\x1b[0m\r\n');

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus('connected');
          term.write('\r\n\x1b[32m[Terminal Session Connected]\x1b[0m\r\n');
        };

        ws.onmessage = (event) => {
          term.write(event.data);
        };

        ws.onclose = () => {
          setStatus('disconnected');
          term.write('\r\n\x1b[31m[Terminal Session Disconnected]\x1b[0m\r\n');
        };

        ws.onerror = () => {
          setStatus('disconnected');
          term.write('\r\n\x1b[31m[Terminal Connection Error]\x1b[0m\r\n');
        };
      } catch (err: unknown) {
        setStatus('disconnected');
        const msg = err instanceof Error ? err.message : String(err);
        term.write(`\r\n\x1b[31m[Failed to connect: ${msg}]\x1b[0m\r\n`);
      }
    };

    connectWebSocket();

    const dataListener = term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    const resizeListener = term.onResize(({ cols, rows }) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    const handleWindowResize = () => {
      try {
        fitAddon.fit();
      } catch { /* ignore */ }
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      dataListener.dispose();
      resizeListener.dispose();
      if (wsRef.current) {
        wsRef.current.close();
      }
      term.dispose();
    };
  }, []);

  const handleClear = () => {
    xtermRef.current?.clear();
  };

  const handleReconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    xtermRef.current?.clear();
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const wsUrl = backendUrl.replace(/^http/, 'ws') + '/terminal/ws';

    setStatus('connecting');
    xtermRef.current?.write('\r\n\x1b[33mReconnecting...\x1b[0m\r\n');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        xtermRef.current?.write('\r\n\x1b[32m[Reconnected]\x1b[0m\r\n');
      };

      ws.onmessage = (event) => {
        xtermRef.current?.write(event.data);
      };

      ws.onclose = () => {
        setStatus('disconnected');
        xtermRef.current?.write('\r\n\x1b[31m[Disconnected]\x1b[0m\r\n');
      };
    } catch { /* ignore */ }
  };

  return (
    <div
      className={`flex flex-col bg-[#090d16] border-t border-zinc-800 transition-all duration-200 z-40 ${
        isExpanded ? 'h-96' : 'h-64'
      }`}
    >
      {/* Header */}
      <div className="h-9 px-4 bg-[#0d1321] border-b border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-300 select-none">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-indigo-400" />
          <span className="font-bold tracking-wider uppercase text-[11px] text-zinc-200">Terminal</span>
          <span
            className={`w-2 h-2 rounded-full ${
              status === 'connected'
                ? 'bg-emerald-500'
                : status === 'connecting'
                ? 'bg-amber-500 animate-pulse'
                : 'bg-rose-500'
            }`}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleClear}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Clear Terminal"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleReconnect}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Reconnect Terminal"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setIsExpanded(!isExpanded);
              setTimeout(() => fitAddonRef.current?.fit(), 210);
            }}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
            title={isExpanded ? 'Collapse Terminal' : 'Expand Terminal'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-rose-950/50 hover:text-rose-400 rounded text-zinc-400 transition-colors"
              title="Close Terminal"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal Viewport */}
      <div ref={terminalRef} className="flex-1 p-2 overflow-hidden" />
    </div>
  );
};

export default Terminal;

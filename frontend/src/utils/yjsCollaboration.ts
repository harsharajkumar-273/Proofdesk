import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import type { editor } from 'monaco-editor';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';

const MESSAGE_DOC_UPDATE = 0;
const MESSAGE_AWARENESS_UPDATE = 1;

export interface YjsCollaborationUser {
  clientId: string;
  login?: string;
  name?: string;
  avatarUrl?: string;
  color: string;
}

export interface YjsParticipant extends YjsCollaborationUser {
  isSelf?: boolean;
}

interface AwarenessUserState {
  user?: Partial<YjsCollaborationUser>;
}

interface CollaborationSessionOptions {
  serverUrl: string;
  roomId: string;
  editor: editor.IStandaloneCodeEditor;
  model: editor.ITextModel;
  initialContent: string;
  user: YjsCollaborationUser;
  onStatus?: (status: string) => void;
  onParticipantsChange?: (participants: YjsParticipant[]) => void;
  onRemoteContent?: (content: string) => void;
}

const toWebSocketUrl = (serverUrl: string) => {
  const normalized = new URL(serverUrl);
  normalized.protocol = normalized.protocol === 'https:' ? 'wss:' : 'ws:';
  normalized.pathname = '/collab/ws';
  normalized.search = '';
  normalized.hash = '';
  return normalized.toString();
};

const encodeMessage = (type: number, payload: Uint8Array) => {
  const output = new Uint8Array(payload.length + 1);
  output[0] = type;
  output.set(payload, 1);
  return output;
};

const decodeParticipants = (awareness: Awareness, selfClientId: string): YjsParticipant[] =>
  [...(awareness.getStates() as Map<number, AwarenessUserState>).entries()]
    .map(([clientId, state]) => {
      const user = state?.user || {};
      return {
        clientId: user.clientId || String(clientId),
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
        color: user.color || '#60a5fa',
        isSelf: user.clientId === selfClientId,
      };
    })
    .sort((left, right) => {
      if (left.isSelf) return -1;
      if (right.isSelf) return 1;
      return (left.name || left.login || '').localeCompare(right.name || right.login || '');
    });

export class MonacoYjsCollaborationSession {
  private readonly doc: Y.Doc;
  private readonly text: Y.Text;
  private readonly awareness: Awareness;
  private readonly wsUrl: string;
  private readonly roomId: string;
  private readonly initialContent: string;
  private readonly user: YjsCollaborationUser;
  private readonly editor: editor.IStandaloneCodeEditor;
  private readonly model: editor.ITextModel;
  private readonly onStatus?: (status: string) => void;
  private readonly onParticipantsChange?: (participants: YjsParticipant[]) => void;
  private readonly onRemoteContent?: (content: string) => void;
  private ws: WebSocket | null = null;
  private binding: MonacoBinding | null = null;
  private reconnectTimer: number | null = null;
  private destroyed = false;
  private hasReceivedInitialState = false;

  constructor(options: CollaborationSessionOptions) {
    this.wsUrl = toWebSocketUrl(options.serverUrl);
    this.roomId = options.roomId;
    this.initialContent = options.initialContent;
    this.user = options.user;
    this.editor = options.editor;
    this.model = options.model;
    this.onStatus = options.onStatus;
    this.onParticipantsChange = options.onParticipantsChange;
    this.onRemoteContent = options.onRemoteContent;

    this.doc = new Y.Doc();
    this.text = this.doc.getText('monaco');
    this.awareness = new Awareness(this.doc);

    this.awareness.setLocalStateField('user', this.user);
    this.awareness.on('change', this.handleAwarenessChange);
    this.doc.on('update', this.handleLocalDocUpdate);
  }

  connect() {
    this.destroyed = false;
    this.hasReceivedInitialState = false;
    this.connectSocket();
  }

  disconnect() {
    this.destroyed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.awareness.setLocalState(null);
    this.destroyBinding();
    this.ws?.close();
    this.ws = null;
    this.publishParticipants();
  }

  destroy() {
    this.disconnect();
    this.awareness.off('change', this.handleAwarenessChange);
    this.doc.off('update', this.handleLocalDocUpdate);
    this.awareness.destroy();
    this.doc.destroy();
  }

  private connectSocket() {
    const socketUrl = new URL(this.wsUrl);
    socketUrl.searchParams.set('roomId', this.roomId);
    const ws = new WebSocket(socketUrl.toString());
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    this.onStatus?.('Connecting team room…');

    ws.onopen = () => {
      if (this.destroyed) return;
      this.onStatus?.('Connecting team room…');
      ws.send(JSON.stringify({
        type: 'join',
        roomId: this.roomId,
        initialContent: this.initialContent,
      }));
      this.sendAwarenessUpdate();
    };

    ws.onmessage = (event) => {
      if (this.destroyed) return;
      if (typeof event.data === 'string') return;

      const bytes = new Uint8Array(event.data as ArrayBuffer);
      const messageType = bytes[0];
      const payload = bytes.subarray(1);

      if (messageType === MESSAGE_DOC_UPDATE) {
        Y.applyUpdate(this.doc, payload, this);
        if (!this.hasReceivedInitialState) {
          this.hasReceivedInitialState = true;
          this.ensureBinding();
          this.onStatus?.('Team room ready');
        }
        return;
      }

      if (messageType === MESSAGE_AWARENESS_UPDATE) {
        this.awareness.setLocalStateField('user', this.user);
        applyAwarenessUpdate(this.awareness, payload, this);
        if (!this.hasReceivedInitialState) {
          this.ensureBinding();
        }
      }
    };

    ws.onclose = () => {
      if (this.destroyed) return;
      this.onStatus?.('Reconnecting team room…');
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      if (this.destroyed) return;
      this.onStatus?.('Team room unavailable');
    };
  }

  private ensureBinding() {
    if (this.binding) return;

    this.binding = new MonacoBinding(
      this.text,
      this.model,
      new Set([this.editor]),
      this.awareness
    );
    this.publishParticipants();
  }

  private destroyBinding() {
    if (!this.binding) return;
    this.binding.destroy();
    this.binding = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connectSocket();
    }, 1500);
  }

  private sendAwarenessUpdate() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const localClientId = this.doc.clientID;
    const awarenessUpdate = encodeAwarenessUpdate(this.awareness, [localClientId]);
    this.ws.send(encodeMessage(MESSAGE_AWARENESS_UPDATE, awarenessUpdate));
  }

  private handleLocalDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) {
      this.onRemoteContent?.(this.text.toString());
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(encodeMessage(MESSAGE_DOC_UPDATE, update));
  };

  private handleAwarenessChange = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    this.publishParticipants();

    if (origin === this) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const changedClients = added.concat(updated, removed);
    if (changedClients.length === 0) return;

    const awarenessUpdate = encodeAwarenessUpdate(this.awareness, changedClients);
    this.ws.send(encodeMessage(MESSAGE_AWARENESS_UPDATE, awarenessUpdate));
  };

  private publishParticipants() {
    this.onParticipantsChange?.(decodeParticipants(this.awareness, this.user.clientId));
  }
}

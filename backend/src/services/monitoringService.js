import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { getProofdeskDataPath } from '../utils/dataPaths.js';

const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const SENSITIVE_KEY_PATTERN = /(token|authorization|cookie|secret|password|client[_-]?secret)/i;
const MAX_DEPTH = 4;
const MAX_KEYS = 24;
const MAX_ARRAY_ITEMS = 24;
const MAX_STRING_LENGTH = 1600;
const DEFAULT_EVENT_LIMIT = 50;

const trimString = (value, maxLength = MAX_STRING_LENGTH) => {
  const normalized = String(value ?? '');
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}…`
    : normalized;
};

const sanitizeValue = (value, depth = 0) => {
  if (depth > MAX_DEPTH) {
    return '[truncated]';
  }

  if (value == null) {
    return value;
  }

  if (typeof value === 'string') {
    return trimString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).slice(0, MAX_KEYS);
    return Object.fromEntries(entries.map(([key, entryValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, '[redacted]'];
      }

      return [key, sanitizeValue(entryValue, depth + 1)];
    }));
  }

  return trimString(value);
};

const getMonitoringEventsPath = () => getProofdeskDataPath('monitoring', 'events.jsonl');

const maybePostWebhook = async (payload, env = process.env) => {
  const webhookUrl = String(env.PROOFDESK_MONITORING_WEBHOOK_URL || '').trim();
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('[Monitoring] Failed to POST webhook event:', error.message);
  }
};

export const isMonitoringEnabled = (env = process.env) =>
  !FALSE_VALUES.has(String(env.PROOFDESK_MONITORING_ENABLED ?? 'true').trim().toLowerCase());

export const getMonitoringContextFromRequest = (req) => ({
  requestId: req?.requestId || '',
  route: req?.originalUrl || req?.url || '',
  method: req?.method || '',
  userAgent: req?.get?.('user-agent') || req?.headers?.['user-agent'] || '',
});

export const recordMonitoringEvent = async (event = {}, env = process.env) => {
  if (!isMonitoringEnabled(env)) {
    return null;
  }

  try {
    const payload = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      source: trimString(event.source || 'backend', 64),
      level: trimString(event.level || 'error', 32),
      category: trimString(event.category || 'application_error', 128),
      message: trimString(event.message || 'Unknown application event'),
      requestId: trimString(event.requestId || '', 128),
      route: trimString(event.route || '', 512),
      method: trimString(event.method || '', 32),
      userAgent: trimString(event.userAgent || '', 512),
      metadata: sanitizeValue(event.metadata ?? null),
    };

    const eventsPath = getMonitoringEventsPath();
    await fs.mkdir(path.dirname(eventsPath), { recursive: true });
    await fs.appendFile(eventsPath, `${JSON.stringify(payload)}\n`, 'utf8');
    void maybePostWebhook(payload, env);
    return payload;
  } catch (error) {
    console.error('[Monitoring] Failed to persist monitoring event:', error.message);
    return null;
  }
};

export const readRecentMonitoringEvents = async (options = {}, env = process.env) => {
  if (!isMonitoringEnabled(env)) {
    return [];
  }

  const requestedLimit = Number(options.limit || DEFAULT_EVENT_LIMIT);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 200)
    : DEFAULT_EVENT_LIMIT;

  try {
    const raw = await fs.readFile(getMonitoringEventsPath(), 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(-limit)
      .reverse();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    console.error('[Monitoring] Failed to read monitoring events:', error.message);
    return [];
  }
};

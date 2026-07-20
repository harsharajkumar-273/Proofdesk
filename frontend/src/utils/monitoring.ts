const API_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000').replace(/\/+$/, '');

type MonitoringPayload = {
  category: string;
  message: string;
  stack?: string;
  componentStack?: string;
  metadata?: Record<string, unknown>;
};

declare global {
  interface Window {
    __proofdeskMonitoringInstalled__?: boolean;
  }
}

const postMonitoringEvent = (payload: Record<string, unknown>) => {
  const body = JSON.stringify(payload);
  const endpoint = `${API_URL}/monitoring/client-error`;

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon(endpoint, blob);
    return;
  }

  void fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    keepalive: true,
    body,
  }).catch(() => {});
};

export const reportClientMonitoringEvent = ({
  category,
  message,
  stack = '',
  componentStack = '',
  metadata = {},
}: MonitoringPayload) => {
  if (typeof window === 'undefined') {
    return;
  }

  postMonitoringEvent({
    source: 'frontend',
    category,
    message,
    stack,
    componentStack,
    pathname: window.location.pathname,
    href: window.location.href,
    metadata: {
      userAgent: window.navigator.userAgent,
      ...metadata,
    },
  });
};

export const installGlobalMonitoringHandlers = () => {
  if (typeof window === 'undefined' || window.__proofdeskMonitoringInstalled__) {
    return;
  }

  window.__proofdeskMonitoringInstalled__ = true;

  window.addEventListener('error', (event) => {
    reportClientMonitoringEvent({
      category: 'frontend_window_error',
      message: event.message || 'Unhandled frontend window error',
      stack: event.error?.stack || '',
      metadata: {
        filename: event.filename || '',
        lineno: event.lineno || 0,
        colno: event.colno || 0,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : 'Unhandled frontend promise rejection';

    reportClientMonitoringEvent({
      category: 'frontend_unhandled_rejection',
      message,
      stack: reason instanceof Error ? reason.stack || '' : '',
      metadata: {
        reason: typeof reason === 'string' ? reason : undefined,
      },
    });
  });
};

import pino from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

// AsyncLocalStorage to maintain the request context (like requestId)
export const requestContainer = new AsyncLocalStorage<{ requestId: string }>();

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const logger = {
  info(message: string, context?: object): void {
    const store = requestContainer.getStore();
    const payload = store ? { requestId: store.requestId, ...context } : context;
    if (payload) {
      pinoLogger.info(payload, message);
    } else {
      pinoLogger.info(message);
    }
  },
  error(message: string, errorOrContext?: any): void {
    const store = requestContainer.getStore();
    let contextPayload: any = {};

    if (errorOrContext instanceof Error) {
      contextPayload.err = {
        message: errorOrContext.message,
        stack: errorOrContext.stack,
      };
    } else if (errorOrContext && typeof errorOrContext === 'object') {
      contextPayload = { ...errorOrContext };
      if (errorOrContext.err instanceof Error) {
        contextPayload.err = {
          message: errorOrContext.err.message,
          stack: errorOrContext.err.stack,
        };
      }
    }

    const payload = store ? { requestId: store.requestId, ...contextPayload } : contextPayload;
    if (Object.keys(payload).length > 0) {
      pinoLogger.error(payload, message);
    } else {
      pinoLogger.error(message);
    }
  },
  warn(message: string, context?: object): void {
    const store = requestContainer.getStore();
    const payload = store ? { requestId: store.requestId, ...context } : context;
    if (payload) {
      pinoLogger.warn(payload, message);
    } else {
      pinoLogger.warn(message);
    }
  },
  debug(message: string, context?: object): void {
    const store = requestContainer.getStore();
    const payload = store ? { requestId: store.requestId, ...context } : context;
    if (payload) {
      pinoLogger.debug(payload, message);
    } else {
      pinoLogger.debug(message);
    }
  },
};

export default logger;

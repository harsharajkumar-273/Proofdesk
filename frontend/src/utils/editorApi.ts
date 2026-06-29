export class EditorApiError extends Error {
  status: number;
  code?: string;
  advice?: string;
  details?: string;

  constructor(message: string, options: { status?: number; code?: string; advice?: string; details?: string } = {}) {
    super(message);
    this.name = 'EditorApiError';
    this.status = options.status ?? 500;
    this.code = options.code;
    this.advice = options.advice;
    this.details = options.details;
  }
}

const readJsonSafely = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

const generateRandomHex = (length: number): string => {
  let result = '';
  const characters = '0123456789abcdef';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

const generateTraceParent = (): string => {
  const traceId = generateRandomHex(32);
  const spanId = generateRandomHex(16);
  return `00-${traceId}-${spanId}-01`;
};

export const requestJson = async <T>(input: RequestInfo | URL, init: RequestInit = {}, fallbackMessage = 'Request failed') => {
  const headersInit = init.headers || {};
  let traceparentExists = false;

  if (headersInit instanceof Headers) {
    traceparentExists = headersInit.has('traceparent');
  } else if (Array.isArray(headersInit)) {
    traceparentExists = headersInit.some(([k]) => k.toLowerCase() === 'traceparent');
  } else {
    traceparentExists = Object.keys(headersInit).some(k => k.toLowerCase() === 'traceparent');
  }

  let finalHeaders: HeadersInit = headersInit;
  if (!traceparentExists) {
    const traceparent = generateTraceParent();
    if (headersInit instanceof Headers) {
      finalHeaders = new Headers(headersInit);
      (finalHeaders as Headers).set('traceparent', traceparent);
    } else if (Array.isArray(headersInit)) {
      finalHeaders = [...headersInit, ['traceparent', traceparent]];
    } else {
      finalHeaders = {
        ...headersInit,
        'traceparent': traceparent,
      };
    }
  }

  const response = await fetch(input, {
    ...init,
    headers: finalHeaders,
  });
  const data = await readJsonSafely(response);

  if (!response.ok) {
    const message = data?.error || data?.message || fallbackMessage;
    throw new EditorApiError(message, {
      status: response.status,
      code: data?.code,
      advice: data?.advice,
      details: data?.details,
    });
  }

  return (data ?? {}) as T;
};

export const isAuthExpiredError = (error: unknown) =>
  error instanceof EditorApiError && error.status === 401;

export const formatEditorError = (error: unknown, fallbackMessage: string) => {
  if (error instanceof EditorApiError) {
    return {
      title: error.message || fallbackMessage,
      advice: error.advice || '',
      details: error.details || '',
    };
  }

  if (error instanceof Error) {
    return {
      title: error.message || fallbackMessage,
      advice: '',
      details: '',
    };
  }

  return {
    title: fallbackMessage,
    advice: '',
    details: '',
  };
};

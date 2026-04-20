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

export const requestJson = async <T>(input: RequestInfo | URL, init: RequestInit = {}, fallbackMessage = 'Request failed') => {
  const response = await fetch(input, init);
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

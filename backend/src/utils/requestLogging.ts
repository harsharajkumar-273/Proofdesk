export const isSensitiveBodyRoute = (reqPath: string = ''): boolean => (
  reqPath.startsWith('/build/')
  || reqPath.startsWith('/collab/')
  || reqPath.includes('/contents/')
  || reqPath === '/team-sessions/create'
);

export const summarizeBodyForLogs = (body: any): string => {
  if (!body || typeof body !== 'object') return '';

  const summary: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (['content', 'token', 'accessToken', 'code'].includes(key)) {
      if (typeof value === 'string') {
        summary[key] = `[redacted:${value.length}]`;
      } else {
        summary[key] = '[redacted]';
      }
      continue;
    }

    if (typeof value === 'string') {
      summary[key] = value.length > 80 ? `[string:${value.length}]` : value;
    } else if (Array.isArray(value)) {
      summary[key] = `[array:${value.length}]`;
    } else if (value && typeof value === 'object') {
      summary[key] = `[object:${Object.keys(value).length}]`;
    } else {
      summary[key] = value;
    }
  }

  return JSON.stringify(summary).substring(0, 200);
};

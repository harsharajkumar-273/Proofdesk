import { Request, Response, NextFunction } from 'express';
import { startTraceSpan } from '../otel.js';
import { SpanStatusCode } from '@opentelemetry/api';

export const tracingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const traceParent = (req.headers['traceparent'] || req.headers['x-traceparent']) as string | undefined;
  
  const spanName = `http:${req.method}:${req.path}`;
  const span = startTraceSpan(spanName, traceParent);

  // Store in res.locals so route controller or compiler services can access it
  res.locals.span = span;
  res.locals.traceParent = traceParent || `00-${span.spanContext().traceId}-${span.spanContext().spanId}-01`;

  res.on('finish', () => {
    if (res.statusCode >= 400) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${res.statusCode}`
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }
    span.end();
  });

  next();
};

export default tracingMiddleware;

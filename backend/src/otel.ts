import { trace, context, Span, SpanStatusCode } from '@opentelemetry/api';
import logger from './utils/logger.js';

const TRACER_NAME = 'proofdesk-core';

export const getTracer = () => {
  return trace.getTracer(TRACER_NAME);
};

const generateRandomHex = (length: number): string => {
  let result = '';
  const characters = '0123456789abcdef';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

export const generateTraceParent = (traceId?: string, spanId?: string): string => {
  const tId = traceId || generateRandomHex(32);
  const sId = spanId || generateRandomHex(16);
  return `00-${tId}-${sId}-01`;
};

/**
 * Starts a trace span, optionally under a W3C traceparent parent context
 */
export const startTraceSpan = (name: string, parentTraceParent?: string | null): Span => {
  const tracer = getTracer();
  let span: Span;

  if (parentTraceParent) {
    const parts = parentTraceParent.split('-');
    if (parts.length === 4) {
      const traceId = parts[1];
      const parentSpanId = parts[2];
      
      const spanContext = {
        traceId,
        spanId: parentSpanId,
        traceFlags: 1,
        isRemote: true
      };
      
      const ctx = trace.setSpanContext(context.active(), spanContext);
      span = tracer.startSpan(name, {}, ctx);
    } else {
      span = tracer.startSpan(name);
    }
  } else {
    span = tracer.startSpan(name);
  }

  const sc = span.spanContext();
  logger.info(`[OTel:SpanStart] name="${name}" traceId="${sc.traceId}" spanId="${sc.spanId}"`);
  return span;
};

/**
 * Traces an asynchronous function and registers execution timings and errors.
 */
export const traceAsync = async <T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  parentTraceParent?: string | null
): Promise<T> => {
  const startTime = Date.now();
  const span = startTraceSpan(name, parentTraceParent);
  try {
    const result = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    const duration = Date.now() - startTime;
    logger.info(`[OTel:SpanEnd] name="${name}" status="OK" duration=${duration}ms traceId="${span.spanContext().traceId}"`);
    return result;
  } catch (error: any) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    const duration = Date.now() - startTime;
    logger.error(`[OTel:SpanEnd] name="${name}" status="ERROR" duration=${duration}ms traceId="${span.spanContext().traceId}" error="${error.message}"`);
    throw error;
  } finally {
    span.end();
  }
};

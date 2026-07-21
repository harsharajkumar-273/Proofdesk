import { Request, Response, NextFunction } from 'express';

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

export const createRateLimiter = (options: RateLimitOptions = {}) => {
  const windowMs = options.windowMs || Number(process.env.IMPORT_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 mins default
  const max = options.max || Number(process.env.IMPORT_RATE_LIMIT_MAX) || 10; // 10 requests default
  const message = options.message || 'Too many import requests, please try again later.';
  
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'test' && process.env.DISABLE_RATE_LIMIT === 'true') {
      next();
      return;
    }

    const key = options.keyGenerator
      ? options.keyGenerator(req)
      : (req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown-ip');

    const now = Date.now();
    const record = requests.get(key);

    if (!record || now > record.resetTime) {
      requests.set(key, { count: 1, resetTime: now + windowMs });
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', max - 1);
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));
      next();
      return;
    }

    if (record.count >= max) {
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
      res.status(429).json({
        success: false,
        error: 'Too Many Requests',
        details: message,
      });
      return;
    }

    record.count += 1;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', max - record.count);
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
    next();
  };
};

export const importRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many import requests from this IP. Please try again after 15 minutes.',
});

export default importRateLimiter;

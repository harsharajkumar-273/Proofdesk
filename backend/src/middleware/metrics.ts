import { Request, Response, NextFunction } from 'express';
import { httpRequestDurationSeconds } from '../services/metricsService.js';

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationSeconds = diff[0] + diff[1] / 1e9;

    let route = req.baseUrl;
    if (req.route) {
      route += req.route.path;
    } else {
      route = req.path;
    }

    // Exclude /metrics from latency tracking to avoid polling noise
    if (route === '/metrics') {
      return;
    }

    httpRequestDurationSeconds.observe(
      {
        method: req.method,
        route: route || 'unknown',
        status_code: res.statusCode.toString(),
      },
      durationSeconds
    );
  });

  next();
};

export default metricsMiddleware;

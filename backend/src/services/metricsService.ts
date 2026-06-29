import client from 'prom-client';

// Create a Registry to register metrics
export const register = new client.Registry();

// Add default metrics (CPU, Memory, etc.)
client.collectDefaultMetrics({ register });

// 1. http_request_duration_seconds: API latency histograms
export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});
register.registerMetric(httpRequestDurationSeconds);

// 2. docker_build_duration_seconds: Build speed distribution
export const dockerBuildDurationSeconds = new client.Histogram({
  name: 'docker_build_duration_seconds',
  help: 'Duration of Docker builds in seconds',
  labelNames: ['owner', 'repo', 'status'],
  buckets: [5, 15, 30, 60, 120, 300, 600],
});
register.registerMetric(dockerBuildDurationSeconds);

// 3. websocket_active_connections: Real-time active collaboration counts
export const websocketActiveConnections = new client.Gauge({
  name: 'websocket_active_connections',
  help: 'Number of active WebSocket connections',
  labelNames: ['type'],
});
register.registerMetric(websocketActiveConnections);

// 4. active_build_jobs: Count of current concurrent compilation runners
export const activeBuildJobs = new client.Gauge({
  name: 'active_build_jobs',
  help: 'Number of currently active build jobs running concurrently',
});
register.registerMetric(activeBuildJobs);

export default {
  register,
  httpRequestDurationSeconds,
  dockerBuildDurationSeconds,
  websocketActiveConnections,
  activeBuildJobs,
};

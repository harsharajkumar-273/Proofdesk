const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

// True while the process is running a test suite or serving the local demo
// repository, neither of which should be throttled.
//
// Limiters bucket by access token or client IP. A test suite runs every case
// against the same token from the same address, so after a handful of cases it
// would receive 429 regardless of what it is asserting — the limiter would be
// measuring the suite, not a caller worth restricting.
export const rateLimitingDisabled = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  TRUE_VALUES.has(String(process.env.ENABLE_LOCAL_TEST_MODE || '').trim().toLowerCase());

// In-memory sliding-window limiter. Returns a function that records a call for
// `key` and reports whether it is within `maxRequests` per `windowMs`.
//
// `capsSpending` marks a limiter that guards paid API usage. Local test mode
// can be left on in a demo deployment, so such a limiter stays enforced there
// and is only lifted for the test suite itself.
export const createRateLimiter = ({
  windowMs,
  maxRequests,
  capsSpending = false,
}: {
  windowMs: number;
  maxRequests: number;
  capsSpending?: boolean;
}) => {
  const buckets = new Map<string, number[]>();

  return (key: string) => {
    // Checked per call rather than once at module load so the limiter follows
    // the environment even if it is set after this module is imported.
    if (capsSpending ? process.env.NODE_ENV === 'test' : rateLimitingDisabled()) {
      return true;
    }

    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (buckets.get(key) || []).filter((t) => t > cutoff);
    timestamps.push(now);
    buckets.set(key, timestamps);

    if (buckets.size > 5000) {
      for (const [k, ts] of buckets) {
        if (ts[ts.length - 1] < cutoff) buckets.delete(k);
      }
    }

    return timestamps.length <= maxRequests;
  };
};

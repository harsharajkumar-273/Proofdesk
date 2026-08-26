# Reproducing Proofdesk's Performance Figures

These are real, runnable benchmarks — not a mock. They exercise the actual build pipeline
and collaboration server, the same way `PulseStream/benchmarks/load_test.js` produces real
numbers for that project. As of this commit they have not been run yet, so the figures in
the main [README.md](../README.md) are still labeled as design targets. Run them and paste
the output into the README to turn them into measured results.

## 1. Compile latency: WASM vs. Docker (`compile_latency.spec.ts`)

Drives the real editor UI with Playwright — the same local-test-mode auth and seeded
`demo/course-demo` repo that `tests/e2e/local-demo.spec.ts` already uses for correctness
testing — and times 5 real builds in each of the two sandbox modes (`WASM Sandbox` selector
set to `wasm`, then `docker`). Each run edits `interactive.js` with a unique marker string
first, so the timing is a real build, not a cache hit.

```bash
# Bring up the WASM/PreTeXt builder container + Redis (used by the Docker/BullMQ path)
docker-compose up --build -d

# Run the benchmark (spins up backend + frontend in local-test mode automatically)
npx playwright test -c playwright.benchmark.config.ts
```

Prints a JSON summary (avg/p50/p95/min/max, in ms) for each mode to stdout.

## 2. CRDT sync latency (`crdt_sync_latency.mjs`)

Extends `scripts/collab-smoke.mjs`'s exact two-client Y.js setup (same WebSocket protocol,
same message framing against `/collab/ws`) with real timing: client A inserts text, and the
script measures wall-clock time until client B's document reflects it, repeated over
multiple rounds for a distribution rather than a single sample.

```bash
# Backend must be running (docker-compose or `npm run dev --prefix backend`)
node benchmarks/crdt_sync_latency.mjs --rounds 30
```

Prints per-round latency plus avg/p50/p95/min/max (in ms) to stdout.

## Once you've run both

Update the "⚠️ A note on the numbers in this README" callout and the "📊 Performance
Figures" table in the main README with the real output, the same way PulseStream's
`benchmarks/load_test.js` results were pasted in — and drop the "design target" language for
whichever paths you've actually measured.

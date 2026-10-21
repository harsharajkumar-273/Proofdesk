# Docker build pipeline: what each optimisation changes

This directory measures the Docker paths of Proofdesk separately, with the same
book content, so each timing can be attributed to a mechanism. Every number
below comes from a committed `*.jsonl` file under `results/`; nothing is
estimated.

**Read this first.** All runs were made in a cloud sandbox VM (Firecracker,
4 vCPU, 16 GB), not on production hardware. Absolute seconds will differ
elsewhere; **ratios between conditions are the portable result**. The
professor's end-to-end timings (the user-impact half) have **not** been
collected yet: see [PROFESSOR_PROTOCOL.md](PROFESSOR_PROTOCOL.md).

## Setup

| | |
|---|---|
| Code under test | commit `0346b51e` on `claude/affectionate-noether-whilc6` (production code unchanged; only benchmark files added) |
| Content | `backend/assets/ila-toolchain`, 749 files, content sha256 `3d7134bb…2308` |
| Runs | 50 per condition (10 for the cache-poison probe, 3 for the no-Redis smoke run) |
| Order | block-randomised, interleaved, so drift hits all conditions equally |
| Statistics | median and nearest-rank p95 with bootstrap 95% CIs; failures are counted and excluded from timing |
| Correctness | every timed run is checked against golden SHA-256 hashes of the built output (container) or against the public page (server); "Incorrect" counts runs that failed this |
| Environment | each `results/*/environment.json` records commit, host, Docker, content hash |
| Deviations | [sandbox-deviations.json](sandbox-deviations.json) (image base from a mirror, no network in containers, local git remote instead of GitHub, Pyodide served from disk, python-poppler omitted) |

Harnesses: `container.mjs` (Docker only), `server.mjs` (real backend API, local
bare git remote, optional `--redis`), `browser.mjs` (Playwright + Pyodide),
`analyze.mjs` (tables). `node --test lib.test.mjs professor_analyze.test.mjs`
tests the statistics helpers.

## Results

### 1. Cold container vs already-running container (`results/sandbox-container`)

| Condition | Runs | Failed | Incorrect | Median ms | p95 ms |
|---|---:|---:|---:|---:|---:|
| first build of a session (new container) | 50 | 0 | 0 | 15,364 | 15,883 |
| repeated build, running container, unchanged | 50 | 0 | 0 | 6,992 | 7,299 |
| repeated build, running container, changed | 50 | 0 | 0 | 7,001 | 7,542 |
| repeated build, new container, unchanged | 50 | 0 | 0 | 11,354 | 12,998 |
| repeated build, new container, changed | 50 | 0 | 0 | 11,327 | 12,623 |

* Cold vs running container (same session state, same content): **+4,363 ms, 1.62x** (CI 4,279 to 4,453).
* **Container start itself is only about 182 ms** (median `startMs`). The other ~4.2 s comes from the new container having no per-session state and no container-local npm cache, so `docker/build.sh` redoes its work. The persistent container is worth it mainly for kept state, not for avoiding startup.
* First build vs repeated build in the running container: 15,364 vs 6,992 ms, **2.20x**.

### 2. Unchanged vs changed content

Edited vs unchanged: +9 ms (CI -37 to 72) in a running container, -27 ms
(CI -138 to 109) in a new one. **Not distinguishable from noise.** The build
does the same work whether or not the content changed; there is no
incremental-build saving on this content.

### 3. Pretex math-image cache (volume `mra-pretex-cache`)

Emptied vs populated: +67 ms on a first build (not distinguishable), +78 ms on
a repeated build (distinguishable but ~1%). **No meaningful effect, and it cannot be
tested here:** the content has no equations, so the cache is never exercised.
Any claim about this cache needs math-heavy content.

### 4. Server path, end to end (`results/sandbox-server`, with Redis)

| Condition | Runs | Failed | Incorrect | Median ms | p95 ms |
|---|---:|---:|---:|---:|---:|
| open repo, cache miss (new container, full build) | 50 | 0 | 0 | 18,020 | 18,505 |
| open repo, build-cache hit | 50 | 0 | 0 | 1,318 | 1,614 |
| edit → publication verified on the public URL | 50 | 0 | 0 | 7,246 | 7,483 |

* **The build cache is the largest single saving: 16,702 ms, 13.7x** (CI 16,529 to 17,188). It copies a snapshot instead of building.
* Edit → verified public page: 7.2 s median, roughly the running-container rebuild (7.0 s) plus about 0.25 s of API and publish overhead; the `update` call itself returns in about 12 ms because it does not wait for the build (see defect 2).
* A short no-Redis run (3 cycles per condition, `results/sandbox-server-noredis`) shows the same timings, so the in-process fallback queue does not change the picture.

### 5. Browser preview vs full container build (`results/sandbox-browser`)

| Condition | Runs | Failed | Median ms | p95 ms |
|---|---:|---:|---:|---:|
| first preview, Pyodide not pre-warmed | 50 | 0 | 2,474 | 2,942 |
| first preview, pre-warmed on page load | 50 | 0 | 611 | 1,075 |
| later previews (warm) | 50 | 0 | 383 | 505 |

* **Pre-warming saves 1,863 ms (4.05x)** (CI 1,837 to 1,899) on the first preview.
* A preview in the browser (0.4 to 0.6 s) is 12 to 18 times faster than the shortest container path (7.0 s), and about 30 times faster than a first container build. Caveat: Pyodide was served from local disk, so a first-ever visit also pays a ~12 MB download this benchmark excludes.
* The browser preview and the container build produce different things (live preview vs the publishable site); the comparison is about latency, not equivalence.

## Which optimisation changed which timing

| Optimisation | Timing it changes | Measured effect |
|---|---|---|
| Build cache keyed by repo + commit | opening an already-built commit | -16.7 s (13.7x) |
| Persistent per-session container | repeated builds in a session | -4.4 s vs a new container (1.62x); startup is only ~0.18 s of that |
| First build vs later (session state, npm cache) | 1st vs later builds | 15.4 s → 7.0 s |
| Browser Pyodide pre-warm | first preview of a visit | -1.86 s (4.05x) |
| Pretex math-image cache | math-heavy builds | not measurable on this content |
| "Changed vs unchanged" shortcut | rebuilds | none; no detectable difference |

## Correctness of the resulting publication

* Container: 350 timed runs across 7 conditions, **0 incorrect**, each compared with golden file hashes (`results/sandbox-container/golden-files.json`).
* Server: 150 timed runs, **0 incorrect**; each edit was confirmed by polling the public share URL and comparing with the pre-edit public rendering (the share route rewrites HTML, so raw hashes cannot be compared).
* Browser: 150 runs, 0 failed, 0 incorrect.
* **Exception that matters:** the cache-poison probe (`cache-probe-after-edit`) was **incorrect in 10 of 10** runs; see defect 1.

## Defects found (each reproduced)

1. **Build-cache poisoning.** After an edit, the new build is cached under the old commit hash, so reopening that commit serves edited content. Probe: 10/10 incorrect (1/1 without Redis).
2. **Premature/early response.** `POST /build/update` returns before the build finishes (about 12 ms), and a late log subscriber can replay a stale "done".
3. **Container leak.** `cleanup` returns early, before `_stopPersistentContainer`, in some paths.
4. **Wasted `npm install`.** `build.sh` Step 3 runs `npm install` in `/repo/mathbox` on every rebuild (~2.6 s) even when nothing changed.
5. **Per-repo build serialisation.** Builds for one repo run one at a time.

## README claim correction (proposed, not applied)

The root `README.md` says "2,914 ms median for a Docker HTML preview build"
(line 14, and the performance table at line 63). Re-running that benchmark with
`docker events` recording (`results/readme-benchmark-reproduction`) showed
**0 container create/start events**: the test runs in local-test mode and
measures the 2 s editor debounce plus three local file writes (samples 2,946
to 3,042 ms). The server side of that update takes about 13 ms
(`local-mode-update-timing.json`, buildType `local-demo`). It is **not a Docker
build**. The real container figures are 7.0 s (repeat) and 15.4 s (first) here.
Suggested edit: relabel the row "Editor preview update, local mode (debounce
dominated)" and add the container numbers above with the caveat.

## What can be claimed

Supported by this data:

* *Engineering performance:* "Measured the Docker build pipeline across 7 container, 3 server and 3 browser conditions (50 runs each, 0 failures, 0 incorrect outputs). The build cache cuts reopening a book from 18.0 s to 1.3 s (13.7x); a persistent container cuts repeat builds from 11.4 s to 7.0 s (1.62x); browser pre-warm cuts first preview from 2.5 s to 0.6 s (4.05x). Found and reproduced five defects, including cache poisoning." Quote ratios; say "in a 4 vCPU sandbox".
* Do **not** claim: an absolute production latency, a pretex-cache benefit, a changed-content benefit, or the README's 2.9 s as a Docker build time.

Not yet supported (needs the professor):

* *User impact:* "editing finished → verified publication" for the previous workflow vs Proofdesk. Use `PROFESSOR_PROTOCOL.md`, fill `professor_log.template.csv`, and run `node professor_analyze.mjs professor_log.csv`. Until then, no user-impact number exists; the server figure above (7.2 s edit → verified public page) is the machine's share of that time only.

## Reproduce

```bash
cd benchmarks/docker_pipeline
node container.mjs --runs 50 --out results/<name> [--net-host] [--only a,b]
# server.mjs and browser.mjs: see the usage comment at the top of each file
node analyze.mjs results/<name>
```

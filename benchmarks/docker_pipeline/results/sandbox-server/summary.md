### server.jsonl (primary metric: `totalMs`, milliseconds)

| Condition | Runs | Failed | Incorrect | Median | Median 95% CI | p95 | p95 95% CI | Min | Max |
|---|---:|---:|---:|---:|---|---:|---|---:|---:|
| open-miss-cold | 50 | 0 | 0 | 18,020 | [17,927, 18,216] | 18,505 | [18,429, 19,219] | 17,430 | 19,219 |
| open-hit | 50 | 0 | 0 | 1,318 | [921.0, 1,438] | 1,614 | [1,551, 2,218] | 698.4 | 2,218 |
| edit-publish-verified | 50 | 0 | 0 | 7,246 | [7,164, 7,262] | 7,483 | [7,380, 7,789] | 7,029 | 7,789 |
| cache-probe-after-edit | 10 | 0 | 10 | n/a | [n/a, n/a] | n/a | [n/a, n/a] | n/a | n/a |

Median of each phase (ms), correct runs only:

| Condition | initMs | buildWaitMs | fetchMs | updateMs |
|---|---:|---:|---:|---:|
| open-miss-cold | 444.8 | 17,529 | 2.9 | n/a |
| open-hit | 1,316 | 0.0 | 2.8 | n/a |
| edit-publish-verified | n/a | n/a | n/a | 11.7 |
| cache-probe-after-edit | n/a | n/a | n/a | n/a |

Head-to-head (difference of medians, A minus B; the interval is a bootstrap 95% CI):

| Question | A | B | A median | B median | A - B | 95% CI of A - B | A / B | Distinguishable from noise? |
|---|---|---|---:|---:|---:|---|---:|---|
| Opening a repo: full build in a new container vs build-cache hit | open-miss-cold | open-hit | 18,020 | 1,318 | 16,702 | [16,529, 17,188] | 13.67x | yes |
| Open (new container, full build) vs edit-to-verified-publication (running container) | open-miss-cold | edit-publish-verified | 18,020 | 7,246 | 10,774 | [10,679, 11,005] | 2.49x | yes |

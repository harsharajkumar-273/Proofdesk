### browser.jsonl (primary metric: `totalMs`, milliseconds)

| Condition | Runs | Failed | Incorrect | Median | Median 95% CI | p95 | p95 95% CI | Min | Max |
|---|---:|---:|---:|---:|---|---:|---|---:|---:|
| browser-cold-noprewarm | 50 | 0 | 0 | 2,474 | [2,450, 2,500] | 2,942 | [2,581, 2,972] | 2,236 | 2,972 |
| browser-warm-changed | 50 | 0 | 0 | 382.5 | [373.9, 390.4] | 504.6 | [471.1, 547.7] | 343.4 | 547.7 |
| browser-cold | 50 | 0 | 0 | 611.1 | [589.5, 626.1] | 1,075 | [838.9, 1,161] | 445.8 | 1,161 |

Median of each phase (ms), correct runs only:

| Condition | pageReadyMs | prewarmReadyMs |
|---|---:|---:|
| browser-cold-noprewarm | 30,797 | n/a |
| browser-warm-changed | n/a | n/a |
| browser-cold | 31,018 | 14,309 |

Head-to-head (difference of medians, A minus B; the interval is a bootstrap 95% CI):

| Question | A | B | A median | B median | A - B | 95% CI of A - B | A / B | Distinguishable from noise? |
|---|---|---|---:|---:|---:|---|---:|---|
| What the background pre-warm saves on the first preview (not pre-warmed vs pre-warmed) | browser-cold-noprewarm | browser-cold | 2,474 | 611.1 | 1,863 | [1,837, 1,899] | 4.05x | yes |
| First preview of a visit (pre-warmed) vs later previews | browser-cold | browser-warm-changed | 611.1 | 382.5 | 228.6 | [204.6, 247.9] | 1.60x | yes |
| First preview of a visit without pre-warm vs later previews | browser-cold-noprewarm | browser-warm-changed | 2,474 | 382.5 | 2,091 | [2,070, 2,121] | 6.47x | yes |

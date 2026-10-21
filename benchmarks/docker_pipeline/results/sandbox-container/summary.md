### container.jsonl (primary metric: `totalMs`, milliseconds)

| Condition | Runs | Failed | Incorrect | Median | Median 95% CI | p95 | p95 95% CI | Min | Max |
|---|---:|---:|---:|---:|---|---:|---|---:|---:|
| rebuild-newcontainer-changed | 50 | 0 | 0 | 11,327 | [11,252, 11,430] | 12,623 | [11,531, 22,262] | 10,966 | 22,262 |
| rebuild-newcontainer-unchanged | 50 | 0 | 0 | 11,354 | [11,280, 11,439] | 12,998 | [11,777, 70,256] | 10,945 | 70,256 |
| rebuild-running-changed | 50 | 0 | 0 | 7,001 | [6,974, 7,057] | 7,542 | [7,181, 10,984] | 6,866 | 10,984 |
| rebuild-running-emptycache | 50 | 0 | 0 | 7,070 | [7,019, 7,094] | 7,282 | [7,192, 7,841] | 6,874 | 7,841 |
| first-build | 50 | 0 | 0 | 15,364 | [15,302, 15,465] | 15,883 | [15,616, 16,244] | 14,840 | 16,244 |
| rebuild-running-unchanged | 50 | 0 | 0 | 6,992 | [6,962, 7,032] | 7,299 | [7,161, 8,184] | 6,795 | 8,184 |
| first-build-emptycache | 50 | 0 | 0 | 15,431 | [15,338, 15,557] | 15,880 | [15,747, 16,326] | 14,873 | 16,326 |

Median of each phase (ms), correct runs only:

| Condition | startMs | execMs | inspectMs |
|---|---:|---:|---:|
| rebuild-newcontainer-changed | 181.9 | 11,148 | n/a |
| rebuild-newcontainer-unchanged | 182.4 | 11,167 | n/a |
| rebuild-running-changed | n/a | 6,977 | 21.5 |
| rebuild-running-emptycache | n/a | 7,048 | 20.8 |
| first-build | 252.2 | 15,092 | n/a |
| rebuild-running-unchanged | n/a | 6,971 | 20.8 |
| first-build-emptycache | 236.3 | 15,206 | n/a |

Head-to-head (difference of medians, A minus B; the interval is a bootstrap 95% CI):

| Question | A | B | A median | B median | A - B | 95% CI of A - B | A / B | Distinguishable from noise? |
|---|---|---|---:|---:|---:|---|---:|---|
| Cold (new) container vs already-running container, same session state, same content | rebuild-newcontainer-unchanged | rebuild-running-unchanged | 11,354 | 6,992 | 4,363 | [4,279, 4,453] | 1.62x | yes |
| Cold (new) container vs already-running container, same session state, edited content | rebuild-newcontainer-changed | rebuild-running-changed | 11,327 | 7,001 | 4,326 | [4,241, 4,435] | 1.62x | yes |
| First build of a session vs repeated build in the running container | first-build | rebuild-running-unchanged | 15,364 | 6,992 | 8,373 | [8,303, 8,485] | 2.20x | yes |
| First build of a session vs repeated build in a new container (session state kept) | first-build | rebuild-newcontainer-unchanged | 15,364 | 11,354 | 4,010 | [3,896, 4,155] | 1.35x | yes |
| Empty pretex-cache volume vs populated, on a first build | first-build-emptycache | first-build | 15,431 | 15,364 | 66.8 | [-77.7, 198.2] | 1.00x | no |
| Emptied pretex cache vs populated, on a repeated build | rebuild-running-emptycache | rebuild-running-unchanged | 7,070 | 6,992 | 78.1 | [21.4, 115.4] | 1.01x | yes |
| Edited vs unchanged content (running container) | rebuild-running-changed | rebuild-running-unchanged | 7,001 | 6,992 | 9.1 | [-37.4, 71.5] | 1.00x | no |
| Edited vs unchanged content (new container) | rebuild-newcontainer-changed | rebuild-newcontainer-unchanged | 11,327 | 11,354 | -27.1 | [-138.3, 109.3] | 1.00x | no |

# Timing a real update: previous workflow vs Proofdesk

This is the part of the evaluation that **only the professor can supply**. The
machine benchmarks measure how long the software takes; this protocol measures
what the professor actually experiences, which is what a user-impact claim has
to rest on.

## The one metric

> **Editing finished → verified publication**, in seconds.

| Moment | Definition | How it is recorded |
|---|---|---|
| **T0: editing finished** | The professor says "done" and the last change is saved. | Observer notes the clock (or the screen recording's timestamp). |
| **T1: verified publication** | The updated page is live at the address readers use **and** it has passed the fixed checklist below. | Observer notes the clock when the checklist is complete. |
| **Duration** | `T1 − T0` | Computed. Never estimated afterwards from memory. |

Timing stops only when the change is **verified correct**, not when a command
finishes. If the checklist fails, the clock keeps running while it is fixed and
re-published; the retry is recorded.

### Verification checklist (identical for both workflows)
1. The changed text/equation/figure is visible on the **public** page (not a local preview).
2. The page around the change is unchanged: nothing is missing, duplicated or mis-numbered.
3. Equations render (no raw LaTeX, no empty boxes).
4. Links/cross-references in the changed section work.
5. Opened in a **fresh private browser window**, so a cached old version cannot hide a failed publish.

Two people can do this quickly, one watching the clock, one running the checklist.
Use the same checklist wording for both workflows.

## Design

**Updates.** Choose real edits the professor makes anyway, in three sizes:

| Size | Example |
|---|---|
| Small | Fix a typo or a number in one sentence. |
| Medium | Add a paragraph and one displayed equation. |
| Large | Add a subsection with several equations and a figure. |

Use **at least 12 updates** (4 of each size), ideally 20 or more. Each update is
done once with the previous workflow and once with Proofdesk.

**Comparable pairs.** The same professor will remember an edit they just did, so
do not repeat the *identical* edit. For each update, prepare two *equivalent*
edits (same size, same kind of content, different location), assign one to each
workflow, and note the pair under the same `update_id`.

**Order.** Counter-balance: for half of the updates do the previous workflow
first, for the other half Proofdesk first. Alternate (A, B, B, A, …) and write
the order down (`order_index`). This stops "the second one was faster because I
had warmed up" from favouring one workflow.

**Before you start**
- Write down the **previous workflow step by step** as the professor really does it (every command, every upload, every wait). Count the manual steps.
- Do 1–2 untimed practice runs of each workflow so neither is slowed by unfamiliarity with the *study*.
- Use the same machine, network and time of day where possible.
- Record the Proofdesk **commit** (`git rev-parse HEAD`) and the environment it ran in (hosted URL, region, instance size).

**During**
- Do not coach, and do not tell the professor which workflow is expected to win.
- Interruptions (a phone call, a meeting) are not part of the workflow: record their length in `interruption_s` and **subtract** it, but keep the row.
- Include every failure and retry. Do not drop a slow or failed update.

**Data**: fill in `professor_log.csv` (one row per update per workflow), then run

```bash
node professor_analyze.mjs professor_log.csv
```

## What you can and cannot claim from it

- Report the **median** and the range. With fewer than ~20 samples per workflow a 95th percentile is just "the slowest one or two", so the script flags it instead of presenting it as a rate.
- The paired comparison (the same size of update, both workflows) is the headline: *"the median update took X s with the previous workflow and Y s with Proofdesk (n = …, 95% CI for the difference …)"*.
- This is **one professor** and one course. State it that way. It supports "for this professor's updates", not "for all instructors".
- Do not attribute the difference to a single optimisation. The professor's time includes things (opening the editor, finding the file, reviewing the page) that no Docker optimisation touches. The machine benchmarks in this directory are what attribute *parts* of the time to specific mechanisms.

## Consent and data

Get the professor's agreement to be timed and to have the results used in a
résumé, report or paper. Do not record students' data, and keep screen
recordings private. Name the professor in published material only if they agree.

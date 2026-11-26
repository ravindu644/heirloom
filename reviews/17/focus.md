# Section 17, Focus: the bar is the task's laps

Pictures: `reviews/17/shots/` focus-next, running-task, focus-task-paused, focus-past-estimate,
focus-no-estimate, focus-no-estimate-running, focus-all-in, focus-break-task, long-break-paused,
focus-nothing, paused, focus-yesterday, focus-yesterday-done, set-done; phone and laptop, light and
dark, all opened. `node tools/design-audit.mjs`: 222 states, 0 violations. Positions measured with
`getBoundingClientRect()` on a build of the demo.

## Verdict: FAIL

Two things are still said twice, which is the over-explaining the user named: "Paused" over the bar
and "paused since 16:38" under the digits; "Take five." beside the button "Start 5 min break".
Everything else the user asked for is there and reads right.

## Measured

| What | Phone (412) | Laptop (1440) |
|---|---|---|
| Line over the bar (empty or not) | y 56, 17 tall | y 32, 17 tall |
| Bar, or the kept place when there is none | y 80.9, 8 tall | y 56.9, 8 tall |
| Project and title | y 112.9 | y 88.9 |
| Digits' box top, every state with the task lines | 178.6 | 154.6 |
| Digits' box top, `paused` and `long-break-paused` (no tasks at all, so no task lines in any state) | 112.9 | 88.9 |
| Left edge: line, bar, title | 20 | 264 |

The digits do not move between a task with an estimate and one without, idle or running, paused or
in a break. Result: line 17 + 8 + bar 24 = 49 tall, the bar stands where it stood.

## Per state

| State | Verdict | Why |
|---|---|---|
| `focus-next` | PASS | Five segments, two full, nothing over them. No count beside the project. "Start now and it ends at 17:05." and one primary |
| `running-task` | PASS | Third segment fills with the clock. Line empty, the digits and "of 25:00, ends at 16:59" carry the state |
| `focus-task-paused` | FAIL | "Paused" (y 56) and "of 25:00, paused since 16:38" (y 343) say one thing twice; the grey digits and Resume say it a third and fourth time. Fix below, 1 |
| `focus-past-estimate` | PASS | Estimate 2, laps [1, 1, 0.5] and a running one: four segments, the stopped one half full and kept. Matches the user's "how many laps there are in the task". Note only: nothing marks where the estimate ended; leave it unless the user asks |
| `focus-no-estimate` | PASS | No bar; the empty 33px (line plus bar place) reads as the screen's top margin, not a hole, and it keeps the digits still when the task is changed to one with an estimate |
| `focus-no-estimate-running` | PASS | Same, running. No "lap 3 on this task" left behind |
| `focus-all-in` | FAIL | The tall bar, three of three, is right and reads at once. But "Take five." stands 50px over "Start 5 min break": the break said twice. Fix below, 2 |
| `set-done` | FAIL | "Take 15 minutes." over "Start 15 min break", same as above. "Four laps. The long break is earned!" is the one place the four is said, and it is earned: keep |
| `focus-yesterday-done` | FAIL | "Take five." over "Start 5 min break", same. "A lap from yesterday" over the bar is right |
| `focus-break-task` | PASS | "Short break" with the rest dot, the task's bar (3 of 4), the next lap's task named. A break reads as a break without a count |
| `long-break-paused` | FAIL | "Long break, paused" over "of 15:00, paused since 16:38": paused twice. Fix below, 1 |
| `paused` | FAIL | "Paused" alone at the top over "of 25:00, paused since 16:38". Fix below, 1 |
| `focus-nothing` | PASS | "This lap is for / Nothing in particular", no bar, digits at 178.6 like the rest |
| `focus-yesterday` | PASS | "A lap from yesterday" and the task's bar; no "Lap 0" |

Light and dark: same layout to the pixel; the bar's empty segments, the rest dot and the grey held
digits all hold in dark. Nothing navy, nothing glowing.

## Fixes

1. **Paused said twice.** Under the digits already says "paused since 16:38", the digits turn grey
   and the button is Resume. The line over the bar is for "what the digits cannot" say (DESIGN.md's
   own words), and the digits' line can. `client/src/ui/focus/focus.tsx`, `lapLine`: in a lap, drop
   `!ready && view.paused && <b>{s.focus.paused}</b>` (the line stays empty); in a break and on a
   stale lap drop `view.paused ? s.focus.lapPaused : ''`. Delete `paused` and `lapPaused` from
   `client/src/ui/strings.ts` focus. DESIGN.md, "Focus's bar is the task's laps": "and "Paused" or
   "Break over" when it is so" becomes "and "Break over" when it is so; paused is said under the
   digits".
2. **The break said twice on the result.** `client/src/ui/focus/focus.tsx` line ~251: remove
   `{s.result.take(breakMs)}`; delete `take` from `result` in `client/src/ui/strings.ts`. The button
   names the break; DESIGN.md already says that is the one place it is said.

## Words

Read cold: "Short break", "Long break", "A lap from yesterday", "This lap is for / Nothing in
particular", "Start now and it ends at 17:05.", "of 25:00, ends at 16:59", "5 more minutes", "Done
for now", "Start 5 min break", "Start the next lap now", "6 laps today. This task is at 3 of 3."
Plain, no feature names, no scolding, nothing generic. The two FAILs above are the only padding left.

## Keep

The bar is now the task's and only the task's: five segments for an estimate of five, gone for a
task with none, its place kept so the digits stay at 178.6 in every state. Any later change that
puts a count, a noun or a "next" back over the bar undoes what the user asked for.

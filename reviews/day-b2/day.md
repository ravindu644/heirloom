# Progress: the day, lap by lap (B2 build)

Reviewed 2026-11-28 against DESIGN.md "The day, lap by lap", `skills/taste-gate`, and option B2 in
`reviews/day-options/b-variations.html`. I opened all 28 pictures in `reviews/day-b2/shots/`.
`node tools/design-audit.mjs` found 276 states and 0 violations. I then measured the panel with
`getBoundingClientRect()` on a built demo.

## Verdicts

| State | Verdict | Why |
|---|---|---|
| progress-real-day | PASS | 31m + 16m = 47m, and 47m is also the figure at the top. The midnight lap shows its real times, "31 minutes today", and "Its first 14 minutes count there." |
| progress-full-day | FAIL | One row says "not counted" twice (finding 1) |
| progress-full-day-open | FAIL | Same as full-day (finding 1). Opening the earlier laps works: the splits run 25m, 50m, 1h 15m, 1h 40m, 2h 5m with no gaps |
| progress-nothing | PASS | It says what to do first ("The first lap starts on Focus."), shows no illustration, and the note field is still there |
| progress-day (past) | PASS | "3 earlier laps, 1h 15m" + 25m = 1h 40m, the first visible split. The last split, 3h 20m, is the figure at the top |
| progress-midnight-before | FAIL | The top says "in 8 laps" but the list holds 9 lap rows, and nothing says why. The last hour label reads "00:00" (findings 2, 3) |
| progress-running | FAIL | The second of two laps that ran at the same time says "25 minutes", but the day total only grows by 10m (finding 4) |
| All states with laps | FAIL | A day of 10 hours or more does not fit the split column (finding 5) |

## Findings

1. **"Not counted" is said twice in one row.** In full-day and full-day-open, the 12:40 row reads "12 minutes, not counted" on its top line and then "Lap, not counted" as its kind. This breaks taste-gate §13: say a state once. Fix: `s.progress.ranAside` should give only the length, so the top line reads "12:40 to 12:52  12 minutes".
2. **The lap count does not match the rows on the day a lap began.** On midnight-before, Monday says "focused that day, in 8 laps", but the rows are 4 hidden + 5 shown = 9 laps. The 23:46 lap is counted on Tuesday, because a lap is counted on the day it ended. Its row says "14 minutes that day", which explains the minutes but not the lap, so the list stops adding up. Fix: give the row a line under its words, the mirror of "Began on Monday.": "Ends on Tuesday, where it counts as a lap." (DESIGN.md: add the sentence beside the "Began on" one.)
3. **The day's end is labelled "00:00".** On midnight-before, the last hour label reads "20:00  00:00", 10.5px apart at 1440. "00:00" at the right end reads like the start of a day. DESIGN.md says the hours never run past 24:00, so the label should say so. Fix: when the stretch ends at the day's midnight, write the last label as "24:00".
4. **Two laps at once do not add up where you read them.** On running, the 15:40 row says "25 minutes", but its total moves from 1h 52m to 2h 2m (+10m). "ran on two devices" sits beside it but does not give the 10. This breaks the PRODUCT.md row: "adds up where you read it". Fix: on the second lap of a pair, say what it added: "25 minutes, 10 not already counted". Or, shorter: "25 minutes, 15 shared with the lap above".
5. **The split column is too narrow for a long day.** `--split` is 72px (touch x 1.5). I put "12h 30m" in a split and measured it at 81px. At 412 it runs from x 295 to 376, while the words and slivers end at 296. The 8px gap is gone and the figure touches the sliver and the title's ellipsis. At 1440 the 16px gap shrinks to 7px. This breaks taste-gate §9: every number has a top. Fix: make the column fit the day's widest figure. Either 96px (touch x 2), or a subgrid over the list so the head and every row share one `max-content` column. Add a demo state for a 12-hour day so the audit checks it on every run.
6. **The column widths borrow other tokens.** The 240px sliver column is written as `sidebar + sm`, and the 72px split as `touch x 1.5`. The code's own ponytail comment says so. If the sidebar changes, the day's slivers change with it. Fix (DESIGN.md, lead): name `layout.day-sliver: 240px` and `layout.day-split`, and use them. Not blocking, but do it together with finding 5.
7. **The hour labels are built inside the screen.** `day.tsx` draws its own row of hour names. `kit/track.tsx` already has `Hours`, which pulls the end labels in the same way but always draws "now". The kit rule is: "a missing piece is added to the kit once". Fix: make `now` optional in kit `Hours` (no line, no "now") and use it here. Not blocking.
8. **The demo's heatmap line disagrees with the panel above it.** Every screenshot shows two different answers for the same day. real-day: "Tuesday 24 November: 47m, 1 lap" over "47m focused today, in 2 laps". midnight-before: "3h 20m" over "3h 34m". running: "2h 5m, 5 laps" over "2h 33m ... in 7 laps". The demo's heatmap is fed from `minutes[day]`, not from `dayView`. Fix in `demo-progress.ts` so the pictures the user judges agree. Then confirm in core that `history.days[day]` and `day()` agree for a day with a stopped lap and one with a midnight lap (`progress.test.ts:569` covers only one case).

Measured and correct, keep these:
- **Left edges** (x 36 at 412, x 280 at 1440): the title, the times line, the kind, the quiet rows, the hours and the note all start here. Links start 1px in because the kit's transparent hair border shifts them. That 1px is the same for every link in the kit.
- **Gaps:** title to figure 16, figure to head 16, head to list 8, row padding 8, last row to note 16. All are steps on the scale.
- **Slivers:** every sliver spans exactly the hours row (36 to 296, and 666.7 to 906.7), so the slivers read down as one lane.
- **Right edges:** "Day so far" and every split share one right edge (376, and 994.7).
- **Touch:** every link has a 48px target. The fold link's target (1567 to 1615) clears both the figure above and the hours below.
- **Hour labels:** the visible gaps between them are uneven (15.5, 32, 32 and 17.5px at 412) because the end labels are pulled in. B2 and Room's `Hours` do the same, so it stays.

Against the drawing: the structure, sizes, order and words all match B2. There are three differences, all acceptable:
- With no fold link, the hours sit on one row beside "Day so far". This saves a row, and it is better than the drawing.
- The break after the midnight lap shows on its sliver, as DESIGN.md asks.
- The links use the kit's muted style. This one is known.

## Words

Every string on the panel:
- "Today, lap by lap" / "Monday 23 November, lap by lap", "Back to today"
- "focused today, in 2 laps" / "focused that day, in 8 laps", "Day so far"
- "4 earlier laps, 1h 40m", "Show the latest 5"
- "23:46 to 00:31  31 minutes today", "14 minutes that day", "16:40 to now  6 minutes"
- "Lap", "Stopped lap", "Lap, not counted", "Lap, running"
- "Began on Monday. Its first 14 minutes count there."
- "ran on two devices", "Don't count it", "Count it again"
- "11:19  Done: Morning routine", "13:05  Checked in: Walk after lunch"
- "A line or two about today", "what went well, or what got in the way", "The line you wrote that day"
- "Nothing has run today yet. The first lap starts on Focus."
- The bar's "Not counted. It adds nothing to your day, week or streak."

All of them are plain and specific, and they give numbers instead of adjectives. None of them scolds or pads, and there is no em dash. Two fail, both above: "12 minutes, not counted" (finding 1, the state said twice) and the second lap of a pair saying "25 minutes" when it added 10 (finding 4).

## One thing to keep

Each row ends with the running "Day so far", and the last one equals the figure at the top. One list explains the day's number with no second chart. In every state I checked, the fold link's total plus the first visible lap equals that lap's split. Any later change to counting, folding or midnight has to keep this true.

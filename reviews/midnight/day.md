# A lap across midnight: Progress's day and Focus

Pictures: `reviews/midnight/shots/` (412x915 and 1440x900, light and dark), plus the "8 earlier
today" list opened at both sizes. `node tools/design-audit.mjs --state <each>` on
progress-midnight, progress-midnight-before, focus-midnight, focus-midnight-done and
focus-midnight-stopped: 0 violations at 412, 471 and 1440. Positions below are read with
`getBoundingClientRect()` from the built demo.

## Verdicts

| Screen | Verdict |
|---|---|
| Progress, today (progress-midnight) | PASS |
| Progress, the day before (progress-midnight-before) | PASS |
| Focus, running / rung / stopped (focus-midnight, -done, -stopped) | FAIL: DESIGN.md still says the opposite. The fix is to DESIGN.md only, not the screen |

## Does the cut block read as "it went on past the edge"?

Partly. Nothing in the drawing marks a cut end: the block is a square `you` block like any other.
What says "cut" is where it sits. It runs to the very end of the lane, at 00:00 or at the
midnight that ends the day, and a real lap never starts or stops there to the second.
- The day before, phone: 23:46 to 24:00 is a 5.3px stub at x 370.7 to 376.0, flush with the
  lane's end at 376. That is about half the width of a 25-minute lap (9.4px) on the same lane. It
  reads as a short lap at the day's end. Its row ("23:46 to 00:32, 46 minutes") is the last row
  and is in view right under it, so the stub is explained where it is seen. At 1440 the block is
  11.1px, ending at 994.6, the lane's end. Good enough.
- Today: 00:00 to 00:32 is 10.7px at 36 (phone) and 22.4px at 280 (1440), flush with the lane's
  start. It reads as a 32-minute lap from 00:00. That is true of today's part. But its row is the
  first of the day, so on any real day it sits behind "N earlier today", and nothing in view says
  it began at 23:46. Not a FAIL, because the block says nothing false about today. Next time this
  is touched, a cut end could be shown without a new token: leave the lane's last `hair` past the
  block unfilled, or put a "from 23:46" `label` on the hour row at the lane's start. Ask the user
  before adding either; they ruled "the block drawn only inside the day" and may want no more.

## Is the axis right?

Yes. Today: 00:00 to 17:00 (labels 00:00, 03:00 ... 15:00, every 3h). It starts at midnight
because the cut lap holds that hour, and it does not reach back into the 23rd. The day before:
09:00 to 24:00. The last label "00:00" is pulled in to the lane's end (x 343 to 376), as DESIGN.md
says only an end label may be. The 4-hour floor counts back from midnight late in the day. Read
from the code, not drawn: a day holding only the cut lap gives 20:00 to 24:00, or 00:00 to 04:00.

## Findings

1. **Focus vs DESIGN.md (blocking, for the lead).** DESIGN.md, "Said so a stranger knows", lines
   1026 to 1027 and 1038 to 1039 still require "A lap from yesterday" in the project row "in every
   state it can be in, running, rung or stopped", and say "nothing promises it will add to today".
   The screens now show the project ("C"), "Lap 1 today stopped at 1h 20m." and "First lap of the
   day.". DESIGN.md wins where the two disagree, so it is rewritten first. Fix: "A lap begun
   before midnight is the day's it ends on: Focus names its project as any lap's, counts it as
   today's lap, and only its minutes from midnight are in today's race."
2. **Progress's timeline vs DESIGN.md (doc gap).** "A day's timeline" (line 549) says nothing of
   midnight. Add: "The axis runs inside the day, 00:00 to 24:00, trimmed to hours that hold
   something. A lap across midnight is drawn on each day only as far as it ran in it, to the
   lane's end, and its row keeps its real times ('23:46 to 00:32')."
3. **Room vs DESIGN.md (doc gap, not reviewed by picture).** room.tsx now starts an upright
   phone's six-hour window at midnight in the first hours, and a report's day at midnight. DESIGN.md
   line 588 still says "six hours with now 5/8 across". Add "from midnight in the day's first
   hours". There is no room-midnight demo state, so the room was not audited for this. Add one,
   or say why not.
4. **Stale comments (code, not screen).** `client/src/ui/strings.ts:88` still explains
   `lapYesterday`, which is gone ("it counts on the day it began, so it has no number today"):
   delete the line. `client/src/ui/today/today.tsx:90` says "yesterday's as that", which
   `stopSaid` no longer does: drop those words.
5. **The demo's ghost is not what 00:10 looks like.** focus-midnight scenes use the fixed
   `tuesday` ghost, so the race says "Last Tue 2h 30m" at 00:10 and 00:20, and the result reads "6
   laps draw you level with last Tuesday." just after midnight. The real ghost at 00:10 is a few
   minutes at most. The pictures the user sees should show the real case: give these three scenes
   a ghost of about 0 (level or ahead). Not a FAIL of the screen.
6. **Totals are not shown by the demo.** "Tuesday 24 November: 2h 5m, 5 laps" and "2h 5m of focus
   in 5 laps." are the same with and without the cut lap, because demo-progress's figures are
   fixed. So the pictures cannot show that today's total has the 32 minutes and the 23rd has the
   14. That proof belongs to `contracts/fixtures/stats.json` and progress.test.ts, not to this
   review. The lead should confirm it there.

Nothing else broke: the audit found no undefined size, colour, radius or gap. Left edges hold:
the list, axis labels and heading all start at 36 (phone) and 280 (1440), the same as
progress-day. Both themes look the same in weight. Nothing is navy.

## Words

- "23:46 to 00:32 · 46 minutes": right. The real times and the whole length, in the app's 16:40 form.
- "Lap 1 today stopped at 1h 20m.": holds. 1h 20m is how far the lap ran, and "today" says
  whose count the 1 is. The race above says "You 20m", so a reader may ask "of what?". It is still
  acceptable, because the chip line says "at 00:20" beside it. Do not add a clause to explain it.
- "First lap of the day.": plain and specific. Better than the old silence.
- "−2h 10m at 00:20. Finish this lap and you draw level.": the words are fine, the data is the
  demo's (finding 5).
- "Stopped after yesterday's lap." (kept for a break that runs past midnight): fine, and true there.
- No scolding, no padding, no exclamation marks.

## Keep

The list keeps the lap whole ("23:46 to 00:32, 46 minutes") while each day's lane draws only that
day's part. The row is the lap and the block is the day. Never "fix" the row to 00:00 to 00:32 or
let the block spill over the axis to match the row.

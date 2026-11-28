# Progress: the day, lap by lap, walked as a stranger

Walked 2026-11-28 on a fresh build of `client/demo.html` (the working tree as it stands), at 412x915
and 1440x900: progress-real-day, -full-day, -full-day-open, -midnight-before, -running, -long-day,
-nothing, -day, plus -midnight and -paused for the lap across midnight and the paused lap. I pressed
"Don't count it", "Count it again", Undo, the fold link both ways, "Back to today", and filled the
note to its count. Findings already in `day.md` that are now fixed (the doubled "not counted", the
9 rows under "8 laps", "00:00" at the end, the pair's "25 minutes", the long split) are not repeated.

Each finding: where, what a stranger thinks, the fix in one line, severity.

## Findings

1. **A lap not counted still says its minutes count on the day before.** real-day, "Don't count it"
   on the 23:46 lap: the row turns to "45 minutes / Lap, not counted" and keeps "Began on Monday.
   Its first 14 minutes count there." Monday's figure has in fact lost those 14 (midnight-before
   drops 3h 34m to 3h 20m when the same lap is set aside there). A stranger believes Monday still
   has them. Cause: `day.tsx` renders `lap.began` with no `counted` check, while the "Ends on" line
   has one. Fix: when not counted, say only "Began on Monday." (or drop the line). **confuses** (it
   states a false number).

2. **"Don't count it" on a lap across midnight changes the other day too, and nothing says so.** On
   Monday's 23:46 row (which says "14 minutes that day") the press takes 14m off Monday and also
   32m and a lap off Tuesday (today goes 8 laps to 7, 2h 59m to 2h 27m). The bar says "It adds
   nothing to your day, week or streak": which day? A stranger expects to lose 14 minutes on
   Monday. Fix: the bar says what left and where: "Not counted. 46 minutes off, 32 of them
   Tuesday's." **confuses**

3. **The press takes off a different number than the row shows.** running: "Don't count it" on
   15:30 "25 minutes" takes 10m off the day (2h 33m to 2h 23m), because the 15 shared minutes move
   to the 15:40 lap, which now reads "25 minutes". A stranger expected 25. Fix: the same as 2, the
   bar names the minutes that left ("Not counted. 10 minutes off today."). **confuses**

4. **On the phone the bar never says what "not counted" means.** At 412 the bar shows only "Not
   counted." and Undo; "It adds nothing to your day, week or streak." does not fit and is dropped
   by design (`said.module.css`). At 1440 it shows. So the one place the consequence is said is
   unseen where most presses happen, and nothing beside the link says it before the press. Fix:
   a shorter tail that fits ("Off your day and streak.") or the minutes from 2, which are shorter.
   **confuses**

5. **The fold link's lap count does not add up with the heading.** running: "focused today, in 7
   laps", "4 earlier laps, 1h 15m", then 4 counted laps and the running one below. 4 + 4 = 8, not 7:
   one of the 4 folded is "Lap, not counted" (only seen once opened). Same in midnight, and after
   setting aside a folded lap in full-day it still reads "4 earlier laps". Fix: count what the
   heading counts, and name the rest: "3 earlier laps and 1 not counted, 1h 15m". **confuses**

6. **The fold hides more than it names.** running and midnight fold "11:16 Done: Discrete maths,
   tutorial sheet 6" along with the laps; "4 earlier laps" does not say a task done is in there.
   Opened, the link reads "Show the latest 5": five what? Fix: "Show only the latest 5 laps"; the
   closed link can stay as it is if 5 is fixed. **nit**

7. **"15 already counted" does not say by what.** running: "25 minutes, 15 already counted" with
   "ran on two devices" on both rows. A stranger asks: counted where, which device, was I paid
   twice? The rows above make it work out, but only by subtraction. Fix: "25 minutes, 15 of them
   in the lap above". **confuses**

8. **"ran on two devices" stays on a pair after one of them is not counted.** running, after
   setting aside 15:30: both rows still say "ran on two devices", though only one now counts and
   the other gives its full 25. Reads as if something is still being shared. Fix: show the mark
   only while both of the pair count. **nit**

9. **"Ends on Tuesday" on a lap that has ended.** midnight-before: "Ends on Tuesday, where it counts
   as a lap." sits beside "Began on Monday." on the next day. Present against past, for a lap
   finished a day ago. Fix: "Ended on Tuesday, where it counts as a lap." **nit**

10. **"Day so far" on a day that is over.** progress-day (Tuesday 17 November) and midnight-before:
    the column still reads "Day so far". "So far" says the day is still going. Fix: on a past day,
    "Day's total" (or "Running total" on every day). **nit**

11. **The big figure counts the running lap's minutes but not the lap.** running and paused: "2h 33m
    focused today, in 7 laps", the 6 running minutes inside 2h 33m, the running lap outside 7. Counting
    rows gives 8. Fix: leave the count, but say it: "in 7 laps, and one running". **nit**

12. **The green tick on a sliver is never named.** Every lap's sliver ends in a short green block
    (the break after it). Nothing on the panel says what green is; red is easy (the lap), green
    could read as "good" or "done". Fix: none on the panel if the break is in the hours' key
    elsewhere; otherwise the row's top line can name it once: "then a 5 minute break". **nit**

13. **The day's figure is shown twice on one page.** progress-day after "Back to today": the year
    grid's line "Tuesday 24 November: 2h 27m, 7 laps" stands 250px above "2h 27m focused today, in 7
    laps". Not wrong, but PRODUCT.md's pick was "nothing shown twice". Fix: when the panel shows the
    chosen day, the grid's line can drop the figure and keep the date. **nit** (the user's call)

14. **"A line or two", but Enter does nothing.** The note's label asks for "a line or two"; Enter is
    swallowed and a pasted newline becomes a space. A past day says "The line you wrote that day".
    Fix: "A line about today", so the label and the field agree. **nit**

15. **"Back to today" drops keyboard focus to the page.** After the press the button is gone and
    focus is on `body`; a keyboard user starts again from the top. Fix: move focus to the panel's
    heading. **nit**

## What reads well

- "23:46 to 00:31  31 minutes today" with "Began on Monday. Its first 14 minutes count there."
  says the midnight rule without a word of the data model; 31 + 14 = 45 is checkable on the row.
- Every split adds up: the fold's minutes plus the first visible lap is that lap's split in every
  state, and the last split is the big figure.
- "Count it again" puts the row and the figure back at once (3h 6m to 3h 18m, 8 to 9 laps); Undo
  on the bar does the same.
- 12h 30m fits its column at both widths; "24:00" reads as the day's end.
- The empty day says where the first lap starts.

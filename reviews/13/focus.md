# Section 13: Focus

Pass 2026-11-25. `node tools/design-audit.mjs`: 182 states, 0 violations. Opened at full size at 412: the pictures named below, in the theme named. Laptop: only `today-laps-17-laptop-light` and `focus-task-laptop-dark`, cropped. The 471 set was not opened; the rest of the laptop set rests on the audit.
Opened: `focus-task`, `focus-nothing`, `focus-choose`, `focus-own` phone light, whole; the top 300px of `focus-chosen`, `focus-top`, `lap-ahead`, `paused`, `break`, `break-over`, `break-paused`, `lap-done-own`, `set-done`, `running-behind` light; `focus-task` dark; `focus-task-zoom`, `lap-ahead-zoom` light; last, `focus-long-break` and `long-break-paused` light and dark (files of 22:30, after the retake). Not opened: `focus-choose-top`, and the dark twins of the ten tops.

| Rule | Verdict |
|---|---|
| A count says of what: "Lap 2 of 4 in this set", "long break after lap 4" at its right | PASS in every state opened. |
| A count says of what: a short fifth mark in `rest` ending the bar, filled while the long break runs | FAIL while it is empty; PASS filled (`focus-long-break`: four full laps and a green mark). |
| Choosing the task on Focus: the two lines are a button, a sheet of today's open tasks and "Nothing in particular", no second start button | PASS. `focus-choose`, `focus-nothing`. |
| A task's own lengths: said on Focus where the length is shown | PASS. `focus-own`: 50:00 and "This task has its own lengths." |
| Free space, one action row | PASS. |
| Nothing breaks when zoomed | FAIL, one. |

## FAIL

1. **The empty fifth mark is not in `rest`.** `focus-task-phone-light` and every lap state: the mark is the grey of an empty lap, so the bar reads as five laps with the last cut short. DESIGN.md: "Focus's bar ends in a short fifth mark in `rest`". Draw it hollow with a `rest` line when empty, as a rest day's ring is, and filled when the long break runs.
2. **At 200% a word breaks inside.** `lap-ahead-zoom-light`: "6 minutes ahead of last Tuesda" / "y." DESIGN.md, Task row, says a title "breaks between words and never inside one"; a headline deserves the same. Step the headline down at that width.
3. **Small, words. A paused long break says "lap 1 of 4 in this set next".** `long-break-paused-*`: the four laps drawn full are the set that is over; lap 1 belongs to the next. Running, the same break says "lap 1 next", which is right. Say that in both.

## Question 3

With the words, no: "Lap 2 of 4 in this set" and "5 of 8 laps today" cannot be confused, and four segments against eight helps. The mark does not yet help: empty, it is one more grey stub. Hollow in `rest` it would say "something else comes after these four" at a glance, which is its job.

# Section 5: Progress

## Second pass, 2026-11-25. Verdict: PASS

Pictures retaken 05:10; every finding read again from the running demo at 05:25.
`node tools/design-audit.mjs`: 109 states at 412, 471 and 1440, 0 violations.

| # | Finding | Now | Measured |
|---|---|---|---|
| 1 | The phone page scrolls | Fixed. | Document 915 of 915 at 412x915, in four states. |
| 2 | The year is a stamp | Fixed. | 24px cells: grid 68 to 354 of a 308px place on the phone; on the laptop the figures start 24px after the grid (598, 622). |
| 3 | A full year does not fit the laptop | Fixed. | The panel runs 264 to 1408; grid 756px in a 756px window, nothing scrolls. |
| 4 | A project's figure floats | Fixed. | Name text and figure end on the same line in every row (2613, 2614), with or without a square. |
| 5 | The dashed line through your total | Fixed. | Ahead, "8h 20m" stands over its dot; on the first day "25m" stands clear of the 0h line. |
| 6 | "16:00" left of its hour | Fixed. | Label 311.9 to 342.9, centred on the tick at 327.4. |
| 7 | "Lap set aside" on two lines | Fixed. | 21px tall in both rows on the laptop. |
| 8 | The streak's figure off the edge | Fixed. | `margin-left` -2.5px on the 44px figure. |
| 9 | Time per project, all time | Built. | "15 laps, up 1h 15m on the week before, 61h 15m in all". |
| 9 | Estimate accuracy over time | Built. | A small line of the weekly ratio against 1.0, "from Mon 5 Oct" to "this week", ending in its dot and "1.3". Hand-drawn, no legend. |
| 10 | The headline's doubled number | Fixed. | "One lap behind last week. Last week ended on 15h 50m." |

Also done from the rulings and the words: "Count again" from the first second, "This week" as the
chart's heading in a first week, "A line or two about today".

Still as it was, by decision: the look back is 2,200px down the phone page until section 6 links to it.

## First pass, 2026-11-25 (kept as written). Verdict then: FAIL

Pictures: 192 in `reviews/5/shots/`, 16 states at phone, wide (471x1020), small, laptop,
phone-full and laptop-full, light and dark. Every one opened: the full pages in light at reading
size, the rest and the dark sets as sheets. Beside `design/routes/b-pacer/screens/progress-*`.
The pictures were taken 04:00 to 04:04 and the lane's files changed until 04:32, so every number
below was read again from the running demo at 04:34 with `getBoundingClientRect()` and from 2x
captures scanned for the first inked pixel. `node tools/design-audit.mjs`: 73 states, 0 violations.
None of the problems below is one the audit can see; three of them it should (see the end).

The screen is the right screen: it opens with a finding, the chart is drawn by hand, nothing
scolds, no tile, no donut, no gradient. It fails on one bug, on the year grid, and on six small
things a careful eye lands on.

### Problems

1. **On a phone the whole page scrolls, not only the content.** Progress at 412x915: the document
   is 1403px tall (1455 at 360x640); scrolled to its end the bottom bar sits at y=362 with bare
   ground under it. Today, Focus and Settings measure 915. Cause: `progress/day.tsx:116`,
   `<p class="sr" role="status">`, is `position: absolute` with no positioned box between it and
   `body`, so it lies on the body 1403px down. DESIGN.md Layout (the bar stays at the bottom);
   taste gate, Function. Fix: `position: relative` on the shell's scrolling `main`, once, so no
   hidden line can ever stretch the page.
2. **The year is a stamp, and on the laptop it leaves a hole.** With ten weeks of history the grid
   is 154px wide (x 68 to 222) in a 340px panel on the phone and in a 715px panel on the laptop,
   where 274px of nothing lies between its right edge (466) and the three figures (740). Taste
   gate, Rhythm: the largest gap lies between things that belong together. A finger also covers
   about nine 14px squares, and a tap is how a day is chosen. Fix: ruling (a) below.
3. **A full year does not fit the laptop.** `progress-year-laptop-*`: the grid is 756px, its window
   445px, so 31 of 54 weeks show and the rest is a sideways scroll with a mouse. DESIGN.md Layout:
   "Nothing scrolls sideways". Fix: when the weeks outgrow the half panel, the year panel runs the
   width of the canvas (1144px holds 53 weeks at 14px with the figures beside it).
4. **A project's figure floats above its name.** Every row with a colour square: name text y 2520
   to 2539, figure box 2502 to 2530, so the figure's baseline is 10px above the name's. The
   "No project" row, which has no square, is level (2709 to 2728 against 2701 to 2730). Both are
   in one list in `progress-long-project-*` and `progress-many-projects-*`. Cause:
   `.name` is an inline-flex box and takes its baseline from the square. Taste gate, same job same
   look. Fix: the name's text gives the baseline (the square inline before the text, or
   `align-items: baseline` on `.name`).
5. **Ahead of last week, the dashed line runs through your total.** `progress-ahead-phone-*`: the
   ghost line crosses "20m" of "8h 20m"; on the laptop it touches the figures' feet. On the first
   day "25m" sits on the 0h line. DESIGN.md, the week's chart: a line is labelled where it ends,
   and the label has to be readable there. Fix: the label goes above the dot when your line is the
   upper one or near the floor, below and right as now when it is the lower one.
6. **"16:00" stands 15px left of four o'clock.** The lane runs 10:00 to 17:00; the 16:00 tick is at
   x=327 on the phone and the label spans 296 to 327 (laptop: tick 893, label 862 to 893), so the
   15:30 lap sits centred over the word "16:00". Cause: `day.module.css:18` end-aligns the last
   label wherever its tick is. Fix: end-align only a label whose tick is the lane's right end.
7. **"Lap set aside" breaks into two lines on the laptop.** `progress-aside-laptop-*`: the label is
   42px tall (21px in every other row) while the title beside it is cut with an ellipsis. Fix:
   the kind never wraps; the title gives way.
8. **The streak's figure is not on the edge.** Ink of "60", "36", "316", "1" at x=38.0 to 38.5; the
   dots under it at 36.0, the heading and the sentence at 36.5 (laptop 1053 against 1051).
   DESIGN.md, One left edge: 0.047em of 44px is the 2px missing; `margin-left` computes to 0.
   Fix: `--layout-figure-bearing` on the streak figure, as Focus does for the timer.
9. **Two rows of PRODUCT.md are half built.** See the table. Fix: build them or change the rows;
   that is the lead's and the user's call, not the lane's.
10. **The headline says one number twice.** "3 laps behind last week. 3 laps draw you level." and
    "One lap behind last week. One lap draws you level." The second sentence only earns its place
    while a lap runs ("The lap you are in now draws you level."). Voice: no padding. Fix: with no
    lap running, the second sentence carries a new fact, as ahead and level already do: "3 laps
    behind last week. Last week ended on 15h 50m."

### PRODUCT.md section 3, row by row

| Row | Delivered | Where |
|---|---|---|
| A year heatmap of focus time | Yes on the phone; on the laptop only 7 months of a year show (problem 3). Steps are laps, said in the key. | `progress-year-*` |
| This week against last week, per day and in total | Yes. Running totals day by day, last week's total at the end of its line, "by this time on Tuesday" under it. | every state |
| Time per project, this week and all time | Half. The last 7 days and the 7 before; no all-time figure anywhere. A line can carry it: "15 laps, up 1h 15m on the week before, 61h in all". | `progress-many-projects-*` |
| Estimate accuracy over time | Half. One ratio and the last five tasks; nothing says whether the guesses are getting closer. One clause would: "about 1.3 laps for each one you guess, 1.6 a month ago". | Estimates panel |
| A day timeline, with interrupted and "ran on two devices" marks | Yes. "Stopped lap" in words, two rows in the lane and "ran on two devices" in the row. | `progress-*-full-*` |
| A forgiving streak, "41 of the last 45" after a miss | Yes. The rule is said in one line; after a miss "36 of the last 45 days". | `progress-miss-*`, `-run-*`, `-nothing-*` |
| Personal bests: best day, best week | Yes. | Streak panel |
| A short end-of-day look back | Yes: the total, the tasks done, one field. It sits 2,200px down the phone page. | `progress-note-*` |

### The Look table

| Row | Result |
|---|---|
| Tells (KPI tiles, gradient areas, donuts, chart-library look, scolding) | Pass. Three figures beside the year are text on the panel, not tiles. |
| Squint | Pass. The headline, then the chart. |
| One left edge | Fail: problem 8. Page and panels otherwise hold 20/36 on the phone, 264/280 on the laptop. |
| Rhythm | Fail: problem 2. Panels 24 apart, parts 16, measured. |
| Free space | Pass. The right column ends 400px above the left, at the bottom of the canvas. |
| Pressable | Pass. "Set aside", "Count again", "Back to today" are underlined links, 48px tall. |
| Same job, same look | Fail: problem 4. The estimate and look-back rows use Today's squares and count, good. |
| Dark | Pass. Same hierarchy; the "none" square is close to the surface but the audit holds its contrast. |

### Rulings on the lane's decisions

- **(a) 12px cells: overturned in part.** 12px with 2px gaps is right when a year has to fit, and
  the full year on the phone looks right. It is wrong for the first five months of anyone's use
  and for a finger. DESIGN.md should hold two sizes, chosen by fit and not by device: 24px
  (2px gap) while the weeks fit their place at that size, 12px after. At 24px ten weeks fill the
  phone panel (286 of 308px) as the reference drew them and one finger lands on one day. Problem
  3 still needs the wider panel.
- **(b) Phone order: upheld.** What changes each lap is on top, and the year sits over the day it
  chooses. The DOM keeps the laptop's order (streak fourth), so a screen reader hears another
  order than the phone shows; put the DOM in the phone's order and place the laptop by grid area.
- **(c) Look back at the end of today's panel, no button: upheld.** A past day shows "The line you
  wrote that day". When section 6 builds the end of the day, link to this field; nobody scrolls
  past eleven rows to find it.
- **(d) Set aside changes the row in place: upheld, with one word instead of two.**
  `progress-aside-*` shows "Undo" on one set-aside row and "Count again" on the next. Same act,
  one list: use "Count again" from the first second.
- **(e) An unpressable axis and the same sessions as rows: upheld.** A 5-minute break is 4px wide.
- **(f) Last week's total over the end of its line, no legend, a sentence under: upheld.**
- **(g) After a miss, "N of the last 45 days", the miss never named: upheld.** The empty dot shows it.
- **(h) "running total", the first lap's date, the projects' total, dropped: upheld.** The sentence
  under the chart, the panel's heading and the figures say all three.
- **(i) Hand-drawn SVG from tokens: upheld.** Measured: chart 192px, dot 12px, line 2px, grid 1px.

### For DESIGN.md and tools (the lead)

- Heat cell: the second size, and one line that the year is the single thing allowed to scroll
  sideways, on a phone only.
- One left edge: say the bearing applies to `figure-lg` too. The audit accepts "0 or the bearing"
  for a figure, so it passed problem 8; from 40px up it should accept only the bearing.
- The week's chart: say where the label goes when the other line would cross it.
- A day's timeline: hour labels are centred on their hour.
- Audit: on phone states the document is as tall as the screen and no taller (problem 1).

### The words

Read against the Voice section, all of `strings.ts` `progress`.

- Good, keep: "Last week has nothing to race. This week becomes the one to beat." "A task takes
  about 1.3 laps for each one you guess." "25 minutes, counted nowhere". "Thursday the 19th was a
  rest day. Two a week keep the streak going." "10 of 10 with a lap, your steadiest day". Both
  empty panels say what to do and where.
- Problem 10, the doubled number.
- "This week against last week" still heads the chart in a first week that has no last week.
  "This week" until there is one.
- "One line about today" takes 280 characters, four lines on a phone (`progress-note-*`). Say
  "A line or two about today" or stop at about 140.
- "Longest day 5h 0m": "5h" reads like a person wrote it.
- Nothing scolds. Behind is a count and a way back, a miss is never named, a rest day is a fact.

### Keep

The title of the page is the finding: "One lap behind last week. The lap you are in now draws you
level." in the place where every other app writes "Statistics". Whatever changes, the screen
opens with a sentence about this week against the last, never with a label.

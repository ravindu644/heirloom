# Section 4: Today, the list

## Second pass, 2026-11-25. Verdict: FAIL

All 252 pictures in `reviews/4/shots/` opened (phone, wide 471x1020, small, laptop, the full-page
and sheet-foot sets; light at reading size, dark as sheets). They were taken 03:16 to 03:25 and
`kit/task-row.module.css` changed at 03:54, so the row was measured again from the running demo
at 04:34. `node tools/design-audit.mjs`: 73 states, 0 violations.

All six findings are fixed. One of the fixes made a new problem, and it is the kind this pass
exists for, so the screen does not pass yet.

### The six findings

| # | Finding | Now | The picture |
|---|---|---|---|
| 1 | Numbers disagree after the bell | Fixed. "2h 30m, 6 laps", "6 of 8 laps today", K&R "3 of 4" with three squares, the same during the break. | `today-lap-over-phone-light`, `today-break-*` |
| 2 | Two loud buttons at lap-over | Fixed. The bar's "Start 5 min break" takes the `you` fill, the row's Start steps down; Pause and Resume are outlines on the ink bar. | `today-lap-over-*`, `today-running-*` |
| 3 | Project square beside the lap squares | Fixed. The project square stands alone at the left; the lap squares moved right, beside the count. | `today-phone-light` |
| 4 | The count outweighs the title | Fixed. `figure-sm`, measured 14px at 600. | `today-phone-light` |
| 5 | The last-tap bar covers its row, spans the canvas, shouts Undo | Fixed. As wide as the list, one line, underlined Undo, in the flow under the last row. | `today-added-laptop-light`, `today-after-*-phone-full-*` |
| 6 | An empty 50px band cuts the list | Fixed. The list runs to the bottom bar. | `today-running-phone-light`, `today-*-small-*` |

### Problems now

1. **The count is jammed against the row's control.** Next row at 412: "2 of 4" ends at x=295 and
   Start begins at 299, 4px apart, and the count (y 452 to 466) overlaps the button's lower edge
   (y 410 to 458) by 6px. In Later rows the count ends at 376, so one list has two right edges
   for the same number. The same at 471, 360 and 1440. In Recently deleted "1 of 1" ends at 324,
   4px from "Restore", and sits lower than the word; in ordering mode it sits under Up and Down.
   Taste gate, Rhythm and same job same look. Fix once in the kit row: with a trailing control
   the squares and count are centred on the control's height and `md` (16px) from it, as far from
   it as they are from the edge in a plain row.
2. **The bar keeps its second sentence and drops the name.** At 412: "Done: Read ... It comes back
   tomorrow.", "Deleted: Exercis... It keeps for 30 days." At 360 both halves are cut. The bar's
   job is to say which task. Voice: specific. Fix: the title keeps at least half the line; the
   second sentence is what gives way.
3. Small: at 360 the lap-over bar reads "Lap 2 of 4, ..." and loses "done".

### What the consistency pass changed

- The header: mark and name left, the person at the right as a 48px target into Settings, the
  same on all five screens and at 471. Sign out lives only in Settings. Good.
- Three kinds of button, all filled, and underlined links for the small acts. Nothing pressable is
  a bare word any more.
- At 471x1020 the list simply gains width; nothing floats.
- The black box around "Later today" in `today-after-delete-*` is the capture's keyboard focus
  ring. Tested with a tap and a click: no ring. Not a finding.

### Keep

Unchanged: past the estimate nothing changes colour. "6 of 5" is still six squares and a plain
figure.

## First pass, 2026-11-25 (kept as written)

Pictures: the 18 list states (`today-empty` to `today-after-delete`) at 412x915, 1440x900 and
360x640, light and dark, 108 in all. Every one opened, beside
`design/routes/b-pacer/screens/today-*`. Taken 02:18 to 02:20 from commit 615e847; the ui files
changed again at 02:33 (Undo now ten seconds, sheet closing), so retake after the fixes below.

A picture is one screen tall. On the phone that leaves Upcoming, Done, "Change the order" and the
"Recently deleted" link below the fold and unseen. I judged them on the laptop only.

### Verdict: FAIL

The plan is all here and most of it is in the product's own language. Six things to fix.

### Problems

1. **After the bell the numbers disagree.** `today-lap-over-*`: Done says "2h 30m, 5 laps", the
   target "5 of 8 laps today", K&R "3 of 4" beside four filled squares. `today-break-*`: Done is
   back to "2h 5m, 5 laps" while K&R stays at 3. Before the bell it was 5 laps and K&R at 2, so the
   day should read 6 laps and 2h 30m in both. This is the moment that says "that counted"
   (PRODUCT.md section 6) and the day's count is the number that must tick. Fix: one source for
   the rung lap in the tile, the target, the squares and the count; if it is only the demo's data,
   fix the data. Retake both states.
2. **Two loud buttons at lap-over, and the bar's button is the loudest thing on the screen.**
   `today-lap-over-*`: a white-filled "Start 5 min break" on the ink bar and a tomato "Start" on
   the Next row tie (taste gate, Squint). The reference draws the bar's button outlined on the
   bar. On Focus the break is the primary and skipping it is a text button; here it is the other
   way round. Fix: the bar's button is outlined on the bar in every state (Pause, Resume, break);
   at lap-over the break button takes the `you` fill and the row's Start steps down to secondary,
   so both screens offer the break first and skipping stays one tap.
3. **The project square and the lap squares are the same square.** Every row is one
   8px square, the project's name, then a run of 8px squares, and for the tomato project all of
   them are tomato (`today-phone-light`, Next row: a square, "C", two filled, two empty). It reads
   as a lap, a letter and two more laps. DESIGN.md Colors:
   the project square is "never alone", but here it is never apart either. Fix: the lap squares
   sit with the count they picture, at the row's right; the left line keeps project, date and
   when. See also "For DESIGN.md" below.
4. **The count outweighs the title.** Later rows set "0" in `figure-md` (26px) beside a 16px
   title; a day's list is a column of large zeros. The reference sets "2 of 4" small and bold, and
   "Up next" on Focus already does (`focus-next-laptop`, `figure-sm`). Fix: `figure-sm` for the
   count on every row.
5. **The bar that says what the last tap did covers what it is about.** `today-added-laptop-*`:
   it spans the whole canvas (1144px) and lies over the row it has just announced; Undo is a white
   fill 1100px from the box that was ticked. `today-after-repeat-small-*`: three lines tall, it
   covers the Next row's title and half of Start for ten seconds. Fix: as wide as the list
   column; the task's title clamps to one line so the bar is one row; Undo is the quiet underlined
   kind, as on Focus; give the list the bar's height of padding at its foot so the last row
   scrolls clear.
6. **An empty 50px band cuts the list on every phone.** `today-running-phone-light`: a row is cut
   at y=800, then ground to the bottom bar at y=850. It is the status strip, kept two lines tall
   so Focus's buttons never move; Today has no buttons there. At 360x640 it leaves 45px of list
   (`today-running-small-*`: half of one row). Fix: the strip keeps its lines on Focus only and
   closes to nothing elsewhere when it has nothing to say.

Not blocking:

- `today-*-small-*`: "Last Tuesday" wraps and its figure sits 17px lower than the other two.
  Fix: no wrap on the tile label ("Last Tue", as the reference's own rail has it).
- `today-ordering-phone-*`: with Up and Down in the row, "Thinking in React, steps 1 to / 3"
  leaves "3" alone. `text-wrap: pretty` on row titles.
- An empty day opens with two tiles of zeros (`today-empty-laptop`, 1144px of "0m"). Honest, and
  the reference's strip; consider no strip until something is planned or done.
- "Nothing on today yet." and "Everything on today is done." use "on today" as a noun. "Nothing
  planned for today yet." reads first time.

### PRODUCT.md section 2, row by row

| Row | Delivered | Where |
|---|---|---|
| Estimate, and done against it, on each task | Yes | squares and "2 of 4" on every row |
| Done may pass the estimate, no warning colour | Yes | `today-over-*`: "6 of 5", more squares, same tomato |
| A gentle nudge over 7 | Yes | sheet.md |
| Projects with a colour | Yes, with problem 3 | square and name on the row |
| Subtasks, one level | Yes, in the sheet | sheet.md; the row says nothing of them |
| Due date and repeat | Yes | date on the row ("tomorrow", "Fri 27 Nov"); the rule in the sheet |
| A day target with a bar that fills | Yes | `today-target-*`, `today-no-target-*`; "13 of 8" fills it and stays tomato |
| Optional "when" | Yes | "after dinner", "before bed" on the row |
| Quick add with the estimate inline | Yes | the field says how; `today-added-*` says what it understood |
| Recently deleted, 30 days | Yes | sheet.md |

Here and not in PRODUCT.md: a manual order ("Change the order"). The Next row needs one, so it
belongs, but it wants a line in the decision log. Notes on a task: see sheet.md.

### The Look table

| Test | Result |
|---|---|
| Squint | Fail at lap-over, problem 2. Otherwise the Next row and its Start lead. |
| One action | Pass by the letter (one `you` fill). The white fills on the bars compete, problems 2 and 5. |
| Reference | Strip, quick add, ink bar, tomato-outlined Next, section labels, struck Done: match. Drift: the box on each row, the 26px count, the bar's filled button, the target bar (new, and right). No shadow, no card in a card, no rounded bar. |
| Logo test | Pass, narrowly. Laps as squares, a target in segments, "Last Tuesday" in the strip and a tomato Next are nobody else's. A column of tick boxes, three tiles and a dark bar with Undo are everybody's; problems 2 to 5 are what tip it back. |
| Empty state | Pass. `today-empty-*`: the field, then "Add the first thing to work on, and guess its laps." No picture. |
| Thumb | Start on the Next row sits at y=406 to 454 of 915, upper half. The reference has it there and a list starts at the top; accepted. |
| Dark | Pass. Neutral ground, the bar inverts to a light slab as in the reference, nothing glows. |
| Tells | No floating add button, no "Are you sure?", no icon, no flame for a full target. Three tiles without icons come from the reference. |

### Rulings on the lane's decisions

- **No Start on any row while a lap counts or is paused: upheld.** It would end the lap. The Next
  row keeps its outline, so what is next is still marked.
- **A 48px box for done on each row: upheld.** Ticking off is what a plan is for, and two taps
  through the sheet is too far. It is the one stock control on the screen, so it must stay the
  only one, and DESIGN.md's Task row line must name it.
- **Reordering as a mode with Up and Down: upheld.** Rare, exact, works with a thumb, a keyboard
  and a screen reader, and needs no drag code. Show the phone's switch in a picture.
- **The day target as segments, one a lap, 24 at most: upheld.** It is the lap bar's own drawing,
  and it makes the day a longer set.
- **Laptop: list in two thirds, Upcoming, Done and Recently deleted in the rail: upheld for now.**
  No hole. When section 5 builds the rail's panels these go back under the list, where the
  reference has Done.
- **A dark bar with Undo for the last tap: the idea upheld, its drawing overturned** (problem 5).
- **Titles clamp at three lines; the repeat rule shows only in the sheet: upheld.**
  `today-long-*` holds. A repeating task says so when it is ticked ("It comes back tomorrow.").
- **A past due date as the plain date: upheld.** `today-carried-*`: "Sat 21 Nov", no colour, no
  "late". Voice rule 4.

### For DESIGN.md (the lead)

- **Task row** lists title, project, squares and "2 of 4". Add the done box and the count's size.
- **A project's colour** may be `you`, `rest` or `ghost`, but the same section says red means
  you, `rest` is "breaks and rest days only" and `ghost` is "never filled". Say the exception in
  those three lines, and decide whether `you` should be a project at all: on a row it is the
  colour of the laps beside it.
- **The lap in progress on a list** (the ink bar) and **what the last tap did** are components
  with no entry, and buttons on ink are a kind Buttons does not have.

### The words

Every string in `today` read against the Voice section.

- Pass: "Add a task. End with ~3 for three laps." Teaches the one trick where it is used.
- Pass: "Added: pointers chapter 3, 4 laps." Says what it understood.
- Pass: "Done: Read one chapter of OSTEP. It comes back tomorrow." What happened, then what is next.
- Pass: "Deleted: Exercise 5-3: strcat with pointers. It keeps for 30 days."
- Pass: "5 of 8 laps today", "13 of 8 laps today", "No target for today.", "4 tasks, 8 laps".
- Pass: "A lap for nothing in particular", "Change the order", "Keep this order", "Keep it".
- Fix: "Nothing on today yet." and "Everything on today is done.", above.
- No exclamation mark, sentence case throughout, no padding word, no em dash.

### Keep

Past the estimate nothing changes colour. `today-over-*`: "6 of 5" is six tomato squares and a
plain figure, and "13 of 8 laps today" is a full bar and a sentence. No amber, no "over", no
badge. A later change must not teach this screen to warn.

# Section 13: Today

Pass 2026-11-25. `node tools/design-audit.mjs`: 182 states, 0 violations. Opened at full size at 412: the pictures named below, in the theme named. Laptop: only `today-laps-17-laptop-light` and `focus-task-laptop-dark`, cropped. The 471 set was not opened; the rest of the laptop set rests on the audit.
Opened: `today`, `today-top`, `today-laps-17`, `today-laps-32` phone light; `today` phone dark (top); `today-adding`, `today-lap-over` light and dark (the field and the strip); `keyboard-1-typing`, `keyboard-1-gone` light; `today-zoom-zoom` light and dark; `today-laps-32-zoom-rows-a`, `-b`, `-c`, `today-laps-17-zoom-rows-a` light. Not opened: `today-laps-9`, the `*-squares-*` crops, the dark zoom rows.

| Rule | Verdict |
|---|---|
| Task row: eight squares to a line, up to four lines, never hidden | PASS. 17 is 8, 8, 1; 32 is four lines; 31 of 31 ends 8, 8, 8, 7. |
| Task row: a line of their own under the count and control when the title leaves no room, ending on the row's right edge | PASS. Measured at 412: in that form the squares end at x=376, the count's own right edge, in `today`, `today-laps-17` and `today-top`; the lowest square ends 8 to 11px inside the card. |
| Task row: over 32 the count alone | Not shown in what I opened. |
| Task row: the title breaks between words, two lines at most | PASS at 412 and at 200%. |
| Task row: under 280px the row's end goes under the words | PASS. `today-laps-32-zoom-rows-a`: count and Start under the title, squares under them. |
| Adding puts the keyboard away | PASS. `keyboard-1-gone`: field let go, bar at the foot. |
| A hint is an example | PASS. "Add a task", and under the field in use "Essay draft ~3 plans it at 3 laps." |
| A count says of what | PASS. "5 of 8 laps today"; the strip says "Lap 2 of 4 in this set, done". |
| Layout: nothing breaks when the phone is zoomed | FAIL, three things, below. |

## FAIL

1. **At 200% the bottom bar is one word.** `today-zoom-zoom-light` and every zoom picture: "FocusTodayProgressHabitsRoom", no space between the five. DESIGN.md, Layout: "a bottom bar of five labelled destinations". The words need 184px of 206; give them no side padding and `xs` between at that width.
2. **At 200% a figure is cut by an ellipsis.** `today-zoom-zoom-*`: the tiles read "Still pl..." and "1h ...", and the third tile is gone. A number is never shortened. DESIGN.md, Layout: "Nothing breaks down to 320 wide" stops at 320, and the Task row's rule already answers for 200%; the tiles need the same answer: stack them.
3. **At 200% the username is a sliver.** Every zoom picture: one clipped stroke stands between "heirloom" and the circle. Hide the name whole below the width that holds it.

## The five questions, the two that are Today's

1. Not a FAIL against a written rule: the count keeps the right edge in both forms, which is all DESIGN.md asks. It does break "same job, same look", because the count stands 19px from the card's top when the squares go under and 25px when they stand beside (`today-phone-*`, rows 1 and 2 of Later today). Change, in one sentence: the count stands on the title's line in both forms, the squares to its left when there is room and under it when there is not.
2. No. In the Next row the count is left of Start and the squares hang under Start, with the button between them (the count ends at x=283, the squares at 376); the squares read as Start's. When the squares take their own line, the count should go down with them, at the right edge with the squares to its left.
5. Acceptable: the strip does not grow. But it breaks as "Lap 2 of 4 in" / "this set, done", with a preposition left hanging. Keep the words and fix the break: "Lap 2 of 4" / "in this set, done".

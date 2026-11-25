# Section 4: the task sheet and Recently deleted

## Third pass, 2026-11-25. Verdict: PASS

The one thing left open is fixed in the shared row: in Recently deleted "1 of 1" is centred on
"Restore" and 16px from it (`today-deleted-phone-light`, retaken 05:11). Nothing else changed here.

## Second pass, 2026-11-25. Verdict: PASS

Pictures: `sheet-*`, `sheet-foot-{phone,wide,laptop}-*` and `today-deleted-*` in
`reviews/4/shots/`, all opened. `node tools/design-audit.mjs`: 0 violations.

| # | Finding | Now | The picture |
|---|---|---|---|
| 7 | Notes, a field PRODUCT.md does not have | Fixed. Gone. | `sheet-phone-light`, `sheet-laptop-light` |
| 8 | The foot of the sheet had no picture | Fixed. "Mark done" is secondary, "Delete" the quiet fill, no red. | `sheet-foot-phone-light`, `sheet-foot-wide-light`, `sheet-foot-laptop-light` |
| 9 | A deleted task did not say when it goes | Fixed. "gone on 22 Dec", "gone on 26 Nov". | `today-deleted-*` |
| 10 | The scrim did not use `state.scrim` | Fixed. `kit/sheet.module.css:23` mixes `ground` at `--state-scrim`. | `sheet-*` |

Still open, and counted against Today because the fix is in the shared row: in Recently deleted
the count "1 of 1" ends 4px from "Restore" and sits lower than the word (`today-deleted-phone-light`).

Keep, unchanged: the nudge under the number that caused it, a sentence with its own way out and no
warning colour.

## First pass, 2026-11-25 (kept as written)

Pictures: `sheet`, `sheet-subtasks`, `sheet-nudge`, `sheet-project`, `sheet-repeat` and
`today-deleted`, at 412x915 and 1440x900, light and dark, 24 in all. Every one opened. Taken at
02:19 from commit 615e847; `task-sheet.tsx` changed at 02:33 (a removed subtask now offers Undo).

### Verdict: FAIL

Two reasons: a field PRODUCT.md does not have, and the lower half of the sheet has no picture.
What can be seen is plain and right.

### Problems

1. **Notes is not in v1.** `sheet-*`: a "Notes" box closes the sheet. PRODUCT.md section 2 lists
   nine things and notes is not one; "a feature not on this page is not in v1". Fix: remove it, or
   the user adds it with a line in the log.
2. **The sheet's foot has never been photographed.** Every picture stops at Subtasks or Notes.
   "Mark done", "Not done after all" and "Delete" are in the code (a secondary and a text button,
   no red, no "Are you sure?") but nobody has seen them. Fix: one picture scrolled to the foot, at
   both sizes, with the longest subtask title.
3. **A deleted task does not say when it goes.** `today-deleted-*`: the note says 30 days; the two
   rows say nothing, so nobody can tell which has a day left. Voice rule 1, numbers first. Fix:
   each row carries its date ("gone on 24 Dec").
4. **The scrim does not use its token.** `sheet.module.css` mixes the ground with
   `--state-press * 2` of transparency, which is 52% ground; DESIGN.md has `state.scrim` at 48%
   and `tokens.css` carries it. Fix: use `--state-scrim`.

Not blocking:

- `sheet-repeat-phone-*`: seven day buttons break six and one, "Sun" alone. With `xs` between
  them (7 x 48 + 6 x 4 = 360) they fit the 372px line.
- `today-deleted-*`: a deleted row repeats the list's square, name, square (today.md problem 3).
- "Weekly" in PRODUCT.md is one chosen day here. True, but unnamed; no change needed unless the
  user looks for the word.
- The date field is the browser's own and reads "11/24/2026" in these pictures while the page
  says "Tuesday 24 November". It follows the device; leave it.
- Close is at the top right, out of a thumb's reach, but the phone's back, a tap on the page
  behind and Escape all close it (`sheet.tsx`). Enough.

### PRODUCT.md section 2, the rows that live here

| Row | Delivered | Where |
|---|---|---|
| An estimate in whole laps | Yes | a stepper, "2 laps", and "0 of 2 laps run" beside it |
| A gentle nudge over 7 | Yes | `sheet-nudge-*`: at 8 and up, one sentence in ink and "Add a subtask" in it. No colour, no icon, nothing blocked |
| Projects with a colour | Yes | chips with square and name; "New project" opens in place with five squares |
| Subtasks, one level | Yes | `sheet-subtasks-*`: a box, the words, Remove. No way to nest |
| Due date and repeat | Yes | Due; Repeats: No, Every day, On chosen days with the seven days |
| Optional "when" | Yes | "When in the day", with PRODUCT.md's own "after dinner" as the hint |
| Recently deleted, 30 days | Yes, with problem 3 | `today-deleted-*`: one sentence, the rows, Restore |

### The Look table

| Test | Result |
|---|---|
| Squint | Pass. A form with no loud part; nothing in it is a `you` fill. |
| One action | Pass. No primary: every edit is kept as it is typed, and the row behind changes with it (`sheet-nudge-laptop`: nine squares behind the sheet). |
| Reference | None for a sheet. DESIGN.md: up from the bottom on the phone, a centred panel on the laptop, one shadow, the page fading toward the ground. All so. |
| Logo test | Pass by the words: "9 laps is a lot to hold in one task", "A smaller piece of it", "Not done after all". The form itself is any form, which a form may be. |
| Dark | Pass. The sheet has a line for an edge where the shadow cannot be seen; the page behind fades down, not to grey. |
| Tells | No "Are you sure?", no save button, no red Delete, no priority, no assignee. |

### Rulings on the lane's decisions

- **The five squares named Tomato, Green, Ink, Grey, Rose: upheld.** Plain names for a screen
  reader. Whether Tomato should be among them is DESIGN.md's (today.md).
- **The scrim as the ground at about half: upheld.** `sheet-laptop-light`: the page steps back
  and stays readable, and the sheet stands by its white and its one shadow. Dimming to black
  would have been the stock answer.
- **The repeat rule only here: upheld** (today.md).

### The words

Every string in `task`, and `binTitle`, `binNote`, `restore`.

- Pass: "9 laps is a lot to hold in one task. Break it down and each piece is easier to start."
  A fact, a reason, one thing to do. The best new line in the section.
- Pass: "A smaller piece of it", "Its name", "Not done after all", "Mark done".
- Pass: "A deleted task keeps for 30 days, then it is gone for good."
- Pass: "0 of 2 laps run", "On chosen days", "When in the day".
- No exclamation mark, sentence case on every button, no padding word, no em dash.

### Keep

The nudge. It appears under the number that caused it, says why in one breath, carries its own
way out as a link inside the sentence, and stops nobody. Do not turn it into a warning colour, a
dialog, or a limit.

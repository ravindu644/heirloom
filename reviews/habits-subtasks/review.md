# Habits (A1) and Today's subtasks: design review

Reviewed 2026-11-28 on the 60 shots in `shots/`, the built demo (measured with
`getBoundingClientRect` and text ranges, phone 412 and laptop 1440), frames of both folds
opening, and `node tools/design-audit.mjs`: 290 states, 0 violations. Compared with A1 in
`reviews/habits-options/a-variations.html` and with `reviews/today-options/subtasks-2.html`,
both rendered. The build matches both drawings closely: same edges, same rows, same words.

## Verdict: FAIL, on one layout case and two screen reader names

The pictures pass. The fails are a long title squeezed by many squares (`habits-top`, not one of
the 15 but an audit state) and two box names that say something untrue.

## Alignment, measured

The user's complaint was three left edges in one row. Now every row has exactly two, at both widths:

| | control centre | title | line under | round / subtask words | week |
|---|---|---|---|---|---|
| Habit, once a day (box) | 28 | 56 | 56 | - | 56 phone |
| Habit, counted (arrow) | 28 | 56 | 56 | 28 box / 56 words | 56 phone |
| Task with subtasks | 28 | 56 | 56 | 28 box / 56 words | - |

On the laptop the week stands in its own 240px column at x 491 of the row in every row. That is
the same in every row and matches the drawing. All controls are 48x48. The round and subtask rows
are 48 tall. The fold link is 48 tall, made by padding. The arrow turns and the rows open over
about 160ms (sampled frame by frame on the built app), and what is under them glides.

## Per state

| State | Verdict | Note |
|---|---|---|
| habits-rounds | PASS | Arrow at 28, squares and "3 of 5" end the title's line. |
| habits-rounds-open | FAIL | Look passes. Round boxes are named "..., check in" (see F2). |
| habits-round-tick | FAIL | Look passes. "Checked in: Check Gmail, 4 of 5." is good. F2. |
| habits-round-back | FAIL | Look passes. F2. Also see W1. |
| habits-rounds-done | PASS | 5 of 5, run goes 9 to 10, heading 4 of 7. |
| habits-rounds-two | FAIL | Both open at once, as specified. F2. |
| today-subtasks | PASS | "2 of 4 subtasks" and arrow after the project, box stays the task's. |
| today-subtasks-open | FAIL | Look passes: struck in `muted`, kept in place. F3. |
| today-subtask-tick | FAIL | F3. Phone bar drops ", 3 of 4 subtasks." (W2). |
| today-subtask-untick | FAIL | F3. |
| today-subtasks-all | PASS | "4 of 4 subtasks" beside an empty box and Start reads as "pieces done, task not". |
| today-subtasks-both | FAIL | F3. Two open at once, both 28/56. |
| sheet-subtasks | PASS | Rows of words, Remove at the end, "Add a subtask" field, 8px apart. |
| sheet-subtask-edit | PASS | Field where the row stood, same height, ink edge while typing. |
| sheet-subtask-removed | PASS | "Removed: Rewrite with two pointers." with Undo holds the row's 48px slot. Today behind it reads 1 of 2. |
| habits-top (extra) | FAIL | F1. |

## Findings

- **F1. A long title squeezed by the squares** (`habits-top`, phone): twenty squares stand
  three lines tall at the end of the title's line, and the 60-character title is cut to three
  lines ending "send it to the…". This breaks DESIGN.md Task row ("the title always has its
  room ... whatever is at the right gives way first"), which the Habit row follows ("as a
  task's laps"), and taste-gate section 10 ("Squares sat squeezed beside a long title"). Fix:
  under 720px, put the pair at the right end of the plan line ("Every day, 2 days in a row"), as
  the task row does in a narrow row, and give it a line of its own only when that line is full.
  Keep it beside the title from 720px.
- **F2. A round's box is named untruthfully** (`habits.roundCheck`, every open counted habit).
  A ticked box is named "Check Gmail, 08:00, check in", but a tap takes a check-in back. An
  empty 5th box is named "5th time", but a tap ticks the 4th. This breaks DESIGN.md Accessibility,
  "Nothing is announced that is not so". Fix: drop the verb, `${title}, ${time ?? ordinal time}`,
  and let `aria-checked` give the state.
- **F3. A subtask's box says it is done when it is not** (`today.subtaskCheck` = "Read 5.1 and
  5.2, done", on an unticked box). It breaks the same rule, and it words the job differently from
  the task's own box ("Done: <title>", `today.check`). Fix: use `s.today.check(sub.title)` and
  delete `subtaskCheck`.

## Watch (not fails)

- **W1.** In `habits-round-back` the tap lands on 08:00 and 16:00 comes off. That is the rule
  ("a tap on a ticked box takes back the latest") and the drawing's caption, but the box tapped
  does not change. Give it to the stranger's walk. If it is asked about, only the latest ticked
  box should take a press to untick.
- **W2.** On the phone the subtask bar reads "Done: Exercise 5-3 with pointers only." Its tail
  ", 3 of 4 subtasks." is dropped by the bar's rule (the tail shows whole or not at all), so it
  reads the same as finishing a task. The struck row is in view, so this is tolerable. The
  laptop shows the whole line.
- **W3.** "16:00 done at 13:55" and, in `habits-top`, "21:30 done at 07:00": a reminder time is
  paired with whichever check-in came that many times in. The rule is in DESIGN.md and the user
  picked it, but on screen it reads odd. Ask about it in the stranger's walk.
- **W4.** `opens.module.css .line span` writes the kit link's look (label, muted, underline,
  ink on hover) a second time. Use `kit/button.module.css .link` so the two cannot drift. The
  drawing had these words in ink; muted matches every other link in a line, so keep muted.

## DESIGN.md's to fix

- Habit row: "where the title, the line under it, a round's words and the week all start" is
  true only under 720px. Add: "from 720px the week stands in a column of its own at the row's
  right end, beside the words, the same x in every row; the rounds open under the words."

## Words

Every string was read against the Voice section. "Every day, 9 days in a row", "Every day, 24 of
the last 30 planned days", nothing said for a run of 1, "No time set", "done at 08:12",
"Checked in: Check Gmail, 4 of 5.", "Taken back: Check Gmail, 2 of 5.", "2 of 4 subtasks",
"Removed: Rewrite with two pointers." with Undo, and "Add a subtask" are all plain, specific and
counted. None scolds or pads, and there are no exclamation marks. The only wrong words are the
two hidden names, F2 and F3.

## Keep

Two edges, 28 and 56, in every habit, every round and every subtask, measured the same at 412
and 1440. They come from one kit piece (`kit/opens.tsx`: `Opens`, `Shorts`, `Short`), shared by
Habits and Today. A later screen that opens rows in place must use it, not draw its own.

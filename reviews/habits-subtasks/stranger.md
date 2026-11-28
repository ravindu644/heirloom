# Habits rounds and Today's subtasks: the stranger's walk

Walked on the built demo at 412x915 and 1440x900: habits-rounds, -open, round-tick, round-back,
rounds-done, rounds-two; today-subtasks, -open, subtask-tick, -untick, -all, -both; sheet-subtasks,
sheet-subtask-edit, sheet-subtask-removed; plus habits-sheet-20 and the long subtask of
sheet-subtasks as extremes. Every finding was pressed in the browser and traced in the code.

## Habits

1. **The box you tap is not the box that changes.** habits-round-back: tapping the ticked 08:00 box
   leaves 08:00 ticked and unticks 16:00. Likewise, with 3 ticked, tapping the 5th box ticks the 4th.
   A stranger thinks "I unticked 08:00" and then sees it is still ticked: is it broken? The rule
   (rounds fill in order, a tap on a ticked box takes back the latest) is only in DESIGN.md.
   `round()` in habits/habits.tsx. Fix: make only the next empty box and the latest ticked box
   pressable (the others drawn but inert), so a press always changes the box under the finger.
   **confuses**
2. **"16:00 done at 13:55".** The 3rd check-in, made at 13:55, is shown on the 16:00 row. A
   stranger reads the times as slots: "I didn't do the 16:00 one yet". At 20 a day
   (habits-sheet-20) it reads "22:00 done at 08:00". Fix: on a ticked round show only "done at
   13:55" and keep the reminder time for the rounds still to come. **confuses**
3. **The screen-reader name of a ticked round says "check in".** `roundCheck` gives every round
   "Check Gmail, 08:00, check in", ticked or not, but a ticked one takes a check-in back. Fix: a
   ticked round says "take back the latest" in its name. **confuses** (screen reader)
4. **The habit's sheet can take a check-in back but not make one.** Tap the row of a counted habit
   (where a once-a-day habit has its box) and the sheet says "3 of 5 today." with "Take one back",
   and no way to check in. That is also a second "take back" beside the round boxes and the bar's
   Undo. Fix: drop "Take one back" from the sheet of a counted habit; the rounds are where a
   day's count is changed. **confuses**
5. **"3 of 5" squares open the sheet, not the times.** Tapping the count at the title line's end
   (the most "progress"-looking thing on the row) opens the habit's sheet, while the times hide
   behind a bare arrow on the other side. Fix: let the count and its squares toggle the rounds
   too, as "2 of 4 subtasks" does on Today. **confuses**
6. **A bare arrow where every other habit has its box.** Closed, a counted habit shows a chevron
   with no words in the box column, and at 5 of 5 (habits-rounds-done) still a chevron, never a
   tick, though the heading counts it as done. A stranger scanning for ticks thinks Check Gmail is
   not done. Today puts the same arrow after words ("2 of 4 subtasks ▾"); Habits puts it alone in
   the box column. Fix: at the day's full count draw the box ticked in that column, and the
   arrow after the "3 of 5" count, as on Today. **nit**
7. **"9 days in a row" counts only full days and skips rest days.** On Check Gmail at 3 of 5 it
   says 9; at 5 of 5 it says 10. A partial day never counts, and up to two empty days a week are
   rest (protocol section 8), so "in a row" can span missed days. The habit's sheet explains rest
   ("A ring is a rest day") but the row does not. Fix: for a counted habit say "9 full days in a
   row"; the ring on the week already marks rest. **nit**
8. **Seventeen "No time set" rows.** At 20 a day, the open list is 17 identical "No time set"
   rows. Fix: an untimed round says which one it is ("4th", "5th") in muted. **nit**

## Today's subtasks

9. **Tapping a subtask's words opens the task's sheet at its top.** In today-subtasks-open a tap
   on "Read why a[i] is the same as *(a+i)" opens the parent task's sheet at Title, and the
   subtask is not ticked. A stranger expected the tap to tick it (like most checklists) or to
   edit it, and gets a form whose Subtasks section is below the fold at 412 and at the sheet's
   foot at 1440. Fix: the words of a short row tick its box (the label wraps them), as the
   round's words would. **confuses**
10. **Renaming, adding and removing are only in the sheet, and nothing on Today says so.** The open
    list has no add, rename or remove, and a task with no subtasks has no sign that they exist.
    The only way in is to open the task and scroll past Repeats. Fix: one muted line under an
    open list, "Change them in the task", that opens the sheet scrolled to Subtasks. **confuses**
11. **The sheet does not show which subtasks are done.** sheet-subtasks: "Write it with array
    indexes first" is done, yet in the sheet it looks the same as the open ones: no box, no strike.
    A stranger who ticked it on Today opens the task and thinks the tick was lost. Fix: strike a
    done subtask's words in the sheet as Today does (still no box). **confuses**
12. **Ticking every subtask does not finish the task, and on the phone nothing says so.** Ticking
    the last subtask shows "Done: Read why a[i] is the same as *(a+i)." At 1440 the bar adds "4 of
    4 subtasks."; at 412 that tail does not fit and is dropped. The row then shows "4 of 4
    subtasks" beside an empty box, still Next. A stranger thinks the task is done, or that the app
    missed it. Fix: when the last subtask is ticked, the bar says "All 4 subtasks done. Tick the
    task to finish it." as its whole sentence, so it is never cut. **confuses**
13. **"Done:" means a task and a subtask.** The bar uses one lead for both. With Exercise 5-3 in
    Later, "Done: Exercise 5-3 with pointers only." reads as that task finished. Fix: lead a
    subtask with "Ticked:". **nit**
14. **Two "2 of 4" on one line.** The Next card's line reads "C  2 of 4 subtasks ▾ ... ■■□□ 2 of
    4": one counts subtasks and the other laps, side by side at 1440 and one line apart at 412.
    Fix: none needed in words, but keep the noun on the subtask count (it has it) and never drop
    it for room. **nit**
15. **A task ticked with subtasks open keeps them open.** today-subtasks-open, tick K&R: the bar
    says only "Done: K&R...", and in Done the row stays "2 of 4 subtasks" for good. Fine by the
    rule, but nothing says the two open ones stay open. Fix: none; noted so it is a choice.
    **nit**
16. **Reordering subtasks is press and hold, unsaid.** Today says "Press and hold a task to
    move it."; the sheet's subtask list says nothing. Fix: the same hint line under the subtasks
    in the sheet when there are two or more. **nit**

## Shown twice, or needing the data model

- Take back a check-in: the round box, the bar's Undo and the sheet's "Take one back" (finding 4).
- "Rounds fill in order" and "a time belongs to the nth check-in" are in DESIGN.md and the
  sheet's reminder note, not on the row (findings 1 and 2).
- "in a row" depends on section 8's rest days and on full days only (finding 7).
- Nothing else shown twice: opening a second row leaves the first open, as intended
  (habits-rounds-two, today-subtasks-both); the sheet's Removed line with Undo stands where the
  subtask stood and the row behind updates to "1 of 2 subtasks" at once.

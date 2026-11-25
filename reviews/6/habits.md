# Section 6: Habits

## First pass, 2026-11-25. Verdict: FAIL

Pictures: 120 in `reviews/6/shots/`, 12 states at phone, wide (471), small, laptop and phone-full,
light and dark. Every one opened: the light phone pages and four laptop states at reading size,
the rest as sheets. Beside `design/routes/b-pacer/screens/habits-*`. Taken 05:03; measured again
from the running demo at 05:30. `node tools/design-audit.mjs`: 109 states, 0 violations.

The list is right: a finding for a title, one box to tap, a week you can read at a glance, and
"24 of 30 planned days" where another app would print a broken streak. Five things to fix.

## Problems

1. **In the sheet nothing says which days are on.** `habits-sheet-*`: an every-day habit shows
   seven grey buttons with a dark border. On is `raised` plus an ink border, off is `surface` plus
   a `line` border (`kit/form.module.css:23`); with all seven on there is no off to compare with,
   and `raised` is the fill of a quiet button everywhere else and of the dead "Cheered" in Room.
   DESIGN.md Accessibility (never colour alone); taste gate, Pressable. Fix: a chosen day is
   `ink` with `ground` text, an unchosen one the secondary button it is now.
2. **The bar cuts its second sentence after two words.** `habits-after-delete-phone-*`:
   "Deleted: Lights out by 00:30. It keeps..." Today's bar now gives the line to the title and
   drops the rest. Voice: no half sentences. Fix in `kit/said`: the tail shows whole or not at all.
3. **"Archived, 1" and "Recently deleted, 1" stand 64px apart.** Phone: targets at y 1212 to 1260
   and 1276 to 1324, so the two lines of words are 64px from each other, and the same in the
   laptop's right column (318 and 382). They are one thought, the habits put away. DESIGN.md
   Rhythm: related things `xs` or `sm` apart. Fix: one line, the two links `md` apart.
4. **The demo's one-habit state contradicts itself.** `habits-one-*`: one habit, no check-in, and
   under it "This week 7, last week 8. One more draws you level." The week comes from a constant
   in `demo-more.ts`. If only the demo can show this, fix the demo; the user will open it.
5. **"Habit" is written twice.** `habits-sheet-*`: the sheet's title and, 56px under it, the
   label of its first field. Fix: the field is "Its name", as in Room's sheet.

## PRODUCT.md section 4, row by row

| Row | Delivered | Where |
|---|---|---|
| Habits with chosen weekdays and a count per day | Yes. "Days" and "How often in a day" in the sheet; the row says "Weekdays", "Mon, Wed, Fri" and "2 of 3". | `habits-sheet-*`, `habits-many-*` |
| One tap to check in | Yes. The box; a counted habit fills a third of today's lane per tap; Undo in the bar. | `habits-checked-*` |
| A small heatmap per habit, with the same forgiving streak | Yes. The week on the row, the whole record in the sheet at 24px, "9 days running" or "24 of 30 planned days". | `habits-sheet-*` |
| A reminder time per habit | Yes, as a field. The platform's time field reads "--:-- --" with AM and PM in this browser while the app writes 16:40 everywhere else; see DESIGN.md's list. | `habits-sheet-*` |

## The Look table

| Row | Result |
|---|---|
| Tells | Pass. No streak flame, no badge, no percentage ring. |
| Squint | Pass. The finding, then the boxes. |
| One left edge | Pass. 20 and 76 on the phone, measured. |
| Rhythm | Fail: problem 3. Rows 8 apart, panels 24, measured. |
| Pressable | Fail: problem 1. |
| Same job, same look | Pass. The box, the bar, the bin and the ordering are Today's. |
| Dark | Pass. |

## Rulings on the lane's decisions

- **The task row's box, not the reference's circle: upheld.** Same job as Today's done box, so the
  same control.
- **"2 of 3" beside the words: upheld.** `figure-sm`, on the title's line.
- **The week as seven lanes under M T W T F S S: upheld.** Measured: each letter's centre is
  within 0.1px of its lane's centre at 412 and 1440 (M: letter 90.9 to 99.9, lane 76 to 114.8);
  lanes 24px tall, 4px apart, 5px under the letters. Done, part done, rest ring, thin line and
  today's outline are five shapes, not five colours.
- **Everything but the box opens the sheet: upheld.** The row is a painted box.

## The words

- Keep: "3 of 6 today. Three left." "6 of 6 today. None left." "24 of 30 planned days". "An
  archived habit keeps its record and asks for nothing." "Add the first thing you want to do most
  days. One tap a day checks it in." "On the days it is planned, until it is checked in."
- Problems 2 and 5.
- "Add a habit. It starts as every day, once." reads twice before it lands. "Add a habit. It
  starts as once a day, every day."
- Nothing scolds. Yesterday is never mentioned.

## Keep

"Every day, 24 of 30 planned days" on a row that missed a day. The count never resets to zero in
front of the person; a later change must not bring a broken streak back.

# Section 8: Settings and the marks

## First pass, 2026-11-25. Verdict: FAIL (Settings), PASS (the marks)

Pictures: 140 in `reviews/8/shots/`, 14 states at phone, wide (471), small, laptop and phone-full,
light and dark. Every one opened: Settings and five marks at reading size, the rest as sheets.
Taken 05:03; `strings.ts` changed at 05:22, so the words were read from the file and the
positions from the running demo at 05:30. `node tools/design-audit.mjs`: 109 states, 0 violations.

## Problems (Settings)

1. **"Back" hangs under the heading and stops short of the edge.** `settings-phone-light`,
   scanned: "Settings" stands on y=79, "Back" on y=86, 7px lower (55 and 62 on the laptop); its last letter ends at x=383
   and the panels at 392 (442 against 451 at 471, 795 against 804 on the laptop). DESIGN.md, Links in a line: the target is made
   by padding and an equal negative margin. Here the 48px box is laid out as it is, and the word
   sits in its middle. Fix: the word shares the heading's baseline and ends on the column's edge.
2. **The two rows under "Starting by itself" are looser than every other switch row.** Heading to
   the first row's words: 29px (16 under "Rooms"). First row's words to the second's: 41px (16
   between rows that carry notes). A row without a note is stretched to the 48px of its box.
   DESIGN.md Rhythm; same job same look. Fix: a row is as tall as its words, the box takes its
   48px by padding and negative margin, rows sit `md` apart with or without a note.
3. **25 minutes to 50 is 25 taps.** One minute a tap, three times over, and "20 hours" in a room
   the same. Taste gate, Function. Fix: the lead's lean is right, see the ruling.
4. **On the laptop the page is one 540px column, 1,866px long, beside 600px of empty canvas.**
   DESIGN.md Layout: on a laptop the free space lies at the bottom. Fix: two columns at 1440.
   What you tune (laps and breaks, day target, starting by itself, the bell, a finished lap) on
   the left; who and where (account, rooms, your copy) on the right.

## PRODUCT.md sections 6 and 7, row by row

| Row | Delivered | Where |
|---|---|---|
| A completion moment when a lap rings | Yes, reviewed in section 2; the mark is one line under it. | `mark-*` |
| A set of four finished: a bigger moment, once | Yes, section 2. | |
| Milestones with names that have a sense of humour, our own words | Yes. Eight lines, a lap as 400 metres of track. | `mark-first` to `mark-2500` |
| A task done within its estimate, a personal-best week: marked when they happen | Yes. "That task: done in 1 lap. You guessed 2." over Today's bar; the week's line on the result. | `mark-estimate-*`, `mark-hundred-*` |
| Every celebration can be turned off | Yes. "Mark a finished lap"; off, the result is its numbers. | `mark-off-*` |
| Nothing for merely opening the app; no currency | Yes. Nothing. | |
| Works offline; a quiet indicator says which | Yes, section 2; here the status line repeats under a refused sign-in. | `settings-refused-*`, `settings-unsent-*` |
| Light and dark, following the system | Yes. | every state |
| Export everything as JSON; import it back | Yes. "Save a copy", "Bring a copy back", and the note says a copy merges. | Your copy |
| Invite-only accounts on the user's own server | Yes, section 2; "This phone keeps step with the server at ...". | Account |

## Rulings

- **Steppers for the lengths: overturned for the lengths, kept for small counts.** Between minus
  and plus the figure becomes a number field (`inputmode="numeric"`), set in the same figure
  face, with "minutes" or "hours" beside it as a word. Type 50 and it is done; minus and plus
  still nudge. "Once a day" and "8 laps a day" keep the plain stepper: nobody goes far.
- **Switch rows with the stock box at the right: upheld,** with problem 2.
- **"One bell for now.": cut.** It tells the person about a choice the app does not have. The
  panel is "The bell" and one switch. Add the line the day there is a second bell.
- **The order: one move.** Day target goes up beside Laps and breaks: the numbers you plan with.
  Account first is right, because the person's chip is what opened this screen.
- **The mark as one line under the result, quieter than it, no badge: upheld.** 13px, in the
  group at the top, never between the sentence and its button.

## The words

Settings:
- Keep: "This phone keeps step with the server at ...". "Save a copy" and "Bring a copy back".
  "A copy merges with what is here: the newer edit wins, so bringing one back twice loses
  nothing." "Room leaves the screens on your devices and friends see you as away."
- "Off, every start is yours to tap. On, a device that wakes within two hours of a bell counts
  the laps and breaks that would have run meanwhile, watched or not. After the long break nothing
  starts by itself." The middle sentence explains the machine. "Off, every start is yours to tap.
  On, laps and breaks follow each other until the long break, and a phone that slept through a
  bell catches up when it wakes."

The marks, each read as the tenth it would never be, since a tier comes once:
- Keep as written: "Lap 1. The bell works." "4 laps. On a track that is a mile, give or take nine
  metres." "25 laps. On a track that is the ten thousand metres." "100 laps. Nearly a marathon:
  on a track, two kilometres short." "250 laps. A hundred kilometres, seated." The sums are right
  (1600 m against 1609, 40 km against 42.2).
- "500 laps. 200 kilometres. The ghost is asking how." tries too hard. The ghost is a lane; it has
  never spoken, and DESIGN.md keeps it from judging. End at "200 kilometres."
- "2500 laps. 1000 kilometres. No medal exists for that, so this sentence will have to do." The
  sentence winks at itself. "2500 laps. 1000 kilometres. No medal exists for that." is the joke.
- "1000 laps. Four figures, one bell at a time." is fine and is the only one that leaves the
  track. "1000 laps. 400 kilometres, one bell at a time." keeps the number.
- The two that recur do not grate: "done in 3 laps, as you guessed." and "17h 55m this week. Your
  best before was 17h 30m." are facts. "That task:" for a long title is vague on its own and is
  saved by the bar under it that names the task.

## Keep

"250 laps. A hundred kilometres, seated." One dry word after a true number. That is the register
for every reward in this app: the fact first, the smile second, no exclamation mark.

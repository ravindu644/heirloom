# Section 7: Room

## First pass, 2026-11-25. Verdict: FAIL

Pictures: 130 in `reviews/7/shots/`, 13 states at phone, wide (471), small, laptop and phone-full,
light and dark. Every one opened: the light phone pages and four laptop states at reading size,
the rest as sheets. Beside `design/routes/b-pacer/screens/room-*`. Taken 05:03; measured again
from the running demo at 05:30. `node tools/design-audit.mjs`: 109 states, 0 violations.

The room says who is on a lap in one sentence and never ranks anyone unless the room asked.
Four things to fix.

## Problems

1. **"Cheered" is a dead button drawn like a live one.** `room-*`: after a cheer the button stays,
   disabled, in the quiet fill of "Skip break" (`room.tsx:277`), 372 by 48px on the phone, under a
   sentence that already says "You and sachi cheered this lap." Taste gate, Pressable: what looks
   pressable is. Fix: once cheered, the button goes and the sentence stays.
2. **On the laptop one row has its buttons at three heights.** `room-eight-laptop-*`: panels
   257 to 512, "Cheered" at y=395, "Cheer" at 402 and at 448. `room-laptop-*`: 395 and 402.
   Taste gate, same job same look. Fix: the panels keep their equal height and the button sits
   on the panel's foot (`margin-top: auto`), `md` above the edge, so a row's buttons share a line.
3. **"Code and settings" is the second thing on the screen.** Phone y 134 to 182, laptop 106 to
   154: a grey button between the finding and the week the room fills. Taste gate, Squint.
   Fix: an underlined link at the right end of the "Room: Second years" line, as "Back" is on
   Settings. When you are alone the finding already says "The code brings a friend in."
4. **Old news is headed "now".** `room-stale-*`: "2 of 4 focusing now." over "This is the room as
   it was last heard from.", with 11:05 and 03:20 still shown as time left. Voice: say what
   happened. Fix: one sentence, "2 of 4 were focusing when the room was last heard from.", and no
   time left for anyone but you.

## PRODUCT.md section 5, row by row

| Row | Delivered | Where |
|---|---|---|
| A private room joined by an invite code; a few friends | Yes. Make, join, the code in the sheet, eight at most, said in the error. | `room-none-*`, `room-sheet-*` |
| Who is focusing right now, which phase, time left | Yes. | `room-*`, `room-eight-*` |
| Each member's focus time today and this week | Yes. "1h 15m today in 3 laps, 6h this week." | every member |
| A shared weekly total the room fills together, with a target | Yes. One lane of shares, "17h 40m of 20h together this week."; past the target it says "35h 25m of 20h" and nothing changes colour. | `room-*`, `room-eight-*` |
| One tap to cheer a friend's finished pomodoro | Yes. | `room-cheered-*` |
| No ranking by default; an opt-in "ranked this week" view per room | Yes. "Order by this week" in the room's sheet; ranked is an order, with no numbers or medals. | `room-ranked-*` |
| Task titles hidden from the room unless switched on | Yes. "Not sharing what they are on.", and the switch in Settings is off by default. | `room-eight-*` |
| A switch to hide rooms entirely | Yes. The destination leaves the bar; "Settings brings them back". | `room-hidden-*` |

## The Look table

| Row | Result |
|---|---|
| Tells | Pass. No leaderboard, no avatars with rings, no activity feed. |
| Squint | Fail: problem 3. |
| One left edge | Pass. The code's ink is on the edge of its label and sentence (x=20 in the sheet, scanned). |
| Rhythm | Pass. Panels 8 apart stacked, 24 across. |
| Free space | Pass on the phone. On the laptop a panel with one line carries 120px of empty surface; that is the price of a level row and is right once problem 2 is fixed. |
| Pressable | Fail: problem 1. |
| Dark | Pass. |

## Rulings on the lane's decisions

- **The week as one lane of shares, yours in `you`, others in `ink`: upheld.**
- **Members side by side on a laptop, stacked on a phone: upheld,** with equal heights in a row
  and problem 2 fixed.
- **Time left in `figure-md`, green on a break: upheld.**
- **"Not sharing what they are on.": upheld.** It is DESIGN.md's own sample.
- **Cheer full width on the phone, its own width on the laptop: upheld.** Every button does that.
- **Leave with a second tap in the page: upheld.** The sentence says what leaves with you and
  that the code brings you back.
- **More than one room as choice buttons under the heading: upheld,** once a chosen choice is
  drawn as in Habits' problem 1.
- **No lap bar per member: upheld.** "Focusing, lap 2 of 4" says it.

## The words

- Keep: "2 of 4 focusing now." "Only you here so far. The code brings a friend in." "Whoever has
  it can join. Read it out, or copy it." "Your laps leave the room's week with you. The code
  brings you back." "That room has its 8 people, or you are in 5 rooms already. Both are the most
  there can be."
- Problem 4.
- Nothing ranks, nothing nags an away friend. "Away" is one word and their week still counts.

## Keep

The headline counts people, not minutes: "2 of 4 focusing now." It makes the room a place where
friends are, and it leaves the slower friend unranked. Do not turn it into a total or a table.

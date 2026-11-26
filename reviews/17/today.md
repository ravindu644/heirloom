# Section 17, Today: the list answers before the release

Pictures: `reviews/17/shots/` today-carry-top, today-carry-up, today-few-upcoming (phone and
laptop, light and dark), and the frame sequences `carry-top-phone-light-1..7`,
`carry-up-phone-dark-1..7`, all opened and diffed frame to frame. `node tools/design-audit.mjs`:
222 states, 0 violations. A real carry was replayed in Chromium on a build of the demo (`today`
state, 412x915, mouse held on "Thinking in React", carried over Next, back down, over again, let
go), reading each row's classes and box at each step.

## Verdict: FAIL

The behaviour the user asked for is there: over the top the carried card wears the red outline and
Start, the old Next becomes the first Later row, "Later today" moves with it and its count
("4 tasks, 9 laps") answers before the release. But the redraw that does it wipes the two classes
the hand put on the rows, and a person sees both:

1. **The card in the hand drops its lift while still held.** Measured: once over the top, the
   carried row's class is `row next trailed lined`; `lifted` is gone. Frames 4 and 5 (finger still
   down): card fill 255 (surface, not `raised`), no shadow under it (ground 238,240,236 right at its
   foot; in frame 3 it is 235,237,233). Carried back down, it stays unlifted. It looks set down
   under a finger that has not let go, 10px below its slot, and DESIGN.md's "letting go changes
   nothing but the shadow" cannot hold: the shadow is already gone.
2. **The old Next jumps instead of gliding.** The same redraw removes `gliding` from the old Next
   card (measured: `row lined`, no `gliding`), so its transition is cancelled and it lands at the
   head of Later in one frame. `carry-up-phone-dark-4.png` caught it: K&R already at its new place
   (title y 520) while Exercise 5-3, still gliding, sits under it (title y 570, should be 591): two
   cards drawn over each other, one block in dark. This is the "smoother" the user asked for.

Cause: Preact writes `class` whole when a row's `next` prop changes (`look(task)` in
`client/src/ui/today/today.tsx`), and `lift.ts` added `lifted` and `gliding` with `classList`.
Fix once, in the kit: `client/src/ui/kit/lift.ts`, when the row lifts, start a
`MutationObserver(el, { subtree: true, attributes: true, attributeFilter: ['class'] })` that puts
`css.lifted` back on `row` and `css.gliding` back on every other member of `lift.list` and
`lift.heads`; disconnect it in `clear()`. It runs after Preact's commit and before the paint, so no
frame is drawn without them. Then re-shoot frames 3 to 6 and check that frame 5 shows the raised
fill, the shadow and the red outline together (`.lifted.lifted` with `--row-ring` already draws
that) and that no two cards overlap in any frame.

## Per state

| State | Verdict | Why |
|---|---|---|
| `today-few-upcoming` | PASS | Next, Later today "2 tasks, 3 laps", Upcoming with "tomorrow", the hint. Next heading to card 8, card to "Later today" 16, as elsewhere |
| `today-carry-top` (held over the top) | FAIL | Problem 1: no shadow, surface fill. The rest is right: React wears outline and Start, K&R is an ordinary Later row, "4 tasks, 9 laps" |
| `today-carry-up` (held over the top) | FAIL | Problem 1. Right: "tomorrow" already gone from the quiz, Upcoming heading fading, "3 tasks, 5 laps" |
| `carry-top` frames 1, 2 | PASS | Rest, then lifted: raised fill, the one shadow, a hair of ink |
| `carry-top` frame 3 (mid-carry) | PASS | The card covers "Later today" and its count. That is the card under the finger passing over a heading, not a row overlapping a row: its landing place (top of Later) is open under it, Exercise at 585. A 1px tick of the heading's "L" shows at the card's top left corner; nobody will see it |
| `carry-top` frame 4 (over the top) | FAIL | Reads as Next at once, as the user asked, but without its lift: problem 1. Frame 4 equals frame 5 |
| `carry-top` frame 5 (settled) | FAIL | Problem 1 |
| `carry-top` frame 6 (just after release) | PASS | Differs from 5 only inside the card's box (20,394 to 392,466): the card glides its last 10px into the slot it was held over. Heading, rows, counts unchanged. Right once 5 has its shadow back |
| `carry-top` frame 7 (after) | PASS | Card at its slot. The hint "Press and hold a task to move it." goes after the first move, by design |
| `carry-up` frames 1, 2 | PASS | Same as above in dark: the hair line of ink reads on `raised` |
| `carry-up` frame 3 | PASS | The quiz over the bottom of Exercise 5-3 on its way up: a carried card crossing a row, normal. The faded Upcoming heading leaves 57px at the list's end (705 to 762) while held; the eye is at the top, and it closes on release |
| `carry-up` frame 4 | FAIL | Problem 2: K&R drawn over Exercise 5-3 for the length of a glide |
| `carry-up` frame 5 | FAIL | Problem 1 |
| `carry-up` frame 6 | PASS | Only the card's last 9px, as in light |
| `carry-up` frame 7 | PASS | "Now due today. It was tomorrow." with Undo; Still planned becomes 2h 55m, 7 laps, which is the change itself |

Light and dark agree except that problem 2 is worse in dark: two `surface` cards with no gap read as
one card holding two tasks.

## Words

"Next", "Later today", "4 tasks, 9 laps", "Upcoming", "tomorrow", "Press and hold a task to move
it.", "Start", "Now due today. It was tomorrow.", "Undo". Plain, specific, nothing to fix.

## Keep

The list answers while the finger is down: the carried card becomes Next, the old Next becomes an
ordinary first row of Later with "Later today" moving over it, and the counts change before the
release. Fixing the lift must not move that answer back to the release.

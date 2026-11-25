# Section 12: the second hour

## First pass, 2026-11-25

Read first: `git diff DESIGN.md` and the taste gate's section 9. `node tools/design-audit.mjs`:
158 states, 0 violations. Where a number is given it was read from the running demo at 412x915.

What I opened, plainly. At full size, 412 wide: every picture named in the table, in the theme
named. Of 1440 I opened only the two `move-laptop` frames, cropped to the list. I did not open
the 471 set at all, nor the laptop set beyond those two frames; they rest on the audit.

| # | Item | Verdict | Opened at full size |
|---|---|---|---|
| 1 | The task row at its extremes | PASS | `today-top` light and dark, `sheet-top` light, `habits-top` light |
| 2 | A row lifted, mid-way, set down | PASS, one thing to change | `move-phone-1`, `-2`, `-3`; `move-laptop-1`, `-2` (these have one theme, light) |
| 3 | The picker | PASS for the picker, FAIL for one button in its form | `sheet-project-edit` light, `sheet-picked` light and dark, `sheet-project` light |
| 4 | One Stop, the part-filled lap, "Done for now" | FAIL on where the link stands | `stopped`, `today-stopped`, `done-for-now`, `break-done-for-now` light; `lap-ahead` and `break` light and dark |
| 5 | The strip's button | PASS | `today-running`, `today-paused` light and dark (the strip only) |
| 6 | "Delete for good" and its question | FAIL, small | `today-purging` light |
| 7 | The stepper at its top | PASS in light, FAIL in dark | `settings-top` light and dark (captured from the demo), `sheet-top` light |
| 8 | The bell that cannot ring | PASS | `settings-ring-blocked` light and dark (captured from the demo) |
| 9 | The digits at 99:58 | PASS, and the demo is wrong | `focus-99` light and dark, `today-99` light and dark |
| 10 | Keyboard up, the page's end | PASS | both `keyboard-up-*` light and dark, `page-end-after-untick` light |
| 11 | The words | PASS | read from `strings.ts` and in the pictures above |

## What to change

1. **Item 4. "Done for now" stands in two places, and the buttons move to make one of them.**
   After a bell (`lap-ahead-phone-*`) the buttons are at y 688 to 736 and the link under them at
   752 to 800. In a break and while a lap runs (`break-phone-*`, `running-behind`) the buttons
   are at 752 to 800 and the link over them at 704 to 752. So the action row jumps 64px up when a
   lap rings and back down when the break starts. DESIGN.md, Consistency, and the taste gate's
   same job same look. The link's weight is right: label size, underlined, the least likely
   choice. Fix: the buttons keep the foot in every state, and the link stands at the right end
   of the line over them, where "Undo" already stands in `stopped` ("Lap 2 stopped at 6 min. Lap
   3 is next.  Undo"). After a bell that line is the sentence, in a break the link is alone on it.
2. **Item 3. "Delete project" is a bare word.** `sheet-project-edit-phone-light`: a quiet button
   is `#E4E7E2` and so is the form it stands on, so beside "Done" there are two bold words and no
   button. DESIGN.md, Buttons; lesson 9, every ground. Fix: it is the link at the row's end, as
   "Remove the day target" is beside its own "Done".
3. **Item 7. In dark an off plus looks on.** `settings-top` dark: "the key without its line" takes
   nothing away, because a dark key has no line; only the sign dims. In light it reads off at
   once. Fix: off is the `key-quiet` fill in both themes (in light the same value, so only the
   line goes; in dark one step down), with the sign in `muted`.
4. **Item 6. The question leaves the title 131px.** `today-purging-phone-light`: "Install a C
   compiler" breaks to two lines beside "1 of 1", "Restore" and "Delete for good?" (36 to 167,
   then 171, 217 and 281 to 376). Nothing touches, but DESIGN.md's own row rule says what is at
   the right gives way first. Fix: on a phone the two links stand under the words, as an
   invite's three do.
5. **Item 2. A lifted row loses its empty squares.** `move-phone-1-lifted`: "Thinking in React"
   shows one square beside "1 of 2"; `move-laptop-1-lifted`: "Next.js" shows none beside
   "0 of 2". The lifted row's fill is `raised` and so is an empty square. Fix: on a lifted row an
   empty square takes `line`, or a hair edge.
6. **Item 9. The demo runs a lap the app cannot have.** `focus-99-*`: 99:58 "of 100:00", while
   the stepper stops at 99 with its plus off. The digits themselves fit at 412 (24 to 366 of
   392) and on the strip. Fix the state to a 99 minute lap.
7. **Item 3, taste. The hue slider is the loudest thing in the app.** The track is a full
   strength rainbow while everything it can give is as calm as the twelve. Draw it at the depth
   the second slider holds, as "Pale to deep" already draws the chosen colour, and the picker
   shows what will be had.

## Item by item

**1. Extremes.** Titles break between words and stop at two lines with an ellipsis; no word is
split. A row that ends in a control shows the count alone ("8 of 8"); "13 of 8" shows the count
alone; a 60 character title pushes the squares out and keeps its two lines. Nothing touches or
leaves a card. The closest pair is the ellipsis and "8 of 8" in the Next row, 10px. Twenty-four
segments in the day's bar read as a dashed line, which is what 24 laps are.

**2. The move.** Lifted, the row is `raised` with a hair of ink and the one shadow, and reads as
picked up. Mid-way it leaves a gap behind and covers the row it is passing; set down, the order
is new. "Press and hold a task to move it." under the list is the right size of hint. Change 5.

**3. The picker.** It is this app's: square tracks at lane height, a thumb drawn with the ink
line, labels in the label face, "Pick" carrying the picked square and drawn as chosen. Nothing
of the browser is left. "Pick" stands under the twelve as its own chip and does not move when
used; DESIGN.md calls it "last in the row", which the picture is not, and the picture is right.
Changes 2 and 7.

**4. Stop.** One "Stop", quiet beside "Pause" in both themes. The stopped lap stays part filled
in the bar and in Today's bar. "Lap 2 stopped at 6 min. Lap 3 is next." and "Stopped after lap 2.
Lap 3 is next.", each with Undo, say what the tap did without a word to learn. Change 1.

**5. The strip.** Ground on ink in light, and its mirror in dark. The button can be told from
the strip and from the page in both.

**6.** Change 4. The sheet is as tall as its list now, and "Delete for good removes it now." in
the note says what the second link does before it is pressed.

**7.** Light: the off plus has no line and a grey sign beside a minus with both; it reads off,
not broken. Change 3 for dark.

**8. The bell.** "Notifications for heirloom are switched off on this device, so the bell cannot
ring. Allow them in the device's settings." in the note's place, in the note's grey. A fact and
a way out. The box stays ticked, which is right: the wish stands.

**10.** With the keyboard up the field being typed in has its label over it and a row under it,
the sheet keeps its foot on the keyboard, and nothing blank shows. After an untick at the end of
a long list the page ends at its content.

**11. Words.** "Focused", "Still planned", "Last Tue", "Laps to run each day", "Remove the day
target", "Changes are saved as you make them.", "A lap or a break already running keeps its
length." None needs a second reading and none wraps badly at 412: the foot line is one line (y
824 to 847), the nudge under 8 laps is two lines and its link. The pictures are of two ages:
`today-top`, the `move` frames, `stopped` and `today-stopped` still say "Done", "Planned, left"
or "Ghost". Retake them so the set says one thing.

## DESIGN.md's to fix

- **Stepper:** "the key without its line" is a rule for light only. Say what off is in dark.
- **A project's colour:** "Pick stands last in the row" should read "under the twelve".
- **The lap bar and the result:** say where "Done for now" stands, once, for both states.
- **Task row:** a row with two links at its end follows the invite row on a phone.

## The one thing that must survive

"Lap 2 stopped at 6 min. Lap 3 is next." One button, and then one sentence that says what it
did and what comes now. Three buttons could not explain themselves; this needs no explaining.

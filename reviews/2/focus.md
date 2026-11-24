# Section 2: Focus

Pictures: `idle`, `first-day`, `next-day`, `running-behind`, `running-ahead`, `paused`, `break`,
`long-break`, `long-title`, `undo-stop`, `undo-aside`, each at 412x915 and 1440x900, light and
dark. All opened, beside `design/routes/b-pacer/screens/focus-*`.

## Verdict: FAIL

One control that is not in v1, and a set of pictures that is older than the code. The screen
itself is the reference, kept honest.

## Problems

1. **"5 more minutes" on a break is not in v1.** `break-*`, `long-break-*`: the link sits above
   "Start lap 3 now". PRODUCT.md section 1 has "Extend the current pomodoro", a small button
   because Cirillo prefers review. A snooze on the break is a different thing, and it is aimed at
   the person PRODUCT.md is for, who "keeps putting it off". Fix: show it only while a lap runs
   (`state.phase === 'work'`), or the user adds break extension to PRODUCT.md with a log line.
2. **Most pictures are not of this code.** `paused`, `break`, `long-break`, `long-title`,
   `first-day`, `next-day`, `running-ahead` were taken at 01:25 and show the phone digits at
   y=228 to 345. `focus.module.css` changed at 01:29 (two lines kept under the digits) and `idle`,
   `running-behind` and `undo-*`, taken at 01:30, show them at y=210 to 335. Fix: take the set
   again. Add 360x640 (the smallest common phone: the scaled digits, the panel scrolling behind
   the stuck buttons) and 1024x768 (sidebar with 168px digits).
3. **For the lead: an empty lap bar almost is not there.** `idle-*-light`: the four empty segments
   are `raised` on `ground`, 1.09:1. DESIGN.md Colors gives `line` to "the empty part of a lane"
   (1.25:1); the `lap-bar` component says `raised`. Pick one in DESIGN.md. `raised` is right on
   the white panel, `line` on the ground.

Not blocking:

- The race sentence breaks badly. `running-ahead-*`, `long-break-*`: "Last Tuesday finished on /
  3h 20m." leaves the figure alone on line two. Fix: `text-wrap: balance` on that sentence, or a
  no-break space inside the total.
- On the laptop a task title pushes the digits down 73px (`long-title-laptop` y=218 against 145).
  On the phone the lane took care that nothing moves them. Settle it in section 4 with the task
  row, not now.
- `first-day`: the panel heading "Today" shares the screen with the "Today" tab, two different
  things. "Today so far" would end it.
- `idle`: a ghost of 5m on a 3h 20m lane is a 5px dashed box and reads as a speck. Honest, so it
  stays; a 2px floor on the outline box would only lie.
- "It stays in your timeline": the timeline arrives in section 5. True in v1, a dead word until then.
- Motion cannot be judged from stills. The user gate should watch one lap end.

## The Look table

Run on the 30% contact sheet of ten phone states, light and dark, and on blurred copies.

| Test | Result |
|---|---|
| Across the desk at 30% | Pass. The time reads in every state. The phase reads without the label: ink digits and a white button is a lap running, grey digits and a red button is paused, green digits is a break, ink digits and a full-width red button is waiting for you. |
| Squint | Pass. The digits are the one thing. Nothing ties with them. |
| One action | Pass. Idle: Start. Paused: Resume. Running and break: no filled button, Pause and "Start lap 3 now" are secondary. The ahead chip is filled but is 14px type and no button. |
| Reference | Lap bar, lap line, digits, race strip, chip, button shapes: match. Differences are all DESIGN.md winning: the title is `title` 24/600, lane figures are `figure-md` 26/500, the ghost outline is 1px. No new colour, no rounded lane, no shadow. |
| Logo test | Pass. Two lanes, a hollow ghost and "Finish this lap and you draw level." belong to nothing else. |
| Empty state | Pass. `first-day`: one lane and "No ghost yet. Today sets the pace for next time." |
| Thumb | Pass. The main button is at y=777 to 825 of 915 in every state. |
| Dark | Pass. Neutral ground, no glow. `rest` on ground 8.4:1, `muted` digits 8.0:1, chip text 13.6:1 behind and 6.9:1 ahead. |

## Rulings on the lane's decisions

- **Actions at the bottom, digits centred in the free space: upheld.** DESIGN.md puts the primary
  action in the lower half and the phone mockup did not (Pause at y=411). The screen does not
  fall into two halves: the digits own the upper part with 120px of ground above and 137px below,
  the panel belongs to the buttons it sits on, and at 30% it reads as a timer over its controls.
  What settles it: Start, Pause, Resume and "Start 5 min break" share one rectangle, and the
  digits and the panel do not move when a lap starts. The ground above the digits is where the
  task title goes (`long-title` shows it absorbed), so it is no hole.
- **Ahead chip filled `you` with `on-you` text: upheld.** `you` on `you-tint` is 4.45:1 and the
  chip is 14px, so DESIGN.md's own small-text rule forbids the literal reading. Filled is 5.5:1
  light, 6.9:1 dark. It also makes ahead louder than behind, which is the right way round. The
  lead rewrites the Split chip line in DESIGN.md so the file says what is built.
- **Ghost outline 1px dashed: upheld on the strip.** DESIGN.md says 1px and the file wins over
  the mockup. On the 16px lane it reads. See result.md for the 40px lane.
- **Break digits `rest`, paused digits `muted`: upheld.** `rest` is "breaks and rest days only"
  and a break is one. 5.2:1 and 7.7:1 on ground, over the 3:1 for large figures. The lap line
  says the same in words, so it is never colour alone.
- **Empty ground under the laptop block: upheld.** The reference is top-anchored too
  (`focus-laptop` is empty below y=613 in the main column). The rail fills in sections 4 and 5.
  Nothing is planned for the lower left, so it is ground, not a hole.
- **Digits scale below 412px: upheld, with its numbers moved.** By proportion "18:42" keeps its
  margins at any width. `168 / 412` and `411px` belong in DESIGN.md (shell.md problem 5). The
  360x640 picture is the proof still owed.

## The words

Every string in `focus` and `race` read against the Voice section.

- Pass: "Start now and it ends at 09:30." A reason to start, as a fact.
- Pass: "of 25:00, ends at 16:59", "of 25:00, paused since 16:38".
- Pass: "Stop and log 6 min". The button says what it will do with the minutes.
- Pass: "Stopped. 6 minutes kept." and "Stopped. Under a minute, so nothing was logged." No scold.
- Pass: "Set aside. It stays in your timeline and counts nowhere." with Undo beside it. No "Are
  you sure?".
- Pass: "No ghost yet. Today sets the pace for next time.", "Side by side.", "Finish this lap and
  you draw level.", "One lap draws you level.", "That is more than all of last Tuesday."
- Pass: "Lap 2 of 4, focus", "Short break, after lap 2 of 4", "Long break, after the set",
  "lap 3 next", "long break after lap 4".
- Out of scope: "5 more minutes" on a break, problem 1.
- No exclamation mark, sentence case on every button, no padding word, no em dash.

## Keep

One rectangle for the button a thumb wants, in every state, and digits that do not move when it
is pressed. Kept rows (`.quiet`, `.say`, `.sub`) pay for it with a few empty lines. A later
section that needs room must take it from the free space around the digits, never from those rows.

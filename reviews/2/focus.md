# Section 2: Focus

## Third pass, 2026-11-25. Verdict: PASS

Read against the rewritten rule, "Free space goes to one place": two groups on a phone, what the
screen says at the top and what to do next at the bottom with its sentence, the space between
them. Measured from the running demo at 412x915, 471x1020 and 360x640.

| State | 412x915 | 471x1020 | 360x640 |
|---|---|---|---|
| Idle | panel ends 461; "Start now and it ends at 09:30." 713 to 736; button 752 | 483; 818 to 841; 857 | 442; 438 to 461; 477 |
| Running | panel ends 516; links 704 to 752; buttons 752 | 514; 809; 857 | panel 300 to 497 runs under the links at 429 |
| Paused | as running | as running | as running |
| Result | lanes end 270; "level at 16:40. 6 laps today. Take five." 715 to 734; buttons 752 | 270; 820 to 839; 857 | 308; 440 to 459; 477 |
| Break | panel ends 492; button 752 | 514; 857 | panel ends 473; button 477 |

- The sentence now travels with its button, 16px over it, in idle and on the result at all three
  sizes. Nothing floats and no group is split. That closes what the second Today pass raised.
- The digits' ink against the line under them, scanned at 471: 19 to 20 against 21, within 2px.
- At 360x640 there is no free space: while a lap runs the panel's last sentence lies under the
  links and the screen scrolls to it. Right for the smallest phone; not a finding.
- On a tall phone the result is its sentence and two lanes, then 550px of ground, then the line
  and the buttons. That is the rule as written. If it reads as half empty in the hand, the
  answer is in what the result says (the day's laps as squares, the week), not in moving the
  button.

## Second pass, 2026-11-25. Verdict: PASS

All 213 pictures opened (taken 01:47 to 01:48, after the last UI change at 01:46): phone, small,
and the light laptop and tablet sets at full size or close to it, the dark laptop and tablet sets at
about 80%. DESIGN.md read again: Colors, Layout, Components.

### The three findings

| # | Finding | Now | The picture |
|---|---|---|---|
| 1 | "5 more minutes" on a break | Fixed. Gone from both breaks; the link shows only while a lap runs. | `break-phone-light`, `long-break-laptop-light` |
| 2 | Pictures older than the code | Fixed. All retaken, with 360x640 and 1024x768 added. | the whole set |
| 3 | Empty lap bar at 1.09:1 | Fixed. Empty segments on the ground are `line`, and DESIGN.md Colors says so. | `idle-phone-light`, `idle-laptop-light` |

From the notes: the race sentence is balanced and the figure no longer sits alone
(`running-ahead-*`); the first-day heading is "Today so far" (`first-day-*`).

### What the fixes cost or added

- **The small phone, 360x640: acceptable, with its cost written down.** `running-behind-small-*`:
  the time, the phase, the lap bar and the buttons are whole and in their usual places; 106px of
  the 204px race panel show and the Ghost row is cut through its letters by the stuck buttons.
  The rest is one scroll away and nothing is lost. No layout fits at this height: the screen is
  98px short as built, releasing every kept row wins back only 40 of them while a lap runs, and
  the digits are not what gives. By the same measure the panel fits whole from about 740px tall,
  so 360x760 and 360x800 are clear and the cut belongs to old 16:9 phones and split screen. It
  does look like a fault rather than a
  scroll, so it goes in `findings.md`: if the user's or a friend's phone is in that band, give
  short screens their own rule (release `.quiet`'s empty row and the second kept lines) and add
  the height to DESIGN.md's list of sizes. Not before.
- **`long-title-small-*`: the same case, worse.** Only the panel's top 30px show and its heading is
  cut through. Section 4 owns the task title: clamp it to one line on a short screen there.
- **The tablet, 1024x768: pass.** `*-tablet-*`: the 168px digits, the panel at the column's full
  720px with the sentence on one line, the buttons under it, 48px sidebar rows. It reads as the
  phone's order with room. One wobble: the lap bar ends at x=984 here and at x=992 on the result
  (`lap-level-tablet-light`), because Focus is capped at 80ch and the result is not. Give both the
  same measure; at 1279 wide the bar would jump about 260px at the bell.
- **Undo beside "Stopped. 6 minutes kept.": pass.** `undo-stop-*`, `undo-aside-*`: the sentence in
  `muted`, Undo after it as an underlined `label`, on the same line or at the end of the second.
  It sits on the words it undoes, takes no row of its own, and the digits do not move. The lap bar
  drops the unfinished segment and the total keeps or loses the minutes as the sentence says.
- **"Today so far": pass.** It no longer shares a word with the tab, and it says what the lane is.

### Still open

Nothing blocks. Two small things:

- `long-break-phone-*`, `long-break-laptop-*`: the balanced sentence now breaks as "Last /
  Tuesday finished on 3h 20m." A no-break space inside the day's name ("last Tuesday") in
  `pastDay` keeps it whole everywhere.
- The lap bar's width on the tablet, above.

## First pass, 2026-11-25 (kept as written)

Pictures: `idle`, `first-day`, `next-day`, `running-behind`, `running-ahead`, `paused`, `break`,
`long-break`, `long-title`, `undo-stop`, `undo-aside`, each at 412x915 and 1440x900, light and
dark. All opened, beside `design/routes/b-pacer/screens/focus-*`.

### Verdict: FAIL

One control that is not in v1, and a set of pictures that is older than the code. The screen
itself is the reference, kept honest.

### Problems

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

### The Look table

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

### Rulings on the lane's decisions

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

### The words

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

### Keep

One rectangle for the button a thumb wants, in every state, and digits that do not move when it
is pressed. Kept rows (`.quiet`, `.say`, `.sub`) pay for it with a few empty lines. A later
section that needs room must take it from the free space around the digits, never from those rows.

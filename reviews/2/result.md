# Section 2: the result of a lap

## Second pass, 2026-11-25. Verdict: PASS (no regression)

All 213 pictures opened (taken 01:47 to 01:48, after the last UI change at 01:46): phone, small,
and the light laptop and tablet sets at full size or close to it, the dark laptop and tablet sets at
about 80%. DESIGN.md read again: Colors, Layout, Components.

- The set's 24px lap bar is in DESIGN.md (`lane-set`, Components). `set-done-*`: unchanged, right.
- The ghost outline is 2px on the result lanes, as DESIGN.md now says. `lap-level-laptop-light`,
  `lap-behind-phone-light`: the ghost reads as a hollow block at arm's length, in both themes.
- The empty part of a result lane is `line` on the ground. The scale is visible again
  (`lap-first-day-laptop-light`).
- The level chip is ink on `you-tint`, as the Split chip line says (`lap-level-*`). Behind and
  level now share a colour; the sign and the word tell them apart, which is the rule.
- Retaken with the rest. At 360x640 the whole result fits without a scroll (`lap-*-small-*`,
  `set-done-small-*`), and "Level with / last Tuesday." breaks well.

Not blocking:

- On the tablet the result's lap bar is 8px wider than Focus's (x=992 against 984). See focus.md.
- The two moments still cannot be judged from stills.

## First pass, 2026-11-25 (kept as written)

Pictures: `lap-level`, `lap-ahead`, `lap-behind`, `lap-first-day`, `set-done`, `break-over`, each
at 412x915 and 1440x900, light and dark. All 24 opened, beside
`design/routes/b-pacer/screens/done-*`.

### Verdict: PASS

The reward is a race result in words over two lanes, and behind is said as the lap that closes
it. Two lines of DESIGN.md are owed by the lead before this merges, and the pictures are stale.

### Problems

1. **For the lead: the set's lap bar is a size DESIGN.md does not have.** `set-done-*`: the four
   segments are 24px tall (`.big i` takes `--space-lg`). DESIGN.md Components: "Lap bar: four
   segments, 8px tall". It should stay: in a still it is the one thing that makes a set bigger
   than a lap, which PRODUCT.md section 6 asks for. Fix: one line in DESIGN.md ("24px in the
   set-done moment") and a `lap-bar-set` height, or it goes back to 8px.
2. **For the lead: the ghost is faint on the tall lane.** `lap-*-laptop-light`: a 1px dashed
   `ghost` outline on a 40px by 717px lane is 2.6:1 on `raised` and reads as a dotted hairline at
   1x; the mockup's 2px reads as a block. The lane followed DESIGN.md, so this is no fail. The
   ghost is half the idea and this is its biggest appearance: consider "1px on the strip, 2px on
   the result lanes" in DESIGN.md.
3. **For the lead: the empty part of a result lane is 1.09:1.** The result lanes sit on `ground`,
   not on a white panel, so the `raised` track nearly vanishes in light and with it the scale
   (the ghost's whole day). Same choice as focus.md problem 3: `line` on ground.
4. **Stale pictures.** All 24 were taken at 01:25, before `focus.module.css` and `focus.tsx`
   changed at 01:29. Take them again with the rest.

Not blocking:

- `lap-first-day`: with no ghost the lane's scale is one set (100 minutes) and nothing says so;
  the lap bar above already shows 1 of 4. It keeps the place where tomorrow's ghost lane will
  sit, so it stays.
- `set-done`: the headline replaces the race sentence, so on a set the result against the ghost
  lives only in the chip. Right for the one big moment; do not add a second headline.
- The lap-done (700ms) and set-done (1200ms) moments cannot be judged from stills. The code keeps
  to transform and opacity, plays once, and skips on any tap or key. The user gate should watch both.

### The Look table

| Test | Result |
|---|---|
| Across the desk at 30% | Pass. The headline and both totals read. Nothing is counting, so there is no time to read. |
| Squint | Pass. Your lane and its figure in `you` are the one thing; the button is second. |
| One action | Pass. "Start 5 min break" is the only filled button; "Skip break" is text. |
| Reference | Headline, tall square lanes, ink finish lines, `figure-lg` totals with yours in `you`, one line of facts, one button: match. Drift, all declared or DESIGN.md winning: lanes 40px (mockup 32), ghost outline 1px, laptop lanes the full canvas. No shadow, no card, no new colour. |
| Logo test | Pass. "Lap 3 draws you level with last Tuesday." over two lanes is nobody else's screen. |
| Empty state | Pass. `lap-first-day`: "25 minutes today." and "First lap of the day. Take five." |
| Thumb | Pass. The button is at y=777 to 825, where Pause was a second before. |
| Dark | Pass. Neutral ground, `dark-you` figure 6.7:1 on ground, no glow. |
| Tells | None. No confetti, trophy, star or emoji. One exclamation mark, on the set. |

### Rulings on the lane's decisions

- **Phone: the result centred, the buttons at the bottom: upheld.** There are 230px between "Take
  five." and its button, which is the cost. It buys the break button in the same rectangle as
  Pause, and the headline landing where the digits were, so the eye is already there at the bell.
  The cheer (section 7) and "Your day so far" (section 5) go into that gap, between the facts and
  the buttons; when they land the block anchors to the top as in the mockup.
- **Laptop: lanes across the whole canvas: upheld for now.** The rail's tenants are sections 5 and
  7. A two-thirds column beside an empty rail would be the hole; a bar that runs the width of the
  canvas to its line is the picture of the moment. When the rail gets content the lanes return to
  the main column, as in `done-laptop`.
- **Laptop: empty ground below y=414: upheld.** `done-laptop` is empty below y=480 in the main
  column. It is the route's rhythm: the result at the top left, quiet ground under it.
- **No way to add time or to stop from the result: upheld.** PRODUCT.md has "Extend the current
  pomodoro" as a small button, "not a habit"; a lap that has rung is not current, and the bell
  being the bell is the method. Nothing is running on this view, so there is nothing to stop:
  "Skip break" leads to "Start lap 3", and leaving the app is being done.
- **Ahead chip filled: upheld**, as in focus.md.
- **Break over is the idle screen with "Short break, over": upheld.** PRODUCT.md section 6 asks
  for a quieter moment for breaks. A label and a full-width "Start lap 3" is quiet.

### The words

Every string in `result` and the ones `race` and `focus` lend to this view.

- Pass: "Level with last Tuesday." DESIGN.md's own sample.
- Pass: "6 minutes ahead of last Tuesday." A number, no adjective.
- Pass: "Lap 3 draws you level with last Tuesday." Behind as the lap that closes it; the chip
  beside it is the pale one. The best line in the section.
- Pass: "25 minutes today." and "First lap of the day. Take five."
- Pass: "6 laps today. Take five.", "8 laps today. Take 15 minutes." What happened, then what is
  next.
- Pass: "Four laps. A full set!" The one exclamation mark, where DESIGN.md allows one.
- Pass: "Start 5 min break", "Start 15 min break", "Skip break", "Start lap 3".
- Pass: "Lap 2 of 4, done", "Short break, over".
- No "Great job", no title case, no padding word, no em dash.

### Keep

Behind is never a verdict. The headline names the lap that draws you level, the chip is pale
`you-tint` while the ahead chip is the filled one, and the ghost's finish line is the same ink as
yours. A later change must not colour the gap, enlarge the minus figure, or let the set-done
headline spread to ordinary laps.

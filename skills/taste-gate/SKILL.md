---
name: taste-gate
description: The gate every heirloom screen passes before the lead merges it or the user sees it - what to measure, the pictures to open, the tells of generic or AI-made app UI with their fixes, and the words check. Load before building or reviewing any screen or component, and whenever something looks generic, cluttered, slow or "like every other app".
---

# The taste gate

heirloom has to read as something passionate people built in their free time. A rule nobody checks
is a hope, so the gate is tools first and judgement second. Adapted from agent-forge-design's
slop-gate for app screens.

## 1. Measure

```
node tools/style-check.mjs         # no colour, font or duration literal outside tokens.css
node tools/design-audit.mjs        # what the browser drew, against DESIGN.md: every size, colour, gap, left edge
node tools/budget.mjs              # JS, CSS, fonts against ARCHITECTURE section 7
npx @google/design.md lint DESIGN.md   # 0 errors
```

Measure positions, never judge them by eye: read `getBoundingClientRect()` for the blocks of a
column and compare their left edges and the gaps between them with the spacing scale. A picture
at 30% hides a 4px misalignment that the person holding the phone sees at once.

Fix every failure. Do not hide things from the checks.

## 2. Look

Capture the screen at 412x915 and 1440x900, light and dark, with real-looking data, an empty state,
and the longest string it can hold. Open every picture.

| Test | It fails when |
|---|---|
| Across the desk: the phone picture at 30% size | you cannot read the time left and the phase |
| Squint | you cannot say what the one main thing is, or two things tie |
| One action | there is more than one primary (you-filled) button |
| Side by side with the reference in `design/routes/b-pacer/screens/` | it drifted: a new colour, a rounded lane, a shadow, a different rhythm |
| Logo test | another productivity app's name could go on it and nothing would feel wrong |
| Empty state | it shows an illustration and "Nothing here yet!" instead of the first thing to do |
| Thumb | the main action on the phone is out of reach in the top third |
| Dark | anything is navy, glowing, or lower contrast than DESIGN.md allows |
| One left edge | two blocks of one column start at different x, or a line under the big digits does not start under their ink |
| Rhythm | a gap is not a step of the spacing scale, or the largest gap on the screen lies between two things that belong together |
| Free space | content floats in the middle with space above and below, or related things were pushed apart to fill a tall screen |
| Pressable | something that can be pressed is a bare word with no fill and no underline, or two buttons that do the same kind of job look different |
| Same job, same look | the same control, heading, figure or gap is drawn two ways on two screens, sizes or themes |
| Where things live | an account action (sign out, settings) sits loose on a content screen instead of behind the person in the header |

## 3. The tells of generic app UI

| Tell | Fix |
|---|---|
| A ring or circle timer | Big condensed digits and the lap bar (DESIGN.md) |
| Confetti, trophies, flames, stars, sparkles, emoji as decoration | The race result: two lanes meeting a line, in words |
| Four KPI tiles with icons in circles | One finding as a sentence, then the evidence under it |
| Gradient areas, donut charts, a chart library's default look | Hand-drawn SVG: lanes, square bars, one hue stepping darker |
| Cards inside cards, a shadow on every card | Flat surfaces stepping by tone; one shadow only for what floats |
| Rounded everything, pills everywhere | Lanes and bars square; 4 to 8px on rows and buttons; circles for people |
| Purple to blue gradient, glassmorphism, blur | Never. Tomato, ghost grey, calyx green, neutrals |
| A floating action button for "add" | Quick add in the list, where the eye already is |
| Icons without labels in the navigation | Five labelled destinations |
| A spinner or skeleton for data already on the device | Render it; it is local |
| Animations on everything, easing that bounces, anything looping | The motion table in DESIGN.md, nothing more |
| A modal asking "Are you sure?" | Do it and offer Undo |
| Inter or the system font | Barlow and Barlow Condensed, from `design/fonts/` |
| A leaderboard of friends | Lanes side by side, a cheer, "Together today" |

## 4. Words

Read every string on the screen aloud against the Voice section of DESIGN.md.

| Tell | Fix |
|---|---|
| "Great job!", "Awesome!", "You're on fire" | Say what happened: "Level with last Tuesday." |
| "Oops! Something went wrong" | What happened and what is safe: "Needs a connection. Your laps are safe on this phone." |
| "You missed your goal", "Streak lost" | The fact and the way back: "41 of the last 45 days." |
| Feature names: "Live presence", "Sync status", "Analytics" | The thing: "Who is focusing now" |
| Title Case Buttons | Sentence case |
| Padding words: "simply", "just", "easily", "seamlessly" | Delete them |
| An em dash | A comma or a full stop |

## 5. Verdict

The design reviewer writes PASS or FAIL per screen, one line per finding (what, where, which rule,
the fix), and one thing that is good and must survive later changes. Any tell from section 3 or 4
is a FAIL until fixed or defended in one sentence that names the user's need it serves.

## 6. Lessons from reviews that passed what the user then failed

Written 2026-11-25, after the user looked at Focus and Today and found three things two design
reviews had let through. Each is now a row above; this is why.

- **A rule that solves one problem can break a person's eye.** The reviewer upheld "digits centred
  in the free space, actions at the bottom" because it met the thumb rule. The user saw a hole
  between the timer and its race panel. Space between related things is a FAIL even when another
  rule asked for it; find the layout that keeps both.
- **Optical edges are edges.** "of 25:00, paused since 16:38" sat a few pixels off the big
  digits, because the digits' box and their ink are not the same. Nobody measured. Measure.
- **A bare word does not look pressable.** "I have an invite" and "Skip break" were text with no
  fill. They passed because DESIGN.md said "text buttons for the rest". When a rule in DESIGN.md
  produces something a person does not read as a button, the rule is wrong: say so in the review,
  under "DESIGN.md's to fix", and fail the screen until it is.
- **Where a thing lives is design too.** "Sign out" loose in the corner of every screen was never
  questioned. Account actions belong behind the person.
- **Consistency is checked across screens, not inside one.** Review each new screen side by side
  with the ones already built: same header, same headings, same buttons, same gaps.

## 7. Lessons from the review that measured

Written 2026-11-25, after the first review done with a ruler (the audit tool, then
`getBoundingClientRect()` by hand) found sixteen things the pictures alone had hidden.

- **A fix can move a hole instead of closing it.** "Free space above the action row" closed the
  gap under the timer and opened 530px between "Take five." and its button. Ask of every fix:
  which two related things are now further apart? A sentence travels with the button it explains.
- **A fix can make the next collision.** Moving the lap squares beside the count put the count
  against the row's Start button. After a fix, measure the neighbours of what moved, in every
  variant of the row (with a control, without, in ordering mode).
- **A hidden element can still take room.** A visually hidden status line, absolute with no
  positioned ancestor, made the phone page 1403px tall and the bottom bar slide. Scroll every
  phone state to its end; the page itself must not move.
- **A component sized for the full case is a stamp in the short one.** A year of 12px squares is
  right at 54 weeks and lost at ten. Look at every component with the least data and the most.
- **Baselines come from text, never from a mark.** An inline-flex name took its baseline from its
  colour square and the figure beside it floated 10px. Where a figure sits beside a label,
  measure both baselines.
- **A label must stand clear of every line that can cross it.** Check a chart in each case of its
  data: ahead, behind, level, empty, and with one value near the floor.
- **Check PRODUCT.md row by row.** Two rows of Progress were half built and nothing looked
  missing. A screen that looks finished is compared with the list, not with the eye.

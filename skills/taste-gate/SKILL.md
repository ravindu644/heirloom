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
node tools/budget.mjs              # JS, CSS, fonts against ARCHITECTURE section 7
npx @google/design.md lint DESIGN.md   # 0 errors
```

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

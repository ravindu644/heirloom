---
version: alpha
name: heirloom
description: Past you is a ghost who runs beside you on every screen. A pomodoro is a lap, a set is four laps, and the day is a race against your usual day, told in splits. Chosen 2026-11-24 from three routes; the screens in design/routes/b-pacer/screens/ are the visual reference.
colors:
  ground: "#EEF0EC"
  surface: "#FFFFFF"
  raised: "#E4E7E2"
  ink: "#121412"
  muted: "#474C47"
  line: "#D5D9D3"
  you: "#C4321A"
  you-tint: "#FBE2DA"
  on-you: "#FFFFFF"
  ghost: "#8A9089"
  heat-1: "#F2D2CD"
  heat-2: "#E4A398"
  heat-3: "#D56B5A"
  rest: "#23704E"
  dark-ground: "#0E100E"
  dark-surface: "#181A18"
  dark-raised: "#232623"
  dark-ink: "#F0F2EE"
  dark-muted: "#A4A9A3"
  dark-line: "#2B2F2B"
  dark-you: "#FF6A4D"
  dark-you-tint: "#3B1D16"
  dark-on-you: "#140806"
  dark-ghost: "#7C827B"
  dark-heat-1: "#4B2C24"
  dark-heat-2: "#803E30"
  dark-heat-3: "#BE543E"
  dark-rest: "#5DBE8D"
typography:
  figure-xxl:
    fontFamily: Barlow Condensed
    fontSize: 300px
    fontWeight: 600
    lineHeight: 0.9
    letterSpacing: -0.01em
    fontFeature: '"tnum" 1'
  figure-xl:
    fontFamily: Barlow Condensed
    fontSize: 168px
    fontWeight: 600
    lineHeight: 0.9
    letterSpacing: -0.01em
    fontFeature: '"tnum" 1'
  figure-lg:
    fontFamily: Barlow Condensed
    fontSize: 44px
    fontWeight: 600
    lineHeight: 1
    fontFeature: '"tnum" 1'
  figure-md:
    fontFamily: Barlow Condensed
    fontSize: 26px
    fontWeight: 500
    lineHeight: 1.1
    fontFeature: '"tnum" 1'
  figure-sm:
    fontFamily: Barlow Condensed
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1
    fontFeature: '"tnum" 1'
  headline-lg:
    fontFamily: Barlow
    fontSize: 44px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -0.02em
  headline:
    fontFamily: Barlow
    fontSize: 34px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
  title:
    fontFamily: Barlow
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: Barlow
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.45
  body-strong:
    fontFamily: Barlow
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.3
  label:
    fontFamily: Barlow
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.3
rounded:
  none: 0px
  sm: 4px
  md: 8px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components:
  button-primary:
    backgroundColor: "{colors.you}"
    textColor: "{colors.on-you}"
    rounded: "{rounded.sm}"
    height: 48px
    padding: 0 20px
  button-primary-dark:
    backgroundColor: "{colors.dark-you}"
    textColor: "{colors.dark-on-you}"
    rounded: "{rounded.sm}"
    height: 48px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: 48px
  lap-bar:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.none}"
    height: 8px
  task-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 14px 16px
  split-chip:
    backgroundColor: "{colors.you-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: 2px 8px
  nav-item-active:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  ghost-lane:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.none}"
    height: 8px
  heat-cell:
    backgroundColor: "{colors.heat-1}"
    rounded: "{rounded.none}"
    size: 12px
  room-member:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 16px
  rest-mark:
    backgroundColor: "{colors.rest}"
    rounded: "{rounded.full}"
    size: 8px
  divider:
    backgroundColor: "{colors.line}"
    height: 1px
  page:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.muted}"
layout:
  touch: 48px
  sidebar: 232px
  margin: 20px
  gutter: 32px
  gap: 24px
  canvas: 1144px
  lane: 8px
  lane-set: 24px
  lane-result: 40px
  figure-bearing: -0.047em
  figure-bearing-0: -0.046em
  figure-bearing-1: -0.066em
  figure-bearing-2: -0.048em
  figure-bearing-3: -0.044em
  figure-bearing-4: -0.024em
  figure-bearing-5: -0.057em
  figure-bearing-6: -0.057em
  figure-bearing-7: -0.046em
  figure-bearing-8: -0.052em
  figure-bearing-9: -0.038em
state:
  hover: 12%
  press: 24%
  scrim: 48%
shadow:
  float: 0 12px 40px rgb(18 20 18 / 0.18)
motion:
  press: 100ms
  fill: 160ms
  sheet: 200ms
  lap-done: 700ms
  set-done: 1200ms
  ease: cubic-bezier(0.2, 0, 0, 1)
---

# heirloom

## Overview

The records you used to look back at become a ghost who runs beside you. Every screen answers "how
am I doing against my usual day?" and nothing else competes with it. The method is race timing:
lanes, splits, laps and condensed figures that read from across a desk. It is clean by nature, so
there is no texture and no hand wobble. Warmth comes from the words, not from decoration.

You are always tomato. The ghost is always grey, hollow and dashed: past you has no colour because
it is only a memory. Being behind is never red. Red means you.

The rendered screens in `design/routes/b-pacer/screens/` (phone 412x915, laptop 1440x900, light and
dark) are the reference for every screen. Where this file and a screen disagree, this file wins and
the screen is redrawn.

## Colors

Light tokens have plain names; each has a `dark-` twin. `tools/tokens.mjs` writes both into
`tokens.css`, the dark set under `prefers-color-scheme: dark`.

- **ground:** the chalk of a lane line, one step off white, so white surfaces read as lanes on it.
  In dark, a true neutral near-black, never navy.
- **surface / raised:** lanes and the active nav pill, separated by tone, not by shadow.
- **ink / muted:** text. Muted passes 4.5:1 on ground and surface in both themes. Text smaller than
  16px uses ink or muted only, never ghost.
- **line:** dividers, and the empty part of a lane that sits on the ground. On a white surface the
  empty part is `raised`: `raised` on `ground` is too faint to see, `line` on `surface` too harsh.
- **you:** the one hue. Your marks, your line, your current lap, the one primary button per screen.
- **you-tint:** the fill of a split chip and the selected row.
- **on-you:** text on a you-filled button.
- **ghost:** past you. Hollow blocks, dashed lines, grey labels. Never filled, never in a hue.
- **rest:** breaks and rest days only, the calyx green of the tomato.
- **A project's colour** is one of five roles this palette already has: `you`, `rest`, `ink`,
  `ghost`, `heat-2`. It shows as a small square before the project's name, never alone and never
  as a fill behind text. This square is the one place `rest` is not a break, `ghost` is filled and
  `you` is not your own mark; it never sits beside lap squares, which would read as one more lap. A second hue family would break the one rule the look stands on: red
  means you. Five tones tell five projects apart; beyond that the name does the work.
- **heat-1 to heat-3, then you:** the four steps of the heatmap, you mixed into the surface at 22,
  45 and 72 percent, so the scale is one hue getting darker. Zero is `raised`.

## Typography

Barlow Condensed for every figure, Barlow for words. One superfamily, two widths: the condensed
digits let the timer run at 168px on a 412px phone (`figure-xl`) and 300px on a laptop
(`figure-xxl`), and their DIN-like shapes
are the faces of timing boards, made to be read at a distance. Tabular figures (`tnum`) wherever a
number updates, so digits do not jiggle.

The result sentence of a finished lap is `headline` on the phone and `headline-lg` on the laptop;
buttons and panel headings are `body-strong`; the split chip's figure is `figure-sm`.

Files, latin subset, OFL 1.1, in `design/fonts/`: barlow-condensed-500 (21 KB), -600 (22 KB),
barlow-400, -500, -600 (22 to 23 KB each). About 110 KB for the whole app; load the timer weight
first, the rest after first paint.

## Layout

- **Phone, 412 wide:** 20px margins, one column, a bottom bar of five labelled destinations
  (Focus, Today, Progress, Habits, Room). The primary action sits in the lower half, in reach of a
  thumb.
- **The header.** Every screen starts with the same line: the mark and the name at the left, and
  at the right the person: their initial in a circle and their username. That is one 48px target
  and it opens Settings. On the laptop the same chip sits at the foot of the sidebar. Sign out is
  in Settings and nowhere else. Settings is reached from the person, not from the five
  destinations.
- **One left edge.** In a column every block starts at the same x: headings, figures, sentences,
  panels, buttons. The big figures are set so their ink sits on that edge, not their box: the
  tabular digits of Barlow Condensed 600 each carry their own space at the left (a 1 the most, a
  4 the least), measured from pixels and kept as `layout.figure-bearing-0` to `-9`, in em of the
  figure's own size. The timer is pulled back by the bearing of whichever digit leads, so the
  sentence under the digits starts exactly under their ink at 25:00 and at 18:42 alike. Smaller
  figures, where the difference is under a pixel, use the one `layout.figure-bearing`.
- **Rhythm.** Every vertical space is a step of the spacing scale. Things that belong together
  sit `xs` or `sm` apart (the line under the digits belongs to the digits); parts of one block
  `md`; one block from the next `lg`. Nothing related is ever further apart than `lg`.
- **Free space goes to one place.** A screen may have one stretch of space that grows with the
  screen, and it lies under the content: above the action row on a phone, at the bottom of the
  canvas on a laptop. Content never floats in the middle of the screen with space above and
  below it, and two related things are never pushed apart to fill a tall screen.
- **Laptop, 1440:** a 232px labelled sidebar on the ground, the canvas at 32px gutters, a 12-column
  grid of 72px columns and 24px gaps inside 1144px. One gap value, 24px, across and down.
- Between the two, the sidebar collapses to the bottom bar under 720px.
- Touch targets at least 48px. Nothing scrolls sideways.
- These numbers are tokens under `layout:` (`touch`, `sidebar`, `margin`, `gutter`, `gap`, `canvas`,
  and the lane heights `lane`, `lane-set`, `lane-result`).
- Three sizes are written in CSS as numbers, because a media query cannot read a variable: 720px
  (bottom bar below, sidebar from there), 1280px (from there the 300px timer and the rail sit side
  by side), and 412px (below it the phone timer scales with the screen, `figure-xl` times the
  width over 412, so the digits never leave a narrow phone).

## Elevation & Depth

Flat. Surfaces step by tone. Only a menu or a sheet floats, with the one shadow (`shadow.float`).
Behind a sheet the page fades toward the ground (`state.scrim` of ground over it), never to grey or black.
The completion moment is flat and in the page.

## Shapes

Lanes and bars are square ended: a track has no rounded corners. Rows and buttons take 4 to 8px
(`rounded.sm`, `rounded.md`). People and the rest mark are circles. Nothing else is round.

## Components

Built once in `client/src/ui/kit/` and reused.

- **Lap bar:** four segments, 8px tall (`lane`), 4px gaps. Done laps filled in you, the current lap
  filled to its elapsed share, the long break after lap four named in words beside it. In the
  set-of-four moment it stands 24px tall (`lane-set`): that is what makes a set bigger than a lap.
- **Race strip:** two lanes, you over ghost, on one scale; the split between them as a chip.
- **Ghost lane:** the same lane as yours, hollow, with a dashed ghost outline: 1px on a strip, 2px
  on the tall lanes of a result (`lane-result`, 40px), where 1px thins to a hairline.
- **Split chip:** "-19m" in ink on you-tint when behind, "level" in ink on you-tint, "+6m" in
  on-you on a you fill when ahead (you on you-tint is under 4.5:1 at this size).
- **Task row:** a 48px box to mark it done (the app's one stock control), the title, under it the
  project's square and name, and at the right the laps as small squares (filled, in progress,
  empty) with "2 of 4" in `figure-sm` beside them. The count never outweighs the title.
- **The strip of the lap in progress** (on Today): an `ink` bar with `ground` text: the time left,
  the task, and one button drawn as an outline in `ground`. When the lap has rung, its button to
  start the break takes the `you` fill and is the screen's primary; the list's Start steps down
  to secondary.
- **What the last tap did:** an `ink` bar as wide as the list, one line (the title clamps), with a
  quiet underlined Undo. It never covers the row it speaks of.
- **The status line** keeps its space only where buttons sit at the bottom of a phone screen
  (Focus). Elsewhere it takes room when it has something to say and none when it is silent.
- **Heat cell:** a 12px square, 2px gaps, zero to four steps; a rest day carries the rest mark.
- **Room member:** a circle initial, the name, phase and lap ("Focusing, lap 2 of 4"), time left in
  figure-md, the task only if shared, and a Cheer button.
- **Buttons:** every button has a fill, so it reads as something to press: primary is `you` with
  `on-you` text, one per screen at most; secondary is `surface` with a 1px `line` border; quiet is
  `raised` with no border, for the lesser choice beside another button ("Skip break", "I have an
  invite", "Stop and log 6 min"). All 48px tall, `body-strong`, `rounded.sm`. A bare word is never
  a button. On an `ink` bar the bar is the fill, and its button is an outline in `ground`. Hover mixes ink into the fill by `state.hover`, press by `state.press`.
- **Links in a line:** a small action inside a sentence or beside a figure ("Change", "Undo",
  "5 more minutes") is underlined text in `label`, in ink or muted, with a 48px touch target made by padding
  and an equal negative margin, so the line it sits in keeps its height.
  These two, button and underlined link, are the only things that can be pressed besides rows,
  boxes and the navigation. A row is a painted box whose whole surface is the target (a task, a
  destination): its words need no fill of their own because the box is one.
- **The person:** a `raised` circle with the first letter of the username in `body-strong`, and
  the username beside it in `label`. In the header and in a room.
- **Sheet:** slides from the bottom on the phone, a centred panel on the laptop, one shadow.

## Motion

Tokens under `motion:`. Short, and only when state changes.

| Event | Token | Rule |
|---|---|---|
| Hover, press | `press` 100ms | Colour only |
| A lap segment filling, a row arriving | `fill` 160ms | Transform and opacity only, ease-out |
| A sheet or menu | `sheet` 200ms | Transform and opacity |
| The timer | none | Digits change; nothing animates |
| A lap done | `lap-done` 700ms | Your bar runs to meet the ghost's line, the split chip turns over, then the words. Tap anywhere to skip |
| A set of four done | `set-done` 1200ms | The four segments light in turn and the long break is offered. Skippable, once per set |

Under `prefers-reduced-motion` every moment shows its final state at once. No animation runs on a
loop, ever.

An Undo is offered for ten seconds, everywhere, and then goes without a word.

## The reward moment

A finished lap is a race result against yourself: "Level with last Tuesday." over two lanes ending
on one line, the day's total in you, one line of facts, a friend's cheer if one came in, and one
button to start the break. Ahead, it reads "6 minutes ahead of last Tuesday." Behind, it names the
lap that closes the gap. The ghost is never a judge. Every celebration can be turned off in
Settings.

## Voice

A running partner who counts for you. Plain, specific, warm, never a coach shouting.

1. **Numbers before adjectives.** "4 of 5 laps" beats "great progress".
2. **Say what happened, then what is next.** "Level with last Tuesday. Take five."
3. **Behind is a fact with a way back.** "One lap behind last week. The lap you are in now draws you
   level." Never "you missed", never "you failed".
4. **A void pomodoro is set aside,** not lost or failed. A missed day is not mentioned the day after.
5. **No exclamation marks** except in the one big moment of a set, and then one.
6. **Short sentences, one idea each.** Sentence case everywhere, including buttons.
7. **Name the thing, not the feature.** "Who is focusing now", not "Live presence".

Sample strings, the register to match:

- "Finish this lap and you draw level."
- "Level with last Tuesday."
- "Thursday the 19th was a rest day. Two a week keep the streak going."
- "41 of the last 45 days."
- "Not sharing what they are on."
- "Needs a connection. Your laps are safe on this phone."

## Accessibility

- Text contrast at least 4.5:1, large figures at least 3:1, in both themes. The route's review
  found three small labels at 3.8 to 4.4:1 ("10 laps" on Today); fix them by using ink, not by
  shrinking the rule.
- Never colour alone: ahead and behind carry a sign and a word, rest days a mark, the ghost a dash.
- Every control has a label a screen reader can say; the timer announces once a minute, not every
  second.

## Consistency

One rule decides every case: if two things do the same job they look the same, on every screen,
at every size, in both themes. A screen never has its own button, its own heading size, its own
gap or its own grey. When a screen needs something this file does not have, the file gets it
first and the screen uses it second.

`tools/design-audit.mjs` holds the app to this. It opens every state of every screen in a
browser and reads what was drawn: every font, size, weight, colour, radius, border and space
must be a value this file defines, every block in a column must share its left edge, and
everything that can be pressed must be 48px to touch. It runs in `make check`.

## Do's and Don'ts

- Do compare with past you only. Friends are in the Room, side by side, never on a leaderboard
  unless a room opts in.
- Do say behind in plain numbers, with the lap that closes it.
- Do keep one primary action per screen.
- Don't draw a ring timer, confetti, flames, trophies or a mascot.
- Don't colour "behind" red, and don't put the ghost in any hue.
- Don't use gradients, blur, glass, or more than one shadow.
- Don't show a spinner for data that is already on the device.

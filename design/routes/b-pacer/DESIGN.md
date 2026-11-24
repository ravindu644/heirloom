---
version: alpha
name: Pacer
description: Route B, adventurous. Past you is a ghost who runs beside you on every screen. A pomodoro is a lap, a set is four laps, and the day is a race against your usual day, told in splits.
format:
  kind: app screen
  size: [412, 915]
  seen: a phone propped on a desk next to a laptop, glanced at from 60 to 90 cm for a second at a time
  safe: 0.04
idea:
  message: You are racing your own usual day.
  sentence: The past records they used to look back at become a ghost who runs beside them on every screen.
  method: pictorial analogy
  route: adventurous
method:
  name: race timing
  marks: [lanes, splits, square-ended bars, dashed hollow ghost marks, condensed tabular figures]
  allow: []
limits:
  typefaces: 2
  colors: 28
  words: 120
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
---

# Pacer

## Overview

The records they used to look back at become a ghost who runs beside them. Every screen answers "how am
I doing against my usual day?" and nothing else competes with it. The method is race timing: lanes,
splits, laps and condensed figures that read from across a desk. It is clean by nature, so there is
no texture and no hand wobble. Warmth comes from the words, not from decoration.

You are always tomato. The ghost is always grey, hollow and dashed: past you has no colour because
it is only a memory. Being behind is never red. Red means you.

## Colors

- **ground / dark-ground:** the chalk of a lane line, one step off white, so white surfaces read as
  lanes on it. In dark, a true neutral near-black, never navy.
- **surface / raised:** lanes and the active nav pill, separated by tone, not by shadow.
- **ink / muted:** text. Muted passes 4.5:1 on ground and surface in both themes.
- **you:** the one hue. Your marks, your line, your current lap, and the one primary button.
- **you-tint:** the fill of a split chip and the selected row.
- **ghost:** past you. Hollow blocks, dashed lines, grey labels. Never filled.
- **rest:** breaks and rest days only, the calyx green of the tomato.
- **heat-1 to heat-3, then you:** the four steps of the heatmap, you mixed into the surface at 22, 45 and 72 percent, so the scale is the same hue getting darker.

## Typography

Barlow Condensed for every figure, Barlow for words. One superfamily, two widths: the condensed
digits let the timer run at 168px on a 412px phone, and their DIN-like shapes are the faces of
timing boards and road signs, made to be read at a distance. Tabular figures everywhere a number
updates. Files: barlow-condensed-500/600.woff2 (21 KB, 22 KB), barlow-400/500/600.woff2 (22 KB each),
latin subset, OFL 1.1. About 110 KB for the whole app.

## Layout

Phone 412 wide: 20px margins, one column, a bottom bar of five labelled destinations. Laptop 1440:
a 232px labelled sidebar on the ground, the canvas at 32px gutters, a 12-column grid of 72px columns
and 24px gaps inside 1144px. One gap value, 24px, across and down.

## Elevation & Depth

Flat. Surfaces step by tone. Only a menu, a sheet or the completion moment floats, with one shadow.

## Shapes

Lanes and bars are square ended: a track has no rounded corners. Rows and buttons take 4 to 8px.
People are circles. Nothing else is round.

## Components

- **Lap bar:** four segments, 8px tall, 4px gaps. Done laps filled in you, the current lap filled to
  its elapsed share, the long break after lap four named in words beside it.
- **Race strip:** two lanes, you over ghost, on one scale; the split between them as a chip.
- **Task row:** title, project, laps as small squares (filled, in progress, empty), "2 of 4".
- **Split chip:** "-19m" in ink on you-tint when behind, "+6m" in you when ahead, "level" in ink.

## Motion

Short and on state only. Hover and press 100ms. A lap segment filling or a row arriving 160ms,
transform and opacity only, ease-out. A sheet 200ms. The timer ticks without animation. The one
long moment is a finished lap: your bar runs to meet the ghost and the split chip turns over, 700ms,
tap anywhere to skip. Reduce Motion shows the final state at once.

## Do's and Don'ts

- Do compare with past you only. Friends are in the Room, never on a leaderboard.
- Do say behind in plain numbers, with the lap that closes it.
- Don't draw a ring timer, confetti, flames or a mascot.
- Don't colour "behind" red, and don't put the ghost in any hue.

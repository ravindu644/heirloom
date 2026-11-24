---
version: alpha
name: Ripening
description: Route C, scary. A pomodoro ripens. The Focus screen is one flat field that turns from unripe green to tomato red as the 25 minutes pass, read from across the room by colour alone. Every other count in the app uses the tomato's ripening stages.
format:
  kind: app screen
  size: [412, 915]
  seen: a phone propped on a desk next to a laptop, read from across the room by colour alone
  safe: 0.04
idea:
  message: A pomodoro ripens where you can see it from across the room.
  sentence: The tomato's ripening from green to red becomes the timer, a flat field that fills with red over 25 minutes.
  method: extreme situation
  route: scary
method:
  name: flat screen-printed fields
  marks: [hard-edged colour fields, a level with five-minute ticks, an uneven hand-cut calyx]
  allow: []
limits:
  typefaces: 1
  colors: 13
  words: 120
colors:
  ground: "#E8EDDC"
  paper: "#FAFBF6"
  ink: "#1B1A14"
  muted: "#4C5040"
  unripe: "#93B45C"
  ripe: "#EC5135"
  calyx: "#2E6A2B"
  on-calyx: "#FFFFFF"
  stage-green: "#D5E2B3"
  stage-breaker: "#EBCB72"
  stage-turning: "#EE8E4A"
  stage-red: "#D93A22"
  line: "#C9D2B6"
typography:
  clock:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 128px
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: -0.03em
    fontFeature: '"tnum" 1'
  statement:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 40px
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: -0.02em
  heading:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 13px
    fontWeight: 700
    lineHeight: 1.3
rounded:
  sm: 4px
  md: 12px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    height: 52px
    padding: 0 24px
  button-start:
    backgroundColor: "{colors.calyx}"
    textColor: "{colors.on-calyx}"
    rounded: "{rounded.full}"
    height: 44px
  field-work:
    backgroundColor: "{colors.unripe}"
    textColor: "{colors.ink}"
  field-done:
    backgroundColor: "{colors.ripe}"
    textColor: "{colors.ink}"
  task-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 14px 16px
---

# Ripening

## Overview

A pomodoro ripens. While you work, the screen is a flat field of unripe green, and tomato red rises
from the bottom like a level in a jug, with a tick every five minutes. From across the room you do
not read the digits, you read how red it is. When the 25 minutes are up the field is all red and the
calyx, the green star on top of a tomato, is stamped on it: ripe.

Everything else counts in the stages a grower uses to grade ripeness: green, breaker, turning, red.
A planned pomodoro is a green circle, a done one is red. The heatmap ramps through the four stages.

This is the scary route. Whole screens of saturated colour are loud, red-green is the worst pair
for the commonest colour blindness, and red usually means danger. It holds only because the stages
also step in lightness (pale green to dark red) and every state is also written in words.

## Colors

- **unripe / ripe:** the two fields. Ink text passes 4.5:1 on both, so the clock never changes colour.
- **calyx:** the star, the Start button and breaks.
- **stage-*:** the four ripening stages, lightest to darkest, for the heatmap and day cells.
- **ground / paper:** the pale leaf-underside green the lists sit on, and the rows.

## Typography

Atkinson Hyperlegible Next, one family. It was drawn for low-vision readers, with digits that cannot
be mistaken for each other, which is what a clock read from across a desk needs. Files:
atkinson-hyperlegible-next-400/700/800.woff2 (12 to 13 KB each), latin subset, OFL 1.1. About 37 KB.

## Layout

Phone: the field runs edge to edge under the top bar; content keeps 20px margins. Laptop: the field
fills the canvas right of a 224px sidebar. Lists use 12px-radius rows on the ground.

## Elevation & Depth

None. Fields and rows are flat colour.

## Shapes

Circles for pomodoros (they are fruit), full pills for buttons, 12px rows. The calyx is drawn with
a little irregularity, six leaves of different lengths, never a perfect star.

## Components

- **Field:** green ground, red level rising from the bottom, five-minute ticks on the right edge.
- **Fruit row:** a task's pomodoros as 14px circles, red done, half red running, green planned.

## Motion

The red level moves once every 15 seconds, 200ms ease-out, so the screen never shimmers. Buttons
and rows 120 to 180ms. Ripe: the last sliver of green goes, then the calyx stamps in with a
120ms scale from 0.9 to 1, then the words. 900ms in all, tap to skip. A long break ripens a whole
set: four circles turn red one by one, 1.2s, skippable. Reduce Motion: the final colour, no stamp.

## Do's and Don'ts

- Do write the state in words on every field: colour is never the only signal.
- Don't add a gradient between green and red. The level is a hard edge.
- Don't draw a tomato mascot. The calyx is the only drawing.

---
version: alpha
name: Tally
description: Route A, safe. The tally gate (four strokes, one across) is the pomodoro set, and every count in the app is written in strokes. A quiet, type-led page with one hand-made mark.
format:
  kind: app screen
  size: [412, 915]
  seen: a phone propped on a desk next to a laptop, glanced at from 60 to 90 cm for a second at a time
  safe: 0.04
idea:
  message: Every pomodoro you finish is a stroke you get to keep.
  sentence: The tally gate a student scratches on a desk becomes the set of four, and the long break strikes through it.
  method: borrowed format
  route: safe
method:
  name: pen strokes on a quiet type-led page
  marks: [tapered round-ended strokes, a slight lean and bend per stroke, pencil grey for strokes not yet earned]
  allow: []
limits:
  typefaces: 2
  colors: 17
  words: 120
colors:
  ground: "#F3F5F7"
  surface: "#FFFFFF"
  ink: "#18202E"
  muted: "#4A5262"
  rule: "#D9E0E8"
  stroke: "#C2361F"
  stroke-tint: "#F6DDD6"
  pencil: "#B9C2CD"
  on-stroke: "#FFFFFF"
  dark-ground: "#121519"
  dark-surface: "#1A1E24"
  dark-ink: "#E9EDF2"
  dark-muted: "#9AA4B1"
  dark-rule: "#2A3039"
  dark-stroke: "#F0664D"
  dark-stroke-tint: "#3A1F1A"
  dark-pencil: "#4A5260"
typography:
  clock:
    fontFamily: Literata
    fontSize: 132px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: -0.03em
    fontFeature: '"tnum" 1, "lnum" 1'
  heading:
    fontFamily: Literata
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.015em
  body:
    fontFamily: Schibsted Grotesk
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Schibsted Grotesk
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.3
rounded:
  sm: 6px
  md: 10px
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
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    height: 48px
    padding: 0 22px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    height: 48px
  task-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: 14px 0
  tally-done:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.stroke}"
  tally-planned:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
---

# Tally

## Overview

A student scratches four strokes and one across to count. Here that gate is the set of four
pomodoros and the long break that closes it, and it is the only drawn thing in the app. The current
stroke grows from the bottom of the gate to the top as the 25 minutes pass, so the timer is a pen
stroke being written. Everything else is quiet type on a pale page, in the voice of a friend who
keeps your score for you.

This is the safe route: the structure is the one people expect (timer, list, stats), done well.

## Colors

- **ground:** the blue-grey of exercise-book paper, not cream.
- **ink:** ballpoint blue-black, for text and the near-black primary button.
- **stroke:** tomato red, only for strokes you have earned.
- **pencil:** strokes not yet earned (estimates, the gate's slash before the long break).
- **rule:** the ruled lines under list rows, a notebook's lines rather than card borders.

## Typography

Literata for the clock and headings: a book face made for long reading, with tabular lining
figures, so the clock reads like a page number rather than a stopwatch. Schibsted Grotesk for
everything you operate. Files: literata-400/600.woff2 (20 KB, 22 KB), schibsted-grotesk-400/500/700
(24 to 25 KB each), latin subset, OFL 1.1. About 115 KB.

## Layout

Phone: 20px margins, one column, five labelled tabs. Laptop: 224px sidebar, the content on a
centred 1040px column inside the canvas, two columns of 7 and 5.

## Elevation & Depth

None. Rows sit on ruled lines; the only raised thing is the completion sheet.

## Shapes

Buttons are full pills (pens and erasers are round), rows are ruled, not boxed. Strokes are drawn:
each one a tapered quad with a 1 to 3 degree lean and a few percent of length variation, generated
from a seed so the same count always looks the same.

## Components

- **Tally:** strokes 4px wide at 120px tall, 18px apart; the slash crosses at 20 degrees.
- **Task row:** title, project, then its estimate as pencil strokes with done strokes inked over.
- **Clock:** Literata 600, tabular, 132px on a phone, 220px on a laptop.

## Motion

A stroke inks in 180ms when a pomodoro is counted. The growing stroke moves once a minute, not
every frame. Lists and sheets 160 to 200ms, ease-out, transform and opacity. The long-break slash
draws across the gate in 600ms, tap to skip. Reduce Motion: strokes appear complete.

## Do's and Don'ts

- Do write every count as strokes where it fits, and in figures where it must be exact.
- Don't add paper texture, coffee stains or doodles. One hand-made mark is enough.

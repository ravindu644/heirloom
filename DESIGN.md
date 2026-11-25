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
  edge: "#7C827B"
  you: "#C4321A"
  you-tint: "#FBE2DA"
  on-you: "#FFFFFF"
  ghost: "#8A9089"
  heat-1: "#F2D2CD"
  heat-2: "#E4A398"
  heat-3: "#D56B5A"
  rest: "#23704E"
  key: "#E4E7E2"
  key-edge: "#121412"
  key-quiet: "#E4E7E2"
  amber: "#A86A00"
  olive: "#6B7A1E"
  teal: "#0F7B7F"
  sky: "#1F6FB5"
  indigo: "#4B4FC2"
  plum: "#8E3A9C"
  clay: "#8A5A3C"
  dark-ground: "#0E100E"
  dark-surface: "#181A18"
  dark-raised: "#232623"
  dark-ink: "#F0F2EE"
  dark-muted: "#A4A9A3"
  dark-line: "#2B2F2B"
  dark-edge: "#7C827B"
  dark-you: "#FF6A4D"
  dark-you-tint: "#3B1D16"
  dark-on-you: "#140806"
  dark-ghost: "#7C827B"
  dark-heat-1: "#4B2C24"
  dark-heat-2: "#803E30"
  dark-heat-3: "#BE543E"
  dark-rest: "#5DBE8D"
  dark-key: "#343934"
  dark-key-edge: "#343934"
  dark-key-quiet: "#232623"
  dark-amber: "#E3A63A"
  dark-olive: "#B3C255"
  dark-teal: "#4FC3C0"
  dark-sky: "#6FB3EE"
  dark-indigo: "#9A9DF5"
  dark-plum: "#D48AE0"
  dark-clay: "#C99873"
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
    backgroundColor: "{colors.key}"
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
  chart: 192px
  heat-cell: 12px
  heat-cell-lg: 24px
  heat-gap: 2px
  dot: 12px
  stroke: 2px
  hair: 1px
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
  rise: 8px
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
- **edge:** the outline of anything typed into or chosen: a field, a number in a stepper, a choice
  that is off. One grey that stands 3:1 or more against ground, surface and raised in both themes
  (3.4, 3.9, 3.2 in light; 4.9, 4.5, 3.9 in dark), because a field with a `line` edge at 1.3:1 is a
  white box on white to many eyes. `line` stays for dividers and for a button's border, where
  the words inside already say what it is.
- **you:** the one hue. Your marks, your line, your current lap, the one primary button per screen.
- **you-tint:** the fill of a split chip and the selected row.
- **on-you:** text on a you-filled button.
- **ghost:** past you. Hollow blocks, dashed lines, grey labels. Never filled, never in a hue.
- **rest:** breaks and rest days only, the calyx green of the tomato.
- **A project's colour** is the one place another hue lives (the user's choice, 2026-11-25:
  five tones could not tell a term's subjects apart). Twelve are offered by name: `you`, `rest`,
  `ink`, `ghost`, `heat-2`, and `amber`, `olive`, `teal`, `sky`, `indigo`, `plum`, `clay`, each
  with a dark twin at 3:1 or more on `surface`. A thirteenth choice, "Another colour", opens the
  device's own colour picker; what is picked is shown as picked on both grounds, inside a `hair`
  line of `edge` so a pale one still shows on a pale ground. Whatever the colour, it is a small
  square before the project's name and nothing else: never alone, never a fill behind text, never
  a bar or a line (a project's bar stays `ink`), and never beside lap squares, which would read
  as one more lap. Red still means you everywhere else.
- **key, key-edge, key-quiet:** the secondary button's fill and its line, and the quiet button's fill. See Buttons.
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
  at the right the person: their username, then their initial in a circle. The circle stands on
  the edge the chip hangs from, so a longer name never moves it: at the top right the name comes
  first and the circle ends on the column's right edge; at the foot of the laptop's sidebar and
  in a row the circle comes first, on the left edge. That is one 48px target and it opens
  Settings. On the laptop the same chip sits at the foot of the sidebar. Sign out is
  in Settings and nowhere else. Settings is reached from the person, not from the five
  destinations.
- **One left edge.** In a column every block starts at the same x: headings, figures, sentences,
  panels, buttons. The big figures are set so their ink sits on that edge, not their box: the
  tabular digits of Barlow Condensed 600 each carry their own space at the left (a 1 the most, a
  4 the least), measured from pixels and kept as `layout.figure-bearing-0` to `-9`, in em of the
  figure's own size. The timer is pulled back by the bearing of whichever digit leads, so the
  sentence under the digits starts exactly under their ink at 25:00 and at 18:42 alike. Every
  figure from `figure-lg` up that starts a column is pulled back the same way (the streak's
  number over its dots); at `figure-md` and under the difference is less than a pixel and none
  is applied.
- **Rhythm.** Every vertical space is a step of the spacing scale. Things that belong together
  sit `xs` or `sm` apart (the line under the digits belongs to the digits); parts of one block
  `md`; one block from the next `lg`. Nothing related is ever further apart than `lg`.
- **Free space goes to one place.** A screen may have one stretch of space that grows with the
  screen. On a laptop it lies at the bottom of the canvas. On a phone the screen is two groups:
  what it says, at the top, and what to do next, at the bottom, which is the action row with the
  sentence that explains it directly above ("Take five." belongs to "Start 5 min break"; "Start
  now and it ends at 09:30." belongs to "Start lap 1"). The free space lies between those two
  groups and nowhere else. It never splits a group: a sentence is not left at the top while its
  button waits at the bottom, and content never floats in the middle with space above and below.
- **Nothing scrolls sideways,** with one exception: on a phone the year scrolls inside its own
  panel. And on a phone the page itself never scrolls: the screen's content scrolls between the
  header and the bottom bar, which stay where they are.
- **A form is the exception to the lower half:** its button follows its last field, wherever
  that is, because that is where the eye and the thumb already are.
- **Settings on a laptop** is two columns, like Progress: what tunes the timer on the left (laps
  and breaks, day target, starting by itself, the bell, a finished lap), and the account, rooms
  and your copy on the right. Never one long narrow column beside an empty half.
- **Laptop, 1440:** a 232px labelled sidebar on the ground, the canvas at 32px gutters, a 12-column
  grid of 72px columns and 24px gaps inside 1144px. One gap value, 24px, across and down.
- Between the two, the sidebar collapses to the bottom bar under 720px.
- Touch targets at least 48px. Nothing scrolls sideways.
- These numbers are tokens under `layout:` (`touch`, `sidebar`, `margin`, `gutter`, `gap`, `canvas`,
  and the lane heights `lane`, `lane-set`, `lane-result`).
- Three sizes are written in CSS as numbers, because a media query cannot read a variable: 720px
  (bottom bar below, sidebar from there), 1280px (from there the 300px timer and the rail sit side
  by side), and 412px, the width the phone is drawn for.
- **Nothing breaks down to 320 wide.** That is a small phone, and it is also a 412 phone at 130%
  or a laptop window zoomed to 400%. Down to 320 the page never scrolls sideways: a username in
  the header is cut with an ellipsis, a button's words wrap, a row gives up its picture before
  its words.
- **The order of the page is the order of the eye.** Tab and a screen reader meet the header
  first (the mark, then the person), then the screen, then the bottom bar, whatever the CSS does
  to place them.
- **The keyboard takes the bottom bar's place.** While the keyboard is up on a phone the bottom
  bar is not drawn, so the field being typed in keeps the room; the bar is back the moment the
  keyboard goes, also when the field still has focus.
- **A phone is not always 412 wide.** The first real one measured 471. Under 720px the layout is
  fluid: every column runs from margin to margin (fields, panels and button rows fill it; a
  measure in `ch` caps a line of text only from 720px up), and the timer keeps its share of the
  width, `figure-xl` times the width over 412, smaller on a narrow phone and larger on a wide
  one, never past `figure-xxl`. Pictures and the audit are taken at 412 and at 471.

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
  empty) with "2 of 4" in `figure-sm` beside them. The count never outweighs the title. When
  the row ends in a control (Start, Restore, Up and Down), the squares and count sit to its
  left, centred on it and `md` away, so every row's count ends on one of two edges and never
  touches a button. In such a row narrower than 400px the squares give way and the count stays:
  the title is worth more than the picture of a number already written.
- **The strip of the lap in progress** (on Today): an `ink` bar with `ground` text: the time left,
  the task, and one button drawn as an outline in `ground`. When the lap has rung, its button to
  start the break takes the `you` fill and is the screen's primary; the list's Start steps down
  to secondary.
- **Habit row:** the task row's box at the left (the same job, so the same control: on a day
  already done it takes the latest check-in back), the title, under it the plan and the run in
  `label` ("Every day, 9 days running"), a count on its way in `figure-sm` beside the words
  ("2 of 3"), and the week: seven lanes `lane-set` tall and `xs` apart under M T W T F S S, each
  letter centred on its lane. Done is filled in `you`, a count is filled that far, a rest day
  carries the ring, a day not planned is a `stroke` line and never a miss, today has a `hair`
  outline. Everything but the box opens the habit.
- **A choice** (a weekday, one room of several, a project's square): off is `surface` with a
  `hair` `edge` border; on is `ink` with `ground` text. On and off must differ by more than a
  border, and neither may look like a quiet button. The seven weekdays always share one row:
  under 400px they narrow equally and keep their 48px height.
- **Switch row:** the words at the left, a note under them in `label` when one is needed, the
  stock box at the right; the whole row is the target. A row is as tall as its words and never
  under `touch` less `md`, so two one-line rows still give a finger 48px each; rows with and
  without a note keep the same `md` between them.
- **Stepper:** minus, the figure, plus. For a small count ("Once a day", "8 laps a day") the
  figure is text. For a length in minutes the figure is a number field with the unit as a word
  beside it, so 25 to 50 is typed once, and minus and plus are for nudging.
- **Links at the end of a list** ("Change the order", "Archived, 1", "Recently deleted, 1") sit on
  one line, `md` apart, wrapping when they must.
- **A mark:** one line in `label` under the result, in the top group, quieter than the result.
  No badge, no icon, no wall of them.
- **Nothing is drawn disabled to say that something happened.** What happened is a sentence
  ("You and sachi cheered this lap."), and the button that did it goes. A button may be busy for
  the moment its own press takes ("Signing in"), and nothing else.
- **The status line** keeps its space only where buttons sit at the bottom of a phone screen
  (Focus). Elsewhere it takes room when it has something to say and none when it is silent.
- **Heat cell:** a square with 2px gaps (`heat-gap`), zero to four steps, in two sizes chosen by
  fit: 24px (`layout.heat-cell-lg`) while all the weeks fit their panel, which is also a size a
  finger can hit, and 12px (`layout.heat-cell`) once they do not. A short history is never a
  stamp in the corner of an empty panel. On a laptop a year that outgrows its half panel takes
  the canvas's full width instead of scrolling. A rest day carries the rest mark, a hollow
  `rest` ring inside the square. Today has a `hair`
  outline in ink, the chosen day a `stroke` one.
- **The week's chart:** drawn by hand, `layout.chart` tall. A line's label stands clear of the
  other line: above its dot when it is the upper line or near the floor, below otherwise. Your running total is a solid `you`
  line of `stroke` width that ends in a `dot` with its figure; last week's is a dashed `ghost`
  line with its total at its end. Grid lines are `hair` in `line`. No fill under a line, no
  legend box, no gradient: a line is labelled where it ends, and a sentence under the chart
  says what it shows.
- **The row of days:** fourteen `dot`s, `xs` apart: a kept day filled in `you`, a rest day the
  hollow `rest` ring, an empty day an empty-track dot, today open until it has a lap. The
  states differ by shape as well as colour.
- **A day's timeline:** a `lane-set` lane on an hour axis, each hour's label centred on its hour
  (only a label at the lane's very end is pulled in): laps in `you`, breaks in `rest`, a
  lap set aside hollow. Two laps that ran on two devices at once sit on two rows and say so
  in words. Under it the same sessions as rows, because a block is too small to press.
- **A project's bar:** a `lane` in `ink` (never the project's colour), with a dashed `ghost`
  mark for the seven days before.
- **A person's circle** carries the first letter of their username everywhere, also where the
  words beside it say "You".
- **Room member:** a circle initial, the name, phase and lap ("Focusing, lap 2 of 4"), time left in
  figure-md (in `rest` on a break), the task only if shared, today and the week in `label`, who
  cheered, and a Cheer button: full width on a phone, its own width on a laptop. Side by side on
  a laptop the panels of a row are equally tall and each button is pinned to its panel's foot,
  so a row's buttons share one line. The room's own settings are an underlined link at the right
  end of the line that names the room, never a button between the finding and the week.
- **Buttons:** every button has a fill, so it reads as something to press: primary is `you` with
  `on-you` text, one per screen at most; secondary is `key` with a `hair` line of `key-edge`;
  quiet is `key-quiet` with no line, for the lesser choice beside another button ("Skip break",
  "I have an invite", "Stop and log 6 min"). **Secondary always outweighs quiet,** in both themes
  and on whatever it stands. In dark the weight is a fill: `key` is one step lighter than
  `key-quiet`, and its edge is its own colour. In light there is no room above the ground for a
  second lighter step and a darker grey reads as switched off, so the weight is a line: the same
  grey fill as quiet, inside a hair of ink. How this was found: the two were `surface` and
  `raised` in both themes and Stop outweighed Pause in dark (the user); then two greys, and
  "Start" beside the break button looked disabled in light (the review). A pair of buttons is
  looked at side by side in light and in dark, on the ground and on a panel, before it ships. A
  secondary is never mistaken for a choice, which is `surface` with a grey `edge`. All 48px tall, `body-strong`, `rounded.sm`. A bare word is never
  a button. On an `ink` bar the bar is the fill, and its button is an outline in `ground`. Hover mixes ink into the fill by `state.hover`, press by `state.press`.
- **The button in a field:** where one field alone makes something on Enter (quick add, a
  subtask), a secondary button stands at its right end with the word "Add", inside the field's
  box, from the first character typed until the field is empty again. Enter does the same. A
  field never depends on a key the phone's keyboard may not show. A form of more than one thing
  (a new project: its name and its square) keeps its button after its last field, as every form does.
- **What the last tap did** (the `ink` bar: "Added: Hello."), one line with a quiet underlined
  Undo when the tap can be taken back; a long title gives way last, and the sentence after it
  shows whole or not at all, never cut mid-word. It is as wide as the column
  it stands in and stands at the bottom of the screen: over the
  bottom bar's upper edge on a phone, at the foot of the content column on a laptop, `md` from
  the edges. It is not part of the list, so a short list does not leave it in the middle of the
  screen, and it never scrolls the page to make room for itself; the list keeps a bar's height
  free at its end instead, and for its few seconds the bar may lie over the last rows in view,
  the one it speaks of among them. It rises in, and goes by itself: after four seconds when it only
  reports, after ten when it carries an Undo.
- **An error has its own line.** It appears directly above the buttons it answers, in ink, with
  `role="alert"`, and opens in place, moving those buttons down by its own height, in time: the
  one case where the thing just pressed moves, because the answer has to be where the eye is. It
  is not cleared and opened again on the next try, which would move the buttons twice. It never takes the place of a hint, an intro or a label:
  what was readable before the mistake is readable after it. (The server step's refusal, which
  took the intro's place, follows this rule too.)
- **The day target's editor** opens in place under the bar: a label ("Laps to run today"), the
  stepper, "Done" as a secondary button, and, apart from them at the row's end,
  the link "Remove the target". Every tap of the stepper is already kept; Done only closes.
  Two links side by side that both close an editor are never offered.
- **The welcome:** what heirloom is, for someone who has never seen it. The mark and name, one
  headline, four short lines (a lap, the day's plan, habits, a room), one line on where it lives
  (a server you or a friend runs), and in the phone app one primary button to the server step.
  The phone app shows it once, before the server step; the browser shows the same lines beside
  the sign-in form from 720px and under it below. No pictures of screens, no pages to swipe, no
  feature grid: it is one screen of sentences in the app's own voice.
- **Links in a line:** a small action inside a sentence or beside a figure ("Change", "Undo",
  "5 more minutes") is underlined text in `label`, in ink or muted, with a 48px touch target made by padding
  and an equal negative margin, so the line it sits in keeps its height.
  These two, button and underlined link, are the only things that can be pressed besides rows,
  boxes and the navigation. A row is a painted box whose whole surface is the target (a task, a
  destination): its words need no fill of their own because the box is one.
- **The mark:** the colon of the big timer, and its two dots are the two runners. The upper dot
  is you, filled in `you`; the lower is the ghost, hollow and dashed in `ghost`, as wide as the
  upper one. One over the other, never side by side. Beside the name it is as tall as the name's
  line, so it never makes the header taller; at that size the ring's line is a little heavier and
  has six dashes, or it fades on a screen of one pixel to the point. Where only one colour is allowed (the status bar, a themed icon) the
  upper is filled and the lower dashed: eight dashes, six under 24dp, where eight run together.
  Chosen 2026-11-25 from five; the others are kept in `design/logos/`.
- **The person:** a `raised` circle with the first letter of the username in `body-strong`, and
  the username beside it in `label`. In the header and in a room. Which side the circle is on:
  see The header.
- **The server step:** the phone app's first screen, and what "Change" on the sign-in screen
  opens. The header's mark and name, a headline, one field ("Server", with the hint that an invite
  link works too, and an address as its placeholder so the shape is seen before the first try) and one primary button under it; the sentence that answers a refusal takes the
  place of the intro, as on the sign-in screen, and is written to the intro's length so the field
  under it does not move. Nothing else: no logo wall, no steps counter.
- **A link to give away** (an invite): shown as Room shows its code, whole, in `body`, breaking
  only where it must: after `/join/` first, so the invite itself stays in one piece wherever the
  width allows. It never runs past the edge. Copy is a secondary button under it, and is called
  "Copy the link" wherever it appears. Where the
  browser may not copy (plain `http`), the sentence says so and the link stays selectable.
- **Invites and Admins** are panels in Settings, and only for those whose role has them. On a
  laptop they stand in the account's column under Account. On a phone, where the page is one
  column, they come after what a person tunes every week (the lengths, the day target, starting by
  itself, the bell, a finished lap) and before Rooms and Your copy: running the server is rarer
  than changing a lap. As for what is drawn: nothing is drawn disabled for a member. A row is the thing (the
  link's last characters and the day it runs out; a person's circle and name), with its actions as
  links in a line at the row's end; on a phone, where three do not fit beside the words, the line
  of links stands under them. What cannot be undone (taking a link back) takes a second tap; what
  can (back to member) is done at once and leaves an Undo. The field that makes an admin follows the list, its button
  after it.
- **Sheet:** slides from the bottom on the phone, a centred panel on the laptop, one shadow. On a
  phone a sheet in which something can open (a task, a habit, a room's settings) is 90 percent of
  the screen tall whatever it holds, so that what opens inside moves only what is under it; a
  sheet that cannot grow is as tall as its content.

## Motion

Tokens under `motion:`. Short, and whenever state changes: a thing that appears, goes, opens,
closes or moves does so in time, never between two frames. The user's first hour with the app
found none of this and called it the one thing that makes the rest feel finished.

| Event | Token | Rule |
|---|---|---|
| Hover, press | `press` 100ms | Colour only |
| A screen is changed | `fill` 160ms | The new screen fades in and rises `rise`; the old one is gone at once |
| A row arrives, goes, is done or is moved | `fill` 160ms | It fades and its height opens or closes, so the rows under it glide to their place |
| Something opens in place (an editor, a form, a panel's extra lines, an error) | `fill` 160ms | Its height opens; what is under it glides |
| A box ticked, a switch thrown, a figure stepped, a lap segment filling | `fill` 160ms | The mark draws, the knob slides, the fill runs |
| A sheet or menu | `sheet` 200ms | It slides `rise` and more from the bottom on a phone, fades and rises on a laptop; its scrim fades |
| What the last tap did | `sheet` 200ms | Rises `rise` in, fades out |
| The timer | none | Digits change; nothing animates |
| A lap done | `lap-done` 700ms | Your bar runs to meet the ghost's line, the split chip turns over, then the words. Tap anywhere to skip |
| A set of four done | `set-done` 1200ms | The four segments light in turn and the long break is offered. Skippable, once per set |

Code that needs a duration reads it through the kit's one function, in milliseconds: the built
CSS writes `200ms` as `.2s`, and a bare `parseFloat` of a token made every glide last 0.16 ms in
the built app while the dev server looked right.

All with `ease`. Under `prefers-reduced-motion` every moment shows its final state at once. No
animation runs on a loop, ever. Motion is built into the kit (a row, a sheet, an opening, the
bar), so a screen gets it by using the kit and never writes its own.

**What you tapped stays under your finger.** After a tap, the control tapped is where it was on
the screen, to the pixel, unless the tap was a move to another place. (At the very top of a
page, where nothing can scroll, a thing closing above the control carries it up, in time.) The four ways a page
jumps, each seen by the user:

1. Something above the control changes height (a total, a panel that appears or goes). The
   scroll is corrected in the same frame so the control does not move.
2. One slot shows two things of different size (a hint and an error, a link and an editor). Each
   gets its own place, or the slot keeps the larger one's size.
3. Code scrolls the page (`scrollIntoView`, `scrollBy`, a focus moved by script) on a resize or
   after a redraw. Script scrolls only as the direct answer to a tap that asks for it.
4. A list sorts itself under the finger. The row tapped keeps its place until the pointer has
   left it.

**A keyboard is the phone's business.** A screen with a field does nothing when the window
resizes: no script scrolling, no height recomputed in code (the shell hiding the bottom bar while
a keyboard is up is the one thing a resize may do). The field the person is typing in is
brought into view once, by the browser, with `scroll-margin` giving it room for its button.

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
4. **A void pomodoro is "not counted",** not lost or failed, and the button says what it does:
   "Don't count this lap", "Count it again". (It was "set aside" until the user read "It counts
   nowhere" and asked: in what?) A missed day is not mentioned the day after.
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

- **Old news is never said in the present.** When a screen shows what it last heard (a room with
  no connection), the finding says so ("2 of 4 were focusing when the room was last heard
  from.") and nothing counts down for anyone but you.
- **The app writes times as 16:40.** The platform's own time and date fields speak as the device
  is set (4:40 PM, 11/24/2026); that is the device's voice and is left alone.

- **Plain http is said once, where the address is typed and under the account in Settings,** as
  a fact and not an alarm: "This address is plain http. Anyone on the same network can read what
  is sent, the password too." No icon, no colour of its own.
- **A role is named by what it does.** "You can invite people here." "You decide who can invite."
  The words owner and admin appear as labels on a person, never as a rank to admire.

## Accessibility

- Text contrast at least 4.5:1, large figures at least 3:1, in both themes. The route's review
  found three small labels at 3.8 to 4.4:1 ("10 laps" on Today); fix them by using ink, not by
  shrinking the rule.
- Never colour alone: ahead and behind carry a sign and a word, rest days a mark, the ghost a dash.
- Every control has a label a screen reader can say; the timer announces once a minute, not every
  second.

- **The focus ring** is 2px solid `ink`, 2px off the thing, on everything that takes focus by key,
  and never removed.
- **A name says which.** Two controls on one screen never share an accessible name: "A lap, one
  minute more", not "One minute more" three times.
- **Nothing is announced that is not so.** A status line speaks only of what has happened: no
  "No connection" in the moment before the first connection is made.

## It is an app, not a page

- **Nothing selects.** Words on a screen are not text to drag over: `user-select: none` on
  everything, in the browser as in the phone app, with no long-press callout and no tap
  highlight. Two exceptions, by name: what is typed into (every field), and what is there to be
  copied (an invite link, a room's code, the server's address).
- **A word that can be pressed looks pressable.** See Buttons and Links in a line.

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
- Don't let anything appear, go or move between two frames, and don't let a tap move the page.
- Don't let words be selected, or an error take the place of a hint.

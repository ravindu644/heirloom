---
version: alpha
name: heirloom
description: Past you is a ghost who runs beside you on every screen. A pomodoro is a lap, a set is four laps, and the day is a race against your usual day, told in splits. Chosen 2026-11-24 from three routes; the demo states in client/demo.html are the visual reference.
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
  card: "#E4E7E2"
  card-track: "#D5D9D3"
  amber: "#A46700"
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
  dark-card: "#343934"
  dark-card-track: "#181A18"
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
  figure-xxl-long:
    fontFamily: Barlow Condensed
    fontSize: 200px
    fontWeight: 600
    lineHeight: 0.9
    letterSpacing: -0.01em
    fontFeature: '"tnum" 1'
  figure-xl-long:
    fontFamily: Barlow Condensed
    fontSize: 112px
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
  day-sliver: 240px
  day-split: 96px
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
  hold: 350ms
  rise: 8px
  lap-done: 700ms
  cheer: 600ms
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

The demo states in `client/demo.html` (every screen and state, at phone and laptop sizes, light and
dark, as `tools/design-audit.mjs` opens them) are the reference for every screen. Where this file
and a screen disagree, this file wins and the screen is changed.

## Colors

Light tokens have plain names; each has a `dark-` twin. `tools/tokens.mjs` writes both into
`tokens.css`: the dark set under `prefers-color-scheme: dark` unless the page is set to light
(`data-theme="light"` on `<html>`), and always when it is set to dark (`data-theme="dark"`).

- **ground:** the chalk of a lane line, one step off white, so white surfaces read as lanes on it.
  In dark, a true neutral near-black, never navy.
- **surface / raised:** lanes and the active nav pill, separated by tone, not by shadow.
- **card / card-track:** a rectangle that groups rows inside a surface panel (a task's card in the
  day), and the empty track of a sliver or square on it. Light it is `raised` (1.25:1 on surface);
  dark `raised` on `surface` is 1.12:1, too faint to see as a shape, so it steps to `key`'s grey (1.48:1).
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
  with a dark twin at 3:1 or more on `surface`. A thirteenth square, "Pick", stands after
  the twelve in a place of its own and never moves: it opens the app's own picker in place under the squares, two
  sliders (which colour, and from pale to deep; the first is drawn at the depth the second
  holds, so the strip is never louder than the colours it gives), and then carries the picked colour itself. (It
  was "Another colour" and opened the phone's picker, which shows a list of squares of its own
  before the real one; and the picked colour took a place in the row and pushed the button to
  the next line.) What is picked is shown as picked on both grounds, inside a `hair`
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

**A size follows the job, never the screen.** Things that do the same job in one space (a
panel, a sheet, a row of controls) are the same size, and the same job is the same size on every
screen. The app may use any role this file defines where it suits; what it may not do is set two
peers apart, as a room's sheet did when its switch's words, its group names and the notes under
each came in four or five sizes. Figures (a code, a count, a time) are their `figure-*` role. The
words of a panel or a sheet, by job:
- `label` (13px): the name of a field, a setting or a group ("Its name", "Together in a week",
  "Who is in"), a sheet's header, and every note or helper under something ("Whoever has it can
  join.", "Most focus first, for everyone in this room.").
- `body` (16px), `body-strong` at the same size: a sentence that says something, whatever is typed
  or picked, a switch row's words ("Order by this week"), a person's name in a list, a panel's
  heading and a button (`body-strong`).
- `title` (24px): a screen's own heading where it has one.

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
  its words. Narrower still (206px is a 412 phone at 200%) nothing is cut to a sliver or run
  together: the bottom bar's five words keep a gap between them, the header's username goes
  whole when it cannot be read, Today's three figures stack, and a headline steps down a size
  before a word breaks inside.
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
(`rounded.sm`, `rounded.md`). People, the rest mark and the count of waiting notes are circles. Nothing else is round.

## Components

Built once in `client/src/ui/kit/` and reused.

- **Lap bar:** one segment for each lap of a task's estimate, 8px tall (`lane`), 4px gaps. A lap
  that rang is filled in you; one that was stopped is filled as far as it ran and stays that way,
  so the bar never says more than was done; the current lap is filled to its elapsed share. Past
  the estimate a segment is added for each lap. When the lap just done is the task's last
  estimated one, the bar stands 24px tall (`lane-set`): the task's laps are all in. Today draws
  the same bar for the day's target.
- **Focus's buttons** keep the foot of the screen in every state, and the one quiet line over them
  holds what is lesser: "Undo", "5 more minutes", and after a bell or in a break "Done for now"
  at its right end. The buttons never move because a lap rang.
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
  touches a button. The title always has
  its room: it breaks between words and never inside one, runs to two lines at most, and the
  line under it does the same; whatever is at the right gives way first. The squares
  stand eight to a line and up to four lines, 32 in all, like a small year: they fill from the
  right edge, the newest line at the foot, and the count ("3 of 12") is always at the right
  edge. The squares and their count are one thing and never part: the squares at the left,
  the count at the right. In a row 720px or wider the pair stands beside the title, as before
  (left of the row's control when it has one). In a narrower row it stands at the right end
  of the project's line, under the title, in every row alike, so a list's rows are one height
  and the counts one column; it takes a line of its own only where that line is full or the
  task has no project and no day to show. It never hides. (Placed by each title's length, the
  counts of one list stood at two heights and some rows grew a third line beside a half-empty
  one.) A row holding more
  than 32 shows its count alone. (The user typed 45 laps into an estimate: the squares ran off
  the card and the title stood one letter to a line; then a top of 8 was too few.)
  In a row narrower than 280px (a phone at 200% zoom) the row's end, count and button, goes
  under the words: the title is never what gives way.
  A row that ends in two links ("Restore", "Delete for good") follows the invite row on a phone:
  the links stand under the words, so the title keeps the row's width.
- **Every number a person can raise has a top,** and the row that shows it is looked at with the
  top in it: an estimate stops at 32 laps, a day's target and a habit's count at theirs. A stepper
  at its top shows its plus as off.
- **Putting rows in order:** press and hold a row and it lifts (`raised`, the one shadow, a `hair`
  line of `ink`); an empty lap square on it takes `line`, since `raised` is what an empty square is made of;
  it then follows the finger or the mouse up and down, the rows it passes glide
  out of its way, and letting go sets it down. A short tap still opens the row and a swipe still
  scrolls the page: only a hold that has not moved picks a row up. A mouse cannot scroll by
  dragging, so with a mouse a press that moves picks the row up at once, as a desktop drag does
  (a held mouse that did not move fast enough did nothing at all). With a keyboard, Alt and the
  arrow keys move the row that has the focus, and a screen reader hears where it now stands.
  No mode, no link, no handle to find first. (It was a link, "Change the order", that turned the
  list into another screen with Up and Down on every row.) Today's open tasks are one list to
  the hand: a row can be set down anywhere among Next, Later today and Upcoming. Set down at
  the top it is Next, and what was Next is the first of Later today. A row carried up out of
  Upcoming is for today from then on, and the bar says so with Undo ("Moved to today."); a row
  is not carried down into Upcoming, since that would need a day, which is given in the task:
  let go there it returns, and the bar says why ("To plan it for another day, set its day in
  the task."). The bar after a carry up names what was replaced: "Now due today. It was
  tomorrow." Upcoming reads by day until a hand moves a row. **The list answers before the
  release:** the moment a lifted row is over the top place it wears the Next card's outline
  (and its Start), and what was Next glides down to the head of Later today as an ordinary row,
  the "Later today" heading moving with it; moved away again, both go back. Letting go then
  changes nothing on screen but the shadow. While a row is carried no two resting cards
  overlap, and the place it would land is always open; the carried card itself passes over
  whatever is under the finger, headings included. Carried back to where it was picked up, the
  list is as it was.
  **While a lap runs, its task is in the strip at the top and nowhere else on Today:** its row
  leaves Next and Later today for the lap's length and comes back to its place when the lap
  ends; Next is the first open task that is not running. The task's title in the strip opens its
  sheet, as its row would, so it can be edited, done or deleted while it runs. **A task deleted while its lap runs**
  keeps its lap (the minutes are the person's) and is still named on Focus (with its project),
  in the strip and in Progress's day, with its minutes under its project, for as long as it is in
  Recently deleted, where Undo brings it back. Purged, it is named nowhere; its minutes stay in
  the day, and in its project's totals, which never lose time because a task went. The lap in
  progress is in Progress's day as it counts, said as running; paused, or past its bell and not
  yet saved, it says so and ends where it stopped.
  A row with nowhere to go does not lift: the only open task stays where it is. (Upcoming
  could not be put in order at all, and the one task under Next lifted to go nowhere.)
- **The strip of the lap in progress** (on Today): an `ink` bar with `ground` text: the time left,
  the task, and one button filled `ground` with `ink` text: the strip is the page turned inside out,
  and so is its button. (A grey `key` button on it could not be told from the strip.) When the lap has rung, its button to
  start the break takes the `you` fill and is the screen's primary; the list's Start steps down
  to secondary.
- **A task with subtasks:** its own box stays at the left and finishes the task, open subtasks
  and all (Jira's rule: ticking every subtask finishes nothing but them, so "3 of 3 subtasks"
  beside an empty box is a task still to finish, still Next). The opener is a band at the
  card's foot, a row of its own under a `hair` rule, `touch` tall: the fold arrow in the box
  column (centre 28px), "1 of 3 subtasks" in body on the words' edge (56px), and the whole band
  is the target (the user found a small link with a tiny arrow on the project's line too weak
  next to Habits' arrow). Open, one short row per subtask follows the band on the same two
  edges: its box in the box column, its words on 56, struck through in `muted` when done and
  kept where it stands; tapping the words ticks it too. Only ticking happens there: no field,
  no editing, no Remove. A task with subtasks is a band taller, closed. Carried by hand with
  its subtasks open, a task folds them away as it lifts and is set down closed; so does a habit
  with its times open. A hold that moves it nowhere opens them again. **The running task:**
  its subtasks hang under Today's strip as the same band and rows (R1), the strip's dot centred
  28px in and its time on 56 so the band lines up under it; paused, they stay; in a break the
  strip is the break's and holds none (they are back on the task's row, open if the strip's
  was); a task with no subtasks changes nothing. Focus does not show them. Making, renaming,
  removing and ordering subtasks is the task's sheet's: there they are rows of words with no box
  (tap a title and it is a field where it stands, each change kept as typed, an empty one
  keeping the last; "Remove" at the row's end, and where it stood the sheet says "Removed:
  <title>." with Undo for ten seconds, since a bar would be under the sheet; press and hold to
  move one among its own; done ones struck through), and "Add a subtask" at the foot.
- **Habit row:** two edges and only two: the control column (a `touch` target, its mark
  centred 28px from the row's left) and the words' edge, 56px in, where the title, the line under
  it, a round's words and (under 720px) the week all start; from 720px the week has its own
  column at the row's right end; every habit lines up down the list. Under the
  title, the plan and the run in `label` ("Every day, 9 days in a row"; "9 full days in a row" for a
  habit done more than once a day, since a part-done day does not add; after a miss "9 of the
  last 14 days"; nothing while the run is 1). The week: seven lanes `lane-set` tall and `xs`
  apart under M T W T F S S, each letter centred on its lane, at the row's foot. Done is filled
  in `you`, a count is filled that far, a rest day carries the ring, a day not planned is a
  `stroke` line and never a miss, today has a `hair` outline. A habit done once a day has the
  stock box in the control column (on a day done it takes the check-in back). A habit done
  more often has the fold arrow there instead, and at the end of the title's line its count in
  squares and `figure-sm`, as a task's laps ("3 of 5"). Open, one short row per round under the
  title, its box in the control column and its words on the words' edge: the round's reminder
  time in body with tabular figures ("08:00"), "No time set" in `muted` where it has none, and
  when ticked "done at 08:12" in `label`. A tap on a box ticks that round or takes that round back,
  in any order (the user's rule: skip 08:00, do 12:00, and 12:00 is what is ticked). An untimed
  round says which one it is ("4th time"). On Habits the box is the only undo: a check-in or a
  take-back raises no bar and no Undo, and the habit's sheet has no "Take one back" (the user:
  one way, the one you can see, beats three). Today keeps its bar and Undo. Opening one leaves the others open: closing a row above
  would move the one just tapped. Everything but the controls opens the habit.
- **The fold arrow:** two strokes, drawn as the tick is, `stroke` wide in `ink`: down is
  closed, up is open, turning on `motion.fill`. It opens rows in place and is the one sign for
  "there is more of this row" (a habit's rounds, a task's subtasks). It always stands in the
  box column of a row of its own: a habit's row, a task's band, the strip's band.
- **A choice** (a weekday, one room of several, a project's square): off is `surface` with a
  `hair` `edge` border; on is `ink` with `ground` text. On and off must differ by more than a
  border, and neither may look like a quiet button. The seven weekdays always share one row:
  under 400px they narrow equally and keep their 48px height.
- **Switch row:** the words at the left, a note under them in `label` when one is needed, the
  stock box at the right; the whole row is the target. A row is as tall as its words and never
  under `touch` less `md`, so two one-line rows still give a finger 48px each; rows with and
  without a note keep the same `md` between them.
- **Stepper:** minus, the figure, plus. At its top the plus is off, at its bottom the minus: the
  `key-quiet` fill with no line in both themes, its sign in `muted`, and it takes no press. (Off
  was first "the key without its line", which in dark, where a key has no line, changed nothing.) For a small count ("Once a day", "8 laps a day") the
  figure is text. For a length in minutes the figure is a number field with the unit as a word
  beside it, so 25 to 50 is typed once, and minus and plus are for nudging.
- **Links at the end of a list** ("Archived, 1", "Recently deleted, 1") sit on
  one line, `md` apart, wrapping when they must.
- **A row's own links** (Restore and Delete for good, Remove, Lower) stand in the same place in
  every row of a list. Where they go is decided by the list's own width, never by one row's
  words: from one width up they sit at each row's right end and a long title wraps beside
  them; under it they sit on their own line under every row. One short link beside a name cut
  to fit (a room's Remove) stays at the right end at every width, the same in every row. (The bin
  once put them at the right of a short title and under a longer one, in the same sheet.)
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
- **The day, lap by lap** (one panel; it replaced the hour lane drawn over its own rows and
  "Looking back on today", which showed the day twice): "Today, lap by lap" ("Friday 27
  November, lap by lap" for a past day), then the day's focus in `figure-lg` in `you` beside
  "focused today, in 2 laps" (with one in progress, "in 7 laps, and one running"). Then one list
  of cards, **one per task** (the user's pick, after a list of lap rows split one task's day
  over many rows and a "done at" row of its own). Each card is a `card` rectangle, `radius-md`,
  `sm` apart, and nothing inside it draws a line: the gap between two cards is the only divider.
  Inside, a card is a habit row: its top row is the target, `touch` tall, the fold arrow in the
  box column (centre 28px from the card's left), the task in `strong` on 56px, and at the right
  the task's time today in `figure-md`. Under it on 56px, the task's sliver of the day's hours
  (8px, `card-track`) holding every lap of the task (`you`; hollow when not counted), the break
  each lap earned right after it (`rest`), and a 2px `ink` tick where the task was done; then
  one `label` `muted` line that sums it up: "4 laps, 2 stopped. Done at 18:14.", "3 laps, 2
  stopped, from 23:45 Fri.", "2 laps, 1 not counted.", "No lap today. Done at 09:10." (a task
  done today with no lap is a card too, the tick its only mark). Laps for no task are one card,
  "Nothing in particular". Cards stand in the order of each task's first lap, so read down the
  slivers still make the day's lane; the card of a lap in progress stands last, where the day is
  now, so the fold never hides it. Every card opens closed; open, one line per lap follows on
  the same edges, `touch` tall: a 12px square in the box column filled as far as the lap ran
  (hollow when not counted), the facts, and at the line's right end "Don't count it" or "Count
  it again" (a running lap: "15:48 to now", no link). A task ticked more than once shows only
  the tick that stands. The task's time is its laps' counted minutes today; the figure at the
  top stays the day's focus, which counts two devices running at once only once, so the cards
  can add to a minute or an overlap more than it. A lap's facts are one sentence: "11:03 to
  11:19, 16 minutes"; stopped, "17:03 to 17:17, stopped, 14 minutes"; across midnight "23:46 Fri
  to 00:31, 31 of 45 minutes today" (it ended after the shown day: "23:46 to 00:31 Sat, 14 of 45
  minutes here"); beside another lap "25 minutes, 15 of them already counted, ran on two
  devices"; paused, "14:00 to 14:31, 25 minutes, paused 6 minutes" (the sliver draws it whole:
  only the pause's length is kept); set aside ", not counted". Clock times are rounded to the
  nearest minute, and a lap's minutes are the difference of its shown times (everywhere in the
  app a duration is said to the nearest minute, never cut down). "already counted" is said only
  where another lap really covered minutes. The hours are named once, over the slivers on 56px, over a `hair` rule in `line` (the one line in the list),
  inside the day (never before 00:00 or past 24:00), trimmed to whole hours around what ran, at
  least 4 hours, at most 4 steps on a phone; the last label of a whole day reads "24:00". "Don't
  count it" says on its bar what left which day, short enough for a phone: "31 minutes off
  today, 14 off Monday" (minutes another lap shares stay counted and are not in it). **Five
  cards show**, the last five in that order (the folded ones are the day's start, in one piece over
  them); one link over them says how many more and what
  they gave ("3 earlier tasks, 5 laps, 1h 15m", naming any lap not counted), opens every card of
  the day in place, then reads "Show only the latest 5 tasks". Last, the day's note: "A line about today". Nothing run:
  "Nothing has run today yet. The first lap starts on Focus." At 600px of panel and up, the
  sliver takes a `day-sliver` column of its own between the task and its time, on the top row;
  the time's column is `day-split` wide, enough for "12h 30m".
- **A project's bar:** a `lane` in `ink` (never the project's colour), with a dashed `ghost`
  mark for the seven days before.
- **A person's circle** carries their picture where they set one, and otherwise their colour and
  letters, everywhere, also where the words beside it say "You". A picture is cut round, never
  framed, and drawn the same in both themes. **Their colour** is flat, never a gradient: one of
  amber, olive, teal, sky, indigo, plum, clay or heat-2 (never `you`, never `rest`), picked from
  the username (protocol section 15, `contracts/fixtures/avatar.json`), so a person is the same
  colour on every screen and every device. **Their letters**: two when the username splits on
  `_`, `-` or `.` ("ravi_deshan" is RD), else the first; in the type role nearest 0.4 of the
  circle (`label` at 24px, `body-strong` at 40 and 48, `title` at 56), the same for two letters;
  in `on-you` on every hue but heat-2, which takes `ink`, so each stands 4.5:1 or more in both
  themes (light amber was darkened to #A46700 for it).
- **The Room screen** (chosen from drawn options): the line that names the room
  ("Study club, kept by lina", with "Code and settings" at its right end), the finding ("1 of 4
  focusing now."), then **tabs**: People, Notes, Week. The call strip stands outside the tabs.
  - **Tabs** are the bottom bar's rule one level down: three labels in `body-strong`, 48px tall,
    equal shares on a phone and each its own width (at least 128px) from the left edge on a
    laptop; the chosen one in `ink` over a `stroke` line of `ink`, the others `muted`; a `hair`
    of `line` under the row. No fill, no pill. The row stays under the header while its panel
    scrolls. They are a tablist to a screen reader, moved through with the arrow keys.
  - **The count of waiting notes** is a 20px circle of `you` with its figure in `figure-sm`
    `on-you` ("9+" past nine), 4px after "Notes", hung outside the label so neither the label
    nor the tab moves when it comes or goes; it fades in `motion-fill`. None at 0. A screen
    reader hears "Notes, 2 new"; the circle is hidden from it. It counts notes written since
    Notes was last open while you were not on a lap. It is on that tab only, never on the
    bottom bar.
  - **People.** Each person is a panel of their own (`surface`, `rounded.md`, 16px in), 8px
    apart, in the live order (on a lap, on a break, the rest, each by this week; strictly by this
    week when the room is ranked). A panel holds the circle (48px on a phone), the name and phase
    ("Focusing", "Short break", "Away"), the time left in `figure-md` (in `rest` on a break),
    today and the week in `label`, the task only if shared, who cheered, and the lane.
    **Upright phone (under 720px):** the words make the panel's top lines and the lane runs its
    full width under them; the window is six hours with now 5/8 across, the hours sliding under
    it, but never starting before today's 00:00 (in the day's first hours now sits further left). **Sideways and laptop (720px up):** the window is 08:00 to 20:00, widened to the hour of an
    earlier lap. **From 980px** the words stand in a column at the panel's left, 280px, as the
    phone's top row (the name and what they are doing, the week under it, the time at the end),
    and the lane takes the rest of the row; under 980px a panel stacks as on a phone, so the lane (340px or more beside the words)
    is never crushed. (The time once sat on its own line under the name at 220px, sunk beside
    its label and pushing the week to the panel's edge.)
    **The lane** is one grey (`raised`) across its window. A lap that ran is a filled block, yours
    `you` and everyone else's `muted`; the lap running is filled as far as now. A break is a gap.
    Nothing else is drawn in a lane. **The hours carry now:** one row of hours over the first
    panel's lane, `ink` over a `stroke` line of `ink` up to now and `muted` over a `hair` of `line`
    after, "now" where the heavy line ends; hour names at least 56px apart, and the one within
    44px of "now" steps aside; the row stands `space-sm` above the first panel, never touching it.
    "Call a lap together" is a link at the right end of the row under the last panel, with "Make
    or join another room" at its left; its picker opens in place of that row and is brought into
    view, above the bottom bar. Nothing stands between the tabs and the hours but, while a lap
    started together runs, the line that says so. While a lap
    is called, each person who is in has their circle
    (24px, a 2px `surface` ring) standing in their lane at the call's start.
    **Cheer** is a 40px round button with 🎉 on the person's top line, just before their time (so the time stays where it is when the button goes) (`key` fill, a
    `hair` of `key-edge`, named "Cheer lina's lap" to a screen reader), there only while a lap of
    theirs that rang is not yet cheered by you. A tap bursts it: the 🎉 breaks into six lap squares
    in the heat colours that fly out a short way and fade (`cheer` 600ms), and the button is gone;
    the line under their lane says "You cheered this lap." (The one emoji in the app, the user's
    choice over a "Cheer" link. It once stayed as a tinted circle after the tap, doing nothing.)
    **A cheer arriving:** the first time the one cheered opens People after it (a device's own
    reckoning, as for notes), six lap squares leave the cheerer's circle and fly to their own
    circle (`cheer` 600ms, one cheer after another when there are several), and then "sachi cheered
    your last lap." fades in on their own panel. Once per cheer, never again on that device.
    Reduced motion: no squares, the words only.
    **A tap on a panel** (anywhere but Cheer) opens that person's report.
  - **A person's report** takes the room's place, on every size. Its top line is their circle,
    name and phase at the left and "Back" at the right end, the same link Settings has beside its
    heading; the phone's back gesture does the same. (It was a big secondary button above the
    circle, which the user found heavy.) The call strip and the bottom bar stay.
    Their circle (56px), name, phase and time left. **Today:** minutes and laps in figures, and
    their day on the same hours and lane, from the hour of their first lap to the hour after now,
    at least six hours ("No laps yet today." when there are none), and their task only if they
    share it. **This week:** minutes in `figure-lg` over Progress's week chart for them, their week
    solid (`you` for you, `muted` for anyone else), their own last week dashed `ghost` and labelled
    where it ends, no target; and one line: "1h 25m ahead of lina's own last week at this time."
    Your own report also has the split chip and what your next lap would do.
  - **The call strip** stands above the bottom bar on a phone, a band under the finding on a
    laptop, while a call is open: "15:00 lina calls a lap" over "Starts in 7:42. lina is in.",
    and "I'm in" as the screen's one primary button ("I'm out" in quiet once you are). When it
    starts, People opens with "lina and you started together at 15:00." The bar that says what the last tap did rises above the strip.
  - **Notes:** the field "Leave a note for the room" first (it was "A line for the room", which a friend could not place), then "Kept for a week. Notes fold away while
    you are on a lap.", then the notes, newest first: the circle (24px), the name and time in
    `label`, the line in `body`. On a lap the panel says only "2 new notes. They open when this
    lap ends, at 15:25."
  - **Week:** "The room is 4h ahead of last week at this time." Then a panel: "22h 55m of 30h
    together this week" (the figure in `figure-lg`) over Progress's week chart (this week solid
    `you` to a dot with its figure, last week dashed `ghost` to its end figure, the target the
    top line labelled "target", today bold on the axis) and "Solid is this week, dashed is last
    week. The top line is the room's target." Then the streak: "12 days in a row, everyone in"
    over the dots (kept `you`, rest ring, today open) and what today still needs. Then **Your
    part**: "5h 50m of the room's 22h 55m this week" over an 8px bar of the room's week with your
    part in `you` and the rest `raised`, and whether you count for today's streak yet. Only your
    own figure is in it: it ranks no one. On a laptop the chart takes eight of twelve columns,
    the streak and your part the other four.
- **Buttons:**- **Buttons:** every button has a fill, so it reads as something to press: primary is `you` with
  `on-you` text, one per screen at most; secondary is `key` with a `hair` line of `key-edge`;
  quiet is `key-quiet` with no line, for the lesser choice beside another button ("Skip break",
  "I have an invite", "Stop"). **Secondary always outweighs quiet,** in both themes
  and on whatever it stands. In dark the weight is a fill: `key` is one step lighter than
  `key-quiet`, and its edge is its own colour. In light there is no room above the ground for a
  second lighter step and a darker grey reads as switched off, so the weight is a line: the same
  grey fill as quiet, inside a hair of ink. How this was found: the two were `surface` and
  `raised` in both themes and Stop outweighed Pause in dark (the user); then two greys, and
  "Start" beside the break button looked disabled in light (the review). A pair of buttons is
  looked at side by side in light and in dark, on the ground and on a panel, before it ships. A
  secondary is never mistaken for a choice, which is `surface` with a grey `edge`. All 48px tall, `body-strong`, `rounded.sm`. A bare word is never
  a button. On an `ink` bar the bar is the fill, and its button is an outline in `ground`. Hover mixes ink into the fill by `state.hover`, press by `state.press`.
- **Adding puts the keyboard away.** When a field has made something a bar speaks of (a task,
  a habit), on a phone the field lets go of the focus so the keyboard goes, and then the bar
  says what was added: a bar behind a keyboard is not read, and nobody should press Back to see
  what they made. On a laptop the field keeps the focus for the next one. A subtask's field
  keeps the keyboard on the phone too: several are typed in a row, each lands in sight right
  above the field, and no bar speaks.
- **A hint is an example, not a rule to decode.** The quick add's hint is "Add a task", and the
  shorthand is shown as what one types: "Essay draft ~3 plans it at 3 laps." under the field
  while it is in use. ("End with ~3 for three laps" was read by the user as nothing at all.)
- **Choosing the task on Focus:** the two lines over the digits are a button. Before a start it
  opens today's open tasks and "Nothing in particular" as a sheet; the one chosen is what Start
  begins. There is no second button for starting without a task. During a lap the lines are
  words only. The link says "Change task" (a bare "Change" after "4 estimated" read as changing
  the estimate). Focus stays on the task of the last lap, wherever that lap was started, until
  another is chosen, the task is done or the day turns: a choice that lasted one lap and then
  went back to the top of Today, saying nothing, is a choice lost. A lap that starts by itself
  goes on with the same task (protocol section 16). A lap for nothing in particular leaves no
  choice behind: Focus goes back to Today's next, or someone whose first lap was started with
  an empty list would find every later lap going to no task.
- **A task's own lengths** are three steppers in its sheet behind one choice, "My usual lengths"
  or "Its own", and a task with its own says so on Focus where the length is shown.
- **A lap runs up to 360 minutes** (the user's own top: a film, an exam paper, a long build).
  The stepper's field takes three digits, and a figure typed past either end comes to the
  nearest one it can be (400 becomes 360), never back to what it was without a word. From 100 minutes the timer reads hours, "5:59:59",
  and its seven characters are set at two thirds of the timer's size, `figure-xl-long` on a
  phone (keeping its share of the width as `figure-xl` does) and `figure-xxl-long` on a
  laptop, on one line inside the column; under 100 minutes nothing changes, and what stands
  under the digits does not move when a long lap comes under 100. A top of 99
  was the clock face's limit, not the person's.
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
- **The bell** (Settings' bell panel, first, the panel's own title naming them): the three sounds as one row of
  choices that share the line under 400px, "School bell" (the default), "Struck bell" and "Soft chime"; a tap picks one and plays
  it once. Phone only, kept on each device, under "Ring on this phone": a switch "Vibrate" ("A
  buzz with the bell: two long, one short.") and a switch "Ring even on silent" ("The bell plays
  through Mute, like an alarm. Turn it off for class or the library."), both on. The buzz is 400
  ms, a 200 ms rest, 400 ms, 200 ms, 150 ms. The phone plays the bell itself, as an alarm when
  "Ring even on silent" is on, so a phone on Mute still rings; the bell's notification makes no
  sound of its own.
- **Light or dark** (Settings' own panel, on a laptop in the right column under the account): three
  choices as one row, like the bell's: "System" (the default, following the device), "Light" and "Dark". Kept on
  each device, like "Ring here": a laptop can stay dark while the phone follows its system. The
  choice holds from the first frame, with no flash of the other theme; in the phone app the whole
  app follows it, the status bar's icons included. Only the splash at launch, drawn before the app
  has read anything, follows the system.
- **A bell you can answer:** after a lap, its notification holds "Take five" (the break's own
  length, as Focus words it) and "Done for now"; after a break, "Start the next lap" and "Done
  for now". A called lap's holds "I'm in"; once in, it reads "You're in. It starts at 15:00."
  with "I'm out"; if the server cannot be reached, "Could not reach your server." and the button
  stays.
- **On the phone, while heirloom is closed** (the background service, ARCHITECTURE section 6):
  - Settings, in the bell's panel under "Ring on this phone", phone only: a switch "Ring when
    heirloom is closed", on by default, with the note "Keeps a quiet connection to your server,
    so a lap started or paused elsewhere reaches this phone, and room notes and calls show up."
    Under it, while Android may still put heirloom to sleep, a link "Let it run in the
    background" with "Android may stop heirloom to save battery. Set it to Unrestricted so it
    keeps step." It opens Android's own screen, from that tap only, never at start. Gone once
    it is set.
  - The service's own notification: "heirloom is keeping in step", nothing under it, on a
    silent channel named "Keeping in step" that the person can hide.
  - A note: the room's name over "sachi: the line itself", on a channel named "Rooms". A call:
    "lina calls a lap at 15:00" over the room's name. Both open the room. A lap started
    elsewhere and drawn from the service alone says "A lap", "Short break" or "Long break" until the app
    has the task: never a blank, never a guessed title.
- **Rest days** are a panel in Settings, after the day's target: the seven weekdays as one row of
  choices (as a habit's days), any two of which may be on; with two on, the other five take no
  press. Under it, a note: "Two days a week may stay empty without breaking your streak. Pin one
  or both to a weekday; any left come on the first days you miss." Progress's streak line then
  names them: "Sundays are your rest day, and one more comes when you need it." / "Saturdays and
  Sundays are your rest days." Nothing else changes on a pinned day: nothing asks, nothing nags.
- **A way back in** is the owner's to give, in Settings beside Admins: a username, one button
  ("Make a reset link"), and the link shown once in the same block an invite's new link has,
  with Copy, and it stays after a copy: it can never be shown again. Under it the open ones by
  name and when they run out, each with "Take back". The sentence
  over the field says what the link does and for how long ("It sets a new password, once, and
  works for 24 hours."), and that it signs that person's devices out. The page the link opens
  names whose password it is and has one field and one button; a link that no longer works
  says so and who to ask. The sign-in screen says, in one muted line, where a forgotten
  password leads: to whoever runs the server. Nothing asks for an email, and nothing says
  "recover".
- **The welcome:** one screen with one idea: your days stay yours. From the top: the header
  line every screen starts with (the mark and "heirloom", 48px, at the left), **one drawing**,
  the free space, then the title ("Your days stay yours."), one sentence ("Laps, tasks and habits
  live on a server that you or a friend runs, and nowhere else. It is free.") and in the phone
  app the one primary button, "Connect to a server", together at the foot in reach of a thumb.
  Nothing else: no key, no list of what it does, no second drawing.
  - The drawing is seven weeks of days as Progress draws a year: squares in the heat steps
    (`raised` for a day with no lap, then `heat-1` to `heat-3`, `you` for the fullest), a
    column per week, growing darker toward today, which is the last square drawn and carries
    the outline Progress gives today (1px `hair`); some days of no laps carry the rest mark. 48px squares, 6px apart, the
    drawing's left edge on the column's. It is made from tokens, so dark is the same drawing on
    the dark tokens; no picture file, no icon, no figure of a person.
  - It is still. It is one image to a screen reader, with one sentence that says what it shows.
  - The title is the screen's heading in `headline-lg`; the sentence is `body` in
    `muted`. Its words say why the next step asks for a server, so the button needs no other.
  - The phone app shows it before the first server step, and the server step's "Back" always
    leads to it, also when the step was opened by "Change" under Sign in: Back means the
    welcome and nothing else. The address the app holds stays in the server field and stays
    the server until "Use this server" chooses another; leaving by Back changes nothing. 
  - **The browser's sign-in (and join, and set up) from 720px** is two halves (chosen from three
    drawn, S1): signed out, the shell draws no sidebar column;
    the mark stands alone at the top left. The left half, on the ground, holds the drawing, its
    squares scaled to the half (56px at 1440, 40px at 1024, about 36px at 720), then the title in
    `headline-lg` and the sentence, all on the drawing's left edge, without the button. The right
    half is a `surface` area its full height holding the form at its 44ch. The drawing's top and
    the form's heading stand on one line (112px down); each half's block is centred in its half;
    the free space falls at the bottom. Under 720px the form comes first and the drawing, title
    and sentence under it, as before. Where the left half is shown the form's intro does not say
    again that laps live on the server: "Sign in and this laptop keeps step with your other
    devices." Every signed-out screen's left edge is the mark's (`layout.gap`, 24px). The reset
    page is one column on that edge, its heading on the same 112px line.
- **The launcher icon** is the mark at three quarters of the adaptive icon's safe circle (about
  47 of 108dp tall), so no launcher's mask crowds it; the splash uses the same drawing.
  - (It was first four sentences about a lap and its 25 minutes, then a day drawn as a race with
    a key and three small drawings; the user found that cluttered and chose this from three.)
- **A room's keeper.** The room's sheet shows the code and "Copy the code" to everyone. Its
  name, target and ranking are controls for the keeper alone; to anyone else they are the same
  values as plain words, with one muted line under them: "Only sachi can change these." The
  keeper's own sheet says nothing about keeping. Leaving is everyone's.
- **About** is the last block of Settings, for everyone: the mark and "heirloom", one line of
  what it is ("A free Pomodoro, tasks and habits app, made in free time."), the version as
  "Version 1.0.0 (ac7fe13)", the commit in the figures face so it can be read out in a bug
  report, and one link, "Source on GitHub", to github.com/ravindu644/heirloom, which opens in
  the browser (outside the app on the phone). Nothing else: no licences list, no credits wall.
- **Counted the same everywhere.** Every total that includes today counts the lap in progress as
  far as it has run: Today, Focus, Progress and a room's lanes give the same minutes at the same
  moment. A screen opened from the bottom bar or the sidebar opens at its top, wherever the last
  screen was scrolled. A habit's day is filled as far as its count went, past days as today: 1 of 2
  is half a box, never an empty one. A habit's "of the last N planned days" counts from the day
  the habit was made, so two habits made together read the same N.
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
  Chosen 2026-11-25 from five; it is drawn in `design/logos/colon.svg`.
- **The person:** their circle (A person's circle) and the username beside it, in `body` in a
  list or a panel and in `label` in the header's chip. Which side the circle is on: see The header.
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
| A row picked up to be moved | `hold` 350ms | How long a finger or the mouse rests on a row, without moving 8px, before the row lifts. Shorter and a slow tap lifts it; longer and nobody finds it |
| A room's live order changes | `hold` 350ms, then `fill` 160ms | The order shown waits until the members' changes have stopped for `hold`, then the panels glide once to the new order. Two people starting a lap a moment apart move the list once, not twice. Someone joining or leaving shows at once |
| A sheet or menu | `sheet` 200ms | It slides `rise` and more from the bottom on a phone, fades and rises on a laptop; its scrim fades |
| What the last tap did | `sheet` 200ms | Rises `rise` in, fades out |
| The timer | none | Digits change; nothing animates |
| A cheer sent, a cheer arriving | `cheer` 600ms | Six lap squares in the heat colours: from the 🎉 outwards and fading as it goes; or from the cheerer's circle to yours, then the words. Never loops; reduced motion shows the end state |
| A lap done | `lap-done` 700ms | Your bar runs to meet the ghost's line, the split chip turns over, then the words. Tap anywhere to skip |
| A task's laps all in | `set-done` 1200ms | The bar stands tall and its segments light in turn over two thirds of it, when the lap just done is the task's last estimated one. Skippable, once per task |

Code that needs a duration reads it through the kit's one function, in milliseconds: the built
CSS writes `200ms` as `.2s`, and a bare `parseFloat` of a token made every glide last 0.16 ms in
the built app while the dev server looked right.

All with `ease`. Under `prefers-reduced-motion` every moment shows its final state at once. No
animation runs on a loop, ever. Motion is built into the kit (a row, a sheet, an opening, the
bar), so a screen gets it by using the kit and never writes its own.

**What you tapped stays under your finger.** After a tap, the control tapped is where it was on
the screen, to the pixel, unless the tap was a move to another place. It is held by scrolling
and by nothing else, so only as far as the page can really scroll: **a page is never scrolled
past its own content, and one that fits the screen is never scrolled at all.** At the top or the
end of a page, where there is nothing left to scroll, the control moves with what opens or
closes beside it, in time. (The first build gave the page a blank end to scroll into: "Keep
this order" left Today pushed up under the header with half a screen of nothing below it, and a
sheet's last field ended up in the middle of the screen.) The four ways a page jumps, each seen
by the user:

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
Every field has that margin, from the kit, `lg` above and below: a field being typed in never
touches the keyboard or the top of its sheet. A sheet with a keyboard up is the same sheet in
less room: it keeps its foot on the keyboard, scrolls inside, and shows no blank end.

**What a person made, they can rename and remove,** and in the place they meet it: a task and a
habit in their sheet, a project where it is chosen ("Edit project" opens the form it was made
with, filled in, with "Delete project" at its foot). Anything that cannot be taken back asks
twice, as "Take back" on an invite does: the button's own words change to the question ("Delete
for good?") and a second tap answers it. Nothing asks in a box of the browser's.

**What opened closes when it is answered.** A form or an editor that opened in place for one
question ("New project", the picker, the target's editor) closes when the question is answered
some other way: another project chosen, None chosen, the sheet closed. Nothing stays open asking
for what the person has just said they do not want.

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
4. **One word for one act, and one button for it.** Focus has one Stop, and it says only
   "Stop": it ends the lap where it is, and the line after says what that did ("Lap 1 stopped
   at 12 minutes. Lap 2 is next."). (There were three: "Stop", "Stop and log 2 min" and "Don't
   count this lap", and the user could not say what each did.) Two controls that end the same
   thing are one too many; a button whose name changes while you look at it is two. A lap taken
   out of the count is "not counted", from the timeline: "Don't count it", "Count it again". A
   missed day is not mentioned the day after.
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
  copied (an invite link, a room's code, the server's address). A sheet is on the browser's
  top layer and was found selectable when the page under it was not: the rule is checked inside
  an open sheet as well as on a screen.
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

## Said so a stranger knows

Found by walking every screen as someone who was only handed the app (2026-11-25, 28 findings).
Each is a rule for every screen, not for the one where it was seen.

- **A sheet says there is no Save.** Everything saves as it is changed, so the sheet's foot says
  "Changes are saved as you make them." And a pair of ways out says what each keeps ("Archive
  keeps its record and takes it off the list. Delete keeps it for 30 days.").
- **A setting that stands until changed is never worded as today's.** "Laps to run each day",
  not "today", wherever the day target is edited.
- **A thing is labelled with what it is,** never with the product's own noun for it: the race's
  second lane is "Last Tue", not "Ghost"; a figure is "Focused", not "Done" beside a list called Done.
- **A count the person did not set is not shown.** The set of four that ends in the long break
  is the timer's own bookkeeping: nobody chose the four, and drawn as a bar on Focus it was
  asked about three times ("why does it stay at 4", "why are there four hard coded lines, can I
  clear them", "why a long break line"), with a noun and without. So the set is on no screen
  and in no notification. **Focus's bar is the task's laps**, its estimate and how many are done:
  "Learn C basics" with five estimated has five segments. **A bar sits with what it counts:** on
  Focus it stands under the task's title, between the title and the digits, so it is never read as
  the day's count; Today's day bar stands with the day's figures. A lap for nothing in particular, or on
  a task with no estimate, has no bar. The day's target is Today's alone. Nothing over the bar
  explains it: no "Lap 3 of 5 today", no ", next", no "5 min break after" (the user's fifth hour:
  "they over explain something, a common AI trap"). There is no line over the task: Focus's
  first row is the task's project with "Change task", and it starts where Today's heading starts
  (an empty line held open there read as a hole). What the digits cannot say takes the project
  row's place instead, in the same row: in a break its name ("Short break", "Long break", and
  "Break over" when it is so). The
  rows are the same in every state where there is something to put in them, so the digits never
  move from a lap to its break; with nothing on the list and no break, the row and the bar's
  place are not drawn at all rather than held open empty. Paused is said once,
  under the digits ("paused since 16:38"), with the digits greyed and Resume on the button. The
  break a lap earns is said once, where it is taken, on the button ("Start 5 min break"), with no
  "Take five." over it. The one place the
  rule of four is said is where the long break is earned: "Four laps. The long break is
  earned!" (not "in a row": the four may be hours apart). A bell says "Lap done." and the break
  it has earned; a room's row says "Focusing" and the time left. Today's figures say "past your
  target of 5" where the day goes over it: "planned" is Today's word for estimates.
  A lap that runs past midnight is today's lap in every state, running, rung or stopped (it ends
  today), and only its minutes since midnight add to today; the ones before stay with yesterday.
- **A count says of what.** "3 of 5 laps today" is the day's target; "1 of 2" on a row is the
  task's estimate; neither stands without its noun where both can be seen. Today's strip after
  a bell says "Lap done" and no number, since the row under it says "3 of 4" of the task.
  Outside the app the task's lap comes first and its title last, where a long one may be cut:
  "Lap 1, 3 estimated: Essay draft", and at its bell "Lap 1 done: Essay draft". (One round
  earlier the set was given a noun, "Lap 2 of 4 in this set", and a mark for the long break at
  the end of its bar. Named, it was still a count nobody had asked for.)
- **A button that starts something names what it starts, and carries no count.** "Start the
  next lap now", not "Skip break", and not "Start lap 3 now": that 3 was the set's, under a line
  that said "lap 2 on this task". The line over the button does the counting.
- **A switch that cannot work on this device says why,** in place of its note, with where to
  change it.
- **A step that asks for something the person may not have says where to get it.**
- **What is done more than once shows how far it has got and the way to take one back,** where
  it is edited.
- **What a tap did is said where eyes can read it.** Nothing is said to a screen reader only.
  Inside an open sheet it is said in the sheet, beside what was changed: the bar stands under a
  sheet and cannot be read there.
- **A thing shown as new is not also drawn in the list under it.**
- **A list that opened as a sheet closes with its last row.**
- **What a change does to other people is said before it is made, and after.**
- **A refusal with two causes is two sentences,** and the app says the one that is true.
- **One word for one thing, everywhere:** estimate (never guess), Restore (never bring back), a
  lap "reaches its bell" (never rings, rang or phase), a lap not counted (never void or set aside).

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

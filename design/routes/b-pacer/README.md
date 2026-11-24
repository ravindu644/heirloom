# B. Pacer (adventurous, recommended)

**Idea.** Their past records become a ghost who runs beside them on every screen. A pomodoro is a lap,
a set is four laps, and the day is a race against their usual day, told in splits.

Method: pictorial analogy (the time-trial ghost from racing games), drawn as race timing: lanes,
splits, square-ended bars, condensed tabular figures. Clean by nature, so no texture and no wobble.

Working name on the screens: **heirloom** (see names.md). The mark is a solid tomato dot beside a
dashed hollow one: you and your ghost.

## What it takes from each reference

- **Focus To-Do:** what made it rewarding was that past work piled up where you could see it (the
  records grid, the goal calendar). Here past work does not only pile up, it runs beside you.
  Also its Today header of four counts, cut to three (done, planned left, last Tuesday).
- **Pomodoist:** the calm frame: true neutral darks, one red, flat surfaces, a labelled sidebar
  that recedes, a four-segment session bar under the title, the motion budget.
- **Anthropic:** plain sentences doing the work ("Level with last Tuesday."), one action per
  screen, no ornament, warmth from words and restraint rather than from decoration.

## Type

Barlow Condensed 600 for every figure (the clock is 168px on a 412px phone, 300px on a laptop),
Barlow 400/500/600 for words. Files: barlow-condensed-500.woff2 21 KB, -600 22 KB, barlow-400/500/600
22 to 23 KB each, latin subset, OFL 1.1. About 110 KB.

## Palette roles

Light: chalk ground #EEF0EC, white lanes, ink #121412, muted #474C47. Dark: neutral #0E100E, never
navy. **You** is tomato (#C4321A light, #FF6A4D dark): your bars, your line, your current lap and the
one primary button. **Ghost** is grey, hollow and dashed, never filled, never coloured. **Rest** is
calyx green, for breaks and rest days only. Being behind is never red.

## Shape and density

Lanes and bars square ended, rows and buttons 4 to 8px, people round. Medium density: 48px controls,
46 to 60px rows, one 24px gap across and down on the laptop.

## Motion

| Event | Duration |
|---|---|
| hover, press | 100ms, colour only |
| a lap segment filling, a row arriving | 160ms, transform and opacity, ease-out |
| a sheet or menu | 200ms |
| the timer | no animation, the digits change |
| **lap done** | 700ms: your bar runs to the ghost's line, the split chip turns over from "-19m" to "level", then the words. Tap to skip. |
| **set done** (milestone) | 1.2s: the four lap segments light in turn and the long break is offered. Skippable. |

Reduce Motion shows the final state at once.

## The reward moment

A finished lap is a race result against yourself: "Level with last Tuesday." over two lanes that end
on the same line, the day's total in tomato, one line of facts, a friend's cheer if one came in, and
one button to start the break. When they are ahead it reads "6 minutes ahead of last Tuesday."; when
behind, it names the lap that closes the gap. The ghost is never a judge.

## Voice

Plain, specific, a running partner who counts for you. Numbers before adjectives. No exclamation
marks, no "Great job", no streak flames.

1. "Finish this lap and you draw level."
2. "Level with last Tuesday."
3. "One lap behind last week. The lap you are in now draws you level."
4. "Thursday the 19th was your rest day. One a week keeps the streak going."
5. "Not sharing what they are on."

## Slop gate, per screen

| Screen | The default | What replaced it, and why |
|---|---|---|
| Focus | a ring timer around digits | digits as the screen's biggest thing, the set as four lap segments: a ring is unreadable from across a desk and every timer app has one |
| Lap done | emoji confetti, a trophy, "Great job!" | two lanes meeting on one line: the reward they asked for is their own record, not a party |
| Today | a to-do list with checkboxes and a FAB | the day as a lane against last Tuesday, laps as small squares per task, one "Start" on the next task |
| Progress | four KPI tiles with icons, a gradient area chart, a donut | one finding as the headline, a running-total line against a dashed ghost, a single-hue heatmap, bars with a dashed tick for the week before |
| Habits | a streak flame per habit | a week strip per habit and the week against last week |
| Room | a leaderboard of friends | lanes for presence, a Cheer button, and "Together today": time side by side, never a ranking |

## Scores (slop-gate rubric, honest)

Idea 8 (it comes straight from "looking at my own past records motivated me"; the ghost device is
borrowed from games), craft 7 (clean, but dense on the Today phone screen, and the laptop Focus
screen has a lot of empty ground below the controls), fit 9, distinct 7. About 7.9.

## Risks

- A ghost can shame. Copy rules above, and a setting to race "your average Tuesday" instead of
  "last Tuesday" when last Tuesday was a freak.
- Early on there is no ghost. Week one races "your first day", then the ghost appears.

## What may travel

Palette, typeface, the lap bar, the day lane. The idea (the ghost) does not move into another route.

## Screens

Open `../../index.html` in a browser to flip between sizes and themes.

### Focus (running)

<img src="screens/focus-phone-dark.png" width="300" alt="focus focus-phone-dark.png"> <img src="screens/focus-phone-light.png" width="300" alt="focus focus-phone-light.png">

<img src="screens/focus-laptop-dark.png" width="800" alt="focus focus-laptop-dark.png">

<img src="screens/focus-laptop-light.png" width="800" alt="focus focus-laptop-light.png">

### Pomodoro done

<img src="screens/done-phone-dark.png" width="300" alt="done done-phone-dark.png"> <img src="screens/done-phone-light.png" width="300" alt="done done-phone-light.png">

<img src="screens/done-laptop-dark.png" width="800" alt="done done-laptop-dark.png">

<img src="screens/done-laptop-light.png" width="800" alt="done done-laptop-light.png">

### Today

<img src="screens/today-phone-dark.png" width="300" alt="today today-phone-dark.png"> <img src="screens/today-phone-light.png" width="300" alt="today today-phone-light.png">

<img src="screens/today-laptop-dark.png" width="800" alt="today today-laptop-dark.png">

<img src="screens/today-laptop-light.png" width="800" alt="today today-laptop-light.png">

### Progress

<img src="screens/progress-phone-dark.png" width="300" alt="progress progress-phone-dark.png"> <img src="screens/progress-phone-light.png" width="300" alt="progress progress-phone-light.png">

<img src="screens/progress-laptop-dark.png" width="800" alt="progress progress-laptop-dark.png">

<img src="screens/progress-laptop-light.png" width="800" alt="progress progress-laptop-light.png">

### Habits

<img src="screens/habits-phone-dark.png" width="300" alt="habits habits-phone-dark.png"> <img src="screens/habits-phone-light.png" width="300" alt="habits habits-phone-light.png">

<img src="screens/habits-laptop-dark.png" width="800" alt="habits habits-laptop-dark.png">

<img src="screens/habits-laptop-light.png" width="800" alt="habits habits-laptop-light.png">

### Study room

<img src="screens/room-phone-dark.png" width="300" alt="room room-phone-dark.png"> <img src="screens/room-phone-light.png" width="300" alt="room room-phone-light.png">

<img src="screens/room-laptop-dark.png" width="800" alt="room room-laptop-dark.png">

<img src="screens/room-laptop-light.png" width="800" alt="room room-laptop-light.png">


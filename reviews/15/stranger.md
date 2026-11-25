# Section 15, the stranger's walk

Walked from the phone pictures in `reviews/15/shots/*-phone-light.png` and
`reviews/14/shots/*-phone-light.png` (some `*-zoom-*`), then the words in
`client/src/ui/strings.ts`, then the code, only to prove or kill a guess. Nothing was run.

Each finding says whether it is **proved in code** or **a reading of a picture only**. The ten
kinds are the ones in `skills/stranger-walk/SKILL.md`. Ranked by how soon in a first day someone
meets it, not by how bad it is; the ones I would fix first are marked **(weighty)**.

## The answers asked for, in short

- **The welcome:** a stranger knows what it is from the headline and the sentence, and there is
  one button, so what to press is not in doubt. Three marks mislead before the key is read, and
  one key entry points at nothing (findings 1 and 2).
- **Is the set still said?** Yes, in five places: the headline "Four laps in a row!"
  (`strings.ts:168`), the label "The long break, after four laps" in Settings and in a task's
  sheet (`strings.ts:279`, used by `kit/lengths.tsx:10`), "until the long break" in the
  auto-start note (`strings.ts:289`), a lap number counted by the set on Today's bar
  (`today/today.tsx:79`, a bug, finding 10), and drawn but not said on the welcome (the wide
  break after the fourth lap, `kit/race.tsx:65`). The notification words in `ring` say nothing
  of it; the bell's body is only "Take 15 minutes." (`plan.ts:39`).
- **Is the long break a surprise?** Yes, before the lap. "15 min break after" gives no reason on
  Focus (finding 6). At the bell the reason given is "Four laps in a row!", which stands beside
  "8 laps today." on the second set.
- **A row that returned:** nothing says why. They would read it as the drag failing (finding 7).
- **A row carried up:** "Moved to today." does not say a date was replaced (finding 8, weighty).
- **Upcoming out of date order:** read as unsorted, because the order it starts in is nobody's
  choice (finding 9).

## Findings

### 1. The room on the welcome shows times left that read as times of day

- **Where:** the welcome, first screen (`reviews/14/shots/welcome-phone-light.png`), the small
  drawing on the right: "Ishara 18:42", "Nimal 07:10", "Tharu Short break".
- **Guess:** 18:42 and 07:10 are clock times: when each friend last worked, or their local time.
  Every other `HH:MM` a person has met by then, or meets next, is a time on the wall.
- **Code:** `welcome.tsx:81` prints `s.clock(LEFT[at])` bare. The Room itself has the same bare
  digits but under "2 of 4 focusing now" and beside the word "Focusing"
  (`reviews/15/shots/room-phone-light.png`); the welcome has neither. **Proved in code.**
- **Kind:** 8, one form for two things.
- **Fix:** print the figure through `s.room.left`, so it reads "18:42 left".

### 2. The key names a mark the drawing does not have, and leaves three it has unnamed

- **Where:** the welcome, the key line under the race.
- **What each mark seems to mean before the key is read:** red blocks, work; thin green, a pause;
  the one wide green, lunch or a longer pause (right, but nothing says so); the grey end of the
  last block, unfinished or "now"; "+25m", 25 minutes more than last week; the dashed hollow
  boxes of "Last week", five empty slots, as if last week had nothing in them. The gap in that
  lane reads as a missing lap until the eye lines it up with the wide green above.
- **Guess at the fourth key entry:** "two small squares and a grey one, 2 of 3, a task planned in
  laps": they look for small squares in the race and find none.
- **Code:** `welcome.tsx:19-24`, the fourth entry is `<Laps laps={2} estimate={3}>`; `DayRace`
  (`kit/race.tsx:86-96`) draws only the two lanes and the chip. **Proved in code;** the readings
  of the marks are **a reading of the picture.**
- **Kind:** 2.
- **Fix:** drop the fourth entry from the race's key (a task is not in that picture) and spend
  its place on the mark that is: "+25m, ahead of last week".

### 3. "A server that you or a friend runs" has no next step for the "you"

- **Where:** the welcome's last sentence and the next screen
  (`reviews/14/shots/welcome-server-phone-light.png`): "No server yet? Ask whoever showed you
  heirloom for an invite link."
- **Guess:** someone who found the app alone and is willing to run a server reads "you or a
  friend runs" and then finds only the friend's way in.
- **Code:** `strings.ts:261`, `strings.ts:837`; `server.tsx` offers the field and Back.
  **Proved in code** (the words), small.
- **Kind:** 7.
- **Fix:** one more sentence on the server step saying where running your own is explained.

### 4. A lap stopped seconds after Start is a lap of the day and a place in the four (weighty)

- **Where:** Focus, the first Start and Stop a curious person makes;
  `reviews/15/shots/stopped-elsewhere-phone-light.png` shows the result: "Lap 7 of 8 today,
  next" over a bar of five full segments and a sliver, and "Lap 6 today stopped at 6 min."
- **Guess:** "Lap 7 of 8" means six are behind me; the bar says five and a bit. And "8 of 8"
  will mean the day's target is met.
- **Code:** a lap always leaves a row, however short (`core/session.ts:42-44`); every such row is
  one of today's laps (`sync/counts.ts:116-118`, `125-133`), drawn as full as it ran
  (`core/stats.ts:42`); and it takes its place in the set (`core/timer.ts:67-72`, `102`). So
  three false starts and one real lap give "Lap 5 of 8 today, next", a bar of one segment and
  three slivers, "15 min break after" on the fourth, and then "Four laps in a row!".
  Today reads "4 of 8 laps today" and "Focused 25m, 4 laps". **Proved in code.**
- **Kind:** 2 (what a lap is) and 6.
- **Fix:** a lap stopped in its first minute leaves no lap, as a break under a minute already
  leaves nothing (`session.ts:44`); this changes a rule, so it is the user's to decide.

### 5. A length typed over the top is put back without a word

- **Where:** Settings, "Laps and breaks", and a task's "Its own" lengths
  (`reviews/15/shots/settings-top-phone-light.png`, `sheet-own-phone-light.png`).
- **Guess:** type 400 for a lap, or 90 for the long break, leave the field: the old figure is
  back (25, 15). "It did not take", and nothing says 360 or 60 is the most.
- **Code:** `kit/stepper.tsx:38-44`: a typed value outside `min..max` is dropped and the draft
  cleared. The tops are 360, 60 and 60 (`kit/lengths.tsx:9`). The plus button does go off at the
  top, but only once you are there. **Proved in code.**
- **Kind:** 4 and 6.
- **Fix:** bring a typed number to the nearest bound instead of putting the old one back, so 400
  becomes 360 with its plus shown off.

### 6. "15 min break after" has no reason on Focus, and the reason at the bell is not true to the count beside it (weighty)

- **Where:** Focus before and during every fourth lap, and its result
  (`reviews/15/shots/set-done-phone-light.png`: "Lap 8 of 8 today, done", "15 min break after",
  "Four laps in a row!", "8 laps today. Take 15 minutes.").
- **Guess:** before the lap, "why is this one 15?"; a setting changed, or this task has its own.
  At the bell, "four in a row? It says eight".
- **Code:** the right end is chosen by the set (`focus/focus.tsx:180`), the headline by
  `view.next.phase === 'long'` (`focus.tsx:95`, `205-206`), the count beside it by the day
  (`focus.tsx:246`). "In a row" is also not what is counted: stopped laps hold a place, and so do
  laps hours apart after "Done for now" (`timer.ts:67-72`, `102`). The two counts can part:
  a lap set aside with "Don't count it" leaves the day's count and not the set, and a lap begun
  before midnight keeps the set going into a day that starts at lap 1, so "15 min break after"
  can stand on "Lap 3 of 8 today" and "Four laps in a row!" beside "3 laps today."
  **Proved in code.**
- **Kind:** 2 and 8.
- **Fix:** name it with the words Settings and the break already use, "long break after, 15
  min" at the line's end, and let the headline say the rule instead of a count: "Every fourth
  lap earns the long break."

### 7. A row of today let go in Upcoming goes back, and nothing says why (weighty)

- **Where:** Today, the first try at putting a task off by dragging it under "Upcoming"
  (`reviews/15/shots/today-upcoming-phone-light-2.png`).
- **Guess:** the row follows the finger down over the Upcoming rows, they do not make room, and
  on release it glides back: the drag is broken, or the finger slipped. They try again.
- **Code:** the row's place is capped at the edge (`kit/lift.ts:66-69`, `105`), it glides home
  (`lift.ts:169`), and when it was already last nothing is called at all (`lift.ts:173`).
  `today/today.tsx:99-114` says something only for a row coming up. The keyboard way is silent
  too (`lift.ts:194`). The one line of help, "Press and hold a task to move it."
  (`strings.ts:424`), says nothing of days. **Proved in code.**
- **Also:** with one task today and one upcoming
  (`reviews/15/shots/today-one-ahead-phone-light.png`) the hint is shown (`today.tsx:334`) and
  the top row, the one a person tries first, does not lift (`lift.ts:121`).
- **Kind:** 6.
- **Fix:** when a today row is released under the Upcoming heading, the bar says "Upcoming is
  for another day. Open the task to give it one."

### 8. "Moved to today." does not say the date was replaced (weighty)

- **Where:** Today, a row carried up out of Upcoming
  (`reviews/15/shots/today-moved-phone-light.png`).
- **Guess:** "I pulled Hand in the lab report up to work on it today; it is still due tomorrow
  at 17:00." The field in its sheet is called "Due", which reads as a deadline.
- **Code:** `sync/today.ts` `moveToToday` writes `due: dayNow()` and keeps the time; the bar is
  `s.today.movedToday` with Undo for ten seconds (`today.tsx:104-106`, `UNDO_MS`). After that the
  old date is nowhere, the phone reminds at 17:00 today and not tomorrow (`timed` reads `due` and
  `time`), and the row cannot be dragged back (finding 7). **Proved in code.**
- **Kind:** 6 and 8 ("Due" is both the day it is planned for and its deadline).
- **Fix:** the bar names what changed: "Now due today, was tomorrow." (`s.today.due` already
  says the day).

### 9. Upcoming's first order is nobody's

- **Where:** Today, "Upcoming", once two tasks have dates
  (`reviews/15/shots/today-upcoming-phone-light-2.png`; in the pictures the demo happens to be
  in date order).
- **Guess:** a list of dated things is by date; "Fri 27 Nov" over "tomorrow" is a mistake, or
  the list is unsorted. Nothing says the order is theirs.
- **Code:** Upcoming sorts by `order` alone (`core/today.ts:200`). A task gets its key at the end
  of today's list when added (`sync/today.ts` `add`), and giving it a date in the sheet writes
  `due` and no key (`edit`), so it stands in Upcoming wherever that old key falls; a repeating
  task's next copy takes the done one's key (`setDone`). **Proved in code.**
- **Kind:** 2.
- **Fix:** a task that enters Upcoming by getting a date takes a key that puts it by its date
  among the rows there, so the list is by date until a hand moves a row (core lane, the lead's
  to route).

### 10. Today's bar counts the stopped lap by the set

- **Where:** Today, ticking the task a lap is running on, from the fifth lap of a day on.
- **Guess:** none needed: Focus said "Lap 6 of 8 today", the bar says "Done: K&R 5.1 to 5.5.
  Lap 2 stopped at 6 min."
- **Code:** `today/today.tsx:79` passes `state.set_index + 1` to `s.today.lapStopped`; Focus's
  own stop passes the day's lap (`focus/focus.tsx:174`). **Proved in code.**
- **Kind:** 8.
- **Fix:** pass `figures.laps + 1` there.

### 11. "Planned" is the target on Focus and the estimates on Today

- **Where:** Focus past the target (`reviews/15/shots/focus-target-passed-phone-light.png`):
  "Lap 6 today, 5 planned, next"; Today's strip: "Still planned 4h 10m, 10 laps".
- **Guess:** "5 planned, next" reads as five more planned after this one. On Today "planned" is
  what the tasks' estimates still hold, and the target is called "Day target" and "5 of 8 laps
  today".
- **Code:** `strings.ts:80` against `strings.ts:387`, `392`, `395`. **Proved in code** (the
  words); the misreading is a reading.
- **Kind:** 8.
- **Fix:** "Lap 6 today, target 5".

### 12. "Start the next lap now" after the fourth lap gives the long break away

- **Where:** Focus's result after the fourth lap (`set-done-phone-light.png`), the second button.
- **Guess:** "I will keep going and take the long one after the next lap."
- **Code:** a lap started from the fourth lap wraps the set to its first place
  (`core/timer.ts:71`, `87`), so the next line reads "5 min break after" and the long break is
  four laps on. Nothing says it was passed up. **Proved in code.**
- **Kind:** 6.
- **Fix:** a rule for the user: a long break passed up stays owed to the next bell; or the
  smallest thing, the line after the tap says "Long break skipped."

### 13. Settings says the target's bar is on Today; Focus has it too now

- **Where:** Settings, "Day target" (`reviews/15/shots/settings-top-phone-light-2.png`): "Today
  shows a bar of this many laps. It can be changed there too."
- **Code:** `strings.ts:304`; Focus draws the same bar and takes its top line from it
  (`focus/focus.tsx:201`, `191`). **Proved in code,** small.
- **Kind:** 9.
- **Fix:** "Focus and Today show a bar of this many laps. Today can change it too."

### 14. A lap from yesterday that rings, or is stopped, becomes "Lap 0"

- **Where:** Focus after midnight, on a lap begun before it. The picture
  (`reviews/15/shots/focus-yesterday-phone-light.png`) shows only the running state, which reads
  well: "A lap from yesterday, focus" over an empty bar.
- **Guess:** none needed once seen: "Lap 0 of 8 today, done".
- **Code:** the name "A lap from yesterday" is used only while `!result` (`focus.tsx:101`,
  `191`). At the bell the line falls to `s.focus.lap(dayLap, ...)` with `dayLap = fig.laps + 0`
  (`focus.tsx:99`; `fillsToday` and `fillOpen` leave out a lap begun on another day,
  `counts.ts:136`, `149`), so with no other lap today it reads "Lap 0 of 8 today, done", with
  "First lap of the day." under it. Stop gives "Lap 0 today stopped at 80 min."
  (`focus.tsx:174`, `159`) and Done for now "Stopped after lap 0 today." (`focus.tsx:169`).
  While it runs, the race panel can say "Finish this lap and you draw level."
  (`focus.tsx:60`), though the lap adds nothing to today (`core/stats.ts:131-134`).
  **Proved in code by reading; no picture and no test covers it** (no "Lap 0" anywhere in
  `client/src` or `tests`).
- **Kind:** 8.
- **Fix:** keep the name through the result and the stop lines: "A lap from yesterday, done",
  "Yesterday's lap stopped at 1h 20m."
- **Picture only:** the demo shows "You 1h 20m" at 00:20 under that empty bar; the real count
  would show nothing of that lap today.

### 15. A long lap stopped is said in minutes

- **Where:** Focus and Today after Stop on a long lap.
- **Code:** `strings.ts:113` and `:468` print `at ${Math.floor(ran / MIN)} min`: "Lap 6 today
  stopped at 280 min." beside a clock that read "4:40:00" and totals that read "4h 40m".
  **Proved in code,** small.
- **Kind:** 8.
- **Fix:** use `total(ran)` there: "stopped at 4h 40m".

## Looked at and found clear

- **The welcome's headline, sentence and button.** What it is and what to press are plain; the
  habit week and its line read right, and the ring on a rest day is the one Habits itself draws
  (`habits/habits.tsx:143`, same `Week`).
- **Focus's top line in its plain states.** "Lap 6 of 8 today, next", ", focus", ", paused",
  ", done", the bar under it, "Lap 6 today" with no target and no bar, and in a break "Short
  break" with "lap 7 today next" all read at once and agree with Today's "5 of 8 laps today".
- **Hours on the clock.** "6:00:00", "5:59:59", "of 6:00:00, ends at 22:40", and "5 more
  minutes" leaving when it would pass 360 (`focus.tsx:401`). Today's strip holds "5:59:59".
- **Stop and Done for now.** One of each, each followed by a line that says what it did, with
  Undo.
- **Carrying a row within today, and up out of Upcoming to a place.** The row lands where it was
  let go and Next takes the Start button; Undo puts both the day and the place back
  (`moveBack`).
- **Progress, "Today, hour by hour".** "7 earlier today" over the latest five, opened in place,
  then "Show the latest 5", and folded again on another day (`progress/day.tsx:34-35`, `87-93`).
  The link stays where the finger is. Nothing to hand back.
- **The task sheet's lengths.** "My usual lengths" and "Its own", with "This task has its own
  lengths." said on Focus before a start.

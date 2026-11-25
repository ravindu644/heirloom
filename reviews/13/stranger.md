# Section 13: the stranger's walk

2026-11-25. Walked from the phone pictures first (`reviews/13/shots/*-phone-light.png`, the
`keyboard-*` set, the `*-zoom-*` set, and three dark ones to settle a doubt), then the words
(`client/src/ui/strings.ts`), then the code, only to prove or kill a guess: `ui/focus/`,
`ui/today/`, `ui/habits/`, `ui/kit/`, and behind the handlers `sync/focus.ts`, `sync/today.ts`,
`sync/habits.ts`, `core/today.ts`, `core/timer.ts`, `core/stats.ts`, `main.tsx`,
`platform/capacitor.ts`. Nothing was run. Paths are under `client/src/` unless they start
elsewhere. Each finding says whether it is **proved in code** or **a reading of a picture**.

The five things already known (four laps fixed, Cheer by time, the three figures at 200%,
reminders from a browser, no times on the Habits row) are left out.

Ranked by how soon in a first day someone meets it. 19 findings.

## The three counts, honestly

The words are much better: wherever a count has its noun ("in this set", "on this task",
"today") a stranger can tell them apart, and the short fifth mark does make Focus's bar a
different thing from Today's. The set and the day never share a bar on one screen.

A stranger can still mix them up in four places, all of them where one count stands without
its noun, or where two sentences about the same lap give two numbers:

1. **Focus, before a start** (`focus-task-phone-light.png`): the line over the title says
   "lap 3 on this task, 4 estimated" and the button under the digits says "Start lap 2". The
   button's number is the set's and has no noun. Finding 3.
2. **Today, just after a bell** (`today-lap-over-phone-light.png`): "6 of 8 laps today", then
   the dark strip "Lap 2 of 4 in this set, done", and directly under it the Next row's bare
   "3 of 4". This is the one screen where all three stand within a thumb's height, and the only
   place Today speaks of the set at all. Finding 6.
3. **Focus's chooser** (`focus-choose-phone-light.png`): the top line "Lap 2 of 4 in this set"
   and the outlined row's bare "2 of 4" are the same three characters. The demo data makes it
   exact, but four is the commonest estimate, so it will happen. Finding 6.
4. **The phone's shade**: the countdown says "Essay draft: lap 1, 3 estimated" and the bell
   that replaces it says "Lap 2 of 4 in this set, done." Same lap, two numbers. Finding 7.

And one that is nobody's fault: through the first set of every day the day's count and the
set's count are the same number, so "2 of 8 laps today" and "Lap 2 of 4" teach a stranger that
they are one count until lap 5 proves otherwise. Setting a day target with an empty list starts
it at 4 (`ui/today/today.tsx:196`), and then the two read "2 of 4" alike.

The cheapest cure for all four is one rule: **Today counts the day and the task, Focus counts
the set and the task, and a button never carries a count.** That is three strings.

## Findings

**1. Quick add: "~" is three taps deep on a phone keyboard, and the example does not look typed.**
- Meets: Today, the first task of the first day (`today-adding-phone-light.png`,
  `keyboard-1-typing-light.png`). Under the field: "Essay draft ~3 plans it at 3 laps."
- Guess: reads it as a sentence about a task called Essay draft; if they see "~3" is to be
  typed, they look for "~" and do not find it on the letters or on the first page of symbols.
- Does: only a trailing `~` and one or two digits is taken (`core/today.ts:84`); on Gboard and on
  Samsung's keyboard the tilde is on the second page of symbols. Anything else stays in the title,
  and the bar says so honestly ("Added: Essay draft ~100.").
- Kind: 2 (a word, here a sign, that needs the book), and the skill's "the phone, with its real
  keyboard". **Regex proved in code; the keyboard is from knowing the keyboards, not from a picture.**
- Fix: draw the typed part as typed (the kit's field face or quotes around "Essay draft ~3"), and
  ask the user whether a sign from the first symbols page should count too.

**2. Focus: "Change" stands at the end of the count, so it reads as "change the estimate".**
- Meets: Focus before the first lap (`focus-task-phone-light.png`): "lap 3 on this task, 4
  estimated ... Change", the title on the line below.
- Guess: Today has just taught them that "5 of 8 laps today ... Change" changes the 8. Here it
  changes the 4.
- Does: opens "This lap is for" and changes the task (`ui/focus/focus.tsx:267`, `304`). With no
  task ("This lap is for ... Change", `focus-nothing-phone-light.png`) it reads right.
- Kind: 8 (one word for two things across screens). **Proved in code; the guess is from the picture.**
- Fix: the word says its object, "Change task", or "Choose" when the lap is for nothing.

**3. Focus: "Start lap 2" under "lap 3 on this task".**
- Meets: Focus before the first lap on any task that already has laps (`focus-task-phone-light.png`,
  `focus-top-phone-light.png`: "lap 17 on this task, 32 estimated" over "Start lap 2").
- Guess: the button is wrong, or it starts some other lap than the one named above the digits.
- Does: the button's number is the set's (`startLap(nextLap)`, `focus.tsx:353`; `strings.ts:97`),
  the line's is the task's (`onTask(named.laps + 1, ...)`, `focus.tsx:265`). After a bell the same
  pair is "This task is at 3 of 4." beside "Start lap 3 now" (`lap-done-own-phone-light.png`).
- Kind: 8. **Proved in code.**
- Fix: the buttons lose their number ("Start", "Next lap now"): the top line already says which
  lap of the set it is.

**4. The task chosen on Focus lasts one lap, and nothing says so.**
- Meets: the second lap of the day, for anyone who used "Change" to work on something that is
  not first on Today.
- Guess: "I chose Exercise 5-3; I am on it until I choose again or tick it."
- Does: the choice is dropped the moment any lap starts (`ui/focus/choice.ts:24`). After the bell
  "Start lap 3 now" starts a lap on Today's first task, without naming it on that screen
  (`focus.tsx:237`); in a break the same (`focus.tsx:360`), and the two lines there show Today's
  first task as words, with no "Change" (`focus.tsx:251`, `302-309`: a button only when `ready`).
  With "Start the next lap when a break reaches its bell" on, the lap that follows is for nothing
  in particular unless the task was Today's first (`taskAfter`, `sync/focus.ts:239-246`). Today's
  own "Start" ignores the choice too (`ui/today/today.tsx:286`). A lap begun on the wrong task
  cannot be pointed at another: only stopped.
- Kind: 6 (a press whose effect ends silently), and 5 from the other side: a choice that closes
  itself. **Proved in code.**
- Fix (changes what the product does, so the user's to say): keep the choice until its task is
  done or the day turns and hand it to both "Start lap N now" buttons; or, with one source of
  truth, choosing a task on Focus moves it to the top of Today.

**5. A break is the moment to choose the next task, and the lines are not a button then.**
- Meets: the first break. The lines over the green digits name the next task exactly as before
  the lap, minus the word "Change".
- Guess: taps the title, as it worked ten minutes ago. Nothing happens.
- Does: `focus.tsx:302-309` draws a `div` unless `ready`; a running or paused break is not `ready`.
  The way round is "Done for now", then "Change", then Start, or a trip to Today.
- Kind: 6 (a press with no visible effect). **Proved in code; no picture shows a break with a task
  (the break demo states have none), so a picture of that state is worth adding.**
- Fix: the lines are the button in a break too, and its choice goes to "Start lap N now".

**6. Today after a bell, and the chooser: a bare "3 of 4" under "Lap 2 of 4 in this set".**
- Meets: Today at the first bell (`today-lap-over-phone-light.png`); the chooser on Focus
  (`focus-choose-phone-light.png`).
- Guess: the row's "3 of 4" and the strip's "Lap 2 of 4" are the same count, and one is late.
- Does: the strip is the set (`today.lapDone`, `strings.ts:396`, drawn at `today.tsx:247`); the
  row is the task's laps over its estimate with no noun (`today.of`, `strings.ts:413`,
  `ui/kit/laps.tsx:27-30`). The task's sheet does say it whole: "0 of 2 laps run".
- Kind: 8. **Proved in code.**
- Fix: Today's strip says only what Today counts ("Lap done."), so the set is spoken of on Focus
  alone; the chooser can stay as it is once the button in finding 3 has no number.

**7. The shade: the countdown counts the task's laps, the bell that replaces it counts the set's.**
- Meets: the first lap on the phone with a task. Countdown: "Essay draft: lap 1, 3 estimated".
  At the bell: "Lap 2 of 4 in this set, done." and "Take five."
- Guess: "it said lap 1 a minute ago; now lap 2 is done?"
- Does: `ring.lapOn(on.title, on.laps + 1, on.estimate)` for the countdown (`main.tsx:102`),
  `ring.lapDone(lap)` with the set's lap for the bell (`main.tsx:112`; `strings.ts:200`, `211`).
- Kind: 8. **Proved in code; the shade itself is not in the pictures.**
- Fix: a bell for a lap on a task says the count the countdown said ("Essay draft: lap 1 of 3
  done."), and the set moves to the body with the break.

**8. Stop in the shade says nothing afterwards and cannot be taken back.**
- Meets: the first time a thumb lands on Stop beside Pause in the notification.
- Guess: as in the app: a line that says what stopped, and an Undo for a few seconds.
- Does: the tap calls `focus.stop()` (`main.tsx:118`). The line and its Undo are Focus's own
  state, set only by Focus's own button (`note`, `focus.tsx:140-154`), and Undo is drawn only
  with a note (`focus.tsx:279-289`). So the app, opened by that very tap when it was not up,
  shows "Start now and it ends at 17:05." and no way back, though the timer still holds the stop
  as undoable for ten seconds.
- Kind: 6. **Proved in code.**
- Fix: Focus says the stop line whenever the timer holds an undoable stop, wherever the stop came from.

**9. In a break the shade offers a Pause the app does not have, and calls "Done for now" Stop.**
- Meets: the first break with the phone in hand: "Short break", Pause, Stop.
- Guess: Stop ends the break and gets on with the next lap (in the app the break's only filled
  button is "Start lap 3 now").
- Does: every phase gets the same two buttons (`platform/capacitor.ts:118`). Stop puts the timer
  at rest, which the app calls "Done for now" (`focus.tsx:146-149`, `373`). Pause holds the break;
  Focus and Today draw Pause only in a lap (`focus.tsx:359-363`, `today.tsx:267-271`), so a paused
  break can only come from the shade.
- Kind: 8 and 1 (two words for one act; a control that exists in one place only). **Proved in code.**
- Fix: in a break the shade's second button carries the app's words, "Done for now"; whether a
  break can be paused at all is the user's to say, and then both places agree.

**10. A long title pushes the count off the countdown's one line.**
- Meets: the first lap on a task with a long title: "Write up the lab report on sorting and send
  it to the group: lap 17, 32 estimated" in a notification title Android cuts at one line.
- Guess: none to make: the count is simply not there.
- Does: `ring.lapOn` puts the title first and has no guard (`strings.ts:211`); `result.task`
  beside it does ("This task" past 28 characters, `strings.ts:171`).
- Kind: 4 (a text with no end). **The string is proved in code; the cut is Android's, not seen in a picture.**
- Fix: the count goes first ("Lap 17, 32 estimated: Write up the lab...").

**11. Adding a habit says nothing, and the new habit is below the fold.**
- Meets: the first habit added once the list is longer than the screen
  (`keyboard-1-habit-typing-light.png`, then `keyboard-1-habit-gone-light.png`).
- Guess: "did it take?" The field emptied, the keyboard went, and the only change in sight is
  "3 of 6 today" turning into "3 of 7 today".
- Does: `onAdd={(text) => habits.add(text, 127, 1) !== null}` with no `say` (`ui/habits/habits.tsx:114`).
  Today's add does say it (`today.tsx:72`). DESIGN.md's "Adding puts the keyboard away" promises
  the bar for a habit too.
- Kind: 6 (an effect out of sight and nothing saying so). **Proved in code.**
- Fix: the same bar as a task: "Added: Brush teeth."

**12. "Its own", then "My usual lengths", then "Its own" again: the three lengths are gone.**
- Meets: the first task given its own lengths (`sheet-own-set-phone-light.png`), by anyone who
  taps the other choice to compare or by mistake.
- Guess: two tabs; what was typed under "Its own" is still there when they come back.
- Does: "My usual lengths" writes three nulls (`ui/today/task-sheet.tsx:291`), and "Its own" then
  copies the account's lengths in again (`task-sheet.tsx:294`). No Undo, no word.
- Kind: 9 (a choice whose consequence is not said). **Proved in code.**
- Fix: the sheet remembers the last own lengths while it is open and gives them back.

**13. A task's own breaks: nothing says which breaks they are, or what a running lap does.**
- Meets: the same sheet (`sheet-own-phone-light.png`): "A short break", "The long break, after
  four laps" under one task.
- Guess: "after four laps of this task", which a task estimated at 2 never reaches; or that
  changing "A lap" now changes the lap that is running.
- Does: a break takes the lengths of the task of the lap it follows, so the long break is this
  task's only when the set's fourth lap was on it (`sync/focus.ts:161-170`); lengths are read when
  a run begins (`sync/focus.ts:111-114`). Settings says the second half ("A lap or a break already
  running keeps its length."); the sheet says neither.
- Kind: 9. **Proved in code.**
- Fix: one note under the three steppers: "The break after a lap on this task takes these. A lap
  already running keeps its length."

**14. "No reminders" reads as a state, clears every time at once, and has no Undo.**
- Meets: the first habit with several reminders (`habits-sheet-20-set-phone-light.png`: twenty
  times typed, and under them the underlined words "No reminders").
- Guess: a label that is wrong ("but I have two"), or a way to switch them off for now.
- Does: `edit({ reminds: [] })` (`ui/habits/habit-sheet.tsx:131`): all of them, for good, in one
  tap. A removed subtask gets ten seconds of Undo in the same kind of sheet; twenty typed times get none.
- Kind: 3 and 9. **Proved in code.**
- Fix: it asks twice when more than one is set (the kit's `Twice`), with words that are an act:
  "Clear all reminders".

**15. One tap on minus in "How often in a day" deletes a reminder time; plus does not bring it back.**
- Meets: the same sheet, the first overshoot on the stepper (`habits-sheet-twice-phone-light.png`:
  two times set, minus pressed once).
- Guess: the stepper changes a number; the 2nd reminder waits in case they go back to two.
- Does: a lowered target cuts the list and writes it (`sync/habits.ts:223-227`). From 20 down
  five and up five loses five times.
- Kind: 9. **Proved in code.**
- Fix: the sheet keeps the cut times while it is open and gives them back when the target goes up again.

**16. The reminders' note needs a second reading, and says "done" where the app says "checked in".**
- Meets: `habits-sheet-thrice-phone-light.png`: "On the days it is planned. The 2nd is skipped
  once it is done twice that day, and so on."
- Guess: has to work out that the 1st is then skipped after one, and whether "done" means the
  habit's whole day (the row's tick) or one check-in.
- Does: place k is skipped once the day's count is over k (`doneToday: habit.today.count > place`,
  `main.tsx:79`). The single form says "until it is checked in" (`strings.ts:678`).
- Kind: 8, 2. **Proved in code.**
- Fix: "Each one is skipped once you have checked in that many times that day."

**17. Subtasks: the keyboard goes after each one, though there is no bar there to read; "~2" is kept as text.**
- Meets: the first task broken into pieces (`keyboard-1-subtask-typing-light.png`,
  `keyboard-1-subtask-gone-light.png`), which the nudge over 7 laps asks for.
- Guess: type one, Add, type the next. And, having learned "~3", "Outline ~1".
- Does: the field lets go after every add (`ui/kit/quick-add.tsx:31`), so five pieces are five
  taps back into the field. No bar is said for a subtask (`task-sheet.tsx:413`), rightly, since
  the row lands directly above the field; so the reason for letting go does not hold here.
  `addSubtask` keeps the whole line as the title (`sync/today.ts:447-455`).
- Kind: 6, 2. **Proved in code.** The keyboard rule is the user's own ask, so this is a question
  for them, not a bug.
- Fix: ask whether the subtask field alone keeps the keyboard; DESIGN.md's rule should say the bar
  is for a task and a habit, not a subtask.

**18. A length typed out of range snaps back with no word.**
- Meets: `keyboard-4-own-light.png`, typing 120 for an hour-long reading lap, or 0.
- Guess: it took it, or the field is broken.
- Does: a value outside 1 to 99 (60 for a break) is put back (`ui/kit/stepper.tsx:34`; the tops in
  `ui/kit/lengths.tsx:9`). The top is said nowhere; plus going grey says it only to someone who
  steps there.
- Kind: 4 (a number with no top said). **Proved in code.** The same field is in Settings.
- Fix: the unit says the range while the field has the focus: "minutes, 1 to 99".

**19. Small ones, at the extremes.**
- At the 33rd lap on a task its squares vanish from that row and the count stands alone, while
  every other row keeps its picture (`ui/kit/lap-squares.tsx:15`). Kind 4. Proved in code.
  Fix: draw the four lines and let the count carry the rest.
- The chooser sheet stays open over a lap that started on another device, and a tap in it then
  quietly sets the lap after this one (`focus.tsx:388`, not gated on `ready`). Kind 5. Proved in
  code. Fix: `choosing && ready`.
- "Long break, paused" beside "lap 1 of 4 in this set next" (`long-break-paused-phone-light.png`;
  `lapAheadInSet`, `strings.ts:91`, used at `focus.tsx:174`): "this set" is the one that has just
  ended. Kind 8. Proved in code. Fix: "lap 1 of the next set".
- "Lap 2 of 4 in this set" on Focus, "lap 2 in a set of 4" in the Room: on purpose, by the
  comment at `strings.ts:729`, and it reads so. No fix asked.

## For the lead, about the pictures

- `focus-long-break-phone-light.png` and `long-break-paused-phone-light.png` show the four laps
  of the set **empty** beside the filled green mark. The dark and zoom pictures of the same states
  show them full, as the code says they are (`core/stats.ts:111`). Either those two were taken
  before the fills had drawn, or opening Focus in a long break starts from an empty bar; a
  stranger who saw it would think the set had been lost. Worth one look in the built app.
- No picture shows a break, or a lap, with a task named over the digits. Findings 4 and 5 live there.
- No picture shows the shade. Findings 7 to 10 are from the words and the code alone.

## Looked at and found clear

- **The keyboard after Add, for a task**: the field empties, the keyboard goes, "Added: Essay
  draft, 3 laps." stands at the foot (`keyboard-1-entered-light.png`, `keyboard-1-gone-light.png`).
  The bar covers the new row for its four seconds, and names it, so nothing is lost. An estimate
  over the top is taken as 32 and the bar says 32.
- **A habit's reminder times**: the set ones and one empty field, two to a line, "1st reminder",
  "2nd reminder"; at 20 times a day with all 20 set the sheet still reads
  (`habits-sheet-20-set-phone-light.png`). Times typed out of order are closed up and sorted when
  the focus leaves the group, which is the order they ring in.
- **The squares**: at 9, 17 and 32 they stay under the count or beside it and never push the
  title out; past the estimate they go on in the same colour beside "13 of 8"; a stopped lap is a
  part square, the same picture Focus's bar uses. At 200% the row still reads.
- **The chooser**: opens from the two lines, the task Start would begin is outlined, a tap
  chooses and closes, "Close" changes nothing, "Nothing in particular" is last. With no task on
  Today there are no lines and no button, so nothing opens onto an empty sheet.
- **"This task has its own lengths."** beside "Start now and it ends at 17:30." on Focus, and the
  digits show 50:00 before the start (`focus-own-phone-light.png`). "Still planned" counts each
  task at its own lap length (`core/today.ts:228`), so the hours are true.
- **The set's line and bar on Focus**: "Lap 2 of 4 in this set, next" with "long break after
  lap 4" explains the set on the screen where it is first met, and the short mark turning green
  in the long break is read at once.
- **The habit hint**: "It starts as once a day, every day. Open it to change that." says what
  was made and where to change it.
- **"Paused, 12:34 left"** with Resume and Stop, under the task's line: plain.
- **Take one back**, the day target's editor, Recently deleted, Archive and Delete with their
  note: all do what their words say.

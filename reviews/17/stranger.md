# Section 17, the stranger's walk: Focus's bar is the task's, and Today's carry

Walked from the phone-light pictures in `reviews/17/shots/` (laptop for `focus-next` and
`today-carry-top`, where the layout differs; dark for the `carry-up` frames), the `focus` and
`result` blocks of `client/src/ui/strings.ts`, and the handlers in `client/src/ui/focus/focus.tsx`
(`chosen`, `barTask`, `bar`, `set`), `client/src/ui/focus/choice.ts` (`picked`, `followLaps`),
`client/src/ui/kit/lapbar.tsx`, `client/src/ui/kit/lap-squares.tsx` and
`client/src/ui/today/today.tsx` (the carry's `today.move` / `today.moveToToday`). Judged with
"Paused" over the bar and "Take five." on the result gone, as asked. Left out as already known:
the carried card's lift and the old Next's glide in `today.md` (frame `carry-up-phone-dark-4`
still shows K&R over "Later today"), and the two FAILs in `focus.md`.

## 1. Focus with a task of 4 estimated laps

- **`focus-next`.** A full-width bar of segments, two red, then "C", "K&R 5.1 to 5.5: pointers and
  arrays", "Change task", 25:00, "Start now and it ends at 17:05.", "Start the lap". Nothing says
  what the bar counts. My first guess, for a timer screen with a bar at its top: the day, or the
  set before a long break. I learn it is the task's only by pressing "Change task" and seeing the
  same pattern, small, on each row ("2 of 4"), or by choosing a task with no estimate and watching
  the bar go. That works, but it takes a detour. See 2.
- **`running-task`.** The third segment fills with the clock. Clear: this lap is that segment. No
  hesitation. The digits and "of 25:00, ends at 16:59" carry the rest. Good.
- **`focus-task-paused`** (without "Paused" over the bar). Grey digits, "of 25:00, paused since
  16:38", Resume. Said once, read at once.
- **`focus-past-estimate`.** Four equal segments: full, full, half, and one growing. I read it as
  "estimate 4, I am on the last one, still inside my plan". The task's estimate is 2: I am two laps
  past it. On Today the same task says "3 of 2" beside its squares; on Focus nothing does, and
  segments past the estimate look exactly like planned ones. The half-full third segment also made
  me look twice: two part-filled segments side by side, and only one is moving. See 3.
- **`focus-all-in`.** The tall bar, three of three, "6 laps today. This task is at 3 of 3.", "Start
  5 min break", "Start the next lap now". Reads at once. The best moment of the walk.
- **`focus-break-task`.** "Short break", green digits, the task's bar at 3 of 4, the task named,
  "Start the next lap now". I know which task the next lap is for. Good.
- **Extreme, 32 estimated** (the picker's top, `task.schema.json`). 32 segments of about 7.75px on
  a phone. Proportion reads; the number does not, and Focus no longer says it before a lap rings.
  Not stuck: Today's row and the result both say "7 of 32". Leave it.

## 2. A task with no estimate, and nothing in particular

- **`focus-no-estimate` / `-running`.** No bar; the top of the screen is simply margin. Nothing
  feels missing, because nothing hints there could be a bar. No hesitation.
- **Changing from a task with an estimate to one without** (via "Change task"): the bar vanishes and
  the title does not move. For a moment I wondered whether I had lost the day's progress, then the
  list showed this task with no squares. Small; it is also the clue that answers walk 1.
- **`focus-nothing`.** "This lap is for / Nothing in particular", no bar. Clear.

## 3. Mid-way through the day: how many laps have I done?

- **On Focus, idle or running.** The only lap-shaped thing is the bar, and in `focus-next` it says
  2 of 5. I took that as "2 laps today". Wrong: Today says "Focused 2h 5m, 5 laps" and "5 of 8 laps
  today". The race card says "You 2h 5m", a time, not laps, so it does not correct me.
- **Why I misread it.** Today's day bar (`today-carry-top`, under the three figures) and Focus's
  task bar are the same component (`LapBar`), the same full-width red segments on the same grey
  track, each near the top of its screen. One look for two different counts.
- **Not stuck:** after a lap rings Focus says "6 laps today.", and Today is one tap away with the
  answer twice. No words need to come back. The fix is to stop the two bars looking like one thing
  (below, 2).
- **`set-done`.** "Four laps. The long break is earned!" over "+50m at 16:40. 8 laps today." Four
  of what? The day says 8; no screen shows the timer's set any more, so the "four" matches nothing
  I can see. On the day's first set it reads fine; from the second on it reads like a wrong count.

## 4. Today: carrying a task to the top

- **Frames `carry-top-phone-light-1..7`.** "Press and hold a task to move it." I hold "Thinking in
  React", it lifts, the list opens under it, and over the top it takes the red outline and Start
  while still in my hand, K&R drops under "Later today", and the count reads "4 tasks, 9 laps"
  before I let go. I knew what letting go would do before I did it. Release does not press the
  Start under my finger (`lift.ts` swallows that click). Good.
- **Carry from Upcoming (`carry-up` frames).** "Now due today. It was tomorrow." with Undo: the
  date change is said and can be taken back. Good.
- **Then I go to Focus, and it says K&R.** In a session where my last lap was on K&R, Focus keeps
  K&R as its task (`choice.ts`: "A lap on a task leaves that task as the choice ... until another is
  chosen"; `focus.tsx`: `chosen = kept ? ... : nextTask`). Carrying React to Next on Today does not
  touch that choice: nothing in `today.tsx` writes `picked`. So Today's Next has a Start that begins
  React, and Focus's "Start the lap" (and "Start the next lap now" in a break) begins K&R. Two
  Starts, one word, two tasks. I just told the app what is next, and the screen made for starting
  ignored me. This is the one place in the walk I would call stuck: nothing on either screen says
  why, and the way out ("Change task" on Focus) is a second act for the same wish.
- **Laptop, "Up next" on Focus vs "Next" on Today.** Today's "Next" is the one task Start begins;
  Focus's "Up next" card lists the tasks after it, which Today calls "Later today". After making
  React Next, I looked for it in Focus's "Up next" and it was not there (it is the big title
  instead). Two words for one list, and "next" meaning two things. Small; see the last note.

## Top problems, each with the smallest fix

1. **Today's Next and Focus's task part ways after a lap.** Carrying a row to the top of Today makes
   it Next with a Start, but Focus keeps the task of the last lap. Fix: in
   `client/src/ui/today/today.tsx`, where a carry lands a row first among the open ones (both
   `today.move` and `today.moveToToday`), set `picked.value = null` (from `../focus/choice.ts`), so
   Focus follows Today's Next again. One line, no words. Test: a lap on K&R, carry React to the
   top, Focus shows React.
2. **Focus's task bar looks like Today's day bar.** Same component, same look, both near the top: a
   stranger reads the task's 2 of 5 as the day's laps. Fix without words: tie the bar to its task
   by place. On Focus, draw it under the title (between the title and the digits) instead of over
   the project line, keeping its height so the digits stay at 178.6; the task row on Today already
   puts its squares with its title. A rule for DESIGN.md: a lap bar sits with what it counts.
3. **Past the estimate cannot be seen on Focus.** Estimate 2 with four laps reads as estimate 4.
   Fix: in `client/src/ui/kit/lapbar.tsx`, pass the estimate and give the first segment past it a
   wider gap before it (`margin-left` of one more space step). No words; Today's "3 of 2" already
   says it in numbers.
4. **"Four laps." on the long break, beside "8 laps today."** The four is the timer's set, which no
   screen shows now. Fix: in `client/src/ui/strings.ts` `result.set`, take the day's count and say
   "Four more laps. The long break is earned!" when it is past 4; keep "Four laps." on the first.

## Other notes, not in the top four

- Focus's laptop card "Up next" could be titled "Later today", the word Today uses for the same
  tasks (`s.focus.upNext` to `s.today.later`). One word change; leaves "Next" meaning one thing.
- A 32-lap estimate makes a bar nobody can count; the number is on Today and on the result. Leave.
- The over-explaining the user named is gone everywhere I looked. Nothing in this walk needs a
  sentence put back.

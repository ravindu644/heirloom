# Section 4: Focus on a task

Pictures: `focus-next`, `focus-task`, `focus-break-task`, `focus-result-task`, at 412x915 and
1440x900, light and dark, 16 in all. Every one opened, beside `focus-*.png` in the reference.
Taken at 02:19 from commit 615e847; `focus.module.css` changed at 02:33 (the title is now one line
on the phone), so the phone pictures want retaking.

## Verdict: PASS

## Problems

None blocks. Three small things:

- `focus-result-task-phone-*`: the facts break as "...K&R chapter 5 is at 3 of 4. / Take five.",
  leaving the next step alone on line two. `text-wrap: pretty` on the facts.
- The sample task has an estimate of 4, so "Lap 2 of 4, next" stands over "lap 3 of 4 on this
  task". The words are right ("on this task" does the work); a sample of 5 would show it better.
- `result.task` says "This task is at 3 of 4." for a title over 28 letters. No picture of it.

## The Look table

| Test | Result |
|---|---|
| Across the desk at 30% | Pass. The digits are unchanged; the title is a second read. |
| Squint | Pass. Digits first, the task second. |
| One action | Pass. "Start lap 2" is the one fill; "Start without a task" is an underlined label. |
| Reference | The task line over the digits and "Up next" in the laptop rail: match. DESIGN.md wins on three points: a square for the project where the mockup has a dot, "lap" where it says "pomodoro", `title` at 24/600. "Up next" counts are `figure-sm`, as the mockup's. |
| Logo test | Pass. Unchanged from section 2. |
| Empty state | Pass. With no task next, the screen is section 2's. |
| Thumb | Pass. Start, Pause and the break button are where they were. |
| Dark | Pass. |

## Rulings on the lane's decisions

- **"Up next" hidden under 720px, the next task named over the digits: upheld.** Better than the
  mockup on a phone: one task, already chosen, one tap. The laptop keeps the list because it has
  the rail for it.
- **The task shown before the lap starts: upheld.** In section 2 the title came only once the lap
  ran and the digits jumped 73px on the laptop at Start (my note then). Now `focus-next` and
  `focus-task` hold the digits at the same place.
- **No task line on a break: upheld.** A break is on nothing. The digits move with the phase,
  when the whole screen changes anyway.

## The words

- Pass: "lap 3 of 4 on this task". The lap in progress is counted, which is what a person means.
- Pass: "Start without a task". PRODUCT.md: starting must not need planning.
- Pass: "Up next".
- Pass: "K&R chapter 5 is at 3 of 4." in the result's facts, between the day's laps and "Take
  five."
- No exclamation mark, sentence case, no padding word, no em dash.

## Keep

"Start without a task" beside the Start that names one. The plan is offered and never required:
one quiet line keeps PRODUCT.md's "for a task or for nothing in particular" true on the screen
where it matters. Do not hide it in a menu or make the task a required choice.

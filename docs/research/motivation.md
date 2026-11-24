# What makes doing the work feel rewarding 🌱

> [!TIP]
> Looking at your own record works: monitoring progress raised goal attainment by d = 0.40
> across 138 trials, more when the record is written down. Comparing with your past self gives
> pride without the urge to beat anyone. Streaks help while intact, and people quit once they
> break, unless the app lets them repair it or shows what they kept. Punishment backfired for
> every Habitica user studied. Rewards work when they report something true, rarely, briefly, and
> can be switched off.

Checked 2026-11-24. Where a publisher blocked the full text, the claim rests on the abstract and
says so in [references.md](references.md).

## 1. Facts to remember

| Finding | Number | Source |
|---|---|---|
| Gamification in learning helps a little | g = .49 cognitive, .36 motivational, .25 behavioural; motivational effects "less stable" | Sailer & Homner, 2019 (abstract) |
| Mixing competition with collaboration worked best for behaviour | moderator effect | same |
| Monitoring your own progress | d = 0.40 over 138 RCTs, larger when recorded or shared | Harkin et al., 2016 |
| "If Y, then I will do X" plans | d = .65 over 94 tests | Gollwitzer & Sheeran, 2006 |
| Fixed breaks vs breaks when you feel like it | 24/6 blocks gave less fatigue, more concentration, same task completion | Biwer et al., 2023, 87 students (abstract) |
| Breaks in general | vigour d = .36, fatigue d = .35, performance not significant | Albulescu et al., 2022 |
| Splitting the streak from the daily goal | +3.3% day-14 retention, over 40% more learners on 7+ day streaks | Duolingo, 2020 |
| A protected weekend | +4% returned a week later | Duolingo, 2017 |
| Friends doing a streak together | 22% more likely to do the daily lesson (correlation) | Duolingo, 2024 |
| Competition arm of a step-count trial | +920 steps a day, the only arm still ahead at follow-up | STEP UP RCT, 2019 (abstract) |

## 2. The Pomodoro Technique, as its author wrote it

Francesco Cirillo, *The Pomodoro Technique*, v1.3, 2007:

1. A pomodoro is 25 minutes of work and a 3 to 5 minute break. Every four, a 15 to 30 minute break.
2. "A Pomodoro Is Indivisible." A pomodoro that is definitively interrupted is void, "as if it had
   never been set". Interruptions are marked (internal and external) and dealt with.
3. "If a Pomodoro Begins, It Has to Ring." Spare time at the end goes to review.
4. Estimate in whole pomodoros. "If It Takes More Than 5-7 Pomodoros, Break It Down." "If It
   Lasts Less Than One Pomodoro, Add It Up." Track how far off the estimates were.
5. Record at the end of the day, in no more than one pomodoro.
6. Starting and finishing are "explicit gestures", better not automated.
7. "The Pomodoro Technique shouldn't be used for activities you do in your free time."
8. Cirillo warns against "ring anxiety": the timer is not an inspector.
9. "The Next Pomodoro Will Go Better."

Auto-starting the next pomodoro and crediting half pomodoros are app conventions, not Cirillo's.

## 3. Your own record

- Monitoring works best when it is physically recorded (Harkin, 2016).
- Measuring an activity makes it feel like work, except when the activity serves a goal such as
  learning (Etkin, 2016). Measuring hobbies has a cost. Measuring study does not.
- Comparing with your past self gave pride "without triggering superiority goals" and "a sense of
  progress and insight"; comparing with others raised pride too, but brought the urge to beat
  them (Gürel et al., 2020, 583 children).
- People speed up as a goal gets close, and a card with 2 of 12 stamps already filled is finished
  faster than an empty card of 10 (Kivetz 2006; Nunes & Drèze 2006).
- A new week or month works as a fresh start after a bad stretch (cited by Silverman & Barasch).

## 4. Streaks

- An intact streak shown in a log raised later engagement. A broken one made people drop off,
  worse when they blamed themselves, softer when they could repair it (Silverman & Barasch, 2023).
  After a break, people "switched to a new language rather than rebuild a streak, because their
  record no longer represents them".
- When GitHub removed streak counters in May 2016, long streaks were abandoned and weekend
  activity fell. The authors read it as counters pushing people to work on rest days (Moldon et
  al., 2021). GitHub kept the graph.
- A goal with built-in slack ("emergency reserves") made people persist after a miss (Sharif &
  Shu, 2021). Duolingo's Streak Freeze cites this line of work.
- Duolingo itself: a broken streak "can have the opposite effect, and actually feel quite
  demotivating".

## 5. Friends

- The presence of others speeds simple tasks and slows complex ones; overall it explains 0.3 to 3%
  of variance (Bond & Titus, 1983). Programming is a complex task.
- Body doubling showed no significant effect in an EEG study of 26 people (ASSETS 2025).
  Focusmate's "143%" is its own survey with no control group.
- Receiving Strava kudos made runners run more. Friends drift toward each other, more toward the
  ones who run less (Franken et al., 2022).
- Leaderboards: sources conflict. Duolingo's leagues raised learning time 17%, but they match you
  with strangers of similar pace. A course with a leaderboard and badges lowered motivation and
  exam scores (Hanus & Fox, 2015, abstract only). People at the bottom of a board "feel
  inadequate" (Park & Kim, 2021). With two friends of unequal pace, a ranked board makes one of
  them the permanent loser.
- Forest's Plant Together kills everyone's tree when one person leaves the app.

## 6. Rewards

- Expected rewards given for merely doing a task undermined intrinsic motivation; positive
  feedback helped (d = +0.33) (Deci, Koestner & Ryan, 1999). A competing meta-analysis found
  rewards mostly harmless (Cameron & Pierce, 1994). Both agree informational feedback helps.
- Habitica punished every participant during their busiest weeks, and people renamed tasks to
  dodge it (Diefenbach & Müssig, 2019).
- Asana's celebration creatures are occasional and opt-in. Todoist's goal celebrations can be
  switched off, and it offers days off, vacation mode and up to 3 streak restores.
- No study draws the line between rewarding and childish. In practice the tasteful ones report
  something true, are rare and brief, and can be turned off.

## 7. Principles for our app

These follow from the above. They are design decisions, not findings.

1. **Cirillo's loop is the core.** A deliberate tap to start, 25/5 with a long break after four,
   interrupted means void and is never shamed, estimates in whole pomodoros, a short end-of-day
   look back.
2. **You against past you.** The main progress view is a heatmap, this week against last week,
   and how close estimates came. No ranking of friends against each other by default.
3. **A forgiving streak.** Low bar (one pomodoro a day), rest days and a small reserve, and after a
   miss the record shows what was kept ("41 of the last 45 days"), never a reset to zero.
4. **No punishment.** No points taken away, nothing dies, nothing depends on another person
   holding out.
5. **Friends share presence and effort.** Who is focusing now, a shared weekly total both fill,
   one tap to cheer a finished session.
6. **Rewards report achievements.** A set of four, a task done within its estimate, a best week.
   Brief, rare, and switchable. Nothing for merely opening the app.
7. **The record reads as a learning log.** "6 pomodoros on React hooks" instead of "6 pomodoros".
8. **Plans carry when and what, and show the distance left.** A bar toward today's and this week's
   target. Monday and the 1st are fresh pages.
9. **Only study is measured.** The app never asks to track free time.

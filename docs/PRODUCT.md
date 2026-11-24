# Product

What heirloom does in version 1, and why each part earned its place. A feature not on this page is
not in v1. Adding one is a decision the user makes, with a line in the log at the bottom.

## Who it is for

A student who wants to learn hard things (C, React, Next.js) and keeps putting it off. Two years
ago Focus To-Do worked for them: they worked in pomodoros, studied in a group with a friend, and
looking at their own record kept them going. Then the paywall and the broken mod APKs took it away.
Today's alternatives are "bloated, confusing, cluttered, not free, and not rewarding".

So the job is: **make it easy to start, pleasant to keep going, and satisfying to look back.**
With a friend, on a phone and a laptop that agree with each other, for free, on their own server.

## What it is not

- Not a project manager. No kanban, no priority matrix, no calendar, no timeline, no assignees.
- Not a social network. No public groups, no global leaderboard, no chat.
- Not a habit game. No coins, no pets that die, no points taken away.
- Not a subscription. Everything is free; there is no "premium".
- Not an AI product. No voice capture, no AI planning.

Each of these is something a competitor does well. Leaving them out is why this one stays small.

## Version 1

### 1. Focus (the timer)

| Feature | Why |
|---|---|
| Pomodoro of 25 / 5, a 15 to 30 minute long break after four, all adjustable, free | Cirillo's definition; locked custom lengths were Focus To-Do's top complaint |
| A deliberate tap to start each pomodoro; auto-start is an option, off by default | Cirillo: starting is "a declaration of your determination" |
| Pause, stop, and set aside. A stopped pomodoro keeps its minutes but is not a lap, and the next start is a fresh one. One set aside ("void") stays in history and counts nowhere. Neither is scolded | Minutes really worked are kept; Cirillo's void, "as if it had never been set", is there when the user asks for it; no punishment ([motivation.md](research/motivation.md) §6) |
| A pomodoro can be for a task or for nothing in particular | Starting must not need planning |
| Time left identical on every device, live; any device can pause or stop it | The user's first requirement |
| Rings on time on the phone with the screen off; a live countdown in the notification | Focus To-Do users complained of timers dying in the background |
| A bell at every phase change, and a choice of a few sounds | "The sound of the bell really does ping my brain" |
| Extend the current pomodoro by a few minutes | Focus To-Do added it in 2024; Cirillo prefers review, so it is a small button, not a habit |

### 2. Today (the plan)

| Feature | Why |
|---|---|
| Tasks with an estimate in whole pomodoros, and done vs estimate shown on each. Done may pass the estimate ("6 of 5"), with no warning colour | Cirillo's estimate loop; Focus To-Do's best planning feature; the overrun feeds estimate accuracy |
| A gentle nudge when an estimate is over 7 ("break it down?") | Cirillo: "If It Takes More Than 5-7 Pomodoros, Break It Down" |
| Projects with a colour, used to tag what the time went to (C, React, Next.js) | The record reads as a learning log ([motivation.md](research/motivation.md) §7) |
| Subtasks, one level | Enough to break a task down; deeper trees are project management |
| Due date and repeat (daily, chosen weekdays, weekly) | Free in v1; locked repeats were a Focus To-Do complaint |
| A day target in pomodoros with a bar that fills toward it | Goal-gradient: effort rises as the goal nears |
| Optional "when" on a planned task ("after dinner") | Implementation intentions, d = .65 |
| Quick add with the estimate typed inline ("pointers chapter 3 ~4") | Capture in one line |
| Recently deleted, 30 days | Undo for the rare sync clash, and for mistakes |

### 3. Progress (the record)

| Feature | Why |
|---|---|
| A year heatmap of focus time | Asked for by name by Focus To-Do users; GitHub kept its graph |
| This week against last week, per day and in total | You against past you (Gürel 2020) |
| Time per project, this week and all time | The most praised Focus To-Do report |
| Estimate accuracy over time | Cirillo's record of over- and under-estimation |
| A day timeline of sessions, with interrupted and "ran on two devices" marks | The honest record |
| A forgiving streak: a day counts with one pomodoro that rang; two rest days a week (Monday to Sunday) do not break it; after a miss it shows days kept ("41 of the last 45") | Streaks help while intact and people quit when they break (Silverman & Barasch); slack keeps them going (Sharif & Shu) |
| Personal bests: best day, best week | Achievement, not activity |
| A short end-of-day look back: what got done, one line to note | Cirillo's daily record, at most one pomodoro long |

### 4. Habits (the routine)

| Feature | Why |
|---|---|
| Habits with chosen weekdays and a count per day | The daily routine the user asked for |
| One tap to check in; each check-in is its own record | Cannot be lost between two devices |
| A small heatmap per habit, with the same forgiving streak | Same principle as Progress |
| A reminder time per habit | Notifications, asked for by the user |

### 5. Rooms (studying with friends)

| Feature | Why |
|---|---|
| A private room joined by an invite code; a few friends | How Focus To-Do groups worked, minus public groups and bots |
| Who is focusing right now, which phase, time left | "Show who else is currently studying" |
| Each member's focus time today and this week | What Focus To-Do groups showed |
| A shared weekly total the room fills together, with a target | Collaboration plus mild competition worked best (Sailer & Homner) |
| One tap to cheer a friend's finished pomodoro | Kudos made runners run more (Franken 2022) |
| No ranking by default; an opt-in "ranked this week" view per room | Rankings make the slower friend the permanent loser (Park & Kim 2021) |
| Task titles hidden from the room unless switched on | Privacy first |
| A switch to hide rooms entirely | Long-time Focus To-Do users valued it |

### 6. Rewards (the soul)

| Feature | Why |
|---|---|
| A completion moment when a pomodoro rings: short, skippable, quieter for breaks | The moment that says "that counted" |
| A set of four finished: a bigger moment, once | Cirillo's unit of a session |
| Milestones with names that have a sense of humour ("First tomato"-style, our own words) | Pomodoist shows personality lives in the words |
| A task done within its estimate, a personal-best week: marked when they happen | Rewards report achievements (Deci et al. 1999) |
| Every celebration can be turned off | Asana and Todoist make theirs optional |
| Nothing for merely opening the app; no currency | Expected rewards for doing nothing undermine motivation |

### 7. Everywhere

| Feature | Why |
|---|---|
| Works fully offline; syncs when it can; a quiet indicator says which | User requirement |
| Light and dark, following the system | Comfort at night |
| Export everything as JSON; import it back | Your data is yours; Focus To-Do users lost theirs |
| Invite-only accounts on the user's own server | Free, private |

## Words

Every string in the app is written, not generated. Rules for the voice are in `DESIGN.md`. Three
that apply everywhere:

1. Say what happened, in plain words. "4 pomodoros on pointers. You guessed 5."
2. Never scold. A void pomodoro is "set aside", a missed day is not mentioned on the day after.
3. One idea per sentence, short sentences, no exclamation marks except in the rare big moment.

## Later, maybe

Ideas that may come back after v1, each needing its own decision: a desktop app (Tauri), iOS, white
noise, app blocking during focus, a companion character, widgets, a public read-only progress page,
a push to the phone so a timer started on the laptop rings on a phone whose app is closed.

## Decision log

| Date | Decision |
|---|---|
| 2026-11-24 | v1 scope as above; rooms in v1; no paid tier; no global social features |
| 2026-11-24 | The look is route B, Pacer: you against your own past as a ghost; see DESIGN.md |
| 2026-11-24 | A pomodoro ends one of three ways: rang (minutes and a lap), stopped (minutes, no lap), set aside (neither). A stop under 60 s is not recorded |
| 2026-11-24 | Two rest days a week, counted Monday to Sunday; the streak's day needs one pomodoro that rang |

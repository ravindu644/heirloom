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
| A task can have its own lengths for a lap, a short break and a long break, in place of the account's | The user: an hour of reading and 25 minutes of drills are not the same lap |
| The task for the next lap is chosen on Focus itself; Today is not a step on the way to a start. Focus stays on the task of the last lap until another is chosen or it is done, and a lap that starts by itself goes on with it | The user; a choice that lasted one lap was found by the stranger's walk |
| The phone's countdown notification has Pause and Stop, and names the task and its lap | The user: the timer is run from the shade as much as from the app |
| Marking a task done while its lap runs ends the lap there. After a bell and in a break, "Done for now" puts the timer to rest without starting anything | The user: a timer still counting for a ticked task read as a bug; and someone finished for the day had two buttons that both started something |
| Pause, and one Stop. Stop ends the lap where it is: it keeps its minutes, is drawn as full as it ran, and the next start is the next lap. A lap can be taken out of the count afterwards, from the day's timeline ("Don't count it"), and put back. Neither is scolded | One rule a person can say back: a lap ends at its bell or when you stop it. Minutes really worked are kept; what is earned (a streak day, a mark, a cheer) still needs the bell; no punishment ([motivation.md](research/motivation.md) §6) |
| A pomodoro can be for a task or for nothing in particular | Starting must not need planning |
| Time left identical on every device, live; any device can pause or stop it | The user's first requirement |
| Rings on time on the phone with the screen off; a live countdown in the notification | Focus To-Do users complained of timers dying in the background |
| A bell at every phase change, and a choice of three sounds (an electric school bell, a struck bell, a soft chime); on the phone it buzzes too and rings through Mute like an alarm, each a switch; a bell's notification can start the break or the next lap, and a called lap's can say "I'm in" | "The sound of the bell really does ping my brain" |
| Extend the current pomodoro by a few minutes | Focus To-Do added it in 2024; Cirillo prefers review, so it is a small button, not a habit |

### 2. Today (the plan)

| Feature | Why |
|---|---|
| Tasks with an estimate in whole pomodoros, 32 at most, and done vs estimate shown on each. Done may pass the estimate ("6 of 5"), with no warning colour | Cirillo's estimate loop; Focus To-Do's best planning feature; the overrun feeds estimate accuracy |
| A gentle nudge when an estimate is over 7 ("break it down?") | Cirillo: "If It Takes More Than 5-7 Pomodoros, Break It Down" |
| Projects with a colour, used to tag what the time went to (C, React, Next.js): twelve to choose from, or any colour from the device's picker | The record reads as a learning log ([motivation.md](research/motivation.md) §7); five tones were too few for the user |
| Subtasks, one level | Enough to break a task down; deeper trees are project management |
| Due date and repeat (daily, chosen weekdays, weekly) | Free in v1; locked repeats were a Focus To-Do complaint |
| A time of day on a task's due day ("15:30"), shown on its row; the phone app reminds at that minute if the task is not done. The browser shows the time and does not remind | Asked for by the user on first use: "giving a task a time is the whole point" |
| A day target in pomodoros with a bar that fills toward it | Goal-gradient: effort rises as the goal nears |
| Quick add with the estimate typed inline ("pointers chapter 3 ~4") | Capture in one line |
| Recently deleted, 30 days, with "Delete for good" on each row for what should go now | Undo for the rare sync clash, and for mistakes; and the user's word: what is mine I can rename and I can remove |
| A project can be renamed, recoloured and deleted where it is chosen; its tasks stay | A typo in a project's name was in every task sheet for good |

### 3. Progress (the record)

| Feature | Why |
|---|---|
| A year heatmap of focus time | Asked for by name by Focus To-Do users; GitHub kept its graph |
| This week against last week, per day and in total | You against past you (Gürel 2020) |
| Time per project, this week and all time | The most praised Focus To-Do report |
| Estimate accuracy over time | Cirillo's record of over- and under-estimation |
| The day, lap by lap: each lap in the order it ran with what it added to the day and the day's running total, drawn on its own sliver of the day's hours; breaks and tasks done at their times; interrupted, "not counted" and "ran on two devices" marks; one line to note | The honest record that adds up where you read it (the user's pick, 2026-11-28: one list, nothing shown twice) |
| A forgiving streak: a day counts with one pomodoro that rang; two rest days a week (Monday to Sunday) do not break it, and either or both can be pinned to a weekday in Settings (a Sunday off), the rest coming on the first days missed; after a miss it shows days kept ("41 of the last 45") | Streaks help while intact and people quit when they break (Silverman & Barasch); slack keeps them going (Sharif & Shu) |
| Personal bests: best day, best week | Achievement, not activity |

### 4. Habits (the routine)

| Feature | Why |
|---|---|
| Habits with chosen weekdays and a count per day | The daily routine the user asked for |
| One tap to check in; each check-in is its own record | Cannot be lost between two devices |
| A small heatmap per habit, with the same forgiving streak | Same principle as Progress |
| A reminder time per habit, and one for each time of the day when it is done more than once (brush teeth: 06:00 and 22:00) | Notifications, asked for by the user |

### 5. Rooms (studying with friends)

| Feature | Why |
|---|---|
| A private room joined by an invite code; a few friends | How Focus To-Do groups worked, minus public groups and bots |
| Who is focusing right now, which phase, time left | "Show who else is currently studying" |
| Each member's focus time today and this week | What Focus To-Do groups showed |
| A shared weekly total the room fills together, with a target | Collaboration plus mild competition worked best (Sailer & Homner) |
| One tap to cheer a friend's finished pomodoro | Kudos made runners run more (Franken 2022) |
| No ranking by default; an opt-in "ranked this week" view per room | Rankings make the slower friend the permanent loser (Park & Kim 2021) |
| A room has a keeper, the friend who made it: only the keeper renames it, sets its target or ranks it; the code stays everyone's to share | A friend who joined could rename the room or rank everyone (the user's find, 2026-11-26) |
| A room's members in a live order: on a lap first, then on a break, then the rest, each by this week's focus; the keeper may switch to the strict weekly order | Who is working now is what a room is opened for; a fixed league table makes the slower friend the permanent loser (Park & Kim 2021) |
| Start together: a member calls a lap for a minute ("a lap at 15:00"), others say they are in, and each phone starts its own lap then | Committing to a time to start is among the best-supported ways to begin (implementation intentions, Gollwitzer & Sheeran 2006) |
| Break notes: one-line text notes in the room, written and read only when you are not on a lap, kept a week, no images, no notifications during a lap | A chat that cannot interrupt a lap; Focus To-Do's chat had no notifications and was half a feature |
| A picture of yourself, shrunk on the device before it is sent (about 5 KB); your initial stays the default | Lanes are known at a glance; Focus To-Do let people set one |
| The room's streak: days in a row on which everyone in the room ran a lap that rang, with two rest days a week | Friends on a shared streak were 22% more likely to do the day's lesson (Duolingo 2024); shared, so nobody is behind |
| The room against its own last week, at this time of the week | The ghost, for the group: competition with no loser among friends |
| The keeper can remove a member, and a new code then stops the old one working | A room must not be stuck with someone who joined by a code passed on |
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
| On a laptop, Chrome or Edge can install the web app: its own window, an icon in the taskbar or dock, the bell through Web Push as before. No native build | A desktop app without a second codebase; the user chose it over Tauri, which wants a Windows signing certificate and a native bell of its own |
| Export everything as JSON; import it back | Your data is yours; Focus To-Do users lost theirs |
| Invite-only accounts on the user's own server | Free, private |
| A way back in for someone who forgot their password: the server's owner makes a link that sets a new one, once, within 24 hours; the owner's own way back is a command on the server. No email, no recovery questions | The user: good to have. A friend will forget a password, and a server on a phone has no email to send |
| A welcome that shows what heirloom is: one drawing (seven weeks of days), one title and one sentence on where your days live; the phone app's first screen, and beside the sign-in form in the browser | Someone handed the app or an address by a friend has never heard of it; the user's own first question |
| About, at the foot of Settings: the name, the version and the build it is, and where its source lives | Someone handed the app wants to know what it is and whose; a bug report needs the exact build |
| The phone app asks which server: an address or a pasted invite link, typed once, changed only while signed out. Plain `http` is allowed and said plainly | Anyone can run a server; one app serves them all, on a home network too |
| A fresh server is set up from the app: the first account needs no invite and is the owner | Nobody should need a terminal to start |
| Three roles. A member uses the app. An admin also recruits: makes invite links, renews them, takes them back. The owner, the first account, also decides who the admins are | The person who runs the server stays in charge of it; friends can help it grow |

## Words

Every string in the app is written, not generated. Rules for the voice are in `DESIGN.md`. Three
that apply everywhere:

1. Say what happened, in plain words. "4 pomodoros on pointers. You guessed 5."
2. Never scold. A void pomodoro is "set aside", a missed day is not mentioned on the day after.
3. One idea per sentence, short sentences, no exclamation marks except in the rare big moment.

## Later, maybe

Ideas that may come back after v1, each needing its own decision: a desktop app (Tauri), iOS, white
noise, app blocking during focus, a companion character, widgets, a public read-only progress page.

## Decision log

| Date | Decision |
|---|---|
| 2026-11-24 | v1 scope as above; rooms in v1; no paid tier; no global social features |
| 2026-11-24 | The look is route B, Pacer: you against your own past as a ghost; see DESIGN.md |
| 2026-11-24 | A pomodoro ends one of three ways: rang (minutes and a lap), stopped (minutes, no lap), set aside (neither). A stop under 60 s is not recorded |
| 2026-11-24 | Two rest days a week, counted Monday to Sunday; the streak's day needs one pomodoro that rang |
| 2026-11-25 | The app asks for its server and allows plain http; a fresh server is set up from the app; owner, admin and member, on Docmost's invitation flow written fresh (links good for 7 days, used once, renewed, taken back). No members list, no removing an account, no password reset: the user's words |
| 2026-11-25 | From the user's first hour with the app: a welcome that says what heirloom is (the phone app's first screen, and beside the browser's sign-in); a clock time on a task with a reminder on the phone; twelve project colours and a picker; "set aside" becomes "not counted" in every word the app says; nothing on a screen selects; things move when they change, and a tap never moves the page |
| 2026-11-25 | Today's tasks can be put in order by hand (the lead's reading: "Next" needs an order, and ARCHITECTURE section 4 already rules on two devices reordering). Notes on a task are not in v1: the field exists in the data, no screen shows it, until the user says so |
| 2026-11-25 | From the user's second hour: one Stop. A stopped lap is a lap that ended early (it has its place in the set and on its task, and is drawn as full as it ran), where it used to give its place back; the second button, "Don't count this lap", is gone from Focus and lives on in the timeline. A lap always leaves a row, however short. The free words for "when" are gone from a task: a clock time says it. An estimate stops at 8 laps. Today's order is changed by pressing and holding a row |
| 2026-11-25 | Whatever a person makes they can rename and remove: a project gets a name and a Delete, and a deleted task or habit can be deleted for good without waiting 30 days (the user, after a stranger's walk found a project could never be changed) |
| 2026-11-25 | From the user's third hour, the things that matter day to day: a task's own lengths; a reminder for each time of a habit's day; an estimate up to 32 laps drawn eight to a row; the task picked on Focus; Pause and Stop in the phone's notification; the keyboard goes when something is added |
| 2026-11-25 | From the user's fourth hour: the set of four is the timer's own bookkeeping and is shown nowhere (Focus's bar is the day's target, and the break a lap earns is said in minutes); a lap up to 360 minutes; Upcoming put in order by hand and a row carried from it into today; the day's sessions folded to the latest five; and a welcome that is drawn |
| 2026-11-26 | From the user's fifth hour: Focus's bar is the chosen task's laps (its estimate, and how many are done), and nothing over it explains it; the day's target is Today's alone. A row carried to the top of Today is shown as Next while it is still carried |
| 2026-11-26 | The welcome made quiet: of three drawn options the user chose one drawing of seven weeks, the mark and name, "Your days stay yours." and one sentence |
| 2026-11-26 | About in Settings: name, version and commit, and the source on GitHub (private for now) |
| 2026-11-26 | Rooms get a keeper: the maker alone changes the room's name, target and ranking; it passes to the longest member when the keeper leaves |
| 2026-11-26 | The room's second pass, chosen by the user from a list: a live member order, start together, break notes, pictures, the room's streak, the room against its last week, removing a member. Badges and a ranked board by default were left out |
| 2026-11-26 | A lap stopped within its first minute is a start taken back: no row, no lap of the day, no place in the four. (For one build every stopped lap counted, and the day's bar on Focus filled with slips of the thumb.) A lap stopped after a minute is still a lap that ended early |
| 2026-11-27 | A room holds 16 people, up from 8: the user wants to invite more friends. The server sends the whole room to everyone at each change, about 400 bytes a person, so 16 is light for the server; past about 25 the People tab would want the people not on a lap folded away |
| 2026-11-27 | Rest days can be pinned: the user wants a whole Sunday to be a rest day by plan. Still two a week; a pinned day holds its place, the rest stay automatic so a bad day is still covered, and a pinned day kept gives its place back. Only the focus streak: habits rest on the days they are not planned, and a room keeps its own automatic two |
| 2026-11-27 | The phone stays in step while heirloom is closed: a foreground service holds its own connection to the server, so a lap started or paused on the web updates the phone's countdown and bell within a second, and room notes and called laps notify. The user chose it over UnifiedPush (an extra app for every friend) and Firebase (a Google project tied to every self-hosted server), as self-hosted apps like Home Assistant and Gotify do. A silent notification says it is running; a Settings switch turns it off |
| 2026-11-28 | The web app is installable (a manifest and icons): the user asked what native Linux and Windows builds would cost, and took the installable web app over Tauri. Tauri stays under "Later, maybe" for a bell with the browser closed or a tray icon |

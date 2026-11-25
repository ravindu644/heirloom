# Roadmap

Version 1 in sections of 2 to 4 hours each. Work top to bottom; a section starts only when the one
before it is committed. Every item is a box; every section ends with the same gate (see
[AGENTS.md](AGENTS.md), "Gate a section").

Lanes are named in brackets: **[lead]** the orchestrating session, **[server]**, **[core]**,
**[ui]**, **[android]**, **[qa]**, **[design-review]**. Lanes in the same section run in parallel.

## 0. Foundation: the rails everything else runs on

Nothing user-visible. Ends with every check wired and failing for the right reason.

- [x] [lead] Pin toolchains in `TOOLCHAINS.md`: Go, Node, pnpm, Android SDK and JDK versions, read
      from the machine and the S10 container
- [x] [lead] `Makefile` with `make check` (runs everything below), `make dev`, `make server`,
      `make web`, `make apk`, `make deploy`
- [x] [lead] `contracts/`: `protocol.md` (the messages in ARCHITECTURE §5, exact JSON), one JSON
      schema per dataset, and fixtures: `merge.json` (cell pairs and the winner), `timer.json`
      (event sequences and the expected time left), `stats.json` (sessions and the expected
      totals, overlaps counted once), `streak.json` (day lists and the expected streak)
- [x] [lead] `tools/tokens.mjs`: `DESIGN.md` (colours with their `dark-` twins, type, spacing, radii,
      `motion`) to `client/src/ui/tokens.css`; fails on an unknown role or a missing dark twin
- [x] [lead] Fonts from `design/fonts/` into the client, timer weight preloaded
- [x] [lead] `tools/style-check.mjs`: fails on a colour, font name or duration literal anywhere in
      `client/src/ui/` outside `tokens.css`
- [x] [lead] `tools/budget.mjs`: built JS and CSS sizes against ARCHITECTURE §7
- [x] [server] Skeleton Go module; `select sqlite_version()` test asserts 3.51.3 or later; the
      binary cross-compiled for arm64 runs on the S10 container and its idle RSS is written down
- [x] [core] Skeleton TS package with the fixture runner; every fixture loads and fails
- [x] [qa] Playwright set up with a "two devices" helper (two browser contexts, `setOffline`)
- [ ] Gate

## 1. The sync core

The part that has to be right. No screens yet.

- [x] [core] Stamps (HLC) with the drift rule, merge of cells, outbox, cursor; `merge.json` passes
- [x] [core] Timer math from the timer cell (time left, phase end, set index); `timer.json` passes
- [x] [core] IndexedDB store with batched writes and `persist()`
- [x] [core] Transport: WebSocket with ping, offset estimate, reconnect with backoff, HTTP fallback
- [x] [server] Store (cells, newest per field, sequence numbers), push/ack/nack, pull by cursor,
      fan-out to an account's devices; `merge.json` passes in Go
- [x] [server] Accounts: invite links, argon2id passwords, per-device tokens, login rate limit
- [x] [qa] Simulator: N devices, random edits, random offline windows; all copies end equal to the
      server; runs in `make check` with a fixed seed
- [x] [qa] Scenarios from ARCHITECTURE §4 as tests, one per table row
- [ ] Gate

## 2. Timer, end to end

The first thing the user can touch: one timer, live on two screens.

- [x] [ui] App shell: navigation between Focus, Today, Progress, Habits, Rooms; tokens loaded;
      light and dark
- [x] [ui] Focus screen from `DESIGN.md`: start, pause, resume, stop, void, extend, phase and set
      of four, the bell
- [x] [core] Session writing: one row per run id, outcome rules, overlap marking
- [x] [ui] The completion moment for a pomodoro and for a set of four (motion rules from DESIGN.md)
- [x] [server] Serves the built web app from the binary
- [x] [qa] e2e: start on device A, see it on B within 1 s; pause on B, see it on A; both offline,
      both run, reconnect, nothing lost and the overlap marked
- [x] [design-review] Focus screen against DESIGN.md at phone and laptop sizes, light and dark
- [ ] Gate (the user runs a pomodoro on two laptops' browsers)

## 3. The phone

- [x] [android] Capacitor 8 project, `USE_EXACT_ALARM`, app icon and splash from DESIGN.md
- [x] [android] Notifier for Capacitor: reschedule the exact alarm on every timer change from any
      device; sound and vibration
- [x] [android] Countdown notification plugin (`setChronometerCountDown`), started and cleared with
      the phase
- [x] [ui] Safe areas, back button, keyboard, touch sizes on the phone
- [x] [qa] On the user's phone over adb: 1-minute timer, screen off, alarm fires within 2 s
      (`dumpsys alarm` and the notification log as proof); timer started on the laptop rings on
      the phone
- [ ] Gate (the user lives with it for a day)

## 4. Today

- [x] [ui] Today list: tasks with estimate and done count, the day target bar, quick add with
      `~4` estimates, the "break it down?" nudge above 7
- [x] [ui] Projects with colours, one level of subtasks, due dates, repeats, optional "when"
- [x] [ui] Start a pomodoro from a task; the Focus screen shows the task
- [x] [ui] Recently deleted with Restore
- [x] [core] Fractional ordering; repeat rule expansion; fixtures added to `contracts/`
- [x] [design-review] Today at both sizes
- [ ] Gate

## 5. Progress

- [x] [core] Stats from sessions: per day, week against week, per project, estimate accuracy,
      personal bests, the forgiving streak ("41 of the last 45"); `stats.json` and `streak.json`
- [x] [ui] Heatmap of the year (hand-drawn SVG, no chart library)
- [x] [ui] This week against last week; time per project; estimate accuracy
- [x] [ui] Day timeline with void and "ran on two devices" marks, void with a tap
- [x] [ui] End-of-day look back
- [x] [design-review] Progress at both sizes
- [ ] Gate

## 6. Habits

- [x] [ui] Habits with weekdays and a count; one-tap check-in; undo
- [x] [ui] Per-habit heatmap and streak
- [x] [android] Habit reminder notifications
- [x] [qa] Two devices check in offline; both kept; the day is done
- [ ] Gate

## 7. Rooms

- [x] [server] Rooms: create, invite code, join, leave, members; presence from the timer cell and
      socket liveness; today's and this week's totals from sessions; cheers
- [x] [ui] Room screen: who is focusing, phase and time left, today and week, the shared weekly
      target, cheer with one tap; opt-in ranked view; task titles only when allowed
- [x] [ui] Settings: what rooms see; hide rooms
- [x] [qa] Three accounts in three contexts: presence within 1 s, totals right, privacy holds
- [ ] Gate (the user and a friend study together for a session)

## 8. Rewards and words

- [x] [ui] Milestones with our own named tiers; within-estimate and best-week marks; all switchable
- [ ] [ui] Sounds: a small set, licensed, under 200 KB in total
- [x] [ui] Settings screen complete: durations, auto-start, sounds, celebrations, ring here
- [x] [lead] Copy pass over every string against the voice rules in DESIGN.md
- [x] [design-review] Every screen, empty states included, at both sizes, light and dark
- [ ] Gate

## 9. Live on the S10

- [x] [server] systemd unit, data directory, daily `VACUUM INTO` backup kept for 7 days
- [x] [server] Web Push with VAPID at phase end for laptop browsers
- [ ] [lead] Exposure: Cloudflare named Tunnel on the user's domain (`cloudflared` on the S10
      container, its RSS measured); WebSocket and the 25 s heartbeat tested through it
- [x] [ui] Export and import as JSON
- [x] [qa] Measured on the S10: idle RSS, RSS with 20 simulated devices, both under budget
- [ ] Gate (the friend installs it from a link and joins a room)

## 10. A server anyone can run

- [x] [lead] PRODUCT, ARCHITECTURE, protocol section 10, DESIGN.md components, the facades
- [x] [server] Roles, first-run setup, invitations (create, list, renew, revoke), admins (list, set), `setup` in healthz, `role` in welcome
- [x] [core] The server's address (typed, probed, kept), `engine.role`, `needsSetup`, invites and admins facades
- [x] [ui] The server step, "Set up this server", joining from a link, the Invites and Admins panels
- [ ] [android] Plain http to any host from the app
- [x] [qa] Setup, a link from make to join, raise and lower, the app build's server step
- [x] [lead] The S10 listens on the home network; the APK that asks
- [ ] Gate (the user sets up the S10 from the phone, makes a link, a second device joins with it)

## 11. What the first hands found

The user's first hour with the app, twelve points. Each becomes a fix, a rule in DESIGN.md, a
lesson in `skills/taste-gate` and a test.

- [x] [lead] PRODUCT rows, protocol (a task's `time`, a project's colour), DESIGN.md (motion, what
      you tapped stays, nothing selects, an error's own line, the bar, button weights), the words
- [x] [core] A task's `time`; project colours by name or picked; how long the bar stays
- [x] [ui] The kit moves: rows, openings, sheets, screens, the bar. What you tapped stays under
      your finger, on every screen
- [x] [ui] The welcome; an error beside its hint; the Add button in a field; the day target's
      editor; Pause outweighs Stop; nothing selects; "not counted" for "set aside"
- [x] [ui] A time on a task; twelve project colours and the picker
- [ ] [android] A task's reminder; the keyboard on sign-in; no long-press callout; the time and
      colour pickers in the WebView (built and unit tested; each still to be seen on the phone)
- [x] [qa] `staysPut` on every tap that changes the page; the bar; errors; Add; the target; a
      task's time; a colour on two devices; the welcome; nothing selects; reduced motion
- [x] [design-review] Every changed screen at 412, 471 and 1440, light and dark, and the motion
- [x] [lead] Every point in `skills/taste-gate` with its check
- [ ] Gate (the user goes through the twelve points again on the phone and the laptop)

## 12. What the second hour found

Nine more points from the user's hands, and one instruction: find the other places that confuse
in the same way. Each becomes a fix, a rule in DESIGN.md, a lesson in a skill and a test.

- [x] [lead] The rules first: one Stop (protocol sections 6, 7, 11, 12), PRODUCT rows, DESIGN.md
      (a page is never scrolled past its content, rows put in order by holding, the picker,
      every number has a top, what opened closes when answered, a field's room from the keyboard)
- [x] [core] Stop ends the lap and the set moves on; a lap always leaves a row; a lap's fill;
      estimates stop at 8; fixtures
- [x] [server] A room's laps count stopped laps too
- [x] [ui] Focus: one Stop, laps drawn as full as they ran
- [x] [ui] Today: hold a row to move it; a row that cannot overflow; the strip's button; no
      blank end after a tap
- [x] [ui] The task sheet: no free "when", "Pick" and the app's own picker, "New project" closes,
      nothing selects in a sheet, a field's room from the keyboard
- [x] [lead] A walk through every screen as a stranger: two controls for one act, words that need
      the data model, numbers with no top, things that never close; the findings fixed or parked
- [x] [core] [ui] What a person made they can rename and remove: a project's name and Delete, and
      "Delete for good" on a deleted task or habit
- [x] [qa] Each point as a test, the new ones at the extremes (45 laps, a page that fits, a sheet
      with a keyboard)
- [x] [design-review] Every changed screen at 412, 471 and 1440, light and dark
- [x] [lead] The lessons in `skills/`
- [ ] Gate (the user goes through the points on the phone)

## 13. What the third hour found

No glitches this time; six things that matter in daily use.

- [x] [lead] PRODUCT rows, protocol (a task's own lengths, a habit's `reminds`, estimates to 32),
      DESIGN.md (squares eight to a line, adding puts the keyboard away, a hint is an example,
      the task chosen on Focus)
- [x] [core] A task's own lengths, read when a run begins; `reminds`; the estimate's top; a lap
      that starts by itself goes on with the task before it
- [x] [android] Pause and Stop in the countdown notification, and a notification for a paused
      lap; its words follow the task; one reminder for each time of a habit's day; a button
      names its run and is never done twice (built and unit tested; not yet run on a phone)
- [x] [ui] The keyboard goes after Add; a habit's reminder times; the squares; a task's lengths;
      the quick add's hint; the task chosen on Focus; every count with its noun
- [x] [qa] Each as a test (`tests/e2e/third-hour.spec.ts`); the notification's words in
      `client/src/plan.test.ts`
- [x] [design-review] The changed screens (`reviews/13/`), and a stranger's walk over them
      (`reviews/13/stranger.md`: 19 findings, 15 fixed, 4 in findings.md)
- [ ] Gate (the user lives with it for a day). On the phone: the real keyboard after Add; the
      notification's Pause, Resume, Stop and "Done for now", with the app in the background,
      locked, and swiped away; a Stop made while the app was gone not done again after a new
      lap and a force stop; two reminder times of one habit, the first leaving the shade alone
      after one check-in

## 14. A welcome that shows it

The user, on the third build: the landing explains what a lap is and that it is 25 minutes, like
any timer's would. Show it instead: artwork drawn in the design's own language, and only
enough words to say briefly what heirloom does.

- [x] [lead] DESIGN.md: what the welcome's artwork is made of (the app's own marks: a day as a
      race in two lanes, a habit's week, a task's squares, a room), what moves and what does
      not, and the few words; PRODUCT row reworded
- [x] [ui] The welcome in the phone app and beside the browser's sign-in, drawn from tokens,
      no picture file that could not be redrawn in dark; reduced motion shows it still
- [x] [qa] It reads at 412, 206 and 1440, light and dark; nothing of it is announced twice to
      a screen reader; the way on to the server field and to sign-in is one press
- [x] [design-review] Against "nothing generic": could this screen belong to another app?
      (`reviews/14/welcome.md`: no; three drafts)
- [ ] Gate (the user sees it on the phone)

## 15. What the fourth hour found

On the third build the user found no glitches; four things about how it reads and moves.

- [x] [lead] DESIGN.md and protocol: the set is on no screen (Focus's bar is the day's target);
      a lap up to 360 minutes; Today's open tasks are one list to the hand, Upcoming included;
      the day's list of sessions shows its five latest
- [x] [core] The lap's top at 360 minutes; Upcoming by day until a hand moves a row; a row
      moved from Upcoming into Today is for today, in one write; a lap stopped in its first
      minute is a start taken back; a long lap across midnight is one sitting; a repeat that
      was carried or dated back no longer ends its series
- [x] [ui] Focus's line and bar; the bell's and the room's words; hours on the timer from 100
      minutes; rows carried between Next, Later today and Upcoming; the sessions list folded
- [x] [qa] Each as a test, the moves on two devices (`tests/e2e/fourth-hour.spec.ts`)
- [x] [design-review] Focus in every state with and without a target; the long timer; the list
      (`reviews/15/`), and a stranger's walk (`reviews/15/stranger.md`: 15 findings, 11 fixed,
      4 in findings.md)
- [ ] Gate (the user lives with it). On the phone: a row carried with a finger; a 360 minute
      lap's alarm with the screen off; the welcome under the phone's own bars. Five tests that
      need the day's earlier hours were skipped by a run made after midnight: run `make e2e`
      in the daytime

## 16. A way back in

- [ ] [lead] PRODUCT row and protocol: whoever owns the server gives a member a link that sets a
      new password; the owner's own way back is a command on the server
- [ ] [server] [core] [ui] The reset link, made in the Admins panel and from `heirloomd`
- [ ] [qa] A reset on two devices; an old token after it
- [ ] Gate

## 17. Release 1.0

- [x] [qa] Soak: simulator for an hour against the S10 with random network drops; no divergence
- [x] [qa] Accessibility: contrast from DESIGN.md, screen reader labels, reduced motion
- [ ] [qa] Budgets: bundle, tap latency on the phone, live timer arrival
- [x] [lead] README for friends: install the APK, open the web app, join a room
- [ ] [lead] Signed release APK; tag `v1.0.0`
- [ ] Gate

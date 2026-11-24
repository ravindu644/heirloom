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

- [ ] [android] Capacitor 8 project, `USE_EXACT_ALARM`, app icon and splash from DESIGN.md
- [ ] [android] Notifier for Capacitor: reschedule the exact alarm on every timer change from any
      device; sound and vibration
- [ ] [android] Countdown notification plugin (`setChronometerCountDown`), started and cleared with
      the phase
- [ ] [ui] Safe areas, back button, keyboard, touch sizes on the phone
- [ ] [qa] On the user's phone over adb: 1-minute timer, screen off, alarm fires within 2 s
      (`dumpsys alarm` and the notification log as proof); timer started on the laptop rings on
      the phone
- [ ] Gate (the user lives with it for a day)

## 4. Today

- [ ] [ui] Today list: tasks with estimate and done count, the day target bar, quick add with
      `~4` estimates, the "break it down?" nudge above 7
- [ ] [ui] Projects with colours, one level of subtasks, due dates, repeats, optional "when"
- [ ] [ui] Start a pomodoro from a task; the Focus screen shows the task
- [ ] [ui] Recently deleted with Restore
- [ ] [core] Fractional ordering; repeat rule expansion; fixtures added to `contracts/`
- [ ] [design-review] Today at both sizes
- [ ] Gate

## 5. Progress

- [ ] [core] Stats from sessions: per day, week against week, per project, estimate accuracy,
      personal bests, the forgiving streak ("41 of the last 45"); `stats.json` and `streak.json`
- [ ] [ui] Heatmap of the year (hand-drawn SVG, no chart library)
- [ ] [ui] This week against last week; time per project; estimate accuracy
- [ ] [ui] Day timeline with void and "ran on two devices" marks, void with a tap
- [ ] [ui] End-of-day look back
- [ ] [design-review] Progress at both sizes
- [ ] Gate

## 6. Habits

- [ ] [ui] Habits with weekdays and a count; one-tap check-in; undo
- [ ] [ui] Per-habit heatmap and streak
- [ ] [android] Habit reminder notifications
- [ ] [qa] Two devices check in offline; both kept; the day is done
- [ ] Gate

## 7. Rooms

- [ ] [server] Rooms: create, invite code, join, leave, members; presence from the timer cell and
      socket liveness; today's and this week's totals from sessions; cheers
- [ ] [ui] Room screen: who is focusing, phase and time left, today and week, the shared weekly
      target, cheer with one tap; opt-in ranked view; task titles only when allowed
- [ ] [ui] Settings: what rooms see; hide rooms
- [ ] [qa] Three accounts in three contexts: presence within 1 s, totals right, privacy holds
- [ ] Gate (the user and a friend study together for a session)

## 8. Rewards and words

- [ ] [ui] Milestones with our own named tiers; within-estimate and best-week marks; all switchable
- [ ] [ui] Sounds: a small set, licensed, under 200 KB in total
- [ ] [ui] Settings screen complete: durations, auto-start, sounds, celebrations, ring here
- [ ] [lead] Copy pass over every string against the voice rules in DESIGN.md
- [ ] [design-review] Every screen, empty states included, at both sizes, light and dark
- [ ] Gate

## 9. Live on the S10

- [x] [server] systemd unit, data directory, daily `VACUUM INTO` backup kept for 7 days
- [x] [server] Web Push with VAPID at phase end for laptop browsers
- [ ] [lead] Exposure: Cloudflare named Tunnel on the user's domain (`cloudflared` on the S10
      container, its RSS measured); WebSocket and the 25 s heartbeat tested through it
- [ ] [ui] Export and import as JSON
- [ ] [qa] Measured on the S10: idle RSS, RSS with 20 simulated devices, both under budget
- [ ] Gate (the friend installs it from a link and joins a room)

## 10. Release 1.0

- [ ] [qa] Soak: simulator for an hour against the S10 with random network drops; no divergence
- [ ] [qa] Accessibility: contrast from DESIGN.md, screen reader labels, reduced motion
- [ ] [qa] Budgets: bundle, tap latency on the phone, live timer arrival
- [ ] [lead] README for friends: install the APK, open the web app, join a room
- [ ] [lead] Signed release APK; tag `v1.0.0`
- [ ] Gate

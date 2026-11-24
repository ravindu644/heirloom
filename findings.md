# Findings

Things noticed and parked, one line each, with the section that should pick them up. Delete a line
when it is done.

## From section 0
- [any] The ack's `from` rule is exercised over POST only: over the socket this server always sends other devices' cells before the ack. A server test that orders them the other way would cover it.
- [any] `core/hlc.ts` `stamp()` trusts its caller for a whole-millisecond `now`. A floor inside it would guard the one place stamps are made.
- [9] Signing out offline with nothing unsent forgets the token locally but the server still holds it. Harmless (nobody has it), but it never expires.
- [any] Five wrong sign-ins lock a username for 15 minutes for everyone, the owner included (protocol section 10). Anyone who knows a username can do it. Accepted on an invite-only server among friends.
- [9] The server reads no frames during catch-up, so a pong can be late by the length of a catch-up. Over a slow link with years of cells the device may declare the socket dead and reconnect; it still makes progress each time. Measure on the S10 with a large account.
- [9] argon2id's peak memory (19 MiB a hash) was measured on the laptop only (32 MB RSS during sign-ins). Measure on the S10.
- [8] Lengths under a minute read as zero ("Start 0 min break", "0 minutes today."). The schema allows down to 1 s for tests; the settings screen should offer whole minutes only.
- [9] The service worker makes the page open offline; a web manifest and icons (install as an app) and Web Push come with section 9. They need `manifest-src`, `img-src` in the server's CSP, whose test fails on any change so each gets a reason.
- [9] After a restore every held cell is re-queued; if the server then refuses that push for the device's clock, the restamp gives all of them new stamps from this device, and a stale value could beat another device's newer one. Narrow the restamp to cells this device made (stamp ends in its id).
- [9] Before the tunnel opens the server to the internet: a flood of sign-ins keeps the hashing line of 8 full (real sign-ins wait; signed-in devices are fine), `POST /api/sync` reads up to 1 MB before it can check the token with no cap on how many at once, and nothing caps open connections. A per-client limit behind the tunnel means trusting `CF-Connecting-IP`; decide the caps with the memory measured on the S10.
- [9] `heirloomd -invite` with a wrong `-data` makes a new database and prints a code the running server does not know.
- [2] The session-writing rules need their own fixture (`session.json`). Design worked out by the lead on 2026-11-25:
  - A `rang` row is a pure function of the timer state: `ended = ends_at`, and every cell carries one stamp at `ends_at` (counter 0, the writer's device id), not at the time of writing. Two devices then write the same row, and a later edit (a void from the timeline, a task change) always beats a device that wakes up late and writes the row again.
  - A device writes a `rang` row only if it holds no row for that run, and only if it is in step with the server or it was the last to write the timer cell (the cell's stamp ends in its own device id). An offline device with a stale timer must not record a bell for a lap that was stopped elsewhere.
  - `stopped` and `void` are things the person did: ordinary stamps, `ended` at the moment (or `paused_at` if paused), no row under 60 s of running time. Stop on a lap that is already over writes `rang`.
  - Starting while a run is open closes it first: `rang` if over, else `stopped`. A running interval replaced by a newer incoming timer state closes as `stopped` at that moment.
- [any] A run stopped under 60 s on another device (no row) and replaced there before this device heard of the stop is closed here as `stopped` or `rang`: this device cannot tell it from a run the other device never saw. It shows with the "ran on two devices" mark and can be set aside.
- [2] Auto-start: both devices must write the same next state (same run id, `started` at the previous end), or one of them makes a stray `stopped` row.
- [3] On the phone the bell uses the notification sound, so silent mode and Do Not Disturb silence it (it still vibrates in vibrate mode). The Clock app's timers ring through silent on the alarm stream. The user's call; a channel's sound is frozen once made, so changing it later means a new channel id.
- [3] Nothing in section 3 has run on the phone: wireless adb dropped overnight. The commands are in the android lane's report, copied to `reviews/3/device-run.md`.
- [any] An edit is durable 8 to 19 ms after the tap on this laptop, median 14 (one IndexedDB transaction with strict durability; measured by the e2e run). A page killed inside that window loses that one edit; a browser offers no synchronous way to close it.
- [3] `java` on the PATH is 17; `make apk` must set `JAVA_HOME=$HOME/.jdks/jdk-21` (Capacitor 8 needs 21).
- [4] From the second design pass, none blocking, for the ui lane's next round: on a tablet the lap bar is 8px narrower on Focus than on the result (one measure for both); the race sentence can break inside "last Tuesday" (a no-break space in `pastDay`); two sentences leave one word hanging ("safe on / it.", "A / code works once."); the `unsaved` sign-in error and `status.signOutUnsent` have no picture at 412 and 360; clamp a long task title to one line on a short screen.
- [4] At 360x640 the race panel is cut by the stuck buttons (it fits whole from about 740px tall). If a real phone lands in that band, short screens need their own rule and a fourth size in DESIGN.md.
- [8] "This phone" is chosen by pointer, so a tablet used with a finger is called a phone.
- [4] A task's `notes` field has no screen: PRODUCT section 2 does not list notes, so the design review had it taken out of the sheet. The user's call.
- [4] A project may be tomato (`you`), which is also the colour of every lap. The five project tones are the lead's bridge between PRODUCT ("projects with a colour") and DESIGN ("one hue"); the user may want real hues instead.
- [4] A repeating task's subtasks are not copied to the next one. Habits are the home of daily checklists; revisit if it grates.
- [5] Stats use the viewer's current UTC offset for every day. A country with summer time shifts old laps by an hour across midnight.
- [6] A habit's reminder time has no field.
- [7] Room totals need each member's "today": the server does not know a member's UTC offset yet.
- [9] SQLite creates `heirloom.db` as 0644, and the data directory is 0700 only when heirloomd makes it. Settle with the systemd unit.
- [any] `tools/style-check.mjs` sees `200ms` in text but not `setTimeout(fn, 200)`.
- [any] `tools/budget.mjs` counts every JS chunk as first load. Read Vite's manifest once a lazy chunk exists.

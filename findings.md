# Findings

Things noticed and parked, one line each, with the section that should pick them up. Delete a line
when it is done.

## From section 0
- [1] The drift recovery (offset corrected, clock moved back, unsent cells restamped in order) has no `stamps` case in `merge.json`.
- [1] Scenario to write: a device far behind pushes while it is still catching up. The ack must not move its cursor (protocol section 4), or it skips other devices' cells for good.
- [1] Playwright ignores its webServer's exit code, so a heirloomd killed mid-shutdown prints a line but `make e2e` stays green. Start it from `globalSetup`, or check after the run.
- [1] Chromium's offline emulation may leave an open WebSocket alive. The first sync e2e asserts the socket drops; the fix, if needed, goes in `Device.setOffline` in `tests/e2e/devices.ts`.
- [1] Nothing stops `document` or `Date.now()` in `client/src/core/`: the whole client shares one tsconfig with the DOM lib. A grep in `tools/` or a second tsconfig would enforce it.
- [1] The 27 stats and streak cases stay red until section 5, so `make check` is red in between. Decide: mark those two groups `todo` in the runner, or bring the two functions forward.
- [2] Sign out keeps the account's local database. On a shared laptop it should be deleted (the outbox is empty by then): needs a `destroy` on `Store`.
- [2] A store that refuses a write is retried every 5 s and still pushed, but nothing tells the person. The quiet indicator needs a "could not save on this device" state.
- [2] A socket that opens but never answers the hello has no timeout in `sync/transport.ts`; it sits there neither live nor lost.
- [2] The browser path of the API (the CORS preflight) is only exercised once `main.tsx` starts the engine; cover it in the first timer e2e.
- [9] Signing out offline with nothing unsent forgets the token locally but the server still holds it. Harmless (nobody has it), but it never expires.
- [9] A server restored from a backup has a `head` below a device's cursor. The protocol has no rule; cells the server lost and the device had acked are never sent again. Needs one before backups go live.
- [9] The server reads no frames during catch-up, so a pong can be late by the length of a catch-up. Over a slow link with years of cells the device may declare the socket dead and reconnect; it still makes progress each time. Measure on the S10 with a large account.
- [9] argon2id's peak memory (19 MiB a hash) was measured on the laptop only (32 MB RSS during sign-ins). Measure on the S10.
- [9] `heirloomd -invite` with a wrong `-data` makes a new database and prints a code the running server does not know.
- [2] Does an unfinished set of four carry over to the next day, or does a new day start at lap one? Not pinned.
- [2] The session-writing rules need their own fixture (`session.json`). Design worked out by the lead on 2026-11-25:
  - A `rang` row is a pure function of the timer state: `ended = ends_at`, and every cell carries one stamp at `ends_at` (counter 0, the writer's device id), not at the time of writing. Two devices then write the same row, and a later edit (a void from the timeline, a task change) always beats a device that wakes up late and writes the row again.
  - A device writes a `rang` row only if it holds no row for that run, and only if it is in step with the server or it was the last to write the timer cell (the cell's stamp ends in its own device id). An offline device with a stale timer must not record a bell for a lap that was stopped elsewhere.
  - `stopped` and `void` are things the person did: ordinary stamps, `ended` at the moment (or `paused_at` if paused), no row under 60 s of running time. Stop on a lap that is already over writes `rang`.
  - Starting while a run is open closes it first: `rang` if over, else `stopped`. A running interval replaced by a newer incoming timer state closes as `stopped` at that moment.
- [2] Auto-start: both devices must write the same next state (same run id, `started` at the previous end), or one of them makes a stray `stopped` row.
- [3] `java` on the PATH is 17; `make apk` must set `JAVA_HOME=$HOME/.jdks/jdk-21` (Capacitor 8 needs 21).
- [4] `task.when` ("after dinner") has no field in ARCHITECTURE section 3; `task.repeat` has no shape; DESIGN.md has no colour roles for projects.
- [5] The end-of-day look back's one-line note has nowhere to live.
- [5] Stats use the viewer's current UTC offset for every day. A country with summer time shifts old laps by an hour across midnight.
- [6] A habit's reminder time has no field.
- [7] Room totals need each member's "today": the server does not know a member's UTC offset yet.
- [9] SQLite creates `heirloom.db` as 0644, and the data directory is 0700 only when heirloomd makes it. Settle with the systemd unit.
- [9] If heirloomd ever ignores SIGTERM for 5 s, the e2e run leaves `/tmp/heirloom-e2e-*` behind.
- [any] `tools/style-check.mjs` sees `200ms` in text but not `setTimeout(fn, 200)`.
- [any] `tools/budget.mjs` counts every JS chunk as first load. Read Vite's manifest once a lazy chunk exists.

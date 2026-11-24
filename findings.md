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
- [2] DESIGN.md says the timer is 300px on a laptop, but only `figure-xl` (168px) is a token.
- [2] Does an unfinished set of four carry over to the next day, or does a new day start at lap one? Not pinned.
- [2] The session-writing rules (who writes the row, the 60 s floor, a replaced run closing as `stopped`) need their own fixture.
- [2] Auto-start: both devices must write the same next state (same run id, `started` at the previous end), or one of them makes a stray `stopped` row.
- [3] Capacitor 8 needs JDK 21; the laptop has 17.
- [4] `task.when` ("after dinner") has no field in ARCHITECTURE section 3; `task.repeat` has no shape; DESIGN.md has no colour roles for projects.
- [5] The end-of-day look back's one-line note has nowhere to live.
- [5] Stats use the viewer's current UTC offset for every day. A country with summer time shifts old laps by an hour across midnight.
- [6] A habit's reminder time has no field.
- [7] Room totals need each member's "today": the server does not know a member's UTC offset yet.
- [9] SQLite creates `heirloom.db` as 0644, and the data directory is 0700 only when heirloomd makes it. Settle with the systemd unit.
- [9] If heirloomd ever ignores SIGTERM for 5 s, the e2e run leaves `/tmp/heirloom-e2e-*` behind.
- [any] `tools/style-check.mjs` sees `200ms` in text but not `setTimeout(fn, 200)`.
- [any] `tools/budget.mjs` counts every JS chunk as first load. Read Vite's manifest once a lazy chunk exists.

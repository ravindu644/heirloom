# How products keep devices in step, online and off 🔄

> [!TIP]
> A running timer is stored as a start time and a state, never as a ticking number. Each device
> works out "time left" itself. Changes travel as small messages that carry who wrote them and
> when; a server orders them and sends each device what it missed. When two devices change the
> same field offline, the later change wins and the other is kept in history or dropped. Things
> that only ever get created (a finished pomodoro, a habit check-in) cannot conflict at all if each
> gets its own id. No timer product documents what happens when two offline devices both run the
> timer; we have to decide that ourselves.

Checked 2026-11-24. The decision we made from this is in [../ARCHITECTURE.md](../ARCHITECTURE.md).

## 1. Words used on this page

| Word | Meaning |
|---|---|
| Offline-first | The app reads and writes its own local copy; the server is for sharing, not for permission |
| LWW (last writer wins) | When two writes hit the same field, keep the one with the later stamp |
| Tombstone | A "deleted" flag kept instead of erasing the row, so the delete can sync too |
| HLC (hybrid logical clock) | A timestamp made of wall time plus a counter plus a device id, so every stamp is unique and orders the way time did, even when clocks are a little off |
| Cursor | "Send me everything after number N", so a device catches up on what it missed |
| CRDT | A data type whose copies always merge to the same result without a server |
| Presence | Who is online and what they are doing right now. Short-lived, never stored |

## 2. The timer

- Toggl stores a running entry with a negative duration and no stop time; the old API spelled it
  out as minus the start time in seconds, so elapsed is `now + duration`.
- Pomodoist stores `startedAt`, `pausedAt`, `pausedTotalSeconds` and `plannedSeconds` per interval.
- Clockify refuses to stop a timer when a device clock change put the stop before the start, and
  tells the user to fix the clock.
- Firebase gives each client its offset from server time (`/.info/serverTimeOffset`), good enough
  to catch gaps over a second.
- TickTick has an opt-in "Sync Across Devices" for Focus since July 2023: start, pause and finish on
  one device apply on all.
- Focus To-Do does not show a running timer on other devices (a Play review, 2024-03-15).
- **Not found:** any documented rule, in Toggl, Clockify, TickTick, Session or Forest, for two
  offline devices that both start or stop the timer and then reconnect.

## 3. The three ways to sync

| Model | Who uses it | How "last" is decided | Cost |
|---|---|---|---|
| Server log, clients replay their pending changes on top | Replicache, Linear (third-party writeup), PowerSync, Todoist | Order of arrival at the server | Server runs the change logic; clients need a rebase step |
| Per-field LWW with HLC stamps, server is a relay | Actual Budget | The stamp, so the edit made later wins even if it arrives first | Small. History grows unless compacted |
| Full CRDT documents | Automerge, Yjs | Operation ids | Change history grows; "easy to implement badly" (Kleppmann, 2020) |

Details worth copying:

- **Todoist:** every command carries a client UUID and the server never runs the same UUID twice,
  so retries are safe. Things created offline get a temporary id that the server maps.
- **Actual Budget:** a change is `(timestamp, dataset, row, column, value)`. It is applied only if
  no later stamp exists for that cell. The server stores and forwards. Clocks may drift 5 minutes;
  the server rejects stamps further in the future because "later messages break sync on other
  devices".
- **Figma:** a client ignores incoming server values that clash with its own unconfirmed edits, so
  nothing flickers. Ids are made on the client. List order is a fractional index, stored together
  with the parent as one field.
- **Automerge:** concurrent increments need a counter type; a plain number loses one of two +1s.
- **Jepsen (Kingsbury, 2013):** with wall-clock LWW, a device whose clock runs ahead silently wins
  over later real edits, for as long as its clock is ahead.

## 4. Deletes and keeping history

- Actual marks deletes with a tombstone column. Todoist and Toggl send deletes as flags.
- Ink & Switch: concurrent edits to the same field were rare in practice; default merge rules were
  enough. Dropbox makes "conflicted copies", Evernote a "conflicting changes" notebook.
- Something created once with its own id has nothing to collide with. A pomodoro recorded offline
  as its own record cannot be lost to a conflict.

## 5. Getting changes to other devices

- Figma and Linear: WebSocket. Replicache: a contentless "poke" over SSE or WebSocket that says
  "pull now". Electric: long-poll or SSE (SSE breaks behind buffering proxies). Actual and Todoist:
  HTTP POST with a cursor.
- Yjs presence drops a peer after 30 s without a renewal; each client renews every 15 s.
- Cloudflare closes idle WebSockets and restarts servers; clients need a heartbeat (see
  [stack.md](stack.md)).

## 6. How small can the server be

- Actual Budget's own docs say to leave a PikaPods instance "at their lowest setting", about $1.50
  a month. A third-party guide reports under 100 MB idle. No official number.
- Rocicorp Zero's minimal example sizes its sync service at 2 GB plus Postgres. Too big for us.

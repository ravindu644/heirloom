# Protocol

The wire format and the rules both sides must agree on. `server/` (Go) and `client/src/core/` (TS)
are written from this page and proved by the fixtures in `fixtures/`, which run in both. Changing
anything here follows the `sync-change` skill: this page and the fixtures first, then the code.

## 1. Cells

A cell is one field of one row:

```json
{ "stamp": "2026-11-24T04:30:00.000Z-0000-a1b2c3d4e5f60718",
  "dataset": "task", "row": "task-pointers", "field": "title", "value": "Pointers chapter 3" }
```

- `dataset`, `row`, `field`: 1 to 64 characters of `A-Z a-z 0-9 _ -`.
- `value`: any JSON value, `null` included. One cell is at most 16 KB as JSON.
- Row ids are made on the device (`crypto.randomUUID()` is fine). `timer` and `settings` have one
  row, `current`. A `session` row's id is the timer's run id.
- The datasets and their fields are in `schemas/`, one file each. The schemas describe what this
  build writes. They are not a filter: a cell for a dataset or a field this build does not know is
  stored, merged and passed on like any other, so a newer device's data survives an older one.

## 2. Stamps and the clock

```
2026-11-24T04:30:00.000Z-0000-a1b2c3d4e5f60718
└ time, UTC, to the ms ─┘ └┬─┘ └ device id ───┘
                        counter
```

Time as `Date.toISOString()` writes it (24 characters), a counter of 4 lowercase hex digits, and
the device id: 16 lowercase hex digits, random, made once per install. Stamps are compared as plain
strings, so time decides, then the counter, then the device id.

A device's clock is two numbers, `ms` and `counter`, both 0 at first: the highest stamp it has made
or seen.

- **To stamp an edit** at wall time `now` (`Date.now()` plus the measured offset to server time,
  rounded to a whole millisecond: the offset is a fraction, the stamp's text is not, and a clock
  holding `311.4` would rank itself above a stamp at `311` with a higher counter):
  if `now > ms`, the clock becomes `(now, 0)`; otherwise `(ms, counter + 1)`. A counter past `ffff`
  becomes `(ms + 1, 0)`. The stamp is the clock plus the device id.
- **On seeing a stamp** from anywhere: if its `(ms, counter)` is higher than the clock, the clock
  becomes it. So the next edit is later than everything this device has seen.
- **Drift:** the server refuses a push that holds a stamp whose time is more than 300000 ms past
  server time. Nothing from that batch is stored. The device sets its offset from the `nack`, then
  starts its clock again from zero, shows it the stamp of every cell it holds that is not waiting
  in the outbox, and gives every unsent cell a new stamp at the corrected time, in the order they
  were made. Each new cell replaces the old one in the device's own store (the old stamp is higher,
  so this is a replacement, not a merge), and the outbox is pushed again.

Fixture: `merge.json`, `stamps` and `drift`.

## 3. Merge

For each `(dataset, row, field)` keep the cell with the highest stamp. That is the whole rule, on
the device (`core/merge.ts`) and on the server (`server/sync/`), and it gives the same result in
any order of arrival. Equal stamps are the same cell.

What follows from it, each with a case in `merge.json`, `merge`:

- Two devices edit different fields of a row: both edits stay.
- `deleted` is a field. A delete and an edit of another field both stay; restore writes `null`.
- The timer's `state` is one value, so it is never half of each device's.
- A check-in is its own row, so two devices checking in make two rows.
- Two devices that saw the same lap end write the same session row; it stays one row.

An edit the device has not sent yet is an ordinary cell in its store. An incoming cell beats it
only with a higher stamp, which means another device really did write later; then the server will
keep that one too, and the unsent edit is dropped from the outbox. Nothing flickers, because an
edit made after seeing a value is always stamped later than it (section 2).

## 4. Messages

One WebSocket per device at `GET /api/ws`. Every frame is one JSON object with a `type`.
Times are ms since the epoch.

| Dir | Message | Meaning |
|---|---|---|
| device to server | `{"type":"hello","token":"...","device":"a1b2c3d4e5f60718","cursor":1042,"client_time":1795494600000}` | First frame. `cursor` is the last sequence number this device has applied, 0 on a fresh install. `token` is the device's token from login (pinned in roadmap section 1). |
| server to device | `{"type":"welcome","server_time":1795494600150,"head":1049}` | `head` is the account's newest sequence number. |
| server to device | `{"type":"cells","from":1042,"to":1049,"cells":[...]}` | Cells with sequence numbers after `from` up to `to`, oldest first, at most 500 a frame. After `welcome` the server sends these until the device has everything, then the same message carries other devices' pushes live. |
| device to server | `{"type":"push","batch":"k3v9","cells":[...]}` | At most 500 cells. `batch` is any id the device picks. Sending a batch twice is harmless: a cell is its stamp. |
| server to device | `{"type":"ack","batch":"k3v9","from":1049,"cursor":1054}` | Every cell is stored or was already beaten by a newer one. `from` is the newest sequence number before this batch and `cursor` the newest after it: the numbers between them are this batch's own cells. |
| server to device | `{"type":"nack","batch":"k3v9","reason":"clock","server_time":1795494600150}` | Nothing was stored. See Drift. |
| server to device | `{"type":"room","room":"...","members":[...]}` | Presence and totals. The member shape is pinned in roadmap section 7. |
| server to device | `{"type":"bye","reason":"token"}` | Sent just before the server closes the socket for good. `token`: the token is unknown or signed out; the device stops reconnecting, keeps its data and its outbox, and asks the person to sign in. `protocol`: the first frame was not a valid `hello`, or a frame broke a limit. |
| both ways | `{"type":"ping","t":1795494625000}` answered by `{"type":"pong","t":1795494625000,"server_time":1795494625140}` | Every 25 s from the device, so the tunnel keeps the socket open. `t` is echoed. The device's offset is `server_time - (sent + received) / 2`, smoothed. |

Rules:

- The server gives every cell it accepts as the newest for its field the next sequence number, and
  keeps only that newest cell. A cell that loses to a stored one gets no number and is not sent on.
- The server sends on one connection in sequence order. The device moves its cursor to a `cells`
  frame's `to`, never backwards, and stores it with the cells it applied.
- An ack moves the cursor to its `cursor` only when the device's cursor equals the ack's `from`:
  then the numbers it steps over are its own cells and nothing else. Any other ack leaves the
  cursor alone. A device still catching up would otherwise jump past cells it was never sent.
- A `cells` frame whose `from` is past the device's cursor means something was missed: the device
  closes the socket and says hello again.
- A device does not get its own push back live. It may see those cells again after a reconnect;
  applying them changes nothing.
- An unknown `type` is ignored, by both sides.
- Limits the server enforces: a frame of at most 1 MB, 500 cells a push, 16 KB a cell (bytes of
  its JSON), names as in section 1, a stamp of exactly the shape in section 2, exactly the five
  keys of a cell, valid UTF-8. A push that breaks one is answered with `nack`, reason `invalid`,
  and nothing stored. A device that gets one sends that batch again a cell at a time to find the
  cell, and sets it aside without dropping it.
- The server reads a device's frames only once that device has caught up. A push or a ping sent
  earlier waits in the socket, so a device never gets its own push back and every ack starts at
  the number the device has reached. A device does not push before it has caught up either.
- A `hello` or a POST with a cursor past the server's head (the server was restored from an older
  copy) is answered from 0: the device is sent everything.
- A page of `cells` also stops near 1 MB, whatever the count.

## 5. Without a socket

`POST /api/sync` carries the same exchange when a proxy will not let a WebSocket through:

```json
{ "token": "...", "device": "a1b2c3d4e5f60718", "cursor": 1042, "client_time": 1795494600000,
  "push": { "batch": "k3v9", "cells": [] } }
```

`push` may be left out. A bad token is answered with 401 `token` (section 10). The reply:

```json
{ "server_time": 1795494600150, "head": 1054, "from": 1042, "to": 1054, "cells": [],
  "ack": { "batch": "k3v9", "from": 1049, "cursor": 1054 } }
```

`ack` or `nack` is there when a push was sent, and the cursor rules are the same as on a socket.
One page of cells a reply; the device asks again until `to` equals `head`, then every few seconds.

## 6. The timer

The timer cell's `state` (`schemas/timer.schema.json`) is written only when the user does
something. Nothing writes it when a phase ends: the phone rings from a native alarm with the app
asleep, so nobody is there to write. Everything on screen is worked out from the state and `now`
(server time):

| Value | Rule |
|---|---|
| `ends_at` | `started + paused_ms + planned_ms` while running; `null` when paused or idle |
| `left_ms` | `planned_ms - (now - started - paused_ms)`, with `paused_at` in place of `now` while paused; never under 0; 0 when idle |
| `over` | running and `now >= ends_at`. A paused lap never rings |
| `paused` | `paused_at` is not `null` |
| `next` | what a tap on start begins. Idle: work at `set_index`. Work: `short`, or `long` when `set_index` is 3, same index. Short: work at `set_index + 1`, wrapping to 0 after 3. Long: work at 0 |

Actions, each a pure function of the state, the action and `now`:

| Action | New state |
|---|---|
| `start` (`phase`, `run`, `task`, `planned_ms`, and `new_set` when wanted) | That phase, `started = now`, no pause. With `new_set: true` a lap is lap one (index 0), whatever came before: a device asks for it when the last run belongs to an earlier local day (the day of its bell if it rang, else of the timer cell's stamp), so yesterday's half set does not decide today's long break. A break keeps the `set_index`. A lap takes the index of the next lap: the idle state's own; one more (wrapping after 3) when the state is a lap that is over or a short break; 0 after a long break; the same when it restarts a lap that is not over |
| `pause` | `paused_at = now`. Nothing when idle, paused or over |
| `resume` | `paused_ms += now - paused_at`, `paused_at = null`. Nothing unless paused |
| `extend` (`ms`) | `planned_ms += ms`. Nothing when idle. After the bell it reopens the lap |
| `stop` | Idle, every other field as the schema's idle state, `set_index` the next lap's index by the same rule as `start` |

Setting a lap aside (void) changes the timer exactly as `stop` does; the difference is the
session's outcome. The session row is written by whoever sees the run end or ends it. Those rules
get their own fixture in roadmap section 2.

Fixture: `timer.json`.

## 7. Stats

From `session` rows and the viewer's offset from UTC in minutes.

- A session counts when `kind` is `work` and `outcome` is `rang` or `stopped`. `void` and breaks
  count nowhere.
- Its counted interval is `[started + paused_ms, ended]`. Its day is the local day of `started`.
- A day's `focus_ms` is the length of the union of its counted intervals, so minutes that ran on
  two devices at once count once. Its `laps` is the number of `rang` sessions.
- `overlaps` lists each pair of counted sessions from different devices whose intervals share more
  than an instant: the "ran on two devices" mark. Each pair is sorted by id, and so is the list.
- A day with nothing counted is not in `days`.
- An interval that would end before it begins counts as 0. Two overlapping laps that started on
  different local days each count in their own day; the mark still shows the pair.

**The race.** Every screen answers "how am I doing against my usual day", so there is one more
function: from the sessions, the timer state, `now` and the offset.

- `you_ms`: today's focus up to `now`, plus the lap in progress: a work run with no session row
  yet counts its running time so far (to the pause if paused, to the planned end if the bell has
  gone). A break in progress adds nothing.
- The ghost is a past day: the same weekday last week if it has any counted focus, else the latest
  day before today that has, else there is none (`ghost` and `split_ms` are `null`).
- `ghost.ms` is that day's focus up to the same time of day as `now`; `ghost.total_ms` is its
  whole day. `split_ms` is `you_ms - ghost.ms`: under 0 is behind.

Fixture: `stats.json`, `cases` for the totals and `race` for the race. Roadmap section 5 adds
weeks, projects, estimates and bests to it.

## 8. The streak

One function serves the focus streak and every habit. In: `today`, the days that were kept (a day
with at least one `rang` lap; for a habit, a day whose live check-ins reach its target), a weekday
mask (bit 0 Monday to bit 6 Sunday, all seven when left out) and a `window` in days.

- Only days in the mask exist. A kept day outside it is ignored.
- The record runs from the first kept day to today, or to yesterday while today is not kept yet:
  a day that is not over is not empty.
- In each Monday to Sunday week the first two empty days are rest days. A third is a miss.
- `streak` is the kept days since the last miss. Rest days do not add to it and do not end it.
- `rest` is every rest day in the record, oldest first.
- `kept` of `of`: the last `window` calendar days of the record, and in them the days in the mask
  (`of`) and how many of those were kept. This is the "41 of the last 45 days" a screen shows
  after a miss.
- No kept day in the mask: everything is 0 and `rest` is empty.

Fixture: `streak.json`.

## 9. Reading the fixtures

| File | A runner does |
|---|---|
| `merge.json` `stamps` (devices only; the server never stamps) | Makes a clock for `device`. A step with `now` stamps an edit and must get `stamp`; a step with `see` shows the clock that stamp |
| `merge.json` `merge` | Applies `cells` to an empty store, in the given order and in reverse (every order when there are six or fewer), and must end with exactly the cells in `expect` |
| `merge.json` `drift` | Asks whether `stamp` is acceptable at `server_time` and must get `accept` |
| `timer.json` | Starts each case from `from`, or idle at index 0. A step with `do` applies that action at `at`; a step with `expect` compares only the keys it lists. A key is a field of the state, one of section 6's worked-out values, or `state` for the whole state |
| `stats.json` `cases` | Computes from `sessions` and `utc_offset_min` and must equal `expect` |
| `stats.json` `race` | Computes from `sessions`, `state` (the timer), `now` and `utc_offset_min` and must equal `expect` |
| `streak.json` | Computes from `today`, `kept`, `days_mask` and `window` and must equal `expect` |

`tools/contracts-check.mjs` checks every cell, session and timer state in these files against the
schemas. A fixture lists under `unknown` the fields it uses on purpose that no schema has.

## 10. Accounts

Plain HTTP with JSON bodies, beside the socket. Registration is by invite only. There are no
cookies: the token travels in the body or the `hello`, so nothing rides along with a request by
itself. That is why every `/api/` route, the socket included, answers any origin (the phone app's
WebView is a different origin from the server) and answers the browser's `OPTIONS` preflight.

| Request | Body | 200 reply |
|---|---|---|
| `POST /api/register` | `{"invite":"...","username":"ravi","password":"...","device":"a1b2c3d4e5f60718"}` | `{"token":"...","account":"...","username":"ravi"}` |
| `POST /api/login` | `{"username":"ravi","password":"...","device":"a1b2c3d4e5f60718"}` | the same |
| `POST /api/logout` | `{"token":"..."}` | `{}`. The token stops working at once, on an open socket too |

- An invite is made on the server by its owner: `heirloomd -data <dir> -invite` prints one code and
  exits. It works while the server is running. A code registers one account, once.
- `username`: 3 to 32 of `a-z 0-9 _`. The server lowercases it. `password`: 8 to 256 characters,
  hashed with argon2id.
- `token`: an opaque string for this device, stored hashed. It works only with the device id it
  was made for. Signing in again from the same device id replaces that device's old token and
  cuts its open socket with `bye`, reason `token`. `account` is an opaque id; a device keeps each account's
  data in its own local database, named by it.
- Every error is a status and `{"error":"<code>"}`:

| Status | Code | When |
|---|---|---|
| 400 | `bad_request` | A field is missing or breaks a rule above |
| 403 | `invite` | The invite is unknown or used |
| 409 | `taken` | The username exists |
| 401 | `credentials` | Wrong username or password; the reply does not say which |
| 429 | `slow_down` | After 5 failed sign-ins for a username inside 15 minutes, every sign-in for it until the 15 minutes pass, right password or not. `Retry-After` carries the seconds |
| 401 | `token` | `logout` or `/api/sync` with a token that is unknown or signed out |
| 500 | `server` | The server's own fault. Nothing was stored; the device tries again |

A device signs out only after its outbox is empty, and refuses, with the reason, while it is
offline with unsent work. Otherwise signing out would be a way to lose a lap.

## 11. Sessions

A run of the timer becomes a `session` row (id: the run id) when it ends. How it ended decides the
row, and who may write it.

**Closing a run.** From the timer state, when the timer cell was last written (the time in its
stamp), what ended it, `now`, the writer's device id, and whether a rang row for this run is
already held:

| What ended it | Row |
|---|---|
| The bell (the run is over) | `outcome: rang`, `ended` the planned end (`ends_at`). Every cell of the row is stamped at the time the timer cell was last written, counter 0, with the writer's device id, not at the time of writing |
| Stop, before the bell | `outcome: stopped`, `ended` now, or the moment the pause began if it is paused |
| Set aside (void), before or after the bell | `outcome: void`, `ended` as above, or the planned end if the bell has gone |
| Replaced: a newer timer state for another run arrives while this device's run is open | As stop |
| Stop or replaced, after the bell | It rang: the row of the first line |
| Stop or replaced, on a run that rang once and was then extended | Still `rang`: a lap that reached its bell stays a lap. `ended` as for stop, an ordinary stamp |

A run that holds a rang row counts as over for the set of four as well: after it, the next lap is
the next lap of the set, extended or not.

- `kind`, `task`, `started`, `planned_ms` and `paused_ms` are the state's; `device` is the writer.
- A run that did not reach the bell and had under 60000 ms of running time (`ended - started -
  paused_ms`) leaves no row. A run that rang always leaves one, however short.
- Stopped and void rows are things a person did, so their cells take ordinary stamps from the clock.
- Starting a run while another is open closes the open one first, as stop.

Why a rang row is stamped when the timer cell was written, and not when the row is: it is the
same row whoever writes it and whenever. The laptop may write it at the bell while the phone,
asleep, writes it an hour later; with one stamp the two are one row. And everything a person did
to that run afterwards is newer than it: a stop on another device ten minutes in, a lap set
aside from the timeline, a task changed. A phone that slept through a stop cannot bring the lap
back as rung. An extension rewrites the timer cell, so the second bell's row is newer than the
first.

**Who writes the bell.** A device that sees a run over writes the rang row only when it holds no
row for that run that ends at or after this bell, and either it is in step with the server (caught up, connected) or it was the
last to write the timer cell (the cell's stamp ends in its own device id). A device that is
offline with another device's timer waits: that lap may have been stopped where it was running.

Fixture: `session.json`. `close` cases call the closing rule with `state`, `end` (`bell`, `stop`,
`void`, `replaced`), `now`, `device`, `written` (the time in the timer cell's stamp) and `rang`
(true when a rang row is already held), and expect `null` or the row, its `id`, and `stamp_at`
(`written` for a bell's row, or `null` for an ordinary stamp). `bell` cases ask whether to write, from the
timer cell's stamp, the device, `in_step` and `has_row`.

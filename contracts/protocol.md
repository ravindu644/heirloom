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

- **To stamp an edit** at wall time `now` (`Date.now()` plus the measured offset to server time):
  if `now > ms`, the clock becomes `(now, 0)`; otherwise `(ms, counter + 1)`. A counter past `ffff`
  becomes `(ms + 1, 0)`. The stamp is the clock plus the device id.
- **On seeing a stamp** from anywhere: if its `(ms, counter)` is higher than the clock, the clock
  becomes it. So the next edit is later than everything this device has seen.
- **Drift:** the server refuses a push that holds a stamp whose time is more than 300000 ms past
  server time. Nothing from that batch is stored. The device sets its offset from the `nack`, moves
  its clock back to the corrected time, gives every unsent cell a new stamp in the order they were
  made, and pushes again.

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

## 5. Without a socket

`POST /api/sync` carries the same exchange when a proxy will not let a WebSocket through:

```json
{ "token": "...", "device": "a1b2c3d4e5f60718", "cursor": 1042, "client_time": 1795494600000,
  "push": { "batch": "k3v9", "cells": [] } }
```

`push` may be left out. The reply:

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
| `start` (`phase`, `run`, `task`, `planned_ms`) | That phase, `started = now`, no pause. A break keeps the `set_index`. A lap takes the index of the next lap: the idle state's own; one more (wrapping after 3) when the state is a lap that is over or a short break; 0 after a long break; the same when it restarts a lap that is not over |
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

Fixture: `stats.json`. Roadmap section 5 adds weeks, projects, estimates and bests to it.

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
| `merge.json` `stamps` | Makes a clock for `device`. A step with `now` stamps an edit and must get `stamp`; a step with `see` shows the clock that stamp |
| `merge.json` `merge` | Applies `cells` to an empty store, in the given order and in reverse (every order when there are six or fewer), and must end with exactly the cells in `expect` |
| `merge.json` `drift` | Asks whether `stamp` is acceptable at `server_time` and must get `accept` |
| `timer.json` | Starts each case from `from`, or idle at index 0. A step with `do` applies that action at `at`; a step with `expect` compares only the keys it lists. A key is a field of the state, one of section 6's worked-out values, or `state` for the whole state |
| `stats.json` | Computes from `sessions` and `utc_offset_min` and must equal `expect` |
| `streak.json` | Computes from `today`, `kept`, `days_mask` and `window` and must equal `expect` |

`tools/contracts-check.mjs` checks every cell, session and timer state in these files against the
schemas. A fixture lists under `unknown` the fields it uses on purpose that no schema has.

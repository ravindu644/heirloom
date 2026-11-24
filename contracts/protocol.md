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
| device to server | `{"type":"hello","token":"...","device":"a1b2c3d4e5f60718","cursor":1042,"client_time":1795494600000,"utc_offset_min":330}` | First frame. `utc_offset_min` is the device's offset from UTC, east positive; the server keeps the latest one per account to know that person's "today" for rooms. A device that does not send it changes nothing: the last one known stands, and before any is known it is 0. `cursor` is the last sequence number this device has applied, 0 on a fresh install. `token` is the device's token from login (pinned in roadmap section 1). |
| server to device | `{"type":"welcome","server_time":1795494600150,"head":1049,"rooms":["r_8f3a"]}` | `head` is the account's newest sequence number. `rooms` is the ids of every room the account is in, so a device that was away when its account left a room drops it now (section 15). |
| server to device | `{"type":"cells","from":1042,"to":1049,"cells":[...]}` | Cells with sequence numbers after `from` up to `to`, oldest first, at most 500 a frame. After `welcome` the server sends these until the device has everything, then the same message carries other devices' pushes live. |
| device to server | `{"type":"push","batch":"k3v9","cells":[...]}` | At most 500 cells. `batch` is any id the device picks. Sending a batch twice is harmless: a cell is its stamp. |
| server to device | `{"type":"ack","batch":"k3v9","from":1049,"cursor":1054}` | Every cell is stored or was already beaten by a newer one. `from` is the newest sequence number before this batch and `cursor` the newest after it: the numbers between them are this batch's own cells. |
| server to device | `{"type":"nack","batch":"k3v9","reason":"clock","server_time":1795494600150}` | Nothing was stored. See Drift. |
| server to device | `{"type":"room", ...}` | One room the account is in, whole: section 15. Sent for each room after `welcome`, and again whenever anything in it changes. |
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
  copy) is answered from 0: the device is sent everything. A device that sees a `head` below its
  own cursor sets its cursor to 0 and puts every cell it holds back in its outbox, because the
  server may have lost any of them. Pushing a cell the server already has changes nothing.
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
| `extend` (`ms`) | `planned_ms += ms`. Nothing when idle. After the bell it reopens the lap if the new end is still ahead of `now`; if not, nothing: minutes nobody worked are not added |
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
| 429 | `slow_down` | After 5 failed sign-ins for a username inside 15 minutes, every sign-in for it until the 15 minutes pass, right password or not. Also when the server has a line of sign-ins waiting (it checks one password at a time): then nothing was wrong and the wait is a second. `Retry-After` carries the seconds, and tells the two apart |
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
row for that run that ends at or after this bell and was written no earlier than the timer
cell that shows the run (a row from before an undo or an extension tells an older story), and either it is in step with the server (caught up, connected) or it was the
last to write the timer cell (the cell's stamp ends in its own device id). A device that is
offline with another device's timer waits: that lap may have been stopped where it was running.

Fixture: `session.json`. `close` cases call the closing rule with `state`, `end` (`bell`, `stop`,
`void`, `replaced`), `now`, `device`, `written` (the time in the timer cell's stamp) and `rang`
(true when a rang row is already held), and expect `null` or the row, its `id`, and `stamp_at`
(`written` for a bell's row, or `null` for an ordinary stamp). `bell` cases ask whether to write, from the
timer cell's stamp, the device, `in_step` and `has_row`.

## 12. Today

The rules behind the Today screen. They are worked out on the device from `task`, `project`,
`session` and `settings` rows; the server knows none of them.

**Quick add.** One line of text makes one task. If the trimmed text ends in a space, `~` and a
number from 1 to 99, that number is the estimate in laps and the rest, trimmed, is the title.
Anything else is all title. An empty title adds nothing.

**Repeat.** `repeat` is `null`, `{"every":"day"}`, or `{"every":"week","days":<mask>}` (bit 0
Monday to bit 6 Sunday; a weekly task is a mask of one day). The day after a given day is the
first day strictly later that the rule allows.

**The next one.** Marking a repeating task done makes the next task of the series, a row of its
own, so each day's laps stay with that day's task:

- its `due` is the day after the later of today and the done task's own `due` (days missed are
  not owed);
- its id is the series id, `-`, and that day as eight digits: `task-read-20261125`. The series id
  is the done task's id without such an ending. Two devices that mark the same task done offline
  therefore make the same row;
- it copies `project`, `title`, `notes`, `estimate`, `repeat`, `when` and `order`. Subtasks are
  not copied.

Marking it not done again sets `deleted` on that next row; done again clears it.

**Order.** `order` is a fractional index: 1 to 64 characters of `0-9 A-Z a-z`, compared as a plain
string, never ending in `0`. Moving a row writes one new key between its new neighbours. Rows sort
by `order`, then by row id, so two devices that picked the same key still agree.

**What is on Today**, for the local day:

| List | Rows |
|---|---|
| Today | not done, not deleted, no `parent`, and `due` is unset or today or earlier. By order. A task is "running" while the timer is on a lap for it that has not rung (counting or paused). The first that is not running is "next": so when a lap on the top task rings, that task is next again, and the plan's order decides what a new lap is for |
| Upcoming | the same, with `due` after today. By `due`, then order |
| Done | `done` falls on today. By when it was done |
| Recently deleted | `deleted` in the last 30 days. Newest first |

A subtask shows inside its parent only.

**Laps on a task.** From the work sessions of that task, oldest first: a `rang` session is one lap
and one whole square; a `stopped` one is a part square, its running time over its planned length;
a `void` one is nothing. The lap in progress on the task adds a part square that fills as it runs,
unless its row is already there; once its bell has gone it is a lap and a whole square, row or no
row, so the count never trails the day's. "2 of 4" counts laps; the squares may pass the estimate.

**Planned, left.** Over the Today list: the sum of each task's estimate minus its laps, never
under 0 for a task. A task without an estimate adds nothing.

Fixture: `today.json`. `quick_add`: text in, title and estimate out, or `null`. `repeat`: the
rule and a day in, the next day out. `next`: a done task's id, `due`, today and rule in, the next
row's id and `due` out. `order`: property checks, described in the file. `squares`: sessions, the
timer state, `now` and a task in, `laps` and `squares` out.

## 13. Progress

The rules behind the Progress screen. All of it is worked out on the device from `session`, `task`,
`project` and `day` rows, with the same counting as section 7: a session counts when it is work
and not `void`, on the local day it started, and minutes two devices ran at once count once.

**This week against last week.** Weeks run Monday to Sunday. For each day of this week up to
today, the running total of focus; today's includes the lap in progress, as the race does. For
each day of last week, the same. The ghost's figure "by now" is last week's total up to the same
weekday and time of day. The split is this week's total less that.

**The year.** One cell per local day from the first day with a counted session to today. A cell's
level comes from the laps that rang that day: 0 none, 1 for 1 to 3, 2 for 4 to 6, 3 for 7 or 8, 4
for 9 or more. A day with counted minutes and no lap is level 1. A rest day (section 8) carries
the rest mark.

**Since the first lap.** Total focus and laps; the days kept (at least one lap that rang) of the
days so far, counted as the streak counts them: to today if today is kept, else to yesterday.
The steadiest weekday is the one with the highest share of kept days among those it has had, if
it has had at least three; ties go to the one kept more often, then to the earlier weekday.

**Bests.** The day with the most focus, and the Monday to Sunday week with the most; the earlier
one wins a tie. Today and this week may be the best.

**By project.** Over today and the six days before: for each project, the focus of the counted
sessions whose task is in it, and their laps; and the same sum over the seven days before those,
for comparison. A session with no task, or a task with no project, is under no project. Projects
with nothing in either window are left out. Most time first.

Each listed project also carries its focus of all time: for each of its tasks, the focus of every
counted session there is, counted as a day is (per local day the union of that task's intervals),
and the tasks added up, the lap in progress included. Two devices at once on one task count
once; on two tasks of one project they count for each task.

**Estimates.** Over tasks done in the last 28 days that have an estimate and are not deleted: the
laps run over the laps guessed, as one ratio (1.3 means a task takes 1.3 laps for each one
guessed), and the eight done most recently with their two numbers. No such task, no ratio.

And over time: the same ratio for each of the last eight Monday to Sunday weeks, oldest first,
this week last, over the tasks whose `done` time falls in the week by local day. A week with no
such task has no ratio.

**A day's timeline.** Every session that started on the day, breaks and set-aside laps included,
oldest first, each with its kind, times, outcome, task, and whether it is one of a pair that ran
on two devices at once (the `overlaps` of section 7).

**Setting a lap aside from the timeline** writes `outcome: void` on its row. Counting it again
writes back what it was, which the row itself says: `rang` if it ran its whole plan
(`ended - started - paused_ms >= planned_ms`), `stopped` if not.

**The look back.** For today: the focus and laps, the tasks done today, and the day's note. The
note is the `note` field of the `day` row whose id is the local day. Writing an empty note writes
an empty string.

These are checked by the core lane's own tests; `stats.json` and `streak.json` hold the parts the
server will share for rooms.

## 14. Habits

Worked out on the device from `habit` and `checkin` rows.

- A habit is planned on the weekdays in `days` (bit 0 Monday to bit 6 Sunday) and is done for a
  day when that day's live check-ins reach `target`. A check-in is live while its `deleted` is unset.
- **Checking in** makes one `checkin` row: `habit`, `day` (the local day of the tap) and `at`,
  written together. It never changes a number. Two devices checking in offline make two rows.
- **Undo** sets `deleted` on the latest live check-in of that habit for today. It never removes a
  row and never touches another day.
- A check-in on a day the habit is not planned for is kept and shown on that day, and counts for
  nothing else.
- **The streak** is section 8's function with the habit's `days` as the mask and its done days as
  the kept days, over the same 45 day window as the focus streak. The target used is today's, for
  every past day.
- **This week against last:** the check-ins of all habits (not archived, not deleted) from Monday
  to now, and last week's from its Monday to the same weekday and time.
- `remind` is a local time of day, `07:30`. The reminder is for the days the habit is planned and
  is not shown on a day the habit is already done. It is a device's own notification; nothing is
  sent by the server.
- Order, delete and restore work as for tasks (section 12): `order` is a fractional index,
  `deleted` a time, restorable for 30 days. `archived` takes a habit off the list and keeps its
  record.

These are checked by the core lane's own tests; `streak.json` holds the streak rule.

## 15. Rooms

A room is a few friends who see each other focusing. Rooms are not cells: they are tables the
server owns, changed by requests that need a connection, because a room belongs to several
accounts and has nothing to merge.

**Requests.** `POST`, JSON, `token` and `device` in every body as for `/api/sync`, the same
errors as section 10, and these of their own:

| Request | Body (beside `token`, `device`) | 200 reply |
|---|---|---|
| `/api/rooms/create` | `name` (1 to 40 characters) | `{"room":"<id>"}` |
| `/api/rooms/join` | `code` | `{"room":"<id>"}`. Joining a room one is in already is the same answer |
| `/api/rooms/leave` | `room` | `{}`. The last member leaving ends the room |
| `/api/rooms/update` | `room`, and any of `name`, `target_ms` (0 for none), `ranked` | `{}`. Any member may |
| `/api/rooms/cheer` | `room`, `to` (a member's id), `run` (a session row id of theirs) | `{}`. Once per person per run; a second is the same answer |

| Status | Code | When |
|---|---|---|
| 404 | `room` | No such room, or the account is not in it |
| 404 | `code` | No room has this code |
| 409 | `full` | The room has 8 members, or the account is in 5 rooms |
| 404 | `run` | `to` is not a member, or has no such session that rang |
| 429 | `slow_down` | Ten wrong codes from one account inside an hour: every join by it, the right code included, until the hour is up. `Retry-After` carries the seconds |

A room's `code` is 8 characters of `A-Z 2-9` without the look-alikes (`I`, `O`, `0`, `1`), made
by the server. Whoever has it can join; any member can read it.

**The room message.** After `welcome`, and whenever anything below changes, the server sends each
connected device one message per room its account is in. A device that has left a room, or been
alone in one that ended, gets the message once more with `"gone": true` and nothing else.
`POST /api/sync` replies carry the same objects under `rooms`, and that array is the whole set.
A device drops any room it holds that a `welcome`'s `rooms` or a POST reply's `rooms` does not
name: it was not there to hear `gone`.

```json
{ "type": "room", "room": "r_8f3a", "name": "Sachi and me", "code": "K7QW3RXM",
  "target_ms": 36000000, "ranked": false, "server_time": 1795494600150,
  "members": [
    { "id": "a_19c2", "name": "sachi", "you": false, "away": false,
      "phase": "work", "set_index": 1, "ends_at": 1795495265000, "paused": false,
      "task": "Thinking in React, steps 1 to 3",
      "today_ms": 4500000, "today_laps": 3, "week_ms": 21600000,
      "last": { "run": "run-7f3a", "ended": 1795493100000, "cheers": ["a_02b7"] } } ] }
```

- `members` are in the order they joined. `id` is the account's opaque id, `name` its username,
  `you` marks the account this message is for.
- `phase`, `set_index`, `ends_at` and `paused` come from the member's timer cell, read at
  `server_time`: a run whose bell has gone, or no timer, is `phase: "idle"` with `ends_at: null`.
  A paused run has `paused: true` and `ends_at: null`. A member is focusing whether or not any
  device of theirs is connected: a phone in a pocket still has its alarm set.
- `task` is the title of the task the lap is for, and only when that member's
  `settings.share_task` is true and the phase is `work`. Otherwise `null`: the server sends no
  title it was not told to share, and "not sharing" and "no task" look the same from outside.
- `away` is true when that member's `settings.rooms_hidden` is true. Then `phase` is `idle`,
  `task` and `last` are `null`, and only the totals are real: someone who has hidden rooms is not
  watched, but what they did still counts toward the room's week.
- `today_ms`, `today_laps` and `week_ms` are section 7's counting over that member's session rows
  (work, not `void`, overlapping minutes once), for their local day and their Monday to Sunday
  week, by the latest `utc_offset_min` any device of theirs sent. The lap in progress is not in
  them; a screen adds it from `ends_at` if it wants the figure to move.
- `last` is the member's most recent work session that rang today: its run id, when it ended, and
  the ids of the members who cheered it. `null` when there is none. A cheer belongs to two people
  and a lap, not to a room: it shows in every room the two share. Only a lap that rang can be
  cheered, never a break, never one's own, and never a member who is away.
- A member's local midnight changes their `today_ms`, so it sends the message like any other change.
- The room's own total for the week is the sum of its members' `week_ms`; `target_ms` is what
  they are filling together, 0 when none is set. `ranked` says whether this room shows its
  members by `week_ms`, most first; otherwise they stay in joining order, side by side.

**What the server reads.** Only what this needs: an account's `timer` cell, its `session` rows,
its `settings` fields `share_task` and `rooms_hidden`, and the `title` of the one task a shared
lap is for. It reads nothing else of anyone's, and logs none of it.

**Offline.** Every request above needs a connection and fails without one. A cheer made offline
is the device's to keep and send when it is back; nothing else is queued. A kept cheer that is
answered `run` or `room` is dropped: the lap or the room is gone. Any other failure keeps it for
the next connection.

## 16. Settings, automatic starts, marks, and a person's own copy

**Settings** are the fields of `settings/current`. A field nobody has written reads as its default.
"Ring here" is not one of them: it belongs to one device and is kept there.

**Automatic starts.** With `auto_break` on, the break a lap has earned starts at the lap's bell;
with `auto_work` on, the next lap starts at a break's bell (for no task, or the same task if it is
still first on today's list). The device that sees the bell writes the next timer state, and two
devices that both see it must write the same one, or one of them would close the other's run as
replaced:

- its `started` is the bell's own time (`ends_at` of the run that rang), not the time of writing;
- its `run` is the rung run's id with `_` appended (so `run-7f3a`, `run-7f3a_`, `run-7f3a__`):
  a run id becomes a row id, and `_` is a character a name may hold;
- its stamp is the stamp of the timer cell it follows with the counter one higher, and the
  writer's device id: always newer than the cell it follows, the same on every device that
  writes it, and older than anything a person does afterwards.

An automatic start is written only by the device that writes the bell's row, in the same write
(section 11 says who may), and never more than two hours after the bell: someone who comes back the next morning finds the timer
idle, not a break that started itself nine hours ago. A set of four never chains past its long
break: after a long break's bell nothing starts by itself.

**Marks.** A mark is for something achieved, never for opening the app. Three kinds: the total of
laps that rang reaching 1, 4, 25, 100, 250, 500, 1000 or 2500; a task marked done with its laps at
or under its estimate; a week's focus passing the best week before it (only once there is a week
before it). A mark is for what was done on this device (the lap's bell, the task's done, the week's latest
lap was written here), and is shown once per account: the device that shows it writes
`settings/current` field `marks`, an object of mark keys to the time shown (`laps-25`,
`estimate-<task id>`, `week-<monday>`), and no device shows a mark whose key is there. A mark
achieved more than a day ago is never shown, so the object need not remember everything: keys
older than two days are dropped when the next is written, and it stays a few keys long. With
`celebrate` off nothing is shown and nothing is written, and turning it on later replays
nothing older than a day.

**A person's own copy.** Export is one JSON text: `{"heirloom": 1, "exported": <ms>, "account":
"<username>", "cells": [...]}` with every cell the device holds, stamps included. Import applies
those cells through the ordinary merge and puts every cell that was kept into the outbox. So it
is safe to import twice, into another account's fresh database, or into a device that has moved
on: the newer stamp wins, as everywhere.

## 17. Ringing a browser that is not looking

A page cannot ring from a closed tab, and a hidden tab's timers run late. So the server sends a
Web Push at the bell to the browsers that asked for one. No paid service: the server makes its
own VAPID key pair at first start and keeps it in its database.

| Request | Body (beside `token`, `device`) | 200 reply |
|---|---|---|
| `GET /api/push/key` | none, and no token | `{"key":"<the VAPID public key, base64url>"}` |
| `POST /api/push/subscribe` | `subscription` (the browser's own object: `endpoint` and `keys` with `p256dh` and `auth`), `words` (below) | `{}`. One subscription per device; a new one replaces the old |
| `POST /api/push/unsubscribe` | nothing more | `{}` |

`words` is what the notification will say, written by the app in its own voice so the server
holds no copy of its own: `{"lap":["Lap 1 of 4, done.", four in all],"take":["Take five.",
four in all, the fourth for the long break],"break":"Break over.","next":["Lap 1 is next.",
four in all]}`. Each string is 1 to 80 characters.

- **When.** At the moment an account's timer cell says a run ends (section 6: running, not
  paused, `ends_at` reached), the server sends one push to each subscribed device of that
  account. A timer that was paused, stopped, extended or replaced before then sends nothing at
  the old time. Nothing is sent more than 60 s late (the server was down): a bell that late is
  not a bell.
- **What.** The encrypted payload (RFC 8291, `aes128gcm`) is
  `{"t":"ring","run":"<run id>","at":<ends_at>,"title":"...","body":"..."}`, the title and body
  picked from that device's `words` by the phase and `set_index`: a lap at index i says
  `lap[i]` and `take[i]`; a short break after it says `break` and `next[i + 1]`, wrapping; a
  long break says `break` and `next[0]`. TTL 60 s, urgency high. A device is rung once for a
  run and its end; a device that subscribes, or a timer that arrives, less than 60 s after a
  bell is still rung for it.
- **The browser's side.** The service worker shows the notification with the tag
  `heirloom-ring`, unless a window of the app is visible, in which case the page rings itself
  and the worker shows nothing. Either way it tells every open window the run has rung and
  whether it showed the notification, so a page whose own late timer fires afterwards stays
  quiet, and a page that is open but hidden behind another window of the app rings if nothing
  was shown.
- A push service that answers 404 or 410 for a subscription has dropped it: the server deletes
  it. Any other failure is not retried: the bell has passed.
- The server never sends anything else by push, and the payload holds no task title.

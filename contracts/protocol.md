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
| server to device | `{"type":"welcome","server_time":1795494600150,"head":1049,"rooms":["r_8f3a"],"role":"member"}` | `role` is the account's role now (section 10); an older server says none, which is `member`. `head` is the account's newest sequence number. `rooms` is the ids of every room the account is in, so a device that was away when its account left a room drops it now (section 15). |
| server to device | `{"type":"role","role":"admin"}` | The account's role has just been changed by the owner (section 10). Sent to every open socket of that account. |
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
The reply also carries `"role"`, the account's role now, as a socket's `welcome` does (section 10),
so a device that only ever reaches the server by POST hears it too.

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
| `start` (`phase`, `run`, `task`, `planned_ms`, and `new_set` when wanted) | That phase, `started = now`, no pause. A lap started over a lap begun under 60000 ms of running time ago takes that lap's index, as after a stop: the first was a start taken back. With `new_set: true` a lap is lap one (index 0), whatever came before: a device asks for it when the last run belongs to an earlier local day (the day of its bell if it rang, else of the timer cell's stamp), so yesterday's half set does not decide today's long break. A run that is counting now belongs to no earlier day, however long ago it began: a six hour lap begun at 20:00 is one sitting at 01:00. A break keeps the `set_index`. A lap takes the index of the next lap: the idle state's own; one more (wrapping after 3) when the state is a lap, over or not, or a short break; 0 after a long break |
| `pause` | `paused_at = now`. Nothing when idle, paused or over |
| `resume` | `paused_ms += now - paused_at`, `paused_at = null`. Nothing unless paused |
| `extend` (`ms`) | `planned_ms += ms`. Nothing when idle. After the bell it reopens the lap if the new end is still ahead of `now`; if not, nothing: minutes nobody worked are not added |
| `stop` | Idle, every other field as the schema's idle state, `set_index` the next lap's index by the same rule as `start`. A lap that is stopped has had its place in the set: after lap 1 is stopped, the next start is lap 2. Except a lap stopped before the bell with under 60000 ms of running time (`now - started - paused_ms`, or to the pause when it is paused): that was a start taken back, it keeps its index for the next start, and section 11 writes no row for it. Stopping lap 4 starts a new set at lap 1 and earns no long break: a break is what a bell gives |

There is one way to end a lap before its bell, and it is `stop`. (Until 2026-11-25 a stopped lap
gave its place back and a second button set a lap aside; the user's second hour with the app
found two stops that nobody could tell apart.) A lap is set aside afterwards, from the timeline
(section 13). The session row is written by whoever sees the run end or ends it (section 11).

Fixture: `timer.json`.

## 7. Stats

From `session` rows and the viewer's offset from UTC in minutes.

- A session counts when `kind` is `work` and `outcome` is `rang` or `stopped`. `void` and breaks
  count nowhere.
- Its counted interval is `[started + paused_ms, ended]`. Its day is the local day of `started`.
- A day's `focus_ms` is the length of the union of its counted intervals, so minutes that ran on
  two devices at once count once. Its `laps` is the number of counted sessions: a lap that was
  stopped is a lap, a short one.
- A lap's `fill` is how much of it ran: 1 for `rang`, else `(ended - started - paused_ms) /
  planned_ms`, never over 1. Wherever laps are drawn (the set of four, a task's squares, the day's
  target), each is drawn that full, so a count of laps never says more than the picture does.
- What is earned needs the bell: the streak's kept day (section 8), a mark for a number of laps
  (section 16) and a cheer (section 15) count only laps that rang.
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
| `stats.json` `fill` | One fill per session row in `sessions`, in order, must equal `expect`. Read by the TS tests only |
| `streak.json` | Computes from `today`, `kept`, `days_mask` and `window` and must equal `expect` |

`tools/contracts-check.mjs` checks every cell, session and timer state in these files against the
schemas. A fixture lists under `unknown` the fields it uses on purpose that no schema has.

## 10. Accounts

Plain HTTP with JSON bodies, beside the socket. Registration is by invite only, but for the first
account on a server. There are no
cookies: the token travels in the body or the `hello`, so nothing rides along with a request by
itself. That is why every `/api/` route, the socket included, and `/healthz` answer any origin (the phone app's
WebView is a different origin from the server) and answers the browser's `OPTIONS` preflight.

| Request | Body | 200 reply |
|---|---|---|
| `POST /api/register` | `{"invite":"...","username":"ravi","password":"...","device":"a1b2c3d4e5f60718"}` | `{"token":"...","account":"...","username":"ravi"}` |
| `POST /api/login` | `{"username":"ravi","password":"...","device":"a1b2c3d4e5f60718"}` | the same |
| `POST /api/logout` | `{"token":"..."}` | `{}`. The token stops working at once, on an open socket too |

- An invite is a link, `<server>/#/join/<invite>`, and `invite` in `register` is its last part.
  It registers one account, once, as a member, and is good for 7 days. One that has run out is
  kept 30 days more, so it can be renewed, and then removed. Invites made before roles existed
  were kept only as hashes and do not work after the update. An admin or the owner makes
  it in the app (below); `heirloomd -data <dir> -invite` prints one and exits, and works while the
  server is running.
- **A fresh server.** `GET /healthz` answers `{"ok":true,"version":"...","sqlite":"...","setup":true}`
  while the server has no account, and leaves `setup` out after. While it is so, `register` with no
  `invite` (absent or empty) makes the first account. Two at once: one wins; the other gets
  `invite` if it arrived before the winner had finished and `bad_request` after, and a device
  reads either as "somebody else has set this server up". The first account on a server is its
  **owner** however it was made, by an invite from the command line too.
- **Roles.** `member`, `admin`, `owner`. The server holds the role and checks it on every call
  below; a device hears it in each `welcome` and keeps it only to choose what to show. There is one
  owner, the first account, and no call changes the owner's role.
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
| 403 | `invite` | The invite is unknown, used, taken back or run out; or a second first account |
| 409 | `taken` | The username exists |
| 401 | `credentials` | Wrong username or password; the reply does not say which |
| 429 | `slow_down` | After 5 failed sign-ins for a username inside 15 minutes, every sign-in for it until the 15 minutes pass, right password or not. Also when the server has a line of sign-ins waiting (it checks one password at a time): then nothing was wrong and the wait is a second. `Retry-After` carries the seconds, and tells the two apart |
| 401 | `token` | `logout` or `/api/sync` with a token that is unknown or signed out |
| 500 | `server` | The server's own fault. Nothing was stored; the device tries again |

Invites and admins. Each call is a `POST` whose body carries the caller's `token` and `device`
beside what is listed, as the room calls do (section 15).

| Request | Body | 200 reply | Who |
|---|---|---|---|
| `/api/invites/create` | | `{"invite":{"invite":"k3J9...","created":1795494600150,"expires":1796099400150}}` | admin, owner |
| `/api/invites/list` | | `{"invites":[...]}`: every invite not used and not run out, oldest first | admin, owner |
| `/api/invites/renew` | `{"invite":"k3J9..."}` | `{"invite":{...}}`: 7 days from now. One that had run out comes back with a new `invite`, so its old link stays dead | admin, owner |
| `/api/invites/revoke` | `{"invite":"k3J9..."}` | `{}`. An invite that is not there is `{}` too | admin, owner |
| `/api/admins/list` | | `{"admins":[{"username":"ravi","role":"owner"},{"username":"sam","role":"admin"}]}`: the owner first, then admins by name | owner |
| `/api/admins/set` | `{"username":"sam","role":"admin"}` (or `"member"`) | `{}`. Already so is `{}` too | owner |

| Status | Code | When |
|---|---|---|
| 403 | `forbidden` | The caller's role does not allow the call |
| 409 | `full` | `create` with 50 invites on the server, the command line's included |
| 404 | `unknown` | `renew` of an invite that was used, taken back or removed; `set` for a username the server does not have, or that could not be one |
| 400 | `bad_request` | `set` naming the owner, with no username, or with a role that is not `admin` or `member` |

Every admin sees, renews and takes back every open invite, whoever made it. Who made one is kept
on the server and not sent. Before sign-in the server says nothing about its accounts but `setup`:
no call lists a username to anyone but the owner, and `taken` is answered only to a real invite.

A role changed by `set` is checked by the server from that moment. The other person's devices
with a socket open are told at once, by a `role` message; the rest hear it in their next `welcome`
or POST reply. A call a device may no longer make is `forbidden`, and the device then asks nothing
more of that kind until it next hears from the server which role it has.

`renew` is held to the same two limits as `create`: an invite that ran out more than 30 days ago
is `unknown`, and bringing one that had run out back while 50 are open is `full`.

A device signs out only after its outbox is empty, and refuses, with the reason, while it is
offline with unsent work. Otherwise signing out would be a way to lose a lap.

**A way back in.** A password is never read back or sent anywhere, only replaced, and only with
the say of whoever runs the server: there is no email here and nothing to recover by.

| Request | Body | 200 reply | Who |
|---|---|---|---|
| `/api/resets/create` | `{"username":"sam"}` | `{"reset":{"reset":"q7Xk...","username":"sam","created":1795494600150,"expires":1795581000150}}` | owner |
| `/api/resets/list` | | `{"resets":[{"username":"sam","created":...,"expires":...}]}`: every reset not used and not run out, oldest first, without its `reset` | owner |
| `/api/resets/revoke` | `{"username":"sam"}` | `{}`. None open for that name is `{}` too | owner |
| `POST /api/reset/look` | `{"reset":"q7Xk..."}`, no token | `{"username":"sam"}` | whoever holds the link |
| `POST /api/reset` | `{"reset":"q7Xk...","password":"...","device":"a1b2c3d4e5f60718"}`, no token | as `login`: `{"token":"...","account":"...","username":"sam"}` | whoever holds the link |

- A reset is a link, `<server>/#/reset/<reset>`. It sets a new password for one account, once,
  and is good for 24 hours. `reset` is 32 random bytes as text; the server keeps only its hash,
  so the link is shown once, when it is made, and never again.
- One account has one open reset: `create` for a name that has one makes a new link and the old
  one is dead from that moment.
- `create` naming the owner is `bad_request`, as `set` is: nobody signed in as the owner can
  change the owner's password from the app, so a device left open is not a way to take the
  server. The owner's way back is `heirloomd -data <dir> -reset <username>`, which prints a link
  for any account, the owner's too, and exits; it works while the server is running, as `-invite`
  does. Whoever can run it already holds the data.
- `POST /api/reset` sets the password (the rule of `register`), uses the reset up, and signs
  every device of the account out: every token it had stops working at once, and its open
  sockets are cut with `bye`, reason `token`. The reply signs in the device that asked, as
  `login` does. All of it is one transaction: a reset is never used up without the password
  having changed, and never the other way round.
- A device signed out this way keeps what it had not yet sent. When the same account signs in on
  it again, with the new password, it sends it: a reset is not a way to lose a lap either.
- `look` and `reset` with a reset that is unknown, used, taken back or run out are 403 `reset`,
  and say no more than that. `create` and `revoke` for a username the server does not have are
  404 `unknown`. `reset` waits in the same line as sign-ins (one password is hashed at a time)
  and may answer 429 `slow_down` with `Retry-After`, as `login` does when nothing was wrong.
- The server writes a reset's making, its use and its taking back to its log with the username
  and the time, never the `reset` itself.

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
| Replaced: a newer timer state for another run arrives while this device's run is open | As stop |
| Stop or replaced, after the bell | It rang: the row of the first line |
| Stop or replaced, on a run that rang once and was then extended | Still `rang`: a lap that reached its bell stays a lap. `ended` as for stop, an ordinary stamp |

- `kind`, `task`, `started`, `planned_ms` and `paused_ms` are the state's; `device` is the writer.
- A run that did not reach its bell and had under 60000 ms of running time (`ended - started -
  paused_ms`) leaves no row, a lap as a break: a start taken back within the minute is not a
  lap of the day, not a lap on its task and not one of the four. Any other lap leaves a row,
  stopped or rung: it had its place, and the row is what shows it. (Every stopped lap left a
  row for one build; three slips of the thumb then made "four laps" with one real one.)
- A stopped row is something a person did, so its cells take ordinary stamps from the clock.
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
`replaced`), `now`, `device`, `written` (the time in the timer cell's stamp) and `rang`
(true when a rang row is already held), and expect `null` or the row, its `id`, and `stamp_at`
(`written` for a bell's row, or `null` for an ordinary stamp). `bell` cases ask whether to write, from the
timer cell's stamp, the device, `in_step` and `has_row`.

## 12. Today

The rules behind the Today screen. They are worked out on the device from `task`, `project`,
`session` and `settings` rows; the server knows none of them.

**Quick add.** One line of text makes one task. If the trimmed text ends in a space, `~` and a
number from 1 to 99, that number is the estimate in laps, 32 at most (a larger one is taken as 32),
and the rest, trimmed, is the title.
Anything else is all title. An empty title adds nothing.

**Repeat.** `repeat` is `null`, `{"every":"day"}`, or `{"every":"week","days":<mask>}` (bit 0
Monday to bit 6 Sunday; a weekly task is a mask of one day). The day after a given day is the
first day strictly later that the rule allows.

**The next one.** Marking a repeating task done makes the next task of the series, a row of its
own, so each day's laps stay with that day's task:

- its `due` is the day after the later of today and the done task's own `due` (days missed are
  not owed); and where the series already has a row for that day (a task carried to an earlier
  day and done there, or its day edited back), the first allowed day after it that the series
  has had no row for, so a series never ends because someone was ahead of it;
- its id is the series id, `-`, and that day as eight digits: `task-read-20261125`. The series id
  is the done task's id without such an ending. Two devices that mark the same task done offline
  therefore make the same row;
- it copies `project`, `title`, `notes`, `estimate`, `repeat`, `when`, `time`, `work_ms`, `short_ms`,
  `long_ms` and `order`.
  Subtasks are not copied.

Marking it not done again sets `deleted` on that next row; done again clears it.

**A task's time.** `time` is a local time of day, `15:30`, on the task's `due` day; it means
nothing while `due` is unset, and a device that sets a time on a task with no day writes today
as its `due` in the same change, and a device that clears the day writes `time` as null in the
same change: a time the person can no longer see must not come back with the next day they
pick. The two are separate cells: one device moving the day while
another moves the time keeps both. A device that can notify reminds once, at that day and
minute, if the task is then not done and not deleted, and never for a moment already past. It
is the device's own notification, as a habit's is (section 14); the server sends nothing. A
value that is not a time of day is kept and sent on, and shown and reminded as none. If one
device clears the day while another sets a time on the day it still saw, both cells are kept
and the task has a time with no day: it shows and reminds as none until a day is set again.

**Done while its lap runs.** Marking a task done while a lap is running or paused on it ends that
lap as `stop` does (section 6), in the same turn as the `done`: the work is finished, so the lap
is, and a timer left counting for a task that is ticked off was read as a bug (the user,
2026-11-25: the strip went on as "a lap for nothing in particular"). The device that writes the
`done` writes the stop. A lap whose bell has already gone is left alone: it rang, and its break
is still offered. Taking the `done` back while the stop can still be undone (section 11's ten
seconds, and the timer cell untouched since) puts the lap back as well; later, or from another
device, only the task opens again. A subtask done ends nothing.

**Deleting for good.** `deleted` is a time, and a row is restorable while that time is in the
last 30 days. A person who wants it gone now writes `deleted: 1577836800000` (the first moment of
2020, the earliest time any build takes for a real one): long past the window, so the row is on
no screen in any build, old ones included, and nothing new has to be learned by anyone. (A `1`
would have been read by every older build as no time at all, and the row would have come back.) The cells stay on the server like those of any row whose 30 days ran out. It holds for a
task, a habit and a project alike, and it is the one write here with no way back, so a screen
asks twice.

**A project's name and its end.** `name` is edited like any field. Deleting a project writes its
`deleted` as now and is offered an Undo (which writes `null`); there is no shelf of deleted
projects. Its tasks keep their `project` id and show no project, as they do for an archived one,
so an Undo, here or on another device, gives every task its project back.

**A project's colour.** `color` is one of the twelve names DESIGN.md gives its project colours,
or `#` and six hex digits for a colour the person picked: written in lowercase, read in either
case. A build that does not know a
value (an older one, a newer name) shows the project in `ink` and keeps the value as it is: a
colour never hides a project and is never rewritten by a device that only read it.

**Order.** `order` is a fractional index: 1 to 64 characters of `0-9 A-Z a-z`, compared as a plain
string, never ending in `0`. Moving a row writes one new key between its new neighbours. Rows sort
by `order`, then by row id, so two devices that picked the same key still agree.

**What is on Today**, for the local day:

| List | Rows |
|---|---|
| Today | not done, not deleted, no `parent`, and `due` is unset or today or earlier. By order. A task is "running" while the timer is on a lap for it that has not rung (counting or paused). The first that is not running is "next": so when a lap on the top task rings, that task is next again, and the plan's order decides what a new lap is for |
| Upcoming | the same, with `due` after today. By order, as Today is: the day is what a row says, not where it stands |
| Done | `done` falls on today. By when it was done |
| Recently deleted | `deleted` in the last 30 days. Newest first |

A task whose `due` is set or changed to a day after today is given, in the same write, the
`order` that puts it by its day among Upcoming's rows: after the last row whose day is not
later than its own. So Upcoming reads by day until a hand moves a row, and a moved row stays
where it was put.

A row is moved within its list by writing its `order`. A row moved from Upcoming into Today is
written `due` as today together with its new `order`, in one transaction; nothing else of it
changes. Nothing is moved from Today into Upcoming by its place: a day is given in the task.

A subtask shows inside its parent only.

**An estimate** is offered from 1 to 32 laps: four rows of eight squares, which is what a row can
draw (the user, 2026-11-25: 8 was too few). A larger number in a row from an older build is kept
and shown as it is; the first edit of the estimate brings it to 32.

**A task's own lengths.** `work_ms`, `short_ms` and `long_ms` on a task, each a length or `null`.
A lap's length is offered up to 360 minutes, in settings and on a task; a longer one that a row
already holds is read and run as it is.
A lap begun on the task takes its `work_ms` as `planned_ms`; the break begun after a lap on it
(by a tap or by itself) takes its `short_ms` or `long_ms`. A field that is `null`, absent or not
a length the settings would take falls back to the account's own (section 16), each field by
itself. The timer cell carries no new field: a length is read once, when the run begins, by the
device that begins it, so a task edited mid-lap changes the next run and not this one.
"Planned, left" counts each task's laps at that task's lap length. The next task of a repeating
series copies all three.

**The free words for when** (`when`) are no longer shown or edited: with a clock time beside
them nobody could say what they were for (the user, 2026-11-25). The field stays in the schema and
is still copied to the next of a repeating task, so no build drops what an older one wrote.

**Laps on a task.** From the work sessions of that task, oldest first: a `rang` session is one lap
and one whole square; a `stopped` one is one lap and a part square, as full as its `fill`
(section 7); a `void` one is nothing. The lap in progress on the task adds a part square that fills as it runs,
unless its row is already there; once its bell has gone it is a lap and a whole square, row or no
row, so the count never trails the day's. "2 of 4" counts laps; the squares may pass the estimate.

**Planned, left.** Over the Today list: the sum of each task's estimate minus its laps, never
under 0 for a task. A task without an estimate adds nothing.

Fixture: `today.json`. `quick_add`: text in, title and estimate out, or `null`. `repeat`: the
rule and a day in, the next day out. `next`: a done task's id, `due`, today and rule in, the next
row's id and `due` out. `order`: property checks, described in the file. `squares`: sessions, the
timer state, `now` and a task in, `laps` and `squares` out.

**Rows that cannot be real.** A day that is not a calendar date (`2026-02-31`), a time before
2020 or after 2199, a length that is negative or not a number, a timer state that is not one:
such a value, from an imported copy or a device with a dead clock, is kept and sent on like any
cell, and is not counted, shown or walked from. Nothing a screen reads may throw on a row.

## 13. Progress

The rules behind the Progress screen. All of it is worked out on the device from `session`, `task`,
`project` and `day` rows, with the same counting as section 7: a session counts when it is work
and not `void`, on the local day it started, and minutes two devices ran at once count once.

**This week against last week.** Weeks run Monday to Sunday. For each day of this week up to
today, the running total of focus; today's includes the lap in progress, as the race does. For
each day of last week, the same. The ghost's figure "by now" is last week's total up to the same
weekday and time of day. The split is this week's total less that.

**The year.** One cell per local day from the first day with a counted session to today. A cell's
level comes from that day's laps: 0 none, 1 for 1 to 3, 2 for 4 to 6, 3 for 7 or 8, 4
for 9 or more. A rest day (section 8) carries
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
  every past day. A habit's planned days are counted from the day it was made, or from its first
  done day if that is earlier, so two habits made together read the same `of`. The habit row has
  no created field: the day it was made is the local day of the oldest stamp among its cells.
- **This week against last:** the check-ins of all habits (not archived, not deleted) from Monday
  to now, and last week's from its Monday to the same weekday and time.
- `reminds` is a list of local times of day, sorted, `["06:00", "22:00"]`: at most one for each
  time a day the habit is done (`target`), and fewer is fine. The first is for the first
  check-in of the day, the second for the second, and so on: the reminder at place k is shown
  on a planned day only while that day has fewer than k check-ins. A habit done twice by noon is
  not reminded at 22:00; one done once is. A device writes the whole list in one cell, and with
  it `remind`, the list's first time or `null`, so a build that knows only `remind` still
  reminds once. It writes `remind` first, so the list's stamp is the later of the two. A device
  reads `reminds` when it is a list and `remind` as a list of one when it is not; and when
  `remind` carries the later stamp, an older build has changed its one time since, and that is
  read in the list's place (`null` as no times), so every device reminds at what was set last.
  Lowering `target` under the list's length cuts the list. An entry that is not a
  time of day makes the whole list read as empty; the cell is left as it is.
- `remind` is a local time of day, `07:30`, kept for older builds as said above. A reminder is
  for the days the habit is planned and is not shown on a day the habit is already done. It is a device's own notification; nothing is
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
| `/api/rooms/update` | `room`, and any of `name`, `target_ms` (0 for none), `ranked` | `{}`. The room's keeper only; anyone else gets 403 `forbidden` |
| `/api/rooms/cheer` | `room`, `to` (a member's id), `run` (a session row id of theirs) | `{}`. Once per person per run; a second is the same answer |
| `/api/rooms/remove` | `room`, `member` (a member's id, not your own) | `{}`. The keeper only. The member is out (their devices get `gone`) and the room gets a new `code` in the same transaction, so the old one stops working |
| `/api/rooms/note` | `room`, `text` (1 to 200 characters, one line: no line breaks) | `{"note":"<id>"}`. A break note; see **Notes** |
| `/api/rooms/call` | `room`, `at` (server ms, a whole minute 1 to 30 minutes ahead), or `at: null` to take your own call back | `{"call":"<id>"}` or `{}`. See **Start together** |
| `/api/rooms/notes` | `room` | `{"notes": [...]}`: the last seven days, newest first. See **Notes** |
| `/api/rooms/in` | `room`, `call`, `in` (true or false) | `{}`. Until the call starts; a second is the same answer |
| `/api/me/picture` | `picture`: a base64 WebP or JPEG of at most 12000 bytes, square, or `null` to take it off | `{"picture":"<hash>"}` or `{}` |

| Status | Code | When |
|---|---|---|
| 404 | `room` | No such room, or the account is not in it |
| 404 | `code` | No room has this code |
| 409 | `full` | The room has 16 members, or the account is in 5 rooms |
| 404 | `run` | `to` is not a member, or has no such session that rang |
| 429 | `slow_down` | Ten wrong codes from one account inside an hour: every join by it, the right code included, until the hour is up. `Retry-After` carries the seconds |
| 403 | `forbidden` | `update` or `remove` by a member who is not the keeper |
| 404 | `call` | No such call open in that room |
| 409 | `call` | The room has an open call already; one at a time |
| 400 | `bad_request` | A note empty, too long or with a line break; `at` not a whole minute 1 to 30 minutes ahead; a picture too large or not WebP or JPEG |
| 429 | `slow_down` | More than 30 notes from one account in a room in a day, or more than 6 calls in a day. `Retry-After` carries the seconds |

**Pictures.** An account's picture is kept by the server as it was sent and named by the sha-256
of its bytes (`hash`, hex). Members carry `picture` (that hash, or `null` for the initial).
`GET /api/pictures/<hash>` with the token as `Authorization: Bearer <token>` returns it, to an
account that shares a room with its owner (else 404), with `Cache-Control: private, max-age=31536000,
immutable`: a new picture is a new hash. The device makes it before it sends it: cut square, 96 by
96, WebP (JPEG where WebP cannot be made), so it is about 5 KB.

A member with no picture is drawn from their username alone, the same on every device and in
every version (`contracts/fixtures/avatar.json`): a hue picked by FNV-1a 32 bit over the UTF-8
bytes of the lowercased username, modulo 8, into amber, olive, teal, sky, indigo, plum, clay,
heat-2, in that order; and one letter, or two when the username splits on `_`, `-` or `.`.

A room's `code` is 8 characters of `A-Z 2-9` without the look-alikes (`I`, `O`, `0`, `1`), made
by the server. Whoever has it can join; any member can read it.

**The room message.** After `welcome`, and whenever anything below changes, the server sends each
connected device one message per room its account is in. A device that has left a room, or been
alone in one that ended, gets the message once more with `"gone": true` and nothing else.
`POST /api/sync` replies carry the same objects under `rooms`, and that array is the whole set.
A device drops any room it holds that a `welcome`'s `rooms` or a POST reply's `rooms` does not
name: it was not there to hear `gone`.

```json
{ "type": "room", "room": "r_8f3a", "name": "Sachi and me", "code": "K7QW3RXM", "keeper": "a_19c2",
  "target_ms": 36000000, "ranked": false, "server_time": 1795494600150,
  "members": [
    { "id": "a_19c2", "name": "sachi", "you": false, "away": false,
      "phase": "work", "set_index": 1, "ends_at": 1795495265000, "paused": false,
      "task": "Thinking in React, steps 1 to 3",
      "today_ms": 4500000, "today_laps": 3, "week_ms": 21600000,
      "run": { "ms": 840000, "today": true, "week": true },
      "last": { "run": "run-7f3a", "ended": 1795493100000, "cheers": ["a_02b7"] } } ] }
```

- `keeper` is the id of the member who keeps the room: the one who made it. Only the keeper may
  change its name, its target and whether it is ranked. When the keeper leaves, the member who has
  been in the room longest becomes the keeper, in the same transaction, and every member is sent
  the room again. A room made before keepers existed is kept by its longest member. The code is
  everyone's to see and share: friends invite friends.
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
  them: it is in `run`.
- `run` is the member's work lap in progress, so their totals can move as it runs: `ms` is how far
  it had run at `server_time`, its paused time not counted, as section 7 counts a lap; `today` and
  `week` say whether it began on the member's current local day and in their current week, as
  the same offset reads them. A screen adds `ms` to `today_ms` when `today` and to `week_ms` (and
  the room's week) when `week`, plus the time since `server_time` while `paused` is false. `run`
  is `null` when the phase is not `work`, when the run's bell has gone (its row is coming), and
  when the member is `away`. A device that does not know `run` ignores it and shows the rows alone.
  The member who is `you` is counted from the device's own timer instead, which knows it exactly.
- `last` is the member's most recent work session that rang today: its run id, when it ended, and
  the ids of the members who cheered it. `null` when there is none. A cheer belongs to two people
  and a lap, not to a room: it shows in every room the two share. Only a lap that rang can be
  cheered, never a break, never one's own, and never a member who is away.
- A member's local midnight changes their `today_ms`, so it sends the message like any other change.
- `picture` on each member: see **Pictures**.
- `days`, `last_days` and `last_at_ms` on each member: that member's own focus per local day of
  this week and of last week (seven numbers each, rows only, their own calendar) and their last
  week as far as the same weekday and time, for the person's report. Zeros and 0 for an away
  member.
- `laps` on each member: their work laps of their local day so far, from their session rows,
  oldest first, each `[started, ended]` in server ms (paused time inside a lap is not cut out;
  a lap set aside is not there). The lap in progress is not in it: it is `run`. `[]` when there is
  none, and for a member who is `away`. At most 48; past that, the newest 48.
- `days` and `last_days` are the room's focus per local day of this week and of last week, Monday
  first, seven numbers each in ms (each member counted on their own local day, rows only, as
  `week_ms`). `last_at_ms` is the room's total last week as far as the same weekday and time of
  day, so a screen says "4h ahead of last week at this time" from `week` minus it.
- `streak` is the room's: `{ "run": 12, "marks": [14 of "kept", "rest", "miss", "open", "none"] }`,
  oldest first, today last, on the calendar of the account the message is for. A day is kept when
  every member in the room on that day (from the day they joined; one who has left is not counted)
  ran a work lap that rang on their own local day of that date; section 8's rule gives two rest
  days a Monday to Sunday week. Today is `"open"` until it is kept. `"none"` is a day before the
  room was made, or before anything was ever kept: no mark is drawn for it, so a new room is not
  shown misses. A device that meets a mark it does not know draws nothing for it.
- `call` is the room's open call or `null`: `{ "id", "by": <member id>, "at": <server ms>,
  "in": [member ids, the caller first] }`.
- `notes_since` is the id of the newest note, so a device knows there is something to fetch.
- The room's own total for the week is the sum of its members' `week_ms`; `target_ms` is what
  they are filling together, 0 when none is set. `ranked` says whether this room shows its
  members by `week_ms`, most first; otherwise in the live order (see **Order**).

**Start together.** A member calls a lap for a whole minute 1 to 30 minutes ahead; the caller is
in. Others say they are in, or take it back, until it starts. At `at`, each device of an account
that is in and whose timer is idle (not on a lap or a break) starts a work lap with run id
`call-<call id>`, at `started = at`, on the task Focus would start; the same run id on every
device of that account makes it one lap, whichever writes first. A device that is not open at
that minute starts nothing; the phone shows a notification at `at` ("The lap together starts"),
set when you say you are in and taken off if you take it back. The call ends one minute after
`at`, or when the caller takes it back; the room is sent again either way. A member who leaves is
taken out of the call; the caller leaving ends it.

**Small rules.** The caller takes a call back with `at: null` (`in` from the caller is 400); `in`
from `at` on is 404 `call`; removing a member already gone is `{}`; the 30 notes and 6 calls are
counted over the last 24 hours, and `Retry-After` counts to when the oldest of them is a day old;
`last_at_ms` is true when the message is built and a screen does not move it. An account may fetch
its own picture whether or not it shares a room; a picture's squareness is the device's to make.
`/api/me/picture` takes at most 20 changes a day (429 `slow_down` past that, counted by the
running server); sending the picture an account already has, or none when it has none, is not a
change: it is not counted and sends no room again.

**Notes.** A note is one line from a member: `{ "id", "from": <member id>, "at": <server ms>,
"text" }`. `POST /api/rooms/notes` with `room` replies `{"notes": [...]}`, newest first, the last
seven days. Notes older than seven days are deleted. A note belongs to the room: when its writer
leaves it stays, written by `"from": null` ("Someone who left"). The server sends no notification
for a note; what is new is the device's own reckoning (the newest note it has shown), not the
server's. A device on a lap does not show them.

**Order.** A screen shows members on a lap first, then on a break, then the rest, each group by
`week_ms` (most first, joining order on a tie). `ranked` true shows them by `week_ms` alone.

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
break: after a long break's bell nothing starts by itself. A lap that starts by itself goes on
with the task of the lap that rang before the break, while that task is open (not done, not
deleted); otherwise it is for no task.

**Marks.** A mark is for something achieved, never for opening the app. Three kinds: the total of
laps that rang reaching 1, 4, 25, 100, 250, 500, 1000 or 2500; a task marked done with its laps at
or under its estimate, at least one of them a lap that rang (what is earned needs the bell: a task
ticked five seconds into its only lap earns nothing); a week's focus passing the best week before it (only once there is a week
before it). A mark is for what was done on this device (the lap's bell, the task's done, the week's latest
lap was written here), and is shown once per account: the device that shows it writes
`settings/current` field `marks`, an object of mark keys to the time shown (`laps-25`,
`estimate-<task id>`, `week-<monday>`), and no device shows a mark whose key is there. A mark
achieved more than a day ago is never shown. Keys are kept as long as their mark could be shown
again: a `laps-` key always, a `week-<monday>` key while that week is the current one or the one
before, and the newest hundred of the others; the rest are dropped when the next mark is written.
(Dropping by age was wrong: a week's mark is achieved again with every lap of that week.) With
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

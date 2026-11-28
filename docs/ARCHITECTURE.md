# Architecture

How heirloom is built, and why each piece was picked. Every decision links to the research that
settled it. A change to anything here is a decision the user approves, recorded in the log at the
bottom, before code changes.

## The short version

```
 phone (Capacitor shell)          laptop (browser)                friend's phone
 ┌──────────────────────┐        ┌──────────────────────┐        ┌───────────────┐
 │ same web UI          │        │ same web UI          │        │ same web UI   │
 │ local copy (IndexedDB)│        │ local copy (IndexedDB)│        │ local copy    │
 │ exact alarm (native) │        │ Notification + push  │        │ exact alarm   │
 └─────────┬────────────┘        └─────────┬────────────┘        └──────┬────────┘
           │  WebSocket: cells + presence  │                            │
           └──────────────┬────────────────┘                            │
                          │  tunnel (TLS)                               │
                ┌─────────▼─────────────────────────────────────────────▼──┐
                │ heirloomd: one Go binary, one SQLite file, on any Linux  │
                │ stores the newest value of every field, hands out what   │
                │ each device missed, tracks who in a room is focusing     │
                └──────────────────────────────────────────────────────────┘
```

1. **Every device works from its own copy.** Reads and writes hit local storage first; the screen
   never waits for the network. The server shares, it does not permit.
2. **Changes travel as cells.** A cell is one field of one row: `(stamp, dataset, row, field,
   value)`. The newest stamp wins. This is Actual Budget's model, proven small.
3. **The timer is one cell holding start time and state.** Every device computes time left
   itself, corrected to server time, so laptop and phone show the same second.
4. **What really happened is never lost.** A finished pomodoro, a habit check-in: each is its own
   row with its own id, so two offline devices cannot overwrite each other's work.
5. **The server is small on purpose.** One Go binary that also serves the web app, one SQLite
   file, under 50 MB of RAM, on the phone the user already runs.

## 1. Requirements this answers

| Requirement | From | How |
|---|---|---|
| Timer started on the laptop shows on the phone, live | User | One timer cell, pushed over WebSocket within a second |
| Works with the server unreachable | User | Local-first: local copy plus an outbox |
| Two devices offline at once must not corrupt or lose anything | User | Stamped cells, append-only records, rules in section 4 |
| Phone rings at the end with the screen off | User, [stack.md](research/stack.md) §1 | Native exact alarm through Capacitor |
| Android and laptop browser now; iOS and desktop later without a rewrite | User | One web UI; Capacitor has iOS; the browser build installs as a PWA |
| Friends study together in v1 | User | Rooms with presence, served by the same server |
| Server: an arm64 Linux container, 1 GiB, kernel 4.14 | User | Go + bundled SQLite, measured budget in section 7 |
| Instant UI, no slow animations | User | Preact, 5.9 KB; budgets in section 7 |
| Free | User | No paid service anywhere in the path |

## 2. Stack

| Layer | Pick | Why | Rejected |
|---|---|---|---|
| UI | **TypeScript + Preact + @preact/signals**, built with Vite | 5.9 KB, 60 ms first paint (React: 51.4 KB, 229 ms). React's component model, so agents write it well and the code reads like React | React (8x heavier), Solid (fastest, but components run once and React habits cause quiet bugs), Svelte (fine, less familiar to agents) |
| Styling | Plain CSS with CSS modules (built into Vite) and custom properties generated from `DESIGN.md` | Tokens stay the one source of colour; no framework to fight | Tailwind (a second vocabulary for the same tokens) |
| Android shell | **Capacitor 8** with `@capacitor/local-notifications`, `USE_EXACT_ALARM` declared | Same build as the browser; exact alarms; iOS later | Tauri 2 (open Android scheduling bugs), PWA alone (cannot ring), RN and Flutter (a second UI stack) |
| Client storage | IndexedDB, writes batched per transaction, `navigator.storage.persist()` | Built in; plenty for thousands of rows | SQLite in WASM (about 1 MB more for no gain at this size) |
| Server | **Go**, one static binary, `CGO_ENABLED=0` | Supports kernel 4.14 (needs 3.2+), about 4 MB at idle, cross-compiles to arm64 | Node (kernel 4.14 unsupported), Bun (memory reports conflict), Rust (fine, slower to build) |
| Server storage | SQLite in WAL mode, one writer, **bundled version 3.51.3 or later** | WAL corruption bug fixed in 3.51.3; Ubuntu 24.04 has 3.45.1 | System SQLite, Postgres |
| Transport | One WebSocket per device, JSON messages; the same messages over `POST /api/sync` when sockets fail | Live timer needs push; the POST path survives hostile proxies | SSE (breaks behind buffering proxies), polling |
| Exposure | **Cloudflare named Tunnel** on the user's domain (chosen 2026-11-24), or the home network over plain `http` (2026-11-25: the server then listens on every interface) | Friends need nothing installed; WebSockets on all plans | Tailscale Funnel (beta, WebSockets undocumented), port forwarding (home IP, no TLS) |

Pure-Go SQLite drivers carry their own SQLite build; section 0 of the roadmap checks
`select sqlite_version()` is at least 3.51.3 before anything else is written on top.

## 3. Data model

Datasets are synced as cells. Field names here are the contract; `contracts/protocol.md` and
`contracts/schemas/` hold the exact wire types, and `contracts/fixtures/` what both sides test against.

| Dataset | Rows | Fields | Kind |
|---|---|---|---|
| `timer` | one per account (`row = "current"`) | `state` (one JSON value, see below) | mutable, atomic |
| `session` | one per pomodoro or break run | `kind` (work, short, long), `task`, `started`, `ended`, `planned_ms`, `paused_ms`, `outcome` (rang, stopped, void), `device`, `note` | created once; only `task`, `note` and `outcome` change later |
| `task` | one per task | `project`, `title`, `notes`, `estimate` (whole pomodoros), `parent`, `due`, `repeat`, `when`, `done`, `order`, `deleted` | mutable per field |
| `project` | one per project | `name`, `color` (a DESIGN.md role name), `order`, `archived`, `deleted` | mutable per field |
| `habit` | one per habit | `title`, `days` (weekday mask), `target`, `remind` (local time of day), `order`, `archived`, `deleted` | mutable per field |
| `checkin` | one per check-in | `habit`, `day` (local `YYYY-MM-DD`), `at`, `deleted` | created once; undo sets `deleted` |
| `day` | one per local day with a note (`row` = the day) | `note` | mutable per field |
| `settings` | one per account | durations, auto-start flags, sounds, celebrations on or off, what rooms may see | mutable per field |

The timer `state` is a single JSON value so it can never be half-updated:

```
{ phase: "idle" | "work" | "short" | "long",
  run: <id of the current interval, becomes the session id>,
  task: <task id or null>,
  started: <server-time ms>, paused_at: <ms or null>, paused_ms: <total>,
  planned_ms: <length>, set_index: 0..3 }
```

Time left is `planned_ms - (now_server - started - paused_ms)`, with `now_server = Date.now() +
offset`. Nothing ticks in storage.

**One finished interval, one session, written by whoever sees it end.** The session id is the
timer's `run` id, so when the phone and the laptop both see the same pomodoro ring, both write the
same row and it collapses into one. Ringing does not write the timer cell: the phone rings from a
native alarm with the app asleep, so a phase is over when its time left reaches 0, and what comes
next is worked out from the cell. Only something the user does writes it.

**Three outcomes.** `rang`: it reached the bell; the minutes count and it is a lap. `stopped`: ended
early; the minutes count, it is not a lap, and the next start is a fresh lap in the same place of
the set. `void`: set aside by the user; it stays in the timeline and counts nowhere. An interval
with under 60 s of running time leaves no row at all.

Rooms are not cells. They are server-owned tables (`room`, `member`, `cheer`) changed through
online-only requests, because a room is shared between accounts and has nothing to merge.

## 4. Conflict rules

Stamps are hybrid logical clocks: wall time in ms (corrected by the device's measured offset from
server time), a counter, and the device id, written as one string that sorts in time order
(Actual's format). A stamp from more than 5 minutes in the future is refused by the server; the
device corrects its offset, restamps its unsent cells and sends again.

| Situation | Rule | What the user sees |
|---|---|---|
| The same field edited on two devices | Newer stamp wins | The later edit. Rare (Ink & Switch found such clashes uncommon) |
| A task deleted on one device, edited on the other | `deleted` is an ordinary field; the delete stands unless undone | It moves to Recently deleted for 30 days, with Restore |
| The timer changed on two devices, both online | Newer stamp wins; both converge within a second | Every screen shows the same timer |
| **Both devices offline, each runs the timer** | Each records its own sessions (different `run` ids). On reconnect the newer timer state wins the live slot. A device whose running interval is replaced closes it as `stopped` at that moment, so its minutes are kept | Every completed pomodoro is kept. Two that overlap are shown side by side with a "ran on two devices" mark and can be voided with a tap. Focus time counts overlapping minutes once |
| A habit checked in on two devices | Two `checkin` rows; the day is done when live rows reach the target | Done, never lost. History shows both; undo removes the latest |
| Two devices reorder a list | The order key is a fractional index in one field; newest wins; ties break by row id | The list settles on one order |
| A device's clock is wrong while offline | Future stamps are refused and restamped. A clock behind loses ties it should have won | Nothing is corrupted; at worst an old edit loses |
| A room action while offline | Not allowed; cheers are queued | "Needs a connection" |
| A device was offline for weeks | It pulls everything after its cursor, then pushes its outbox | It catches up; its own offline sessions arrive intact |

Settled by the research: [sync.md](research/sync.md). No timer product documents the two-offline
case, so the rule above is ours. It follows the principle that what you really did is kept.

## 5. Sync protocol

```
device → server   hello  { token, device, cursor, client_time }
server → device   welcome{ server_time, head }           then cells after cursor, in pages
device → server   push   { batch, cells: [...] }          (idempotent: a cell is its stamp)
server → device   ack    { batch, from, cursor }   or   nack { batch, reason: "clock", server_time }
server → others   cells  { from, to, cells }              (the account's other devices, live)
server → device   room   { room, members: [...] }         (presence and today's totals, on change)
both ways         ping / pong every 25 s                  (heartbeat for the tunnel; time offset)
```

- The server keeps only the newest cell per field plus its stamp, and gives every accepted cell a
  sequence number. A cursor is that number. Storage stays the size of the data, not of its
  history (Actual's growth problem avoided).
- The server stores and forwards; it reads only the datasets it needs for rooms (`timer` for
  presence, `session` for totals).
- The device applies its own change locally first and puts it in the outbox. An unsent edit is an
  ordinary cell: an incoming cell replaces it only with a higher stamp. Nothing flickers, because
  an edit made after seeing a value is always stamped later than that value.
- Time offset: on each pong, `offset = server_time - (sent + received) / 2`, smoothed.

## 6. Notifications

| Where | How | Why |
|---|---|---|
| Android | Whenever the timer cell changes, from any device, cancel and reschedule an exact alarm at the phase end. Ring and vibrate | The only thing that rings on time with the screen off ([stack.md](research/stack.md) §1) |
| Android, during a phase | A notification with a live countdown (`setChronometerCountDown`) | Time left at a glance without opening the app |
| Android, app closed | A `specialUse` foreground service holds a read-only socket to `/api/ws` (OkHttp, JSON ping every 25 s, a partial wakelock while connected, reconnect with backoff and at once on a network change). It starts from the app, on boot and after an update; not with its switch off, Ring here off, or notifications denied | A closed app hears nothing from the server otherwise, and the user ruled out FCM and UnifiedPush |
| Android, who draws | The native side draws every notification on the phone (countdown, bell, a called lap's alarm, room alerts). Two feeders: the page sends `(timer stamp, state, words)` at each plan; the service sends `(stamp, state)` from the server and words it from templates the page handed over. The newer stamp wins; on a tie the page's words win | One drawer means no two writers on one notification; the stamp keeps a stale feed from undoing a newer one |
| Laptop, tab open | In-page timer plus the Notification API and the bell | Instant |
| Laptop, tab closed or in background | Web Push from the server at the phase end (VAPID keys made by the server, no paid service) | Background tabs throttle timers |
| Every device | A per-device "ring here" switch | Phone and laptop on the same desk should not both ring if the user says so |

### The phone's native drawer: what the page sends it

The `Countdown` plugin is the one way in (`client/src/platform/capacitor.ts` calls it; nothing
else does). Stamps are the timer cell's stamp, compared as plain strings (protocol section 2).

- `plan({ stamp, state, ring })`: the timer as the page knows it. `state` is the timer cell's
  value, `ring` is what `planFor` made (a `Ring`, a `Paused`, or null). Answers `{ rings }`:
  whether Android will ring it (false with notifications or exact alarms refused, so the page
  rings in-page instead).
- `call({ id, at, title, body } | null)`: the soonest called lap you are in, `at` in this
  device's time. Null takes it off.
- `keep({ server, account, token, device, cursor, on, words } | null)`: what the service needs.
  `account` is the account id: any change of `server`, `account` or `token` wipes everything the
  native side holds (stamp, cursor, alarms). `on` is the switch and Ring here together. Null is a
  sign-out: stop, wipe. `words` are the templates, all from `strings.ts`:
  `{ bell: { lap[4], take[4], next[4], break }, during: { work, short, long }, actions: { pause,
  resume, stop, done }, left: "Paused, {t} left", note: { title: "{room}", body: "{name}: {text}" },
  call: { title: "{name} calls a lap at {time}", body: "{room}" }, starts: { title, body: "{room}",
  with: "{room}, with {name}" }, keeping, channels: { keep, rooms } }`. OkHttp is pinned at 5.4
  while compileSdk is 36 (5.5 wants 37).

The service merges its own feed with the page's by stamp, newer wins, the page on a tie. It
starts when `keep` says `on` and notifications are allowed, and at boot and update from what it
kept.

## 7. Budgets (checked by tools, not by eye)

| Budget | Limit |
|---|---|
| Server memory | under 50 MB RSS with 20 connected devices; `GOMEMLIMIT=64MiB` |
| Server binary | under 25 MB, web app embedded |
| Web app, first load | under 100 KB of JS gzipped, under 20 KB of CSS, at most 2 font files preloaded (the other three load after first paint) |
| Tap to visible change | under 100 ms on the user's phone |
| Motion | state changes under 250 ms; the reward moment under 1.2 s and skippable; all of it off under `prefers-reduced-motion` |
| Live timer arrival | under 1 s from one device to the other on the home network |

## 8. Repository layout

```
contracts/     protocol.md, JSON schemas, fixtures/*.json   (orchestrator only)
server/        Go module: cmd/heirloomd, store, sync, hub, auth, rooms, push, web
client/        Vite + Preact app
  src/core/      pure TS: stamps, merge, timer math, stats   (no DOM, tested in Node)
  src/sync/      WebSocket and HTTP transport, outbox
  src/store/     IndexedDB adapter
  src/platform/  notifier, sound, haptics: web and Capacitor implementations
  src/ui/        screens and components, tokens from DESIGN.md
android/       Capacitor Android project and the countdown plugin
tests/e2e/     Playwright: two and three devices against a real server
tools/         token generator, style check, budget checks, sync simulator
docs/          this file, PRODUCT.md, research/
```

## 9. Security

- Registration is by invite only: the server owner makes invite links. Usernames and passwords,
  hashed with argon2id. Each device gets its own revocable token, stored hashed.
- Behind a tunnel the server listens on localhost and the tunnel terminates TLS. On a home network
  it listens on every interface over plain `http`: whoever is on that network can read what is
  sent, and the app says so where the address is typed. Login is rate limited.
- Three roles, held by the server and checked on every call: member, admin (invite links), owner
  (the first account; names the admins; cannot be changed). While a server has no account, the
  first to register owns it.
- Rooms show friends only what the user allows: focusing or not and today's time always, the task
  title only when switched on.
- Backups: a daily `VACUUM INTO` copy, seven kept, and a JSON export for every user.

## 10. Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-11-24 | Local-first with per-field newest-wins cells and a store-and-forward server | Smallest model that meets offline + live; [sync.md](research/sync.md) |
| 2026-11-24 | Timer as one atomic cell of timestamps; sessions as append-only rows keyed by run id | No ticking storage; duplicates collapse; offline work kept |
| 2026-11-24 | Preact + Vite, Capacitor 8, Go + bundled SQLite 3.51.3+, IndexedDB | [stack.md](research/stack.md) |
| 2026-11-24 | Rooms share presence and time, not tasks; no global leaderboard | [focus-todo.md](research/focus-todo.md), [motivation.md](research/motivation.md) |
| 2026-11-24 | The two-offline-devices rule in section 4, approved by the user | Nothing really done is lost; overlaps counted once |
| 2026-11-24 | Name: heirloom. Server binary: heirloomd | the name's notes, in git history (design/names.md) |
| 2026-11-24 | Design language: route B, Pacer | `DESIGN.md`; the three routes are in git history (design/routes/) |
| 2026-11-24 | Exposure through a Cloudflare named Tunnel | User's choice; [stack.md](research/stack.md) §5 |
| 2026-11-24 | Session outcomes are `rang`, `stopped`, `void`; a replaced offline interval closes as `stopped` | The user's call: minutes really worked are kept, a lap is only a lap when it rings |
| 2026-11-24 | Ringing does not write the timer cell | The phone rings with the app asleep; nobody is there to write |
| 2026-11-24 | An unsent edit loses to an incoming cell with a higher stamp (was: incoming values ignored) | Ignoring them left the device showing a value the server had already replaced |
| 2026-11-24 | Server SQLite driver: `modernc.org/sqlite` | Pure Go, bundles its own SQLite, builds with `CGO_ENABLED=0`; a test asserts 3.51.3 or later |
| 2026-11-24 | One root `package.json`; core tests on `node --test`, no test framework | Capacitor wants `android/` beside its config; Node 22 runs `.ts` itself |
| 2026-11-25 | Server packages for section 1: `github.com/coder/websocket`, `golang.org/x/crypto` (argon2id) | Go's standard library has neither a WebSocket server nor argon2 |
| 2026-11-25 | Client: `@preact/signals-core` as a direct dependency; `fake-indexeddb` for the store's Node tests | The engine runs in Node for the simulator, so it cannot import Preact; the real IndexedDB is proved by e2e from section 2 |
| 2026-11-25 | No cookies; the API and the socket answer any origin | The Capacitor WebView is another origin, and a token in the body cannot be sent by a page that does not hold it |
| 2026-11-25 | Invites are made with `heirloomd -invite` on the server | The owner already has a shell there; no admin screen in v1 |
| 2026-11-25 | The stats and streak functions are built in section 1, not 5 | Their fixtures exist and `make check` goes green one section earlier; section 5 extends them |
| 2026-11-25 | Capacitor packages for section 3: `@capacitor/core`, `android`, `local-notifications`, `app`, and `cli` for the build | The shell, the exact alarm, the back button |
| 2026-11-25 | The phone app is built knowing its server (`make apk SERVER=...`); application id `io.github.ravindu644.heirloom` | A bundled app has no origin to ask; the id is the lead's pick and can change until the first release |
| 2026-11-25 | The phone rings for a timer it has seen: one that was started or changed while heirloom was open on it with the screen on, or within about two minutes of the screen going off. Measured on the user's phone: after two minutes of screen off the open app's socket goes quiet, and a lap started on the laptop reached the phone only when its screen came on (then within 3.4 s). A timer started on the phone itself always rang, 3 to 21 ms after its planned end, screen off and locked included | Android gives a closed app no way to hear from our server without a push service (FCM or UnifiedPush) or a running service, and v1 has neither. Listed under Later in PRODUCT.md |
| 2026-11-25 | The web build carries a service worker that keeps the built files, generated by `vite.config.ts` | Without it a reload with no connection showed the browser's error page; "works fully offline" has to include opening the app |
| 2026-11-25 | One tab per browser profile runs the engine (Web Locks); a second tab waits and takes over | Two tabs share a device id and a database but not a clock |
| 2026-11-25 | `task.when` and the shape of `task.repeat` added; a project's `color` is one of five existing DESIGN.md roles | PRODUCT asks for projects with a colour; DESIGN.md allows one hue. Five tones of the palette, shown as a small square beside the name, keep both. The user may overrule with real hues |
| 2026-11-25 | A repeating task done makes the next task as its own row, with an id made from the series and the day | Each day's laps stay with that day's task, and two devices marking it done offline make the same row |
| 2026-11-25 | A `day` dataset holds the look back's one line, one row per local day | The note belongs to a day, not to a session or a task; a row per day cannot collide across devices except on the same line, where the later edit wins |
| 2026-11-25 | Rooms pinned (protocol section 15): any member may rename a room, set its target or turn on ranking; a member who has hidden rooms shows as away but their time still counts; the server also reads `settings.share_task`, `settings.rooms_hidden` and the title of a shared task; devices send their UTC offset in the hello | Small rooms of friends need no owner; hiding is about not being watched; the server cannot share a title it never reads, nor know a member's today without their offset |
| 2026-11-24 | Dev-only packages: `@playwright/test`, `@google/design.md`, `yaml`, `ajv`, `@preact/preset-vite` | e2e, the DESIGN.md lint, reading its front matter, checking fixtures against schemas, JSX and hot reload |
| 2026-11-25 | Owner, admin and member; invite links stored as they are, good for 7 days, deleted when used | The user's choice, after Docmost's flow. Stored plain so an admin can copy a link again; 7 days and "Take back" bound what a stolen backup can do |
| 2026-11-25 | The phone app's server is typed in the app, and may be plain `http` | The app is self-hostable; a home network has no certificate. Android needs cleartext and mixed content allowed for it |
| 2026-11-25 | `task.time` added, a local time of day on the due day; a project's `color` is one of twelve names or `#rrggbb` | The user asked for both by name. A new field and a wider set of values: an older build keeps what it does not know and shows such a project in ink |
| 2026-11-25 | Motion is CSS in the kit and the browser's own pickers are used for a time and a colour: no animation library, no picker component | The platform does all three; the JS budget stays where it is |
| 2026-11-27 | The phone keeps its own connection while closed: a `specialUse` foreground service with a read-only second socket per device, OkHttp its one new dependency, the token kept in a file in the app's no-backup folder, `allowBackup` off. Supersedes the 2026-11-25 line that the phone rings only for a timer it has seen | The user's chosen way, the one self-hosted apps use. OkHttp is what Home Assistant, Gotify and ntfy ship; Java-WebSocket ignores Android's network security config. Backups could carry the token to another phone |
| 2026-11-27 | A third place compares a timer stamp: the phone's native drawer keeps the newer of its two feeds (the page's and the service's), the page winning a tie | It only decides which feed to draw, never what a cell holds; `merge.ts` and `server/sync` stay the only places a cell is applied |
| 2026-11-27 | Measured on the user's phone (Samsung, release build 10000240), a lap driven from the laptop: with the screen off, in forced deep Doze, swiped from Recents, and after a reboot (the service came back at the first unlock without the app being opened), the countdown was drawn, paused, resumed and cleared as the laptop acted; a room note and a call from another account showed with the app closed; no bell or call alarm was left after a stop. The battery cost overnight is still to measure | The section's gate; the wakelock is the cost to watch (`dumpsys power` flags it LONG) |
| 2026-11-28 | A lap's minutes are cut at local midnight and the lap itself counts on the day it ended (its bell). Supersedes "a lap's day is the day it started" | A 23:46 lap that rang at 00:32 left today empty and the room strip blank after midnight; the user asked for the split Focus To-Do makes, and the bell is where a lap is earned |
| 2026-11-28 | How far an account has read a room's notes is kept by the server (`member.notes_read`, `POST /api/rooms/read`), not by each device | A note read on the phone stayed unread on the laptop; read once, read everywhere, as a messaging app does |
| 2026-11-28 | The first load's JS budget is 100 KB gzipped, was 90 | The day lap by lap, the Habits fold and Today's subtasks did not fit in 90; the user chose 100 over trimming each feature to fit |
| 2026-11-28 | A habit's check-in may name its `round` (which of the day's times was ticked); one without fills the lowest empty round | The user wants to skip 08:00 and tick 12:00 as 12:00; optional, so older builds' check-ins still count |

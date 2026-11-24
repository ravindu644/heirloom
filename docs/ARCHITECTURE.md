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
                │ heirloomd: one Go binary, one SQLite file, on the S10     │
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
| Server on the S10 container: arm64, 1 GiB, kernel 4.14 | User | Go + bundled SQLite, measured budget in section 7 |
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
| Exposure | **Cloudflare named Tunnel** on the user's domain (chosen 2026-11-24) | Friends need nothing installed; WebSockets on all plans | Tailscale Funnel (beta, WebSockets undocumented), port forwarding (home IP, no TLS) |

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
| Android, during a phase | A notification with a live countdown (`setChronometerCountDown`) through a small custom plugin | Time left at a glance without opening the app; no running process |
| Laptop, tab open | In-page timer plus the Notification API and the bell | Instant |
| Laptop, tab closed or in background | Web Push from the server at the phase end (VAPID keys made by the server, no paid service) | Background tabs throttle timers |
| Every device | A per-device "ring here" switch | Phone and laptop on the same desk should not both ring if the user says so |

## 7. Budgets (checked by tools, not by eye)

| Budget | Limit |
|---|---|
| Server memory | under 50 MB RSS with 20 connected devices; `GOMEMLIMIT=64MiB` |
| Server binary | under 25 MB, web app embedded |
| Web app, first load | under 90 KB of JS gzipped, under 20 KB of CSS, at most 2 font files preloaded (the other three load after first paint) |
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
- The server listens on localhost; the tunnel terminates TLS. Login is rate limited.
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
| 2026-11-24 | Name: heirloom. Server binary: heirloomd | [design/names.md](../design/names.md) |
| 2026-11-24 | Design language: route B, Pacer | [design/](../design/README.md); `DESIGN.md` |
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
| 2026-11-25 | The phone rings for a timer it has seen: one that was started or changed while heirloom was open on it, or since it was last opened. A timer started on the laptop while the phone app is closed does not reach the phone | Android gives a closed app no way to hear from our server without a push service (FCM or UnifiedPush) or a running service, and v1 has neither. Listed under Later in PRODUCT.md |
| 2026-11-25 | The web build carries a service worker that keeps the built files, generated by `vite.config.ts` | Without it a reload with no connection showed the browser's error page; "works fully offline" has to include opening the app |
| 2026-11-25 | One tab per browser profile runs the engine (Web Locks); a second tab waits and takes over | Two tabs share a device id and a database but not a clock |
| 2026-11-25 | `task.when` and the shape of `task.repeat` added; a project's `color` is one of five existing DESIGN.md roles | PRODUCT asks for projects with a colour; DESIGN.md allows one hue. Five tones of the palette, shown as a small square beside the name, keep both. The user may overrule with real hues |
| 2026-11-25 | A repeating task done makes the next task as its own row, with an id made from the series and the day | Each day's laps stay with that day's task, and two devices marking it done offline make the same row |
| 2026-11-25 | A `day` dataset holds the look back's one line, one row per local day | The note belongs to a day, not to a session or a task; a row per day cannot collide across devices except on the same line, where the later edit wins |
| 2026-11-24 | Dev-only packages: `@playwright/test`, `@google/design.md`, `yaml`, `ajv`, `@preact/preset-vite` | e2e, the DESIGN.md lint, reading its front matter, checking fixtures against schemas, JSX and hot reload |

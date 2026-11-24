# AGENTS.md: heirloom

`CLAUDE.md` holds one line, `@AGENTS.md`, which loads this file (a real file, not a symlink, so it
works on Windows). Read this first, then the file your task names.

## What it is
A free Pomodoro, tasks and habits app with a soul: one web UI for the laptop browser and an Android
app (Capacitor), live sync between a person's devices, offline first, and rooms where friends study
together. Its server is one Go binary with one SQLite file, running on a phone. Read in this order:
1. [docs/PRODUCT.md](docs/PRODUCT.md): what v1 does and why. A feature not there is not in v1.
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how, and the conflict rules.
3. [DESIGN.md](DESIGN.md): every colour, type size, space, radius and duration. The voice of the words.
4. [ROADMAP.md](ROADMAP.md): where we are. The first unticked box is the next job.
5. [docs/research/](docs/research/README.md): the evidence behind 1 to 3. Read a page when a decision needs it.

**The bar:** this must read as something passionate people built in their free time. Every feature
and every word earns its place; nothing generic, nothing because "apps usually have it".

## The team
One **lead** session runs the roadmap and is the only one that commits. It splits each section into
**lanes**, briefs one agent per lane, gates the result, and merges. Lane roles live in
`.claude/agents/` (Claude Code loads them as subagent types):

| Lane | Agent | Owns (writes only here) |
|---|---|---|
| contracts, tools, docs | lead | `contracts/`, `tools/`, `docs/`, root files |
| server | `server-engineer` | `server/` |
| core | `core-engineer` | `client/src/core/`, `client/src/sync/`, `client/src/store/` |
| ui | `ui-engineer` (one per screen folder when parallel) | `client/src/ui/` |
| android | `android-engineer` | `android/`, `client/src/platform/` |
| qa | `qa-engineer` | `tests/`, `tools/sim/` |
| design review | `design-reviewer` | nothing; writes `reviews/<section>/<screen>.md` |

A lane that needs a change outside its folder asks the lead in its report; it never edits there.
`contracts/` changes only through the lead, and both sides re-run fixtures after.

## Workflow (per roadmap section)
1. **Plan.** Enter plan mode. List the section's boxes by lane, the files each lane touches, the
   check that proves each box, and what lanes must agree on (names, message shapes, component
   props). Write anything shared into `contracts/` or `DESIGN.md` before any lane starts.
2. **Brief.** One agent per lane, in one message so they run in parallel, in this checkout,
   disjoint folders. Brief like a peer: the goal, the boxes, the files to read (only those), what
   is ruled out, the check that proves done, the skills to load. From the second section on,
   resume a lane's agent with SendMessage: it keeps its code in context.
3. **Build.** Lanes do not commit. A lane ends every process it started (dev servers, emulators,
   browsers) before it reports. A failing check caused by another lane's half-written file: re-run
   once before calling it a bug.
4. **Gate a section.**
   - Re-run every check yourself: `make check`. An agent's report is a lead, not proof.
   - Read every diff before merging.
   - UI changed: `design-reviewer` on screenshots at 412x915 and 1440x900, light and dark; fix
     what it marks as a FAIL.
   - Run the `code-review` skill at `medium`. Fix real bugs and regressions in normal use,
     re-review at most once, send the rest to `findings.md`, one line each.
   - **The user tries it** on the phone and the laptop, as the section's gate says. Tests passing
     is not the same as it feeling right.
   - Tick the boxes, commit, push.
5. **Lessons**, then the next section. See Self-improvement.

## Choke points (bypassing one is a bug)
- `contracts/` is the only definition of the wire format, the datasets and their fields. Fixtures
  in `contracts/fixtures/` run in both Go and TS tests.
- `client/src/core/merge.ts` and `server/sync/` are the only places a cell is compared or applied.
- `DESIGN.md` is the only file with colour, font, size, radius and duration values. UI code uses
  the generated `tokens.css`; `tools/style-check.mjs` fails on a literal.
- `client/src/ui/kit/` holds the shared components. A screen that needs a button, a sheet or a list
  row uses the kit; a missing piece is added to the kit once.
- `client/src/platform/notifier.ts` is the one interface for alarms and notifications; web and
  Capacitor implement it. Screens never call a plugin directly.
- Every user-facing string lives in `client/src/ui/strings.ts`, written to the voice in DESIGN.md.

## Code rules
- **No em dashes** in code, comments, commits, docs or UI strings. **No ASCII banner comments.**
- **Comments sound like a person:** say why, or what breaks without it. Skip ones that restate code.
- **Ten lines that work beat a hundred that do the same thing.** Delete before you add.
- TypeScript strict. Go: `gofmt`, `go vet`, errors wrapped with context.
- **Before you write anything,** stop at the first answer that holds:
  1. Does it need to exist? Not in PRODUCT.md: skip it, say so in one line.
  2. Does it already exist here? Grep first. See Choke points.
  3. Does the platform do it? The browser, Preact, Go's standard library, Android.
  4. Does an installed dependency cover it? Never add one for what a few lines can do. A new
     dependency is a lead decision with a line in ARCHITECTURE's log.
  5. Can it be one line? Then it is one line. Only then, the smallest thing that works.
- This shortens the solution, never the reading: trace the whole flow first. A bug names a
  symptom; fix the shared function once. Never simplify away input validation, error handling that
  loses data, or anything the user asked for by name.
- **No work is ever lost.** Any code path that could drop a session, a check-in or an offline edit
  needs a test that proves it does not.

## Words
UI text follows the voice in DESIGN.md. Plain, warm, specific, never scolding. Numbers over
adjectives: "4 of 5 pomodoros" beats "great progress". The lead does a copy pass each UI section.

## Version control
- Sign off every commit: `git commit -s`. Commits are GPG signed. A commit an agent wrote ends with
  `Co-Authored-By: Claude <model> <noreply@anthropic.com>`. Never add a `Claude-Session:` trailer.
- Prefixes: `server:`, `core:`, `ui:`, `android:`, `qa:`, `contracts:`, `tools:`, `docs:`,
  `design:`, plus `fix:` / `feat:` / `refactor:`, and `fix(security):` for anything security related.
- Fix forward. Never force-push `main`. Never commit secrets, `.env*`, keystores, `.local/`, or
  build output (`dist/`, `android/app/build/`, `server/bin/`).

## Devices
- Machine-specific details (the S10 container's address and login, the phone's adb serial) live in
  `.local/ENV.md`, which is gitignored. Ask the user if it is missing; never guess a password.
- Phone: run `adb devices` first, every time. If no line ends in `device`, stop and say so.
- S10 container: deploy with `make deploy`; never edit files on it by hand.

## Self-improvement
- **Tools:** a command sequence run twice, or a script you would run again, becomes
  `tools/<name>.mjs` with a usage line at the top and a row in the Tools table below.
- **Gotchas:** anything that took more than two tries becomes one line with its why, below.
- **Skills:** a lesson about how to do a kind of work goes into `skills/<name>/SKILL.md`.
- Keep this file under about 150 lines. Merge duplicates, prune what no longer bites.

## Skills
`skills/` is linked at `.claude/skills`. Load the one the step needs; name it in lane briefs.
| The step | Skill |
|---|---|
| Any screen or component | `taste-gate`, plus the global `design-taste-frontend` |
| Naming, copy, a reward moment, anything that could come out generic | the global `antialgorithm` |
| A new dataset or field, anything touching sync | `sync-change` |
| Anything on the phone or the S10 | `device-test` |

## Tools
| Tool | Use |
|---|---|
| `make check` | Every check, each one reported. The gate runs this |
| `make dev` / `web` / `server` / `apk` | Vite beside heirloomd / the built app / the binary for here and arm64 / the debug APK |
| `make deploy`, `make s10-rss` | Copy the arm64 binary to the S10 / run it there for 3 s and print its memory |
| `tools/tokens.mjs` | DESIGN.md to `client/src/ui/tokens.css`, fonts included. Run by `make tokens` |
| `tools/style-check.mjs` | Fails on a colour, font name or duration literal in `client/src/ui/` |
| `tools/budget.mjs` | Built JS, CSS, fonts and the server binary against ARCHITECTURE section 7 |
| `tools/contracts-check.mjs` | Every cell, session and timer state in the fixtures against the schemas |

## Gotchas
- `npx @google/design.md lint DESIGN.md` must show 0 errors. Its warnings `orphaned-tokens` (UI reads
  tokens through tokens.css), `missing-primary` (roles are named for their job) and
  `token-like-ignored` on `motion` (our key, read by tools/tokens.mjs) are expected.
- `node --test tools/` fails: Node 22 wants a quoted glob (`node --test "tools/*.test.mjs"`), not a directory.
- `go.mod` says `go 1.26.0`, not `go 1.26`: the SQLite driver sets that floor and Go rewrites the line.
- Never pass a cancellable context to a SQLite call in `server/`: a cancelled call makes the driver
  drop the connection, the checkpoint at close is skipped and a `-wal` file is left behind.
- SQLite before 3.51.3 can corrupt a WAL database; Ubuntu 24.04 ships 3.45.1. Use the bundled one.
- Node does not support the S10's kernel (4.14). The server is Go for that reason.
- `@capacitor/local-notifications` silently falls back to an inexact alarm without the exact-alarm
  permission. Declare `USE_EXACT_ALARM` and check `checkExactNotificationSetting()`.
- Chrome throttles timers in background tabs. The laptop's end-of-phase alert comes from Web Push,
  not from a `setTimeout` in the page.
- Cloudflare closes idle WebSockets and restarts its servers: ping every 25 s and always reconnect.
- Wall-clock last-writer-wins lets a device with a fast clock overwrite real edits. Stamps use
  server-corrected time, and the server refuses stamps more than 5 minutes ahead.

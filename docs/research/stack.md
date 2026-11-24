# What can carry it: shells, runtimes, storage, reach 🧰

> [!TIP]
> Only a native alarm rings on time on Android with the screen off; a web page cannot schedule one
> (Chrome's Notification Triggers has sat behind a flag since 2022). Capacitor runs the same web
> build in the laptop browser and on the phone, and its notification plugin uses exact alarms. Go
> runs on the S10's 4.14 kernel at a few MB of RAM; Node does not support that kernel at all.
> SQLite needs version 3.51.3 or later because of a WAL bug fixed in March 2026. Friends reach a
> home server through Cloudflare Tunnel (needs a domain) or Tailscale Funnel (free, beta).

Checked 2026-11-24 against saved copies of each page.

## 1. The phone has to ring

- `setAlarmClock()` is the only alarm Android never delays. `setExactAndAllowWhileIdle()` fires
  "at a nearly precise time" even in Doze, at most once per 9 minutes per app.
- Since Android 14, `SCHEDULE_EXACT_ALARM` is denied by default and the user can revoke it.
  `USE_EXACT_ALARM` is granted automatically and cannot be revoked.
- Google Play allows `USE_EXACT_ALARM` when "The app is an alarm or timer app". A sideloaded APK
  goes through no review at all.
- The LineageOS clock app schedules timers with `setExactAndAllowWhileIdle`, declares
  `USE_EXACT_ALARM`, and starts a foreground service only once a timer is ringing.
- A foreground service is the wrong tool: `shortService` lasts about 3 minutes and no type covers
  a timer.
- `Notification.Builder.setChronometerCountDown` (API 24) shows a live countdown in the
  notification with no process running.
- Chrome's Notification Triggers is "In developer trial (Behind a flag)". A web page alone cannot
  ring at a set time.
- dontkillmyapp rates Xiaomi, Samsung, OnePlus and Huawei 5 of 5 for killing background apps.

## 2. One web UI, two places

| Shell | Laptop browser | Android alarm | State in 2026-11 |
|---|---|---|---|
| PWA alone | Yes | No (no scheduled notifications) | Fails v1 |
| Capacitor 8 | Same build | `@capacitor/local-notifications` uses `setExactAndAllowWhileIdle`; silently falls back to inexact without the permission | 8.6.2, 2026-11-12 |
| Tauri 2 | Same build | Plugin does not document scheduling; open bugs #3550 (lost on reboot) and #2341 ("Scheduling just doesn't work on Android in a build") | Stable since 2024-10-02 |
| React Native / Expo | Needs react-native-web | Supports exact alarms and an alarm-clock trigger | Different UI stack |
| Flutter | Draws to a canvas, not the DOM | Supports exact alarms | Different UI stack |

No source compares APK size and cold start of all five on one device with a stated method.

## 3. The server, on the S10

The container: Ubuntu 24.04, arm64, 1 GiB RAM, no swap, kernel 4.14.

| Runtime | Supports kernel 4.14 | Idle memory (one task) | Source |
|---|---|---|---|
| Go | Yes, 3.2+ (Go 1.24+) | 3.6 MB | hez2010 benchmark, 2024-12-01, x86 |
| Rust (tokio) | Yes, 4.1+ on aarch64 | 4.7 MB | same |
| Node | No: arm64 needs 4.18+ (v22) or 5.14+ (main) | 41.9 MB; 61 MiB measured with node:http + node:sqlite | Node BUILDING.md; same benchmark; our run |
| Bun | "Runs on kernels as old as 3.10 ... with graceful degradation"; recommends 5.6+ | Sources conflict: blogs say below Node, issue #34389 reports 670 MB | bun.com; GitHub |
| Deno | Not found | Not found | |

## 4. Storage

- **Server:** SQLite in WAL mode. A WAL-reset corruption bug affects 3.7.0 through 3.51.2, fixed in
  3.51.3 (2026-03-13). Ubuntu 24.04 ships 3.45.1 with no backport, so the server bundles its own.
  Litestream takes over checkpointing from a second process, the pattern the bug needs. Plain
  backups: `VACUUM INTO` or the backup API. SQLite says sites under 100K hits a day "should work
  fine".
- **Client:** IndexedDB, with writes batched into one transaction (1,000 writes: about 80 ms in one
  transaction, about 2 s as separate ones, per a vendor benchmark). Data is best effort and can be
  evicted unless `navigator.storage.persist()` is granted; Chromium decides without a prompt.
  SQLite in WASM over OPFS works in Android WebView 109+, but adds about 1 MB for little gain at our
  size.

## 5. Letting friends in

| Route | Friends need | WebSockets | Catch |
|---|---|---|---|
| Cloudflare named Tunnel | Nothing | Supported on all plans | Needs a domain on Cloudflare; idle sockets are closed, so send a heartbeat |
| Tailscale Funnel | Nothing | Not stated in the docs; should work (it is a TCP proxy), test first | Beta, ports 443/8443/10000 only, unstated bandwidth limits, `*.ts.net` names |
| Friends install Tailscale | An account and admin of their own tailnet | Yes | High friction; free plan up to 6 users |
| TryCloudflare | Nothing | Yes, no SSE | Testing only, no uptime |

A low-memory `tailscaled` build idles at 25 to 26 MiB (contributor report). `cloudflared` idle
memory: not found.

## 6. UI libraries

js-framework-benchmark, release chrome158, 2026-11-22:

| Library | Compressed size | First paint |
|---|---|---|
| Solid 1.9 | 4.5 KB | 47.5 ms |
| Preact 11 (hooks) | 5.9 KB | 60.3 ms |
| Svelte 5 | 9.7 KB | 61.8 ms |
| Vue 3.5 | 23.3 KB | 94.8 ms |
| React 19.2 | 51.4 KB | 228.9 ms |

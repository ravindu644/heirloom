# Agent 3: stack research for the Pomodoro + tasks + habits app (client, notifications, server, storage, exposure)

Fetched 2026-11-24. [S] means stated by the source. [I] means inferred.
Pages are saved under scratchpad/research/pages/agent-3/. Text extracts are in pages/agent-3-txt/.

## 1. Android: timer-end notification with the screen off

1.1 [S] Of the three exact-alarm calls, only setAlarmClock() is never adjusted by the system. It also leaves low-power modes to deliver. setExactAndAllowWhileIdle() fires "at a nearly precise time ... even if battery-saving measures are in effect". https://developer.android.com/develop/background-work/services/alarms/schedule (updated 2026-10-28)
1.2 [S] setExact, setExactAndAllowWhileIdle and setAlarmClock all need SCHEDULE_EXACT_ALARM, otherwise they throw SecurityException. The exception is setExact with an OnAlarmListener, which needs no permission. https://developer.android.com/about/versions/14/changes/schedule-exact-alarms (updated 2026-03-03)
1.3 [S] Since Android 14, SCHEDULE_EXACT_ALARM is denied by default for new installs that target 13+. The user can revoke it, and revoking it cancels all future exact alarms. USE_EXACT_ALARM is "Granted automatically, Cannot be revoked by the user ... Limited use cases". (same two pages)
1.4 [S] Google Play policy allows USE_EXACT_ALARM only when the app's core function needs precise timing: "The app is an alarm or timer app" or a calendar app. Apps that do not qualify are "disallowed from publishing on Google Play". https://support.google.com/googleplay/android-developer/answer/13161072 (fetched 2026-11-24, no date visible)
1.5 [I] A Pomodoro app is a timer app, so it should qualify. The policy only matters for Play distribution; a sideloaded APK goes through no review.
1.6 [S] In Doze, setAndAllowWhileIdle and setExactAndAllowWhileIdle "can [not] fire alarms more than once per nine minutes, per app". https://developer.android.com/training/monitoring-device-state/doze-standby (updated 2026-10-22)
1.7 [I] Firing once per pomodoro or break end stays well inside the 9-minute limit. Back-to-back 5-minute breaks while the phone stays in Doze could hit it, and setAlarmClock avoids the issue.
1.8 [S] What a real clock app does: AOSP/LineageOS DeskClock (lineage-22.2) schedules timers with `am.setExactAndAllowWhileIdle(ELAPSED_REALTIME_WAKEUP, ...)` ("Ensure the timer fires even if the device is dozing"). It declares USE_EXACT_ALARM and starts a foreground service only once a timer has expired and is ringing. https://raw.githubusercontent.com/LineageOS/android_packages_apps_DeskClock/lineage-22.2/src/com/android/deskclock/data/TimerModel.java and .../AndroidManifest.xml
1.9 [S] Foreground services: `shortService` runs for about 3 minutes only. `specialUse` needs a free-form justification that Play reviews. No FGS type covers a timer. https://developer.android.com/develop/background-work/services/fgs/service-types (updated 2026-11-16)
1.10 [I] A 25-minute foreground service is the wrong tool. Use an exact alarm plus an ordinary notification.
1.11 [S] Notification.Builder.setChronometerCountDown (API 24) shows a live countdown in the notification with no running process. https://developer.android.com/reference/android/app/Notification.Builder
1.12 [S] FCM: high-priority messages can wake a sleeping device. Messages that display a user-visible notification are "delivered without any intended delay (bypassing Doze)". Normal priority can be held until Doze ends. https://firebase.google.com/docs/cloud-messaging/android/message-priority (updated 2026-11-18)
1.13 [S] Web Push has an `Urgency: very-low|low|normal|high` header, and the default is normal. https://web.dev/articles/push-notifications-web-push-protocol (updated 2024-09-20). RFC 8030 §5.3: https://www.rfc-editor.org/rfc/rfc8030.html
1.14 [I] A push sent by the server at the end time depends on the phone having network at that moment, plus FCM and the tunnel. It is a fallback, not the main mechanism, and it breaks the "works offline" requirement.
1.15 [S] Notification Triggers (scheduled notifications for web pages) is "In developer trial (Behind a flag)". Its ChromeStatus entry was last updated 2022-09-13. The origin trial is "Complete" and the launch "Not started". https://chromestatus.com/feature/5133150283890688 and https://developer.chrome.com/docs/web-platform/notification-triggers
1.16 [I] So a PWA on its own cannot schedule a local notification on Android. The only remaining route is server push (1.14). A PWA alone fails the v1 requirement.
1.17 [S] OEM battery killers: dontkillmyapp rates Xiaomi, Samsung, OnePlus and Huawei 5/5. On MIUI, "In default settings, background processing simply does not work right". https://dontkillmyapp.com/xiaomi (undated)

## 2. Client shell

2.1 [S] Capacitor's Android support is API 24+ with WebView Chrome 60+. On Android 10+ it uses the Android System WebView. https://capacitorjs.com/docs/android. Latest releases: @capacitor/core 8.6.2 (2026-11-12) and @capacitor/local-notifications 8.3.1 (2026-08-19), per registry.npmjs.org.
2.2 [S] @capacitor/local-notifications: without SCHEDULE_EXACT_ALARM, scheduled notifications "won't be exact". The docs mention USE_EXACT_ALARM, `allowWhileIdle: true` for Doze (once per 9 minutes), and checkExactNotificationSetting(). Error OS-PLUG-LNOT-0017 reads "Scheduled as an inexact alarm instead". https://capacitorjs.com/docs/apis/local-notifications
2.3 [S] The Capacitor source calls setExactAndAllowWhileIdle when exact alarms are allowed and allowWhileIdle is set. Otherwise it silently falls back to setAndAllowWhileIdle or set(). It never calls setAlarmClock. https://github.com/ionic-team/capacitor-plugins/blob/main/local-notifications/android/src/main/java/com/capacitorjs/plugins/localnotifications/LocalNotificationManager.java
2.4 [S] Past Doze bugs: #1341 (2022-12-23, a notification 35 s to 3 min late while asleep) was closed by a merged PR. #1795 (2023-09-13) was closed during the 2026 backlog cleanup. https://github.com/ionic-team/capacitor-plugins/issues/1341 , /1795
2.5 [S] Tauri 2.0 went stable on 2024-10-02 with iOS and Android support. https://v2.tauri.app/blog/tauri-20/. Latest releases: @tauri-apps/api 2.12.5 (2026-11-16) and @tauri-apps/plugin-notification 2.8.1 (2026-11-10), per npm.
2.6 [S] The Tauri notification plugin docs do not document scheduling. https://v2.tauri.app/plugin/notification/ (updated 2026-06-15). Its Android code has `setExactIfPossible` (setExactAndAllowWhileIdle, or setAndAllowWhileIdle as a fallback), and the plugin manifest does not declare SCHEDULE_EXACT_ALARM or USE_EXACT_ALARM. https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/notification/android/src/main/java/TauriNotificationManager.kt
2.7 [I] On Tauri, alarms stay inexact unless the app adds the permission itself. The code looks ported from Capacitor's: same function name, same logic.
2.8 [S] Tauri open issues: #3550 (2026-08-24, plugin 2.3.3, Android 16) says scheduled notifications are stored as the literal "null", so they "silently disappear across a reboot", and getPending() and cancelAll() reject. #2341 (2025-01-21) says "Scheduling just doesn't work on Android in a build". #2141 (2022) requests scheduling and is still open. https://github.com/tauri-apps/plugins-workspace/issues/3550 , /2341 , /2141
2.9 [S] Expo notifications support SCHEDULE_EXACT_ALARM and USE_EXACT_ALARM ("alarm clock, timer, and calendar apps") and offer a `delivery: 'alarmClock'` trigger. https://docs.expo.dev/versions/latest/sdk/notifications/. Latest react-native is 0.88.1 (2026-10-27, npm).
2.10 [S] flutter_local_notifications supports AndroidScheduleMode.exactAllowWhileIdle and documents both permissions. https://pub.dev/packages/flutter_local_notifications. The Flutter engine adds "a few megabytes compressed" (docs reflect Flutter 3.50, updated 2026-11-23). Flutter web renders through CanvasKit or Skwasm on WebGL or WebGPU, not the DOM. https://docs.flutter.dev/resources/faq
2.11 [I] React Native and Flutter both force a different UI stack for the laptop browser: react-native-web, or Flutter's canvas renderer. That works against "web-like UI, reuse in the laptop browser, no heavy bundles". Capacitor and Tauri run the same web build that the browser loads.
2.12 APK size and cold start, same device and same method across all five shells: NOT FOUND. The only four-way numbers are https://www.oflight.co.jp/en/columns/flutter-rn-capacitor-tauri-performance (2026-03-04): Capacitor about 8 MB APK and 2.3 s cold start, RN about 12 MB and 1.8 s, Flutter about 15 MB and 1.2 s. It gives no methodology and its Tauri figures are desktop only, so treat it as unreliable.

## 3. Server runtime on arm64, kernel 4.14, 1 GiB

3.1 [S] Go 1.24+ needs Linux kernel 3.2 or later. https://go.dev/wiki/MinimumRequirements
3.2 [S] Rust aarch64-unknown-linux-gnu is Tier 1 on "kernel 4.1+, glibc 2.17+". https://doc.rust-lang.org/nightly/rustc/platform-support.html
3.3 [S] Bun: "We recommend kernel version 5.6 or higher. Bun runs on kernels as old as 3.10 (RHEL 7) with graceful degradation of newer syscalls." https://bun.com/docs/installation
3.4 [S] Node.js: the main branch lists arm64 Tier 1 at kernel >= 5.14. The v22.x branch lists arm64 at kernel >= 4.18. Footnote: "Older kernel versions may work" but "For production applications, run Node.js on supported platforms only". https://github.com/nodejs/node/blob/main/BUILDING.md , https://github.com/nodejs/node/blob/v22.x/BUILDING.md
3.5 [I] Kernel 4.14 is below every supported Node line.
3.6 Deno's minimum kernel: NOT FOUND. https://docs.deno.com/runtime/getting_started/installation/ lists Linux ARM64 builds only.
3.7 [S] Memory, hez2010 "Take 2" (data committed 2024-12-01, i7-13700K, Debian 12, one task idle): Rust tokio 4.7 MB, Go 1.23 3.6 MB, Node 23.2 41.9 MB. At 10k tasks: Rust tokio 9.0 MB, Go 34.3 MB, Node 64.8 MB. https://github.com/hez2010/async-runtimes-benchmarks-2024/blob/main/RESULT.md. The 2023 original (pkolaczk, 2023-05-21) reaches the same conclusion: "Go and Rust programs ... need very little memory". https://pkolaczk.github.io/memory-consumption-of-async/
3.8 [I, own measurement] Node 22.22.2 on x86_64 Fedora, running node:http plus node:sqlite in WAL mode: VmRSS 61 MiB idle, 72.5 MiB after 200 requests. Measured 2026-11-24. arm64 numbers would differ somewhat. I could not measure Bun, Deno, Go or axum because downloading their toolchains was denied in this session.
3.9 Idle RSS for Bun and Deno: no reliable dated source found. Sources conflict:
   - [S] Blog posts put idle Bun at about 18 to 42 MB and below Node (see web-search leads, e.g. https://www.kunalganglani.com/blog/bun-vs-node-performance-2026). Their methodology is unverified.
   - [S] Bun issue #34389 (2026-07-16, closed) points the other way: a Next.js standalone server on Bun 1.3.14 used about 670 MB idle RSS against 80 MB on Node 24 for the same build. https://github.com/oven-sh/bun/issues/34389
3.10 [S] tailscaled: a contributor's low-memory OpenWrt build "sits around 25–26 MiB RSS when connected and idle" (2026-09-26). https://github.com/tailscale/tailscale/pull/21495. Tracking issue for small devices: https://github.com/tailscale/tailscale/issues/21498. The idle RSS of a stock build: NOT FOUND.
3.11 cloudflared idle RSS: NOT FOUND. [S] An open issue reports cloudflared "grows without bounds when request rate exceeds upload bandwidth" (2024-03-14). https://github.com/cloudflare/cloudflared/issues/1205

## 4. Server storage

4.1 [S] WAL: "readers do not block writers and a writer does not block readers". "All processes using a database must be on the same host computer; WAL does not work over a network filesystem". The default auto-checkpoint is at 1000 pages. https://sqlite.org/wal.html (updated 2026-08-25)
4.2 [S] WAL-reset bug: present in 3.7.0 through 3.51.2 and fixed in 3.51.3 (2026-03-13), with backports to 3.44.6 and 3.50.7. It needs "two or more database connections ... in separate threads or processes" writing or checkpointing "at the same instant". A reproducer without the test hook was published 2026-08-24. (same page)
4.3 [S] Ubuntu 24.04 ships sqlite3 3.45.1-1ubuntu2.11 (2026-11-19). https://launchpad.net/ubuntu/noble/+source/sqlite3
4.4 [I] The changelog shows no WAL-reset backport. https://changelogs.ubuntu.com/changelogs/pool/main/s/sqlite3/sqlite3_3.45.1-1ubuntu2.11/changelog. Link a bundled SQLite of 3.51.3 or later instead of the system library.
4.5 [S] Litestream "takes over the checkpointing process". It holds a long-running read transaction and calls checkpoints itself from a separate process. https://litestream.io/how-it-works/
4.6 [I] That is the two-process checkpoint pattern from 4.2, so if Litestream is used, use SQLite 3.51.3 or later.
4.7 [S] Simpler backup options: `VACUUM INTO` makes a vacuumed copy of a live database (https://sqlite.org/lang_vacuum.html), or use the online backup API (https://sqlite.org/backup.html).
4.8 [S] Scale: "any site that gets fewer than 100K hits/day should work fine" (a conservative estimate). https://sqlite.org/whentouse.html
4.9 SQLite problems specific to kernel 4.14: NOT FOUND.
4.10 [I] WAL needs only mmap and POSIX fcntl locks, both present long before 4.14.

## 5. Client offline storage

5.1 [S] OPFS (StorageManager.getDirectory) shipped in Chrome 86 desktop and Chrome 109 Android. FileSystemFileHandle.createSyncAccessHandle shipped in Chrome 102 desktop and Chrome 109 Android. Android WebView mirrors Chrome Android. https://github.com/mdn/browser-compat-data (api/StorageManager.json, api/FileSystemFileHandle.json, main branch, fetched 2026-11-24)
5.2 [I] Capacitor and Tauri on Android, which use System WebView, get OPFS on WebView 109 or later.
5.3 [S] sqlite-wasm: OPFS works only in Worker threads. The "opfs" VFS needs SharedArrayBuffer and therefore COOP/COEP headers. Apps that "are unable to set the COOP/COEP response headers, should use the 'opfs-sahpool' VFS" (no multi-tab concurrency). https://sqlite.org/wasm/doc/trunk/persistence.md. The latest npm package is @sqlite.org/sqlite-wasm 3.54.1-build1, about 3.0 MB unpacked across all builds (npm registry).
5.4 [S] MDN on quotas: storage is best-effort by default and evicted LRU under pressure. Origins granted persistence through navigator.storage.persist() are skipped. Chromium grants or denies persist() without a prompt, based on how the user has interacted with the site. The quota is 60% of disk. Safari deletes script-written data after 7 days without user interaction when tracking prevention is on. https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria (modified 2026-01-05)
5.5 [S] IndexedDB cost is per transaction: 1k docs in one transaction took about 80 ms, one transaction per doc about 2 s. RxDB claims about 4x for OPFS over IndexedDB. https://rxdb.info/slow-indexeddb.html (undated; vendor that sells OPFS storage)
5.6 [I] A few thousand tasks, habits and sessions fit comfortably in IndexedDB with batched writes. SQLite-wasm adds about 1 MB of wasm and a worker for little gain at this size.

## 6. Exposure to the internet

6.1 [S] Tailscale Funnel is "currently in beta" and "available for all plans". Its limits:
   - Ports 443, 8443 and 10000 only.
   - TLS only, on *.ts.net names only.
   - Traffic "subject to non-configurable bandwidth limits", with no number given.
   - Public DNS can take 10 minutes to appear.
   https://tailscale.com/kb/1223/funnel (validated 2026-01-20)
6.2 [S] How Funnel works: a public relay opens a TCP proxy to the device, and tailscaled terminates TLS locally. Anyone with the URL can reach it. (same page)
6.3 [I] Friends need no app or account with Funnel.
6.4 WebSocket support through Funnel: NOT STATED in the docs. [I] It should work because Funnel is a TCP proxy, but verify it.
6.5 [S] The Tailscale Personal plan is "$0 Free forever, Unlimited user devices, Up to 6 users". https://tailscale.com/pricing
6.6 [S] Friends installing Tailscale, via node sharing: the recipient accepts an invite from any Tailscale account and "needs to be an Owner, Admin, or IT admin of a tailnet". Shared machines are quarantined, meaning they cannot start connections. https://tailscale.com/kb/1084/sharing (validated 2026-01-05)
6.7 [S] Without /dev/net/tun, tailscaled has a userspace-networking mode (`--tun=userspace-networking`, a SOCKS5 or HTTP proxy). https://tailscale.com/kb/1112/userspace-networking (validated 2025-11-12)
6.8 Funnel in userspace mode: NOT VERIFIED. [I] It is probably fine, because Funnel's traffic is terminated inside tailscaled.
6.9 [S] Cloudflare Tunnel: cloudflared makes outbound-only connections, so no public IP is needed. https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/ (updated 2026-11-18)
6.10 [S] Publishing an application needs a domain on Cloudflare: "you must add a website to Cloudflare". https://developers.cloudflare.com/.../get-started/create-remote-tunnel/ (updated 2026-06-23)
6.11 [S] Cloudflare account limits: 1,000 tunnels per account and 25 replicas per tunnel. https://developers.cloudflare.com/cloudflare-one/account-limits/ (updated 2026-11-17). The free plan's inclusion of Tunnel is not stated on the pages fetched. [I] Tunnel is widely used on the free plan.
6.12 [S] WebSockets are "supported on all Cloudflare plans". Cloudflare "may restart servers, which terminates WebSockets connections" when it releases code. It closes idle WebSockets after an unstated period and recommends a client heartbeat. https://developers.cloudflare.com/network/websockets/ (updated 2026-08-14)
6.13 [S] Cloudflare proxy timeouts: Proxy Read Timeout 125 s and Proxy Idle 900 s. https://developers.cloudflare.com/fundamentals/reference/connection-limits/ (updated 2026-11-13)
6.14 [S] Quick Tunnels (trycloudflare): no account, "for testing and development", no uptime guarantee, 200 in-flight requests, no SSE. "The visitor does not need a Cloudflare account." https://developers.cloudflare.com/.../trycloudflare/ (updated 2026-09-30)

## 7. UI library weight and speed

Source: js-framework-benchmark, release chrome158, published 2026-11-22, keyed results, medians computed from results.ts. https://github.com/krausest/js-framework-benchmark/releases/tag/chrome158

| framework | size, compressed | first paint | create 1k rows | swap rows | memory after run |
|---|---|---|---|---|---|
| Solid 1.9.3 | 4.5 KB | 47.5 ms | 21.1 ms | 12.3 ms | 2.7 MB |
| Preact hooks 11.0.0 | 5.9 KB | 60.3 ms | 25.1 ms | 23.1 ms | 3.3 MB |
| Svelte 5.42.1 | 9.7 KB | 61.8 ms | 21.7 ms | 12.8 ms | 2.9 MB |
| Vue 3.5.39 | 23.3 KB | 94.8 ms | 23.7 ms | not extracted | 3.9 MB |
| React hooks 19.2.0 | 51.4 KB | 228.9 ms | 24.6 ms | 87.4 ms | 4.4 MB |

7.1 [S] The numbers in the table above. [I] Bundlephobia (react-dom 19.3.1 at 1.5 KB gzip) is misleading: it measures only the package entry point, while the renderer lives in react-dom/client. Use the benchmark's numbers instead.
7.2 [I] For "instant" on mid-range Android, the gap that matters is React's roughly 50 KB and roughly 4x first paint. Solid, Preact and Svelte are within noise of each other.

## Ranked recommendation per layer (all [I])

- **Timer-end notification:**
  1. Schedule a local exact alarm when the pomodoro starts. Use setExactAndAllowWhileIdle, or setAlarmClock for guaranteed timing, with USE_EXACT_ALARM, since a timer app qualifies under the Play policy. Show a chronometer countdown notification. No foreground service.
  2. Server Web Push or FCM at the end time, only for the laptop browser or as a backup.
  3. Not viable: a PWA alone, or a foreground service.
- **Client shell:**
  1. Capacitor 8. The same web build runs in the laptop browser, local-notifications is mature, exact alarms work, and iOS and desktop (Electron or a plain PWA) stay possible. Declare USE_EXACT_ALARM in the app manifest, because the plugin falls back to inexact silently.
  2. Tauri 2. It is the better path to desktop later, but its Android notification scheduling has open breakages (#3550, #2341) and needs Rust.
  3. React Native/Expo or Flutter. Both have good notifications but no web-UI reuse.
  4. A PWA alone fails v1 on Android.
- **Server runtime:**
  1. Go. Supported on 4.14, about 4 MB baseline, one static binary, a pure-Go SQLite driver is possible.
  2. Rust with axum. Supported on 4.14, about 5 MB baseline, slower to build.
  3. Bun. It runs on 4.14 "with graceful degradation", and its memory data conflicts.
  4. Node. Unsupported below kernel 4.18 or 5.14, about 42 to 62 MB idle.
  - Deno: unknown on this kernel.
- **Server storage:** SQLite in WAL mode with one writer connection in the server process, and a bundled SQLite of 3.51.3 or later. Back up with a nightly `VACUUM INTO` copied off the phone. Add Litestream only if you need continuous replication, and then the 3.51.3 requirement is firm.
- **Client storage:** IndexedDB with batched transactions plus navigator.storage.persist(). Use sqlite-wasm with opfs-sahpool only if SQL queries on the client are wanted.
- **Exposure:**
  1. Cloudflare named Tunnel, if you own a domain. Friends need nothing, WebSockets are supported, and you add a heartbeat and reconnect logic.
  2. Tailscale Funnel, if you have no domain. Free, but beta, with unpublished bandwidth limits and WebSocket support undocumented, so test it.
  3. Friends install Tailscale. Every friend needs an account and admin rights on their own tailnet, which is high friction.
  - TryCloudflare is for testing only.
- **UI library:**
  1. Solid or Preact.
  2. Svelte 5.
  3. Vue.
  4. React (about 51 KB compressed, about 229 ms first paint in the benchmark).

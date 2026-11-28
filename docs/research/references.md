# References and fact-check

All fetched 2026-11-24. The full per-claim source lists, with dates and saved file names, were in
the raw agent reports, now in git history (docs/research/raw/). Saved page copies are kept outside
the repository (they are other people's work).

## Primary sources

**Focus To-Do**
- Official site: https://www.focustodo.cn/
- Google Play: https://play.google.com/store/apps/details?id=com.superelement.pomodoro
- iOS App Store (with version history): https://apps.apple.com/us/app/focus-to-do-focus-timer-tasks/id966057213
- Mac App Store: https://apps.apple.com/us/app/focus-to-do-pomodoro-tasks/id1258530160?mt=12
- 3,537 Play reviews (store review endpoint) and 665 US App Store reviews (Apple's review RSS)
- MakeUseOf, 2025-11-13; Wildcat Tribune, 2020-03-25; goalsandprogress.com (prices "as of February 2026"); AlternativeTo; JustUseApp

**Pomodoist**
- Source: https://github.com/Kabanya/Pomodoist at `0dbf40bd` (2026-11-20): `apps/flutter/lib/domain/models/`, `apps/flutter/lib/data/services/sync/`, `apps/flutter/lib/ui/core/localization/app_en.arb`, `server/README.md`
- Site and pricing article: https://pomodoist.com/ , https://pomodoist.com/pricing-comparison

**Motivation**
- Cirillo, *The Pomodoro Technique* v1.3 (2007), mirrored copy: https://www.faasafety.gov/files/events/SO/SO15/2024/SO15134204/Cirillo_--_Pomodoro_Technique.pdf
- Sailer & Homner 2019: https://doi.org/10.1007/s10648-019-09498-w (abstract)
- Harkin et al. 2016: https://doi.org/10.1037/bul0000025
- Etkin 2016: https://doi.org/10.1093/jcr/ucv095
- Gollwitzer & Sheeran 2006: https://doi.org/10.1016/S0065-2601(06)38002-1 (abstract)
- Kivetz, Urminsky & Zheng 2006: https://doi.org/10.1509/jmkr.43.1.39 ; Nunes & Drèze 2006: https://doi.org/10.1086/500480 (abstract)
- Biwer et al. 2023: https://doi.org/10.1111/bjep.12593 (abstract); Albulescu et al. 2022: https://doi.org/10.1371/journal.pone.0272460
- Deci, Koestner & Ryan 1999: https://doi.org/10.1037/0033-2909.125.6.627 ; Cameron & Pierce 1994: https://doi.org/10.3102/00346543064003363 (abstract)
- Silverman & Barasch 2023: https://doi.org/10.1093/jcr/ucac029 ; Moldon et al. 2021: https://arxiv.org/abs/2006.02371 ; Sharif & Shu 2021 (UCLA copy of the paper)
- Duolingo: https://blog.duolingo.com/improving-the-streak , https://blog.duolingo.com/how-duolingo-streak-builds-habit/ , https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals , https://blog.duolingo.com/product-lessons-friend-streak/
- Bond & Titus 1983: https://doi.org/10.1037/0033-2909.94.2.265 (abstract); Franken et al. 2022: https://doi.org/10.1016/j.socnet.2022.10.001 (abstract); STEP UP, Patel et al. 2019: https://doi.org/10.1001/jamainternmed.2019.3505 (abstract); Park & Kim 2021: https://pmc.ncbi.nlm.nih.gov/articles/PMC8097522/ ; Gürel et al. 2020: https://doi.org/10.1037/xge0000733 ; Hanus & Fox 2015: https://doi.org/10.1016/j.compedu.2014.08.019 (summary only)
- Diefenbach & Müssig 2019 (Habitica): https://epub.ub.uni-muenchen.de/77668 ; Todoist Karma: https://todoist.com/help/articles/introduction-to-karma-OgWkWy ; Forest: https://forestapp.cc/llms-full.txt

**Sync**
- Toggl Track API: https://engineering.toggl.com/docs/track/api/time_entries/ ; v8: https://github.com/toggl/toggl_api_docs/blob/master/chapters/time_entries.md
- Actual Budget source: https://github.com/actualbudget/actual (`packages/crdt/src/crdt/timestamp.ts`, `packages/sync-server/src/sync-simple.js`, `packages/loot-core/src/server/sync/index.ts`); docs: https://actualbudget.org/docs/getting-started/sync/
- Todoist API: https://developer.todoist.com/api/v1/
- Figma: https://www.figma.com/blog/how-figmas-multiplayer-technology-works/
- Replicache: https://doc.replicache.dev/concepts/how-it-works ; Ink & Switch: https://www.inkandswitch.com/essay/local-first/ ; Kingsbury: https://aphyr.com/posts/299-the-trouble-with-timestamps ; Kleppmann: https://martin.kleppmann.com/2020/07/06/crdt-hard-parts-hydra.html
- TickTick: https://help.ticktick.com/articles/7055782010496745472 ; Clockify: https://clockify.me/help/troubleshooting/cant-stop-the-timer ; Yjs awareness: https://github.com/yjs/y-protocols/blob/master/src/awareness.js

**Stack**
- Android alarms: https://developer.android.com/develop/background-work/services/alarms/schedule ; Android 14 exact alarms: https://developer.android.com/about/versions/14/changes/schedule-exact-alarms ; Doze: https://developer.android.com/training/monitoring-device-state/doze-standby
- Play policy on exact alarms: https://support.google.com/googleplay/android-developer/answer/13161072
- Chrome Notification Triggers: https://chromestatus.com/feature/5133150283890688
- Capacitor local notifications: https://capacitorjs.com/docs/apis/local-notifications and its source; Tauri notification plugin issues #3550, #2341
- Go requirements: https://go.dev/wiki/MinimumRequirements ; Node BUILDING.md (main and v22.x); memory benchmark: https://github.com/hez2010/async-runtimes-benchmarks-2024
- SQLite WAL bug: https://sqlite.org/wal.html ; Ubuntu noble sqlite3: https://launchpad.net/ubuntu/noble/+source/sqlite3
- Tailscale Funnel: https://tailscale.com/kb/1223/funnel ; Cloudflare WebSockets: https://developers.cloudflare.com/network/websockets/
- js-framework-benchmark chrome158: https://github.com/krausest/js-framework-benchmark/releases/tag/chrome158

## Fact-check table

✅ checked: seen by the lead in the saved source. ⚠️ reported: a user review, a company's claim
about itself, or a source read only as an abstract. ❌ not confirmed: left out.

| Claim | Status | Note |
|---|---|---|
| Focus To-Do: 4.6 stars, 290K reviews, 10M+ downloads | ✅ | Play page |
| Focus To-Do iOS prices: Lifetime $11.99, 3 Months $3.99, Premium $1.99; "Contains Messaging and Chat" | ✅ | iOS page |
| "Last 30 Days" ranking and member removal in iOS **8.4 (2023-10-27)** | ✅ | The agent's report said 8.3; the version history says 8.4. Corrected |
| Full-screen timer and extend time in iOS **8.6 (2024-10-09)** | ✅ | The agent's report said 8.5. Corrected |
| Report history page, monthly focus widget, iOS 8.9 (2026-11-13) | ✅ | iOS page |
| Quotes: "who else is currently studying", "heat map", "we sold by platform", "just top 3 ranking user", "150+ day streak", "vibecoded", "Great synchronization across platforms" | ✅ | Found in the saved review data |
| 178 of 2,000 recent reviews mention the paywall | ⚠️ | The agent's keyword count; rough by its own note |
| Custom timer length locked after the trial | ⚠️ | Many reviews; the exact locked values conflict |
| Forest sunlight caps 800 g or 480 g | ⚠️ | Reviews disagree |
| Groups free, or group time needing premium sync | ⚠️ | Two reviews conflict |
| Why the mod APKs broke | ❌ | Not found; left out |
| Pomodoist needs 4 GB RAM and 40 GB disk | ✅ | `server/README.md` |
| Pomodoist timer fields and achievement names | ✅ | Source code |
| Pomodoist prices $4.99, $29.99, $89.99 | ✅ | pricing-comparison page |
| Toggl running entry has a negative duration | ✅ | Toggl v8 and v9 docs |
| Actual Budget allows 5 minutes of drift, server refuses the future | ✅ | `timestamp.ts` (`maxDrift: 5 * 60 * 1000`), `sync-simple.js` |
| Todoist `tmp-` placeholder ids and command UUIDs | ✅ | Todoist API page |
| Figma needs no timestamps because the server orders events | ✅ | Figma blog |
| Forest Plant Together: one leaves, everyone's tree dies | ✅ | Forest how-to PDF and llms.txt |
| Replicache "poke" | ✅ | Replicache docs |
| No timer product documents the two-offline-devices rule | ✅ | Absence across Toggl, Clockify, TickTick, Forest docs |
| Linear's sync engine details | ⚠️ | Third-party reverse engineering |
| Actual Budget idles under 100 MB | ⚠️ | Third-party Railway guide |
| Play allows USE_EXACT_ALARM for "an alarm or timer app" | ✅ | Play policy page |
| Notification Triggers "In developer trial (Behind a flag)" | ✅ | ChromeStatus JSON |
| SQLite WAL bug 3.7.0 to 3.51.2, fixed 3.51.3 | ✅ | sqlite.org/wal.html |
| Node arm64 needs kernel 4.18+ (v22) | ✅ | Node v22 BUILDING.md |
| Go needs kernel 3.2+ | ✅ | Go wiki |
| Doze: allow-while-idle alarms at most once per 9 minutes | ✅ | Capacitor docs and Android Doze page |
| Tailscale Funnel ports 443, 8443, 10000 | ✅ | Tailscale KB |
| Idle memory: Go 3.6 MB, Rust 4.7 MB, Node 41.9 MB | ⚠️ | One benchmark, x86, 2024 |
| Bun idle memory | ❌ | Sources conflict; left out of the decision |
| Sailer & Homner g = .49 / .36 / .25 | ✅ | Abstract |
| Biwer 2023: 24/6 breaks, less fatigue, same completion | ✅ | Abstract |
| Harkin d = 0.40 over 138 RCTs | ✅ | Paper |
| Cirillo: "as if it had never been set", "ring anxiety" | ✅ | Cirillo's paper |
| Duolingo +3.3% day-14, Weekend Amulet +4%, Friend Streak 22% | ⚠️ | Company's own numbers about itself |
| STEP UP competition +920 steps | ✅ | Abstract (number checked in the agent's saved copy) |
| Hanus & Fox 2015, leaderboard lowered motivation | ⚠️ | Only a summary of the abstract was reachable |
| Focusmate "143%" | ⚠️ | Company survey, no control group |

## What could not be reached

- Reddit (login wall and tool restrictions). No Reddit claims are used.
- YouTube captions (empty tracks); only descriptions.
- Full texts behind ScienceDirect, Springer, Wiley, JAMA: abstracts used, marked above.
- Francesco Cirillo's current website (404); the 2007 paper used instead.
- Bun, Deno, Go and Rust memory could not be measured locally (toolchain downloads were blocked);
  section 0 of the roadmap measures the real server.

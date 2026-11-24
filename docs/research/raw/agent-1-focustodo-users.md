# Focus To-Do: what users got, what they paid for, how groups worked (agent-1)

Research date 2026-11-24. Saved pages are in `.../scratchpad/research/pages/agent-1/` (written as `pages/` below).
S = stated by source. I = inferred by me. Unless noted, dates are the source's own dates.

## Sources and coverage
- Google Play listing, `https://play.google.com/store/apps/details?id=com.superelement.pomodoro`, fetched 2026-11-24 (`pages/play-us.html`, `.txt`).
- Google Play reviews: 3,537 unique reviews (en/US) pulled from the store's own review endpoint, saved in `pages/play-reviews-{relevant,newest,1star,2star}.json`. They have no per-review URLs, so each one is cited as "Play review YYYY-MM-DD, N stars". The newest-2000 sample covers 2025-08-15 to 2026-11-23. 1 and 2 star reviews were deliberately oversampled in the other files.
- iOS App Store, `https://apps.apple.com/us/app/focus-to-do-focus-timer-tasks/id966057213` (`pages/appstore-ios-us.html`), with the CN storefront for the original Chinese release notes (`pages/appstore-ios-cn.html`).
- Mac App Store, `https://apps.apple.com/us/app/focus-to-do-pomodoro-tasks/id1258530160?mt=12` (`pages/appstore-mac-us.html`, `appstore-mac-cn.html`).
- App Store reviews: 665 US reviews (2017-03 to 2026-11) from Apple's customer-review RSS feed, `https://itunes.apple.com/us/rss/customerreviews/page=N/id=966057213/sortby=mostrecent/json` (`pages/appstore-reviews-us.json`).
- Articles: MakeUseOf 2025-11-13 (`pages/makeuseof-free-focus-to-do-app.txt`), Wildcat Tribune 2020-03-25 (`pages/wildcattribune-2020.txt`), goalsandprogress.com (pricing "as of February 2026", `pages/goalsandprogress-review.html`), JustUseApp (`pages/justuseapp-reviews.txt`), AlternativeTo and Chrome Web Store (`pages/alternativeto-and-chromestore.txt`).
- **Reddit was not read (gap).** reddit.com is refused by the search tool ("domains not accessible"), curl gets a login wall, and the browser extension says "not allowed due to safety restrictions". The report contains no Reddit claims.
- **YouTube: descriptions only.** Caption tracks came back empty (`pages/youtube-notes.txt`). The "joining a group via a group code" video in search results is for a different product ("bulb"), so I discarded it.
- Kimola's review-analysis page returns 410 Gone, so it is not cited.

## 1. Identity, scale, status
- S: On Play the developer is "SuperElement Soft". The contact is a Shenzhen address. Rated 4.6 from 290K reviews, 10M+ downloads (the raw count in the page JSON is 11,867,980), updated Nov 11, 2026. Play listing, fetched 2026-11-24.
- S: On the App Store the seller is "Shenzhen Tomato Software Technology Co., Ltd." with "© 2015 SuperElement Inc". Rated 4.8 from 14,757 ratings. The age rating says "Contains Messaging and Chat". iOS App Store, fetched 2026-11-24.
- S: The Chrome extension is v7.1.1, updated 2025-12-04, rated 4.8 from 14.5K ratings, with 500,000 users. Chrome Web Store via WebFetch.
- S: The listing claims "Users have been focused on our app for 200 million hours". Play and App Store descriptions.
- S: Platforms are Android, Wear OS, iPhone, iPad, Apple Watch, Mac, Windows and Chrome. Play listing; AlternativeTo (listed 2025-10-22).
- Company news (acquisition, shutdown, rebrand) for 2024-2026: **not found**.

## 2. Prices (Premium)
Current store prices, fetched 2026-11-24:
- S: iOS US in-app purchases are "Lifetime $11.99", "3 Months $3.99" and "Focus To-Do Premium $1.99". The page does not say what period the $1.99 item covers. iOS App Store.
- S: Mac US in-app purchases are "Lifetime $11.99", "3 Months $3.99" and "Focus To-Do Premium $3.99". Mac App Store.
- S: Play US shows the in-app range "$1.99 - $11.99 per item". Play listing, page JSON.

Third-party price statements (these conflict, so all are listed):
- S: "$1.99/month ($23.88/year), $9.99/year, or $11.99 for a lifetime license (pricing as of February 2026)". goalsandprogress.com. **Conflict:** no store listing shows a $9.99 yearly item.
- S: "One time purchase that costs $12", with subscriptions at about $1-2 a month. AlternativeTo, 2025-10.
- S: "Premium is $2.99 every three months and $17.99 for a lifetime." Wildcat Tribune, 2020-03-25.

Historical prices from user reviews (each is S for the review):
- iOS review 2017-04-26: "$0.99".
- Play 2019-04-11: "price for the premium had jumped from a reasonable 2€ to 9€".
- Play 2019-04-24: "The cost for lifetime is £9".
- Play 2020-08-19: "$8.99 + tax".
- Play 2021-02-08: "$3 per 3 months or $9 for lifetime".
- Play 2021-04-07: "nearly $20 for lifetime".
- iOS 2021-05-11: "best $9 i've ever spent".
- iOS 2024-02-10: "I wish I could get my $11 back".
- Play 2026-09-21: "I'm out $11.99".

Platform scope of a purchase:
- S: Premium was sold per platform. The developer replied on Play (2018-09-28): "You need purchase the mobile premium version again, we sold by platform. There are 4 platform for our app: android, iPhone, Mac, Windows".
- S: Users still report this in 2022 and 2025. Play 2022-12-26: "you have to purchase in every platform to use the sync feature". Play 2025-03-29: "wish they were more clear about having to buy premium for each platform you want to sync".
- S: Neither tier shows ads. Recent examples: Play 2025-10-08 "no ad distraction" and Play 2023-02-11 "No ads". AlternativeTo lists the app as "Ad-free".
- Pricing change in 2024-2026: **not found** in any store listing. Lifetime is $11.99 everywhere that was checked.

## 3. Free vs Premium split
Neither store listing marks which features are premium. The split below comes from reviews and articles.
- S: New installs get about 3 days of premium. Features then lock, and users say they were not told it was a trial. Play reviews:
  - 2019-04-24: "end of the 3 day premium trial".
  - 2020-04-12: "First 3-days you have access to statistics".
  - 2020-06-16 (213 helpful votes): "the app gives you a premium demo, but it doesn't tell you until the demo expires".
  - 2025-08-04: "only three days free trial".
  - 2026-01-25: "after using two days, it locked all features".
- **Custom pomodoro and break length** (S, the most frequent complaint in 2025-26):
  - Play 2018-11-01: "pay to change ... break and study times".
  - Play 2020-06-16: timer stuck at the 3 minutes set during the trial.
  - Play 2022-01-31: "can't even set break or pomodoro timing".
  - Play 2026-09-17: "changing the length of a pomodoro requires a premium subscription".
  - Play 2025-11-10: "Cant change the pomodoro from 45 min to something else".
  - Conflicting specifics: Play 2021-08-06 says "more than 30 min" is locked, Play 2025-01-04 says "can't increase more then 10 minutes", and Play 2026-09-07 says locked "above 50 mins". I: the free timer appears to freeze at whatever value was set during the trial.
- **Sync and cloud backup** (S):
  - Developer reply on Play, 2019-08-03: "backup data to the cloud is a premium feature".
  - Wildcat 2020: premium "allow[s] for Cloud backup and synchronizing data".
  - Play 2025-09-07: "why is the sync feature only available for premium users".
  - Play 2026-06-01: "every basic feature is locked, Even Syncing".
- **Recurring tasks and reminders** (S): Play 2019-04-30 "(tasks reminders and repeat frequency are premium)", Play 2020-07-28, Play 2022-03-07, Play 2025-11-19 "No repeat option".
- **Reports and statistics** (S):
  - Play 2020-05-08: the task-distribution "pie chart ... is premium only".
  - Play 2024-01-05: "statistics, tags for tasks, strict mode" are paid.
  - Play 2025-11-19: "no weekly/monthly report".
  - goalsandprogress: free has "basic statistics", premium has "detailed analytics with charts".
- **White noise and alarm sounds** (S):
  - Play 2021-01-11: "All the very nice working and break time sounds has been moved to premium".
  - Play 2024-10-27: "no good white noise".
  - Play 2026-07-11: "background noises ... I can't access later in the free version".
  - Wildcat 2020: premium gives "a wider range of white noises and alarms sounds".
- **Tags, folders, themes and wallpapers, calendar view** (S): Play 2022-02-15 (tags, background music, wallpapers), Play 2025-11-19 (folders), Play 2021-11-11 (calendar came with the 90-day plan), iOS 2024-02-10 (custom wallpaper for premium only).
- **Strict mode and app blocking** (S): Play 2020-07-11 "please make app block a free feature"; Play 2024-01-05.
- **Turning off the end-of-pomodoro vibration** (S): Play 2024-01-05 "premium is necessary to remove the vibration after a pomodoro".
- **Free after the trial:**
  - Default timer, tasks, projects, subtasks and basic stats (S: goalsandprogress).
  - Groups, ranking and forest (I, from Play 2023-09-30: forest and "ranking board ... was the highlight of free version").
- **Conflict:**
  - iOS review 2025-12-02 says "Thank you for not paywalling this app". I: either iOS is less gated or the reviewer was still in the trial.
  - MakeUseOf 2025-11-13 says premium "unlocks a few extra features".

## 4. Group, social and ranking features
- **Timeline** (S, unless marked I):
  - Groups and forest are present on Android by early 2019. Play 2019-03-13 mentions the "introduction of forest". Play 2019-05-31 (v7.7) says "Groups gone?? I cannot go to groups anymore in this update".
  - iOS 7.2 (2021-01-29): "Fix bug of the forest ranking".
  - iOS 8.3 (2023-09-17): "Added 'Last 30 Days' ranking. Group support for user deletion." (CN text: 新增"近30天"排行榜 / 小组支持删除用户). iOS version history.
  - Mac 7.2 (2025-12-04): "Added Groups, Leaderboard, and Forest features". Mac version history.
  - Before that, groups were mobile-only. Play 2021-03-14: "please provide some features as Groups, Ranking and Forest to Desktop version".
  - The Chrome extension has them by 2026 (iOS review 2026-03-02, quoted below). I: the exact first release of groups is **not found**, but it was before May 2019.
- **Joining** (S):
  - Join by group code. Play 2026-01-28: "improve the group search ... search by name not just group code".
  - Public groups exist. Play 2023-07-09: "it's hard to find active groups. I found one for myself with 15 members. If they group has 100 members, its probably having 80 bot users".
  - Play 2022-08-12: "group info/bio ... is essential to access before deciding to join, rather than joining blindly".
- **What members see** (S):
  - iOS review 2026-03-02 (same text on Play 2026-04-08, desktop and extension): "Study groups show who else is currently studying"; "Displays each person's cumulative focus hours for the day"; "Ranking system to compare your progress with others".
  - Members are ranked by focus time. Play 2023-07-09: "they get ranked according to the amount of time they focus".
  - There are week slots too (Play 2020-05-24) and "Last 30 Days" (iOS 8.3).
- **Tree-size ranking** (S): Wildcat 2020-03-25: "The size of your sapling is ranked along with the saplings of your group members" and there is "ranking for the amount of focus time and the size of the tree".
- **Global ranking** (S):
  - MakeUseOf 2025-11-13: "how your total Pomodoro hours compare to those of other people around the world ... those top-10 rankings".
  - Play 2026-11-23: "my rank in global is too low".
  - iOS 2025-01-03: the ranking "says it updates every hour, but there's no way".
- **Group chat** (S):
  - Wildcat 2020: "find motivated friends to chat with".
  - Play 2021-03-08: "in the chat segment we don't get a notification".
  - Play 2024-08-27: "need to add notifications on group messages so you can be notified when your friend is studying and wants you to join them".
  - JustUseApp: "we can't block people from the group chats".
  - The App Store age rating says "Contains Messaging and Chat".
- **Admin rights** (S):
  - Developer reply on Play, 2020-01-06: "just top 3 ranking user can edit the group. And you didn't need to delete the group, the group will deleted automatically."
  - Play 2020-04-05: the creator "can't remove others", with a request for private, invite-only groups. Fixed for removal in iOS 8.3, 2023.
- **Moderation** (S): Play 2021-06-04: a group showed "a full frontal pic of a naked female".
- **Opt-out** (S): social features can be hidden. Play 2026-02-10: "I can hide the leaderboard and social functions". Play 2026-06-03 and Play 2026-09-30 say the same.
- **Shared projects, shared task lists, or seeing other members' task names: not found** in any source. I: groups share focus time and presence, not tasks.
- **Group and sync** (S): Play 2026-03-30 says "syncing is a premium option. when You're in a group and you focus for hours. it doesn't sync so you're leaved with 0 minutes!!" I: a free user's group totals may depend on premium sync. The evidence is one review, and it conflicts with Play 2023-09-30, which calls ranking a free feature.
- **Praise for groups** (S):
  - Play 2020-07-11 (80 helpful): "it helps me create that competitive environment with those ranks, and specially groups, I always try to be on top in the groups".
  - Play 2021-01-22: "the group function helps me to be more motivated (trying to be the first among me friends)".
  - Play 2023-01-08: "The best thing in it is the groups and the competition amoung the members".
  - Play 2024-11-17: "their are study groups in here which is awesome".
- **Group and ranking bugs** (S):
  - Wrong hours. Play 2025-11-27: "I've read only 5 hours while in the dashboard of the group it constantly shows 9 & half hours". Play 2026-03-20: "it was showing 29 hours in group and people were asking me that am i a bot". iOS 2026-05-26: "the score and the ranking were down".
  - Slow or blank loading: Play 2020-09-09, 2023-01-22, 2023-04-27 ("10 sec or more to open groups"), 2025-05-12, 2026-02-23.
  - Lost groups. Play 2026-05-30: "After updating the app, all the groups I had joined and all the hours ... disappeared".
- **Dislike of groups** (S):
  - JustUseApp: "very unnecessary to have a ranking system and a plant thing".
  - iOS 2020-06-30: an alternative was better "bc it did not have the group things or the stupid tree thing".
  - Play 2022-08-12: "ranking and forest isn't the most motivating".

## 5. Motivational mechanics
- **Forest** (S): "Turn your focused moments into a lovely plant ... generate sunlight for the plant, and grow with the plant". Play listing. It is not in the iOS listing text, but iOS release notes refer to "forest ranking".
- **Sunlight economy** (S):
  - Sunlight comes from completed pomodoros and tasks and must be tapped to collect. Play 2019-04-05: "if you complete a task you can earn sunlight which will help to grow your sapling". Play 2022-01-03: "Sunlight dissapears randomly, is not counted when clicked".
  - Daily caps conflict. Play 2021-01-22 says "you can only collect up to 800g". Play 2021-08-23 says "max 480".
  - There is a share bonus. Play 2023-10-26: "the 40g sunlight of sharing".
  - The plant has levels: "my LVL in forest" (Play 2019-05-31), "the same level tree" (Play 2022-10-11).
  - It is slow by design. Play 2026-02-10: "(very slow growing tree) ... a delay in gaining points so you keep coming back".
- **Daily login streak** (S):
  - The streak feeds a daily sunlight bonus. Play 2020-06-18: "a daily streak of 90 days, but I'm only getting a daily sunlight bonus of 80×6".
  - Play 2021-08-23: "Continuous login stats changed from 600 over days to 31".
  - Streak resets are a repeated grief point: Play 2022-10-11 (22 to 4 days after a timezone change); iOS 2022-11-16 "150+ day streak and it erased itself"; JustUseApp "streak in Forest had been reset to zero after many months".
  - I: the streak counts logins, not met study goals.
- **Reports** (S, Play and App Store listings): "Gantt Chart of the Focus Time", "Trend chart of the completed To Do and the focus time", "Statistics on time distribution of project", "Daily/Weekly/Monthly Report", "View all of your tracked time in a calendar view". Later additions:
  - Year dimension in iOS 8.3 (2023).
  - "New report history page" and "monthly focus time widget" in iOS 8.9 (2026-11-13).
  - Day timeline. Play 2023-07-15 complains about its 4-hour gaps; iOS 2026-03-02 says "Timeline view displays each session".
- **Heatmap: not found.** iOS 2025-01-16 asks for one: "wish it also had a heat map and would show the longest streak you have met your study hrs goal just like in anki". I: there was no heatmap at that date.
- **Daily focus goal** (S): Play 2026-10-21: "why daily focus goal is just multiple of 1 hr".
- **Estimated pomodoros per task** (S): "Estimated Pomodoro Number: Estimate the workload or set a goal". Listings.
- **Achievements and badges: not found.** Play 2023-02-14 asks for "periodical achievement rewards".
- **Strict mode and app whitelist** (S): Play listing "App Whitelist"; iOS 7.3 (2021-08-02) "Strict mode"; iOS 8.7 "app blocking feature during timing periods".
- **The bell as a cue** (S): iOS 2019-07-23: "the sound of the bell really does ping my brain to move to the next task".

## 6. What users praise
Counts are from the Play newest-2000 sample (2025-08 to 2026-11, 84% 4-5 stars), using keyword matches (I: rough).
- Students and exams: 261 mentions, 240 of them 4-5 stars. Example: Play 2025-09-30, "proven best for my JEE Preparation".
- Statistics and reports: 68 mentions, 58 of them 4-5 stars.
  - iOS 2020-03-31: "It makes me feel proud to see what I've accomplished".
  - iOS 2021-08-12: "It's satisfying to see all the past task done and the hours of effort you put".
  - MakeUseOf 2025-11-13: "My favorite part ... is the reporting dashboard".
- White noise and sounds: 69 mentions, 57 of them 4-5 stars. Example: Play 2026-09-03, "my little emotional support 25 minute countdown!!! i love the white noise options".
- No ads: 14 explicit praises. Play 2025-09-09 argues ads "would be a distraction" for ADHD users.
- ADHD fit: 12 mentions, all 4-5 stars. iOS 2023-04-29: "Simply being able to mark each task as done is so rewarding!"
- Lifetime pricing instead of a subscription:
  - iOS 2019-07-23: "reasonable one-and-done payment for lifetime premium".
  - Play 2020-07-02: "glad for the option to, in essence, buy the app rather than pay for a subscription".
- Sync, when it works:
  - Play 2025-01-24 (447 helpful, the top Play review): "Great synchronization across platforms".
  - MakeUseOf: "never encountered conflicting data".
  - One limit: a running timer is not mirrored between devices. Play 2024-03-15: "starting the timer on one device does not show the timer in progress on another device".

## 7. What users complain about
- **Paywall after the trial** (S): 178 of 2000 recent reviews mention premium, subscription or trial; 79 of those are 1-2 stars. Example: Play 2026-05-27, "Custom time of pomodoro is a Premium feature ... after 3 days, removed all features".
- **Paid but not unlocked, and no support reply** (S): Play 2023-11-18, 2025-04-30, 2025-06-12 (lifetime not honoured on a new phone), 2026-07-14, 2026-09-14, 2026-09-21. There are 24 support-unresponsive mentions in the recent sample.
- **Sync failures, even for paying users** (S): Play 2019-09-01, 2020-04-11, 2021-08-20 ("Different information in each device"), 2024-03-01, 2026-07-04 (tablet "says it's synced but the screen is blank"); iOS 2024-02-10.
- **Data loss** (S):
  - iOS 2025-11-10: after the DST change "ALL my data, notes, tasks were GONE", and support took 6 days to answer.
  - Play 2025-04-16: "My entire study data has been deleted".
  - Play 2026-06-20: "Updated the app and lost all my tasks".
  - Free users lose data on logout or reinstall because cloud backup is premium (developer reply on Play, 2019-08-03).
- **Timer stops in the background or alarms don't fire** (S): Play 2024-03-10, 2026-04-19 ("timer stopped running in the background even if I allowed it"), 2026-07-18; iOS 2025-08-13. Also Play 2023-04-01 and Play 2026-10-11 (task reminder makes no sound).
- **Nagging** (S):
  - Play 2020-10-26: "pop up after pop up telling me to review on every timer end".
  - Play 2019-03-28: daily and weekly report notifications "will not go away".
  - Play 2025-11-12: a persistent timer notification.
- **Regressions in late 2026** (S): Play 2026-10-17 (v17.9): "-ve pomodoro counts, problems with day tracking ... focus hours lost". Play 2026-10-12: "you've vibecoded that last update ? So the app is broken now ?"
- **Clutter and learning curve** (S): Wildcat 2020 says it is "confusing for first-time users". goalsandprogress says "can feel cluttered on smaller phone screens". JustUseApp has "Nice app, cluttered interface".
- **Battery** (S): Play 2021-01-22, 2024-05-26, 2025-01-23.
- **Desktop parity** (S): Play 2021-02-13 (no tags or folders on Mac and Chrome); Play 2025-01-23 ("asking for dark mode on PC for 3+ years").

## 8. Changes 2024-2026 (store release notes)
- S, iOS:
  - 8.5 (2024-09-20): new full-screen timer, extend time during the timer, volume control.
  - 8.7 (dated 2025-02-01): "Added app blocking feature during timing periods", always-on display on Apple Watch.
  - 8.8 (2026-09-21): bug fix.
  - 8.9 (2026-11-13): "New report history page", "monthly focus time widget", "New timer design".
- S, Mac:
  - 7.0 and 7.1 (May-June 2024): timing fixes.
  - 7.2 and 7.3 (2025-12-04 and 2025-12-22): dark mode, Groups, Leaderboard, Forest, search.
- S, Android "What's new" (Play, updated 2026-11-11): "adjust the opacity of the floating Pomodoro timer window", "Improved syncing". Reviews show Android versions 16.x (early 2026) to 18.0 (2026-10 and 2026-11).
- Features removed in this period: **not found**. Price changes in this period: **not found**.

## 9. "Premium mod" APKs (context for the student's story)
- Search snippets list "Premium Unlocked" and "解锁高级版" (premium unlocked) builds for v13.4, v14.8, v16.3 and v17.5 on mod and download sites (modyolo.com, liteapks.com, yxssp.com, myqqjd.com). **Leads only, not visited** (untrusted sites).
- Why mods stopped working: **not found**. I: cloud backup, sync, and the premium flag are tied to the account on the server. The developer offered, on Play 2019-07-08, to "unlock the premium for you" by email, and purchases are bound to account and platform. A client-side patch would therefore not unlock sync or keep group totals.

## 10. Design-relevant facts for the reader (all I, derived from the S items above)
- The social layer was focus-time leaderboards inside small, code-joined groups, plus presence ("who is studying now"), a basic chat and a global top list. No shared tasks were found.
- The most frequent reliability complaints in the social layer were wrong group hours, slow group loading and streak resets.
- The rewards were a slowly growing plant fed by collectable "sunlight", a login streak that boosts sunlight, and daily, weekly, monthly and yearly charts.
- Users asked for: private or invite-only groups, member removal, chat notifications, viewing members' levels, a heatmap, and a goal-based streak.
- Some long-time paying users explicitly value being able to switch off the leaderboard and forest.

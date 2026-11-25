# Section 3: the run on the phone

Done on 2026-11-25, about 03:00, on the user's phone (Samsung SM-A166P, Android 15), in silence
(ringer silent, media volume set to 0 for the run and restored). Every check passed:

| Check | Result |
|---|---|
| Join, the notification prompt, a one minute lap | pass |
| The alarm Android holds | exact (`window=0`), `RTC_WAKEUP`, allow-while-idle, `exactAllowReason=policy_permission` |
| The countdown notification | ongoing, counting down, on its quiet channel, gone at the end and on pause |
| Pause and resume | the alarm goes and comes back at the new end (64 ms off the sum) |
| The bell, app in front | 17 ms after the planned end |
| The bell, app in the background | 19 ms |
| The bell, screen off | 14 ms |
| The bell, screen off and locked, lap started on the laptop | 21 ms; the phone had the lap 0.58 s after the laptop's click |
| Hardware back | from Today to Focus; from Focus out of the app, the process kept |

Two things it could not show:
- **Doze.** The phone was charging, so Android never entered its idle mode. The alarm is the kind
  Android fires in Doze, but that is not yet seen on this phone. To see it: with a lap scheduled
  and the screen off, `adb shell dumpsys battery unplug; adb shell dumpsys deviceidle force-idle`,
  read when the bell was posted, then `adb shell dumpsys deviceidle unforce; adb shell dumpsys
  battery reset`. It needs the phone unlocked to start the lap.
- **A sleeping phone and another device.** After about two minutes with the screen off the open
  app stops hearing the server. A lap started on the laptop then did not ring on the phone; when
  the screen came on, still locked, it caught up in 3.4 s. This is the limit in ARCHITECTURE's
  log (no push service in v1), measured.

The commands, for running it again. The screen-off step is last, because the phone locks.

```sh
adb devices                                  # stop unless a line ends in "device"
make apk
D=$(mktemp -d); server/bin/heirloomd -data $D -invite      # note the code
server/bin/heirloomd -addr 127.0.0.1:8787 -data $D &  SRV=$!
adb reverse tcp:8787 tcp:8787
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell appops get io.github.ravindu644.heirloom SCHEDULE_EXACT_ALARM   # "No operations" or allow; USE_EXACT_ALARM covers Android 13 and later
adb shell monkey -p io.github.ravindu644.heirloom 1
# on the phone: join with the invite, start a lap, allow notifications
adb shell dumpsys alarm | grep -B2 -A8 io.github.ravindu644.heirloom   # RTC_WAKEUP, ALLOW_WHILE_IDLE, exact (window 0), origWhen = the phase end
adb shell dumpsys notification --noredact | grep -A12 'id=7400'         # the countdown: chronometer, ongoing, the quiet channel
adb shell input keyevent 26                                              # screen off; LAST, the phone locks
# wait past the end, then:
adb shell dumpsys notification --noredact | grep -A12 'pkg=io.github.ravindu644.heirloom'  # id=1 on the bell channel, posted; 7400 gone
adb logcat -d -v time | grep -iE 'TimedNotificationPublisher|NotificationService.*heirloom|AlarmManager.*heirloom'  # posted within 2 s of the planned end
# from the laptop: with the app open on the phone, start or extend a lap in a browser at http://localhost:8787,
# then run the dumpsys alarm line again: origWhen must move to the new end.
adb shell input keyevent 224                 # screen back on
kill $SRV; adb reverse --remove tcp:8787; rm -rf $D
```

A one-minute lap needs `settings/current` `work_ms: 60000`; until the settings screen exists
(section 8), write it from a laptop browser's console or wait out a 25 minute lap.

## Second run: 2026-11-25, 09:50 to 10:15, the final UI

Same phone, wireless adb, unlocked at the start. Silent for the run: ringer set to silent and media
volume to 0, every value put back after (table at the end). The app was driven through the
WebView's devtools (`adb forward` to `webview_devtools_remote_<pid>`, Playwright over CDP), with
`adb shell input` for the real keyboard, the system dialogs and hardware back. Screenshots are in
`reviews/3/device/`.

| Check | Result |
|---|---|
| Lap of 1 minute typed in Settings | pass. Tapping the field brings Samsung's numeric keypad (with `.` and `,` keys); `25` cleared and `1` typed reads back `1`, Focus shows `01:00` |
| Doze, run 1 (forced deep idle, `deviceidle get deep` = IDLE before and after the end) | **fail: no bell.** Planned 1795580702474. Android never delivered the alarm's broadcast, and 837 ms after the end the app itself cancelled id 1 (`LocalNotifications.cancel {"id":1}` in logcat), because the timer stops running at the bell and the notifier plans null. See bug 1 |
| Doze, run 2 | pass. Planned 1795580840313, broadcast +29 ms, posted 1795580840374, **+61 ms** |
| Doze, run 3 (phone locked) | pass. Planned 1795581007690, broadcast +31 ms, posted 1795581007731, **+41 ms** |
| Bell, screen off and locked, lap started on the laptop | pass, +18 ms (planned 1795581434774, posted ...434792) |
| Save a copy in the app (`<a download>` with a blob, clicked) | does nothing: no file in `/sdcard/Download`, nothing on screen, nothing in logcat. Capacitor sets no `DownloadListener` on its WebView. The app's sentence in place of the button is right |
| Bring a copy back | works: `com.google.android.documentsui/.picker.PickActivity` opens (twice; backing out does not wedge it), nothing picked |
| Habit reminder 4 minutes ahead | held as 14 inexact alarms (`window=+2m54s` today, `+1h0m0s` on later days), channel `remind` at importance 3. It fired at the very end of its window: **2 min 54 s late** |
| Check in, today's reminder gone | pass for a reminder still ahead (10:30 removed, tomorrow's kept, 28 to 27). **Fail** for one whose time had passed but not yet fired: checked in at 10:06:36, the 10:06 reminder still fired at 10:08:54. See bug 2 |
| Ring here off, start a lap | pass: no bell alarm, no countdown. On again: the alarm and countdown are back |
| Two devices | pass: a lap started in a laptop browser showed on the phone 0.31 s after the click, its alarm held by 0.72 s; a habit checked in on the phone showed in the browser within 0.1 s |
| Hardware back | pass: keyboard first, then the sheet (task, habit, room), then back through the screens; from Focus out of the app with the process kept, and back in on the same page |
| No sideways scroll | pass on every screen: `scrollWidth` 471 = `innerWidth` 471 |

Bugs:
1. **platform: the phone cancels a bell that is due.** When the timer stops at the bell the notifier is
   planned null and cancels id 1. If Android is even a second late (run 1, deep Doze) the app kills
   its own bell. Fix: never cancel the bell once its time has come; Android owns it from then.
2. **platform: a reminder past its time but not yet fired is not cancelled by a check-in.** The rebuild
   only considers reminders whose time is ahead, and Android may hold an inexact one up to an hour
   after it. Fix: treat reminders up to an hour past as still held (cancel if unwanted, never
   schedule one in the past).
3. **platform: inexact reminders arrive late on this phone.** Samsung fired at the end of the
   window: about 3 minutes for one set 4 minutes ahead, and up to an hour for one set the day
   before. Proposal: exact alarms for reminders (a few a day, nowhere near the allowance).
4. **ui:** with the keyboard up, the bottom tab bar rides on top of it (Settings lap field), taking
   a row of space.
5. **ui:** Room shows "Y / You" for the person whose header says "P / phone_two".
6. **ui, minor:** the result after a lap leaves most of the screen empty between the bar and
   "6 laps today. Take five."

What is left on the phone: heirloom installed, signed in as `phone_two` to a laptop server that no
longer runs. Opening it shows the account with this run's laps, two habits (reminders cleared, so
nothing will fire) and the room "Library table", and it cannot reach its server. "Ring on this
phone" is on.

| Phone value | Before | During | After |
|---|---|---|---|
| Ringer mode | NORMAL | SILENT | NORMAL |
| Do Not Disturb | 0 | 0 | 0 |
| System volume | 9 | 0 | 9 |
| Ring volume | 12 | 0 | 12 |
| Media volume | 2 | 0 | 2 |
| Alarm volume | 11 | 11 | 11 |
| Notification volume | 0 | 0 | 0 |
| Deep idle | ACTIVE | forced IDLE three times | ACTIVE (`unforce`) |
| Battery | USB powered | `unplug` three times | USB powered (`reset`) |

## Third run: 2026-11-25, 10:25 to 10:55, the fixes

Same phone and rules. APK rebuilt from the tree with the platform fixes (two bell ids, reminders
exact and kept from the start of today) and the ui lane's keyboard and Room fixes. Silent for the
run, everything put back (table at the end). Joined as `phone_three` on a scratch server.

| Check | Result |
|---|---|
| Doze 1 | planned 1795583676457, broadcast +27 ms, posted +41 ms |
| Doze 2 | planned 1795583747202, broadcast +31 ms, posted +43 ms; the page planned null at +1126 ms, after Android delivered, and the bell was not touched |
| Doze 3 | planned 1795583817973, broadcast +31 ms, posted +46 ms |
| Doze 4 | planned 1795583898946, broadcast +18 ms, posted +30 ms |
| Doze 5 | planned 1795583969597, broadcast +33 ms, posted +46 ms |
| Doze, auto-start on | lap's bell on id 1: broadcast +24 ms, posted +36 ms; the page planned the long break at +290 ms on id 2 |
| Auto-start on, screen on | lap's bell on id 2 posted +2 ms; the break held on id 1 (`getPending`: 1 "Break over." at 10:41:20, 2 the rung lap), its bell then posted +2 ms |
| A real stop halfway | the held bell cancelled (0 heirloom alarms), the countdown gone |
| Shade, lap, break, lap | after lap 1: `1 "Lap 1 of 4, done."`; break running: that and the countdown; after the break: `1` and `2 "Break over."`; lap 2 running: `2` and the countdown (1 was replaced); after lap 2: `1 "Lap 2 of 4, done."` and `2 "Break over."`. Never more than two bells |
| Reminder 3 minutes ahead | exact (`window=0`, `flags=0x5`, `exactAllowReason=policy_permission`); due 10:32:00.000, broadcast +7 ms, posted +24 ms. A second habit's reminder a minute in the past: not scheduled, nothing posted |
| Fired reminder still in the plugin's list | yes (`getPending` lists it with today's time), so the check-in finds it |
| Check in after it fired | it left the shade (0 reminders shown) and the plugin's list |
| Keyboard, Settings lap field | tab bar gone while the keyboard is up (`display: none`), back after hardware back, the field still focused. Frame by frame (15 fps): no jump of the content; on closing, the bar comes back about one frame (70 ms) before the keyboard has finished sliding away |
| Keyboard, task sheet and Today's quick add | the same: bar gone with the keyboard, back after hardware back, field still focused; a second back closes the sheet |
| Room | the circle says P beside "You" |

In none of the six Doze runs did the page plan anything before Android delivered the bell; in four
the page did not run at all near the bell (Samsung froze the app 1 to 4 times per run). Android was
never late: the latest broadcast was 33 ms after the planned end.

Left on the phone: heirloom installed and signed out, no heirloom notification in the shade, no
alarm held, reminders cleared, "Ring on this phone" on, auto-start off, screen on (lock screen).

| Phone value | Before | During | After |
|---|---|---|---|
| Ringer mode | NORMAL | SILENT | NORMAL |
| Do Not Disturb | 0 | 0 | 0 |
| System volume | 9 | 0 | 9 |
| Ring volume | 12 | 0 | 12 |
| Media volume | 2 | 0 | 2 |
| Alarm volume | 11 | 11 | 11 |
| Notification volume | 0 | 0 | 0 |
| Deep idle | ACTIVE | forced IDLE six times | ACTIVE |
| Battery | USB powered | `unplug` six times | USB powered |

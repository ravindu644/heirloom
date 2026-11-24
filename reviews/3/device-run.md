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

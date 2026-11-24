# Section 3: the run on the phone

Not done yet: wireless adb dropped while the user slept. Run these with the phone connected.
The screen-off step is last, because the phone locks.

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

---
name: device-test
description: How to test heirloom on the user's Android phone over adb and deploy to the server container. Load before any [android] or deploy box, or any check that needs a real device.
---

# Testing on real devices

Details that differ per machine (adb serial, the server container's address and login) are in
`.local/ENV.md`, gitignored. If it is missing, ask the user. Never guess a password, and never write
one into the repository.

## The phone
1. `adb devices` first, every time. If no line ends in `device`, stop and tell the user.
2. Install the debug build: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.
   `make apk` builds the app that asks for its server. For a run against a server on the laptop,
   build with `make apk SERVER=http://localhost:8787` and open the way with
   `adb reverse tcp:8787 tcp:8787`; remove the reverse when done.
3. Exact alarm proof, after starting a 1-minute timer:
   - `adb shell dumpsys alarm | grep -A3 <applicationId>` shows the alarm, its type and when.
   - Turn the screen off (`adb shell input keyevent 26`), wait past the end, then
     `adb shell dumpsys notification --noredact | grep -A5 <applicationId>` shows it was posted.
   - Note the posting time against the planned end. Over 2 s late is a failure.
4. Permission state: `adb shell appops get <applicationId> SCHEDULE_EXACT_ALARM` and check
   `USE_EXACT_ALARM` is in the merged manifest (`aapt dump permissions`).
5. Logs: `adb logcat -d | grep -i <tag>`; WebView console with `chrome://inspect` from the laptop.
6. `dumpsys notification` lists the live notifications under "Notification List:" and, further
   down, an archive of removed ones in the same format: read only the first section, or a removed
   countdown looks live (a watcher did this on 2026-11-27). The same holds for `dumpsys alarm`:
   pending alarms are in the batches, the rest is history.
7. Forced Doze: `dumpsys battery unplug` then `dumpsys deviceidle force-idle`; undo with
   `dumpsys deviceidle unforce` and `dumpsys battery reset`. After `adb reboot`, BOOT_COMPLETED
   arrives only after the first unlock, and USB debugging may need allowing again.
8. Leave the phone as you found it: uninstall test builds the user did not ask to keep, turn the
   screen back on, end any `adb` port forwards you opened.

## The server
- Deploy only with `make deploy`: it asks the server for its CPU, builds for it, copies the
  binary and runs install.sh. Never edit files on the server by hand.
- Memory proof: `make server-rss`, idle and under the simulator.
- It is reached from the internet only through the Cloudflare tunnel; do not install packages or
  open ports without asking the user.
- The tunnel's token lives in `/etc/cloudflared/token` on the server. Move it machine to machine
  (`ssh old 'sudo tar -cf - ...' | ssh new 'sudo tar -xf -'`), never through the chat or a file here.

## Two devices at once
The user's own phone plus a laptop browser is the real test of live sync. A second browser profile
stands in for a friend's account in rooms.

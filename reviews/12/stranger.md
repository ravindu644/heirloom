# Section 12: the stranger's walk

2026-11-25. Read: `client/src/ui/strings.ts`, every screen and the kit, the models behind the
handlers (`client/src/sync/`, `client/src/core/`), 21 phone pictures at 412 light from
`reviews/11/shots/`, and DESIGN.md's Voice, Components (as changed for section 12) and "It is an
app, not a page". Nothing was run: every finding is confirmed in the code at the lines given,
and where a layout could only be read from CSS the line says so. The nine points already being
fixed are left out. Paths are under `client/src/` unless they start elsewhere.

The lanes were editing while this was read. Line numbers were taken again at the end, against
the tree as it then stood; the function or the string is named beside each so it can be found
after the next edit. Two findings were dropped because the fix landed meanwhile: Habits'
"Change the order" (now hold and drag) and "~45" in quick add (now stops at 8).

Ranked, worst first. 28 findings.

## Findings

**1. Focus: a break has no way out, and neither has a finished lap.**
- Sees: after a bell, "Start 5 min break" and "Skip break". In a break, one button: "Start lap 3 now".
- Happens: "Skip break" starts the next lap at once (`ui/focus/focus.tsx:200`, `skipBreak` at
  `sync/focus.ts:288`, `begin` at `146`). Stop is drawn only inside a lap (`focus.tsx:321-325`);
  nothing ends a break (`focus.tsx:316-317`; Today's strip has no button in a break either,
  `ui/today/today.tsx:243-250`). With both "Starting by itself" switches on, lap, break and lap
  follow each other (`follow`, `sync/focus.ts:208`), so the only way to end the day is to wait
  for the next lap and stop it, which under the new rule leaves a stopped lap in the count.
- Why: someone who is finished for the day has two buttons and both start something.
- Fix (a change to the product, so the user's to say): one quiet button after a bell and in a
  break, "Done for now", which ends the run (`focus.stop()` already takes any phase). The line
  after: "Stopped after lap 2. Lap 3 is next."

**2. The habit sheet ends in "Archive" and "Delete"; the task sheet in "Mark done" and "Delete".**
- Sees: a form they have just edited, and at its foot two buttons that both take the thing off
  the list. "Close" is a small link at the top.
- Happens: every edit is saved as it is typed (`ui/today/task-sheet.tsx:53`,
  `ui/habits/habit-sheet.tsx:28`); the foot buttons are `habit-sheet.tsx:110-115` and
  `task-sheet.tsx:313-318`.
- Why: nothing on any screen says edits save themselves, so the stranger looks for Save and
  finds "Archive" where Save would be. What Archive does is said only afterwards, inside the
  "Archived habits" sheet (`archivedNote`, `strings.ts:595`).
- Fix: one line over the foot buttons of both sheets: "Changes are saved as you make them." And
  under the habit's buttons: "Archive keeps its record and takes it off the list. Delete keeps it
  30 days, then it is gone."

**3. Day target: Today's editor says "today" and changes every day, on every device.**
- Sees on Today: "No target today.", "Set a target", "Laps to run today", "Remove the target".
  Sees in Settings: "Day target", a stepper down to "No target", "8 laps a day", no note.
- Happens: both write the one standing setting (`setTarget`, `sync/today.ts:430-432`;
  `ui/settings.tsx:141-149`). Today's goes 1 to 24 with a link to remove (`today.tsx:197-211`);
  Settings' goes 0 to 24.
- Why: two controls for one number, with two shapes and two meanings in their words. "Remove
  the target" reads as "for today" and removes it for good.
- Fix: Today's words say what is true: "No day target.", "Laps to run each day", "Remove the day
  target". Settings gets the missing note: "Today shows a bar of this many laps. It can be
  changed there too."

**4. "Ghost" is never said to be you.**
- Sees on Focus: a panel "Against last Tuesday" with lanes "You" and "Ghost". On a first day:
  "Today so far" and "No ghost yet. Today sets the pace for next time."
- Happens: the ghost is the same weekday last week if it had focus, else the latest day that had
  (`sync/counts.ts:144-148`); `focus.tsx:52,59`, `strings.ts:127,132`. Today calls the same day
  "Last Tue" (`ghostDay`, `strings.ts:395`), Progress races "last week".
- Why: the word only makes sense if you know racing games or the data model, and the first
  sentence a new person reads about it is that they do not have one. The welcome's "Race the you
  of last week" is on another screen, seen once.
- Fix: the lane is named for the day, as Today names it: "Last Tue" in place of "Ghost". First
  day: "Nothing to race yet. Today becomes the day to beat."

**5. Starting a lap has four names, and one of them hides that a lap starts.**
- Sees: "Start lap 3" (Focus, ready), "Start lap 3 now" (Focus, in a break), "Skip break"
  (Focus, after a bell), "Start" (Today's Next row, in every one of those states).
- Happens: the last three are the same call, `focus.skipBreak` (`focus.tsx:200`, `317`,
  `today.tsx:267`). Today's "Start" in a running break ends the break without a word.
- Why: "Skip break" reads as "do not take one"; 25 minutes start counting.
- Fix: after a bell the second button says what the break's button says: "Start lap 3 now".
  Today's "Start" can stay: the lap strip appears above it at the tap.

**6. The bell: nothing says what "ring" is, and nothing says when the device has blocked it.**
- Sees: "Ring on this phone. For this phone only. Your other devices keep their own."
- Happens: in a browser a ring is a sound, plus a notification only when the tab is hidden and
  leave was given (`ring`, `platform/web.ts:81-97`). Leave is asked once, at the first start
  (`main.tsx:100-106`); refused, `allow()` returns false and no screen is told (`web.ts:165-171`).
  `strings.ts` has no sentence for a blocked notification or a missing exact alarm.
- Why: the switch stays ticked while nothing can ring. The stranger's bell "does not work" and
  the app has no next step.
- Fix: the note says what it does: "A sound and a notification when a lap or a break ends." And
  when leave is refused, one line in its place: "This phone has notifications for heirloom
  switched off. Allow them in the phone's settings and the bell rings."

**7. The phone app's first screens: no server, no way on.**
- Sees: "Connect to a server", then "Which server?", "An address, or an invite link someone sent
  you.", an example address.
- Happens: `ui/welcome.tsx:46-49`, `ui/server.tsx:34-48`. Nothing says where a server comes from;
  only the README does.
- Fix: one line under the hint: "No server yet? Ask the friend who showed you heirloom for an
  invite link, or run your own: the README says how." With the project's address, which the
  lead knows.

**8. A lap can be 180 minutes, and "5 more minutes" has no top.**
- Sees: Settings lets "A lap" go to 180 (`LENGTH_MAX`, `ui/settings.tsx:23`); Focus has the link
  "5 more minutes".
- Happens: the clock then reads "180:00", six characters in digits sized so that five fill a
  phone, `white-space: nowrap` (`ui/focus/focus.module.css:50-59`; read from CSS, not run).
  `extend` adds five minutes every tap with no limit (`core/timer.ts:95-100`, `sync/focus.ts:291`).
- Fix: a lap stops at 99 minutes, and "5 more minutes" is not offered once the lap would pass
  that. Look at Focus and Today's strip with 99:59 in them. It is DESIGN.md's new rule, "Every
  number a person can raise has a top", one step to the side.

**9. "Lap 2 of 4" and "lap 3 of 4 on this task" stand on one screen.**
- Sees on Focus: the top line "Lap 2 of 4, focus", and over the digits "lap 3 of 4 on this
  task". On Today's rows and in Focus's "Up next": a bare "2 of 4", "0 of 3".
- Happens: the first is the place in the set of four (`focus.tsx:140`, `strings.ts:77`), the
  second the task's laps against its estimate (`focus.tsx:256`, `onTask`, `strings.ts:110`);
  "Up next" is `focus.tsx:293-298`.
- Why: one phrase for two things. With an estimate of 4 the two lines differ by a digit and
  nothing says why.
- Fix: the task's line says its noun: "3rd lap on this task, 4 guessed". "Up next" rows end
  "0 of 3 laps".

**10. Today's strip: "Done" is time, "Done" is also the list of finished tasks, and "Planned, left" reads 0 with five tasks open.**
- Sees: "Done 2h 5m, 5 laps" in the strip, a section "Done" lower down, a button "Done" in the
  target's editor, and "Planned, left 0m, 0 laps" when no task has an estimate.
- Happens: `today.tsx:136-137`, `201`, `318-320`; "Planned, left" adds only estimates
  (`plannedLeft`, `core/today.ts:218-219`).
- Fix: the strip's first label is "Focused". The second is "Left, as guessed", and its note
  counts what it cannot: "10 laps, 2 tasks with no guess".

**11. A project can be made and never changed or removed.**
- Sees: "New project", "Its name", "Add project". A typo is then a choice in every task's sheet.
- Happens: `editProject` exists (`sync/today.ts:418`) and no screen calls it. The name has no
  length limit (`task-sheet.tsx:120`, `addProject`, `sync/today.ts:408`) and a choice has no rule
  for a long one (`ui/kit/form.module.css`, `.choice`; read from CSS, not run).
- Fix: `maxLength={24}` on the name now. Renaming and removing a project is a feature: the
  user's to say. Until then the form could say "A project stays once it is made."

**12. A habit done several times a day: the box adds, then takes away.**
- Sees: one box. "A glass of water, 2 of 3".
- Happens: under the target a tap adds a check-in; at the target the same tap takes the latest
  one back (`check`, `habits.tsx:61-74`). A wrong tap at 1 of 3 can be undone only from the bar,
  for ten seconds. The box is always named "Check in: ..." (`habits.tsx:120`).
- Fix: the sheet's "How often in a day" gets a line with today's count and its own way back:
  "2 of 3 today." and the link "Take one back".

**13. Subtasks exist only inside the sheet.**
- Sees: "8 laps is a lot to hold in one task. Break it down and each piece is easier to start.",
  adds three subtasks, closes. The row is as it was.
- Happens: subtasks are read in `task-sheet.tsx:281-311` and nowhere else; the row
  (`ui/kit/task-row.tsx`) and Focus show nothing of them.
- Why: the app asked for them and then does nothing a person can see with them.
- Fix: the row's small line says "1 of 3 pieces done" when a task has subtasks.

**14. A reminder on a laptop: the habit says nothing, the task says the wrong thing.**
- Sees on a habit: "Reminder. On the days it is planned, until it is checked in." On a task:
  "The phone app reminds you at that minute. A browser only shows the time."
- Happens: a browser does remind, for both, but only while a tab is open and leave was given
  (`remind`, `platform/web.ts:121-144`; `main.tsx:65-72`). Setting a task's time in a browser
  asks for that leave (`task-sheet.tsx:215`, `main.tsx:106`), straight after the line that says a
  browser only shows the time.
- Fix: one note for both fields in a browser: "The phone app reminds you at that minute. A
  browser does only while heirloom is open in a tab."

**15. Progress, a day's laps: what "Don't count it" does is told to screen readers only.**
- Sees: the link "Don't count it" beside each lap. Pressed, the row reads "Lap, not counted".
- Happens: "It adds nothing to your day, week or streak." is in a `class="sr"` line
  (`ui/progress/day.tsx:112-114`). With Focus's own button gone, this link is now the only place
  the act lives.
- Why: the owner's own question was "counts in what?". The answer is written and hidden.
- Fix: show that sentence under the list for as long as an Undo lasts.

**16. Invites: the new link is listed twice, with two "Copy the link".**
- Sees: "The new link", the whole link, a button "Copy the link"; under it a row for the same
  link with "Copy the link", "Renew", "Take back" (`settings-owner-invites-phone-full-light.png`).
- Happens: `make` adds it to the open list as well (`gives`, `sync/invites.ts:77-86`);
  `ui/people.tsx:95-108` and `114-131`. "The new link" then stays until Settings is left.
- Fix: while it is shown as new, its row is not drawn; the block goes when another link is made
  or the link is copied.

**17. "Recently deleted" and "Archived habits" stay open when their last row is restored.**
- Sees: an empty sheet with only "A deleted task keeps for 30 days, then it is gone for good."
- Happens: nothing closes them (`today.tsx:347-366`, `habits.tsx:199-218`).
- Fix: the sheet closes with its last row. It is DESIGN.md's new rule, "What opened closes when
  it is answered", one step to the side.

**18. Room sheet: "Rename" says nothing, and only one of three settings says it is for everyone.**
- Sees: "Its name", "Rename"; "Together in a week"; "Order by this week. Most focus first, for
  everyone in this room."
- Happens: a rename that worked sets no line (`change`, `ui/room/room.tsx:80`; the form,
  `100-110`) and the name it changed is under the sheet. Any member may change name and target
  for all (`server/rooms/rooms.go:273`).
- Fix: after a rename, "Renamed for everyone." A first line in the sheet: "What you change here
  changes for everyone in the room."

**19. "Rest day" sounds like something you take.**
- Sees: "Two rest days a week do not break it." (Progress), a ring on a habit's week with no
  word beside it (the list), "A ring is a rest day." (only inside the sheet).
- Happens: the first two missed days of a week become rest days by themselves
  (`core/streak.ts:57-61`).
- Fix: "The first two days you miss in a week are rest days: they do not break it."
  (`streakStart`, `strings.ts:496`), and the same sentence once under the Habits list.

**20. "A lap that rings" and "the phase".**
- Sees: "A day counts with one lap that rings.", "Start the break when a lap rings", "No lap has
  rung today yet." (`strings.ts:241`, `496-497`, `560`); "who is on a lap, the phase and the time
  left" (`strings.ts:260`, `634`).
- Why: "rings" is the model's word for "ran to its bell", and matters more now that a stopped lap
  is a lap too. "Phase" is the timer's field name.
- Fix: "one finished lap", "when a lap ends", "No lap has finished today yet."; "whether they
  are on a lap or a break, and the time left".

**21. The run under a habit changes what it counts.**
- Sees: "Every day, 9 days running" on one row, "Every day, 24 of 30 planned days" on the next.
- Happens: after a miss the row shows days done in the last 45 (`run`, `habits.tsx:22`;
  `strings.ts:583-584`; `core/streak.ts:28`). Progress says its window: "of the last 45 days".
- Fix: "24 of the last 30 planned days".

**22. "On chosen days" looks chosen and saves nothing.**
- Happens: the tap only opens the row of days; with none picked the task does not repeat, and
  closing the sheet forgets the choice (`task-sheet.tsx:255-258`). In a habit's "Days" a tap on
  the last day left does nothing and says nothing (`habit-sheet.tsx:52`).
- Fix: choosing "On chosen days" picks today's weekday. The habit's last day needs no fix
  beyond a line: "A habit keeps at least one day."

**23. A room refuses with one sentence for two causes.**
- Sees: "That room has its 8 people, or you are in 5 rooms already. Both are the most there can
  be." (`strings.ts:644`).
- Fix: the client knows how many rooms it is in. Five: "You are in 5 rooms, the most there can
  be. Leave one first." Otherwise: "That room has its 8 people, the most there can be."

**24. A wrong password has no next step.**
- Sees: "That username and password do not match." (`strings.ts:312`). PRODUCT.md line 137: no
  password reset, by the user's own word.
- Fix: say it once, after the third wrong try: "A password cannot be reset. Whoever runs this
  server can invite you again, for a new account." The lead should check that this is the
  honest answer.

**25. Settings' "Back" can leave the app.**
- Happens: `history.back()` (`ui/settings.tsx:199`). With Settings as the first page of the tab
  (a bookmark, a reload from another site) it goes to that site or does nothing.
- Fix: when the app has no earlier step of its own, go to `#/focus`.

**26. Changing "A lap" during a lap changes nothing on screen.**
- Happens: a lap takes its length when it starts (`begin`, `sync/focus.ts:159`).
- Fix: a note under the three lengths: "A lap or a break already running keeps its length."

**27. "Cheer" stands under someone who is mid-lap.**
- Sees: "Focusing, lap 3 of 4, 11:04" and the button "Cheer"; later "You cheered this lap."
- Happens: it cheers the last lap that finished, named only for a screen reader
  (`room.tsx:301-306`, `strings.ts:673-675`).
- Fix: "Cheer lap 2", and "You cheered lap 2."

**28. Small pairs of words.**
- "Estimate" (the sheet, the Progress panel) and "guess" (the empty Today, Progress's
  sentences, the marks): one thing, two names. Pick "guess" for sentences and keep "Estimate"
  only as the label, or use one everywhere.
- "Restore" (deleted) and "Bring back" (archived) beside "Bring a copy back" (import): three
  ways to say back. "Restore" for both shelves would do.

## Checked and found clear

- Sign in, join and set up: each intro, each error and its next step, "I have an invite" and
  back. The server step's three refusals.
- The welcome explains a lap, a set, rest days and a room before the word is needed.
- Empty states: Today, Habits, Room, every Progress panel, a day with no laps.
- Sheets: "Close", a tap outside, Escape and the back button all close one step.
- The bar: what a tap did, Undo, a long title cut short. Subtask "Remove" with its Undo.
- The connection lines (offline, cannot save, signed out) and the refused sign out.
- Invites: "Take back" with its second tap, "Renew" with its date. Admins: "Back to member" with
  Undo, a wrong username.
- "Your copy": both buttons, every result, the phone app's line about where to save.
- "Hide rooms" and its way back; "Show the room what I am on" and "Your task is not shown to the
  room."; leaving a room; copying the code and when it cannot.
- Progress: the key under the year, "Back to today", the note and its count of characters.
- Tops that hold: day target 24, a habit 20 times a day, a room 200 hours and 40 characters, a
  note 280, a username 32, and now an estimate at 8 by both doors. Long names in the header, the
  room picker and Progress lists are cut with an ellipsis.
- "Set" is carried by "Lap 1 of 4" and "long break after lap 4" on Focus.
- Settings is reached only by pressing your own name, with no word "Settings" on any screen.
  That is the owner's rule; left alone, but a stranger will look for it.

Not covered: the built app in a browser or on the phone, the 1440 and dark pictures, the new
hold and drag and the new colour picker (they arrived while this was written), the phone's own
date and time pickers.

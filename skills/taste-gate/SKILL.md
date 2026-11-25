---
name: taste-gate
description: The gate every heirloom screen passes before the lead merges it or the user sees it - what to measure, the pictures to open, the tells of generic or AI-made app UI with their fixes, and the words check. Load before building or reviewing any screen or component, and whenever something looks generic, cluttered, slow or "like every other app".
---

# The taste gate

heirloom has to read as something passionate people built in their free time. A rule nobody checks
is a hope, so the gate is tools first and judgement second. Adapted from agent-forge-design's
slop-gate for app screens.

## 1. Measure

```
node tools/style-check.mjs         # no colour, font or duration literal outside tokens.css
node tools/design-audit.mjs        # what the browser drew, against DESIGN.md: every size, colour, gap, left edge
node tools/budget.mjs              # JS, CSS, fonts against ARCHITECTURE section 7
npx @google/design.md lint DESIGN.md   # 0 errors
```

Measure positions, never judge them by eye: read `getBoundingClientRect()` for the blocks of a
column and compare their left edges and the gaps between them with the spacing scale. A picture
at 30% hides a 4px misalignment that the person holding the phone sees at once.

Fix every failure. Do not hide things from the checks.

## 2. Look

Capture the screen at 412x915 and 1440x900, light and dark, with real-looking data, an empty state,
and the longest string it can hold. Open every picture.

| Test | It fails when |
|---|---|
| Across the desk: the phone picture at 30% size | you cannot read the time left and the phase |
| Squint | you cannot say what the one main thing is, or two things tie |
| One action | there is more than one primary (you-filled) button |
| Side by side with the reference in `design/routes/b-pacer/screens/` | it drifted: a new colour, a rounded lane, a shadow, a different rhythm |
| Logo test | another productivity app's name could go on it and nothing would feel wrong |
| Empty state | it shows an illustration and "Nothing here yet!" instead of the first thing to do |
| Thumb | the main action on the phone is out of reach in the top third |
| Dark | anything is navy, glowing, or lower contrast than DESIGN.md allows |
| One left edge | two blocks of one column start at different x, or a line under the big digits does not start under their ink |
| Rhythm | a gap is not a step of the spacing scale, or the largest gap on the screen lies between two things that belong together |
| Free space | content floats in the middle with space above and below, or related things were pushed apart to fill a tall screen |
| Pressable | something that can be pressed is a bare word with no fill and no underline, or two buttons that do the same kind of job look different |
| Same job, same look | the same control, heading, figure or gap is drawn two ways on two screens, sizes or themes |
| Where things live | an account action (sign out, settings) sits loose on a content screen instead of behind the person in the header |

## 3. The tells of generic app UI

| Tell | Fix |
|---|---|
| A ring or circle timer | Big condensed digits and the lap bar (DESIGN.md) |
| Confetti, trophies, flames, stars, sparkles, emoji as decoration | The race result: two lanes meeting a line, in words |
| Four KPI tiles with icons in circles | One finding as a sentence, then the evidence under it |
| Gradient areas, donut charts, a chart library's default look | Hand-drawn SVG: lanes, square bars, one hue stepping darker |
| Cards inside cards, a shadow on every card | Flat surfaces stepping by tone; one shadow only for what floats |
| Rounded everything, pills everywhere | Lanes and bars square; 4 to 8px on rows and buttons; circles for people |
| Purple to blue gradient, glassmorphism, blur | Never. Tomato, ghost grey, calyx green, neutrals |
| A floating action button for "add" | Quick add in the list, where the eye already is |
| Icons without labels in the navigation | Five labelled destinations |
| A spinner or skeleton for data already on the device | Render it; it is local |
| Animations on everything, easing that bounces, anything looping | The motion table in DESIGN.md, nothing more, and nothing less: see section 8 |
| Nothing moves at all: rows pop in, editors snap open, screens swap between two frames | Every row of the motion table, built into the kit |
| A modal asking "Are you sure?" | Do it and offer Undo |
| Inter or the system font | Barlow and Barlow Condensed, from `design/fonts/` |
| A leaderboard of friends | Lanes side by side, a cheer, "Together today" |

## 4. Words

Read every string on the screen aloud against the Voice section of DESIGN.md.

| Tell | Fix |
|---|---|
| "Great job!", "Awesome!", "You're on fire" | Say what happened: "Level with last Tuesday." |
| "Oops! Something went wrong" | What happened and what is safe: "Needs a connection. Your laps are safe on this phone." |
| "You missed your goal", "Streak lost" | The fact and the way back: "41 of the last 45 days." |
| Feature names: "Live presence", "Sync status", "Analytics" | The thing: "Who is focusing now" |
| Title Case Buttons | Sentence case |
| Padding words: "simply", "just", "easily", "seamlessly" | Delete them |
| An em dash | A comma or a full stop |

## 5. Verdict

The design reviewer writes PASS or FAIL per screen, one line per finding (what, where, which rule,
the fix), and one thing that is good and must survive later changes. Any tell from section 3 or 4
is a FAIL until fixed or defended in one sentence that names the user's need it serves.

## 6. Lessons from reviews that passed what the user then failed

Written 2026-11-25, after the user looked at Focus and Today and found three things two design
reviews had let through. Each is now a row above; this is why.

- **A rule that solves one problem can break a person's eye.** The reviewer upheld "digits centred
  in the free space, actions at the bottom" because it met the thumb rule. The user saw a hole
  between the timer and its race panel. Space between related things is a FAIL even when another
  rule asked for it; find the layout that keeps both.
- **Optical edges are edges.** "of 25:00, paused since 16:38" sat a few pixels off the big
  digits, because the digits' box and their ink are not the same. Nobody measured. Measure.
- **A bare word does not look pressable.** "I have an invite" and "Skip break" were text with no
  fill. They passed because DESIGN.md said "text buttons for the rest". When a rule in DESIGN.md
  produces something a person does not read as a button, the rule is wrong: say so in the review,
  under "DESIGN.md's to fix", and fail the screen until it is.
- **Where a thing lives is design too.** "Sign out" loose in the corner of every screen was never
  questioned. Account actions belong behind the person.
- **Consistency is checked across screens, not inside one.** Review each new screen side by side
  with the ones already built: same header, same headings, same buttons, same gaps.

## 7. Lessons from the review that measured

Written 2026-11-25, after the first review done with a ruler (the audit tool, then
`getBoundingClientRect()` by hand) found sixteen things the pictures alone had hidden.

- **A fix can move a hole instead of closing it.** "Free space above the action row" closed the
  gap under the timer and opened 530px between "Take five." and its button. Ask of every fix:
  which two related things are now further apart? A sentence travels with the button it explains.
- **A fix can make the next collision.** Moving the lap squares beside the count put the count
  against the row's Start button. After a fix, measure the neighbours of what moved, in every
  variant of the row (with a control, without, in ordering mode).
- **A hidden element can still take room.** A visually hidden status line, absolute with no
  positioned ancestor, made the phone page 1403px tall and the bottom bar slide. Scroll every
  phone state to its end; the page itself must not move.
- **A component sized for the full case is a stamp in the short one.** A year of 12px squares is
  right at 54 weeks and lost at ten. Look at every component with the least data and the most.
- **Baselines come from text, never from a mark.** An inline-flex name took its baseline from its
  colour square and the figure beside it floated 10px. Where a figure sits beside a label,
  measure both baselines.
- **A label must stand clear of every line that can cross it.** Check a chart in each case of its
  data: ahead, behind, level, empty, and with one value near the floor.
- **Check PRODUCT.md row by row.** Two rows of Progress were half built and nothing looked
  missing. A screen that looks finished is compared with the list, not with the eye.

## 8. Lessons from the user's first hour with the app

Written 2026-11-25. Ten sections of pictures, audits and tests had passed. Then the user held
the app for an hour and sent twelve points. None could be seen in a still picture, which is the
lesson: **a screen is reviewed by using it**, at phone size, scrolled part way down, with the
keyboard up, with a thumb. Each point is a check now.

| What the user met | The check, before any screen ships |
|---|---|
| "The entire UI does not have any kind of animations" | Record a tap on every kind of thing: a row added and removed, an editor opened, a sheet, a screen change, the bar. Anything that appears or goes between two frames is a FAIL. "Short, and only when it matters" had been read as "none" |
| The page scrolled when they pressed "Count again", and they had to scroll back | `staysPut` in the e2e suite on every tap that changes the page; by hand, scroll half way down and tap. The four causes are listed in DESIGN.md, Motion |
| The sign-in page "glitches, shifts up, then resets" when the keyboard opens | Grep for `scrollIntoView`, `scrollBy`, `scrollTo` and any `resize` listener in `client/src/ui/`. A script that scrolls on resize is a FAIL. Open the real keyboard on the real phone |
| An error replaced the sentence that was there | Trigger every error on a screen and read what is left: the hint, the intro and the labels must all still be there. One slot never holds two things |
| "Keep it" and "No target" looked the same and both closed the editor | Two controls side by side must differ in what they do **and** in how they look. Read each button and say what it does without knowing the code; if you cannot, the user cannot |
| "Set aside", "counts nowhere", "Count again": "in what?" | A word the method's inventor used is not a word the user knows. Give each string to someone outside the project in your head: would they ask "what does that mean?" A button says what it does ("Don't count this lap") |
| The bar sat in the middle of the screen and stayed | Look at every floating or sticking thing with a short list and a long one. Check when it goes, with a clock, without touching anything |
| Adding a task needed Enter and nothing said so | Every field that makes something has a visible button. A phone keyboard's Enter key is not a control anyone can see |
| Stop looked heavier than Pause, in dark only | Every pair of buttons is looked at side by side in light **and** dark, on the ground and on a panel. Weight is checked per theme, never assumed from the token's name |
| All text could be selected like a web page | Long-press a heading and a row on the phone; drag across a sentence on the laptop. Only fields and things meant to be copied may select |
| "No landing page, mentioning what this even is" | Open the app as someone who was only handed a link. The first screen must say what it is before it asks for anything |
| No time on a task, five colours | When PRODUCT.md and the user disagree about what "the whole point" is, the user is right: ask early which rows they will use first, and let them use those before polishing the rest |

Two things about process, for the lead:

- **The user's hour beats the tenth review.** Get a build into their hands at the end of every
  section, not after ten. The gate says "the user tries it"; a section whose gate was skipped
  carries its bugs into the next.
- **Dev is not the build.** The hold and every glide passed on the dev server and lasted 0.16 ms
  in the built app, because the minifier rewrote the duration tokens. Motion, and anything else
  code reads back from CSS, is proven on `make web`'s output; the e2e suite runs against it.
- **A rule read as a ban hides a hole.** "No animation on a loop, the timer never animates" grew
  into "nothing animates". When a rule says what not to do, the review still asks what should
  be there instead.

## 9. Lessons from the user's second hour

Written 2026-11-25. Section 11's fixes were in their hand an hour later and nine more points
came back. Most were not new kinds of bug: they were the first hour's fixes, each right where
it was tested and wrong one step to the side. **A fix is tested where it was not made:** in a
sheet as well as on a screen, at the end of a page as well as its middle, at the largest number
as well as a small one.

| What the user met | The check, before any screen ships |
|---|---|
| Words in a sheet could be selected after "nothing selects" shipped | A rule for "everything" is checked in every layer: a screen, an open sheet (the browser's top layer), the bar, a menu. The e2e test for it opens a sheet |
| After "Keep this order" Today sat pushed up under the header, with a blank end below | A page that fits is never scrolled; no page is scrolled past its content. After every tap, at the top, the middle and the end of a page: is anything blank, is the heading where it was? A fix that invents room (a blank end, a spacer) is a second bug |
| A field in a sheet touched the keyboard; the last field sat mid-screen over nothing | Focus every field of every sheet with the window as short as a phone with its keyboard up (412x1180 of 412x2000). The field has room above and below; the sheet ends at its content |
| An estimate of 45 laps: squares off the card, the title one letter to a line | Every number has a top and every row is looked at with the top in it, beside a 60 character title. A title breaks between words, never inside one. A demo state holds the extreme so the audit sees it every run |
| "Stop", "Stop and log 2 min" and "Don't count this lap": "why two stop buttons?" | One act, one control, one name that does not change. If two controls end, remove or undo the same thing, one goes. If the difference needs a sentence to explain, the person will not read it |
| "When in the day" beside a clock time: "what does it actually do?" | Every field is asked: what does the app do with this? "It shows it back to you" beside a field that does more is not an answer. A field that came from a research paper goes when a plainer one arrives |
| "Change the order" was a link into a mode | A thing people do with their hands on every phone (drag a row, swipe back, pull down) is done that way here, with a keyboard path beside it. A link that turns the screen into another screen is the last resort |
| "Another colour" opened a list before the picker; the picked colour moved the button | A control that opens the platform's own picker is tried on the phone, not in the laptop's browser: the two differ. A control never moves because it was used |
| "New project" stayed open after another project was chosen | What opened for one question closes when the question is answered another way. Open every form, then answer it from outside the form |
| The Pause button on the light strip was grey on white | A component is looked at on every ground it can stand on, the inverted one too. The fix for a pair of buttons on the page was never looked at on the strip |

For the lead:

- **Ask what the first fix did not cover before the user finds it.** After a round of fixes,
  list for each one the places it was not tried (other layers, other grounds, the extremes, the
  ends of a page) and try those. This round would have been three points, not nine.
- **Walk it as a stranger, every section.** See `skills/stranger-walk`.
- **A green suite says what the tests ask, not what the app does.** With 127 browser tests
  passing, the code review still found five bugs a person would hit in the first minutes (the lap
  that had just rung drawn empty, a dropped row opening its sheet, a picker that overwrote a colour
  on opening). The review runs before anyone is told a build is ready, and each bug it finds gets
  the test that would have caught it.
- **A change to what a word means is traced through every reader of it.** "A lap" grew to include
  a stopped one, and three places that meant "a lap that rang" quietly changed with it (a mark,
  today's count mid-extension, the bar after a bell). When a definition moves, list every use and
  say for each which meaning it had.
- **The user's model wins over the book's.** Cirillo's pomodoro is indivisible, so a stopped
  one was "not a lap"; the user's is "stop ends the lap, the next is lap 2". When the product's
  rule needs explaining and the user's does not, take theirs and write down what it costs.

## 10. Lessons from the user's third hour

No glitches this time: every point was about daily use. Each row is a check to make before a
build goes out.

| What the user met | The check |
|---|---|
| "Added." came up behind the keyboard, and Back was needed to see it | On the phone, an act that ends typing (Add, the keyboard's own done key) lets go of the field first, then says what it did. Anything shown at the foot of the screen is looked at with the keyboard up |
| The day target was 2, a task's estimate 3, and Focus's bar stayed at 4: "what does that even mean" | A count says of what. Two bars or two "x of y" that count different things never differ by their place alone: each carries its noun ("in this set", "today", "estimated"). Read every figure on a screen cold and ask "of what?" |
| The notification said "Lap 1 of 4" for a task estimated at 2, and kept saying it after the estimate changed | Words shown outside the app (a notification, a push, a widget) are checked against the same rule as a screen, and they follow the data: change the thing while it shows and look again |
| "End with ~3 for three laps" under the field: "I don't get what it means" | A hint is an example with its result ("Essay draft ~3 plans it at 3 laps."), never a rule in the app's own grammar. If it has to be decoded, it is not a hint |
| Squares sat squeezed beside a long title | A row that holds a count and words is looked at with the most of both. The count gets a line of its own only when there is no room, and keeps one edge (the right) in both forms |
| One reminder for a habit done several times a day; one set of lengths for every task | When a thing has a number ("3 times a day", "this task"), ask whether each setting beside it should follow that number. A global setting with no way to differ for one thing is asked about in the stranger's walk |
| The task had to be chosen on Today before a start on Focus | The screen with the button holds the choice the button needs. Count the screens between wanting to do a thing and doing it |
| The countdown notification could not pause or stop | A thing that shows a running state offers the two or three acts that state has, wherever it shows |

What the stranger's walk then found in the fixes themselves, before the user did:

| What it found | The check |
|---|---|
| "Start lap 2" under "lap 3 on this task" | A fix for a count without a noun is followed through every place a number of the same kind stands: buttons, the bell, the strip, a friend's row. A button carries no count |
| The task chosen on Focus lasted one lap, then went back to the top of Today, saying nothing | A new choice is followed past its first use: what does the second lap do, the one started from another screen, the one that starts by itself? |
| "Change" after "4 estimated" read as "change the estimate" | A one-word link is read with the words that stand before it. If it could act on two things, it names the one |
| The countdown said the task's lap, the bell that replaced it the set's | Two messages about one moment are read one after the other, as they arrive |
| Stop in the notification left no Undo in the app | A second way to do an act (a notification button, a shortcut, another device) gets everything the first way gives: the line that says what happened, the Undo |
| "No reminders" wiped twenty times in one tap; minus on a stepper dropped a time for good | A control that removes several things at once is named as an act ("Remove the reminders"), is undoable, and what a toggle hid comes back when it is toggled again in the same sitting |
| The keyboard rule was applied to subtasks, where no bar speaks and several are typed in a row | A rule made for one case is asked of each place it was applied: is the reason there too? |


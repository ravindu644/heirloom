# Section 11: what the first hands found

## First pass, 2026-11-25

Pictures: 391 in `reviews/11/shots/`. Opened at full size, 412 wide, light: every state named
under points 1 to 8, with the dark twin of every button pair; `signin-wrong` at 1440; the 15
motion strips at 80%. The dark phone set and the light laptop set were read as overview sheets,
the 471 and dark laptop sets only through the audit. `node tools/design-audit.mjs`: 145 states,
0 violations. Positions below were read from the running demo.

| # | Point | Verdict |
|---|---|---|
| 1 | The welcome | PASS, one line to fix |
| 2 | An error on its own line | PASS |
| 3 | The day target's editor | PASS |
| 4 | The Add button in the field | PASS, one line to fix |
| 5 | The bar | PASS; two things are DESIGN.md's |
| 6 | A task's time, the thirteen squares | PASS |
| 7 | Buttons | FAIL in light, PASS in dark |
| 8 | Phone sheets at 90dvh | PASS, with a better way |
| 9 | Motion | PASS |
| 10 | Everything else | PASS |

Screens that fail, all on point 7 and all in light only: Today at lap-over, Settings, Room and
its sheets, the task sheet's new project form.

## Findings

1. **The welcome's headline breaks inside its second sentence.** Under the form at 412 and
   beside it at 1440 (`signin-wrong-*`, `signed-out-*`): "Work in laps. Race" / "the you of last
   week." On the welcome screen itself it breaks right. Voice rule 6, one idea a line. Fix: the
   two sentences are two lines wherever the headline is set.
2. **Typed words run into the Add button.** Quick add at 412: the field's right padding is 48px,
   the button stands at 340 to 388, so a long title ends under the button's edge with no gap
   (`reviews/11` has no picture of it; typed into the demo). DESIGN.md, The button in a field.
   Fix: padding of the button's width plus `sm`.
3. **Secondary buttons in light: see point 7.**

Nothing else breaks a written rule.

## Point by point

**1. The welcome.** It says what the app is in the app's voice: a lap, the day's plan, habits, a
room, then "It is free. Everything you do is kept on a server that you or a friend runs, and
nowhere else." No screenshots, no grid. On the phone app the four lines stand at the top, the
last line with its button at the foot, the space between. In the browser it sits beside the form
at 1440, both headings on y=46, and under it behind a hairline at 412. "The you of last week"
is odd for a second and then it is the whole idea. Finding 1.

**2. Errors.** `signin-wrong`, `join-wrong`, `server-invalid`: the sentence stands above the
buttons in ink; the intro, the labels and the hints are all still there. The strip shows it
opening in time and the button going down by its height once.

**3. The day target's editor.** "Laps to run today", minus, the figure, plus, "Done", and under
them the link "Remove the target". Each says what it does, and a button against a link is a
difference nobody misses. "No target today." with "Set a target" is as plain. One thing to look
at: Done has the stepper's fill and height and stands 16px after the plus, so the row reads as
four keys; `lg` before Done would part them.

**4. Add.** Inside the field's box at its right end, from the first character, in both themes
and in the sheet's subtask field. Finding 2.

**5. The bar.** Phone: 16 to 396 across, 16px over the bottom bar. Laptop: at the foot of the
column. It rises and fades (`motion-bar-rising`), reports for four seconds, holds an Undo for
ten. Two things for DESIGN.md below: on a phone it covers the row it has just added, and on the
laptop it is 576px wide under a 747px list.

**6. Time and colour.** A row reads "C  16:40, after dinner"; the sheet has Due, At and "No time";
the app's note says "This phone reminds you at that minute, if the task is still open." Twelve
squares in two rows, "Another colour" showing the picked one inside a hair line, the same square
on the row. One thing to look at: Due, At and "When in the day" are three answers to "when" in
one sheet.

**7. Buttons.** Dark is right: `key` #343934 reads as a key on the ground and on a panel, Pause
outweighs Stop, "Mark done" outweighs "Delete". In light the grey fails in the three places the
lane named and I add a fourth:
- "Start" beside the primary break button is a mid grey block next to a red one. It does not
  read disabled, the label is ink, but it reads switched off.
- A lone full-width secondary on a white panel is the heaviest thing in its panel: "Sign out",
  "Make an invite link", "Copy the code", "Rename", "Make the room", "Join". "Cheer", the one
  warm act in the app, is a 340 by 48 slab of grey.
- "Add project" is #CBD0C9 on the form's #E4E7E2, 1.26 to 1.
- The stepper's minus and plus are two more grey slabs beside every figure.

**The recommendation, one:** in light the secondary is the quiet fill with a hair edge of ink.

| Token | Light | Dark |
|---|---|---|
| `key` | `#E4E7E2` (was `#CBD0C9`) | `#343934` (as now) |
| `key-edge`, new, 1px | `#121412` | `#343934` (the fill's own colour: no visible edge) |
| `key-quiet` | `#E4E7E2` (as now) | `#232623` (as now) |

Why it holds in all four cases:
- It outweighs quiet everywhere by construction: in light it is quiet plus an edge, on the
  ground and on a panel; in dark it is the lighter fill it is today.
- It cannot look disabled: an ink line and an ink word.
- It is not a choice: a choice is white with a grey `edge`, and chosen it is solid ink. This is
  grey with an ink edge.
- Primary stays the only `you` fill.
- "Add project" on the grey form is carried by its edge; a full-width "Sign out" weighs what a
  line weighs, not what 16,000 grey pixels weigh.
Light has no room above the ground for a second lighter step, so the weight has to come from a
line; dark has the room and needs none. I drew both in every context to check:
`/tmp/claude-1000/-home-ravindu644-Documents-Git-heirloom/21e87866-9129-4aa2-9bea-f43608303423/scratchpad/r12/mock.png`.
In dark the same edge made a secondary too like a choice, which is why dark keeps its fill.

**8. Sheets at 90dvh.** Acceptable. "This room" ends at y=767 of 915 and "Another room" at 516,
so 400px of blank surface lie under two fields and two buttons. It is top-anchored like every
form and the keyboard covers it. A better way to keep the rule: only a sheet in which something
can open needs the fixed height (the task, the habit). A sheet that cannot grow (Another room,
Archived, Recently deleted) can be as tall as what it holds, as before.

**9. Motion.** Nothing appears or goes between two frames in any strip. A row done fades and
closes while the Done row opens; an editor and a form open by height; the error opens above its
button; the sheet slides on the phone and fades on the laptop, both ways, with its scrim; a
screen fades in and rises; a people row closes and its sentence opens; a cheer's button gives
way to its line. Nothing is slow and nothing shows off. Two notes:
- `motion-row-moved`: for one frame the Next outline stands empty before its row arrives.
- `motion-progress-panel-emptying`: the link tapped travels 213px, because the page was near
  its top and had no scroll to give. `motion-hold-progress` holds to the pixel. Both are right.

**10. Everything else.** The header, headings, gaps and links are the same on every screen
opened. The earlier findings are in: "Your laps live on this server.", "Copy the link" on the
rows, the owner's phone Settings with the timer's panels before Invites.

## DESIGN.md's to fix

- **Buttons:** "Neither has a border" becomes "the secondary carries a hair `key-edge`", with
  the values above, if the recommendation is taken.
- **"What the last tap did" is written twice,** and the two disagree. One says "as wide as the
  list" and "never covers the row it speaks of"; the other says the bar stands at the foot and
  never scrolls the page. On a phone a task added to a list of five lands at the fold, under
  the bar that announces it (`motion-bar-rising`, last frames). Both rules cannot hold. Keep the
  second, and say what is true: the bar may lie over the last rows for its four seconds, and the
  list keeps a bar's height free so any row can be scrolled clear. Say the laptop's width too.
- **"What you tapped stays under your finger, to the pixel":** add "while the page has scroll
  to give".
- **The device's voice:** the date field reads 11/24/2026 here, as the time field reads 4:40 PM.
  The line about the time field should name both.

## The one thing that must survive

`motion-hold-progress`: 521px collapse above the link and the link does not move. That, and the
error that opens on its own line, are the difference between a page and an app. Any later change
to a list, a panel or a form is checked against it with the page scrolled half way down.

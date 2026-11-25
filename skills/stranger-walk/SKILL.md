---
name: stranger-walk
description: How to find what confuses a first-time user of heirloom before they do - two controls for one act, words that need the data model, numbers with no top, things that never close. Load at every UI gate after the design review, whenever the user says something is confusing or "makes no sense", and before any build goes into their hands.
---

# The stranger's walk

Pictures, audits and tests answer "is it drawn right". This answers "would someone who was only
handed the app know what to press, and what it did". The team cannot answer that by looking:
everyone on it knows how a lap is stored.

## Who walks

A fresh agent with no context from the build, never the lane that wrote the screen. Give it the
words (`client/src/ui/strings.ts`), the screens' code, the phone pictures, and what is already
known and being fixed so it does not hand those back. It is read-only and writes
`reviews/<section>/stranger.md`. Tell it to trace each handler before it lists a finding: a
stranger's guess about what a button does is the finding, the code is the proof.

## What it looks for

1. **Two controls for one act.** Two ways to stop, remove, close, save or undo the same thing,
   on one screen or across two. One goes, or they become one control with one name.
2. **A word that needs the data model or the book.** Lap, set, ghost, split, void, rest day.
   Where does a stranger meet it first, and does that screen say what it is?
3. **A name that changes while you look at it.** "Stop" that becomes "Stop and log 2 min" reads
   as another button. What a press will do is said in the line after it, not in the label.
4. **A number with no top, a text with no end.** Enter the largest value the field takes and a
   60 character title. The row, the sheet and the totals must all still read.
5. **Something that never closes.** A form, a picker, a mode. Answer its question from outside
   it: choose something else, close the sheet, go back. It must be gone.
6. **A press with no visible effect,** or with its effect on another screen and nothing saying so.
7. **A dead end.** An empty screen that does not say what to do first, an error with no next step.
8. **Two words for one thing, one word for two things,** across screens.
9. **A setting whose consequence is not said beside it.**
10. **A field the app does nothing with.** Ask of each: what does heirloom do with this?

## What the lead does with it

- Confirm each finding in the code or the built app; a stranger's report is a lead, not proof.
- A bug or a wording fix goes to the ui lane the same round. A change to what the product does
  (a control removed, a rule changed) is the user's: say what you would do and ask.
- Each fixed finding becomes a rule in `DESIGN.md` if it is about the UI, a row in
  `skills/taste-gate` section 9 or later if it is a way of checking, and a test or a demo state
  if a machine can see it.

## The other half: try the fix where it was not made

After any round of fixes, before the user sees the build, for each fix name three places it was
not tried and try them:

- another layer (a sheet, the bar, a menu, the inverted strip);
- another position (the top of a page, its end, a page that fits the screen whole);
- the extreme (the top value, a long title, an empty list, a list of fifty);
- the phone, with its real keyboard and its own pickers, when the fix touches a field.

How this was learned: the first hour's twelve fixes were each right where they were tested, and
the second hour found nine points, six of them one step to the side of a fix.

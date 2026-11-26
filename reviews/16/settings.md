# Section 16, Settings: "A way back in" (the owner's block)

Pictures: `reviews/16/shots/settings-owner*` at 412x915 and 1440x900, light and dark, all opened.
`node tools/design-audit.mjs`: 217 states, phone, wide and laptop, 0 violations. Every size,
colour and gap below is a token; the FAILs are about sameness with the sibling blocks and words.
Measured with `getBoundingClientRect()` on a build of the demo, beside Invites (`settings-admin`,
`settings-owner-invites`) and Admins (`settings-owner`, `settings-owner-unknown`).

## Verdict: FAIL

Three things a person sees: the open links' rows are drawn two ways in one list on a phone and
their link floats off the right edge on a laptop; the refusal looks like a note where Admins' looks
like an error; and two words differ from the siblings' for the same thing.

## Per state

| State | Verdict | Why |
|---|---|---|
| `settings-owner` (block empty) | PASS | Title, note, field, button at x=36 (phone) and 864 (laptop), like Admins. Gaps: note to label 16, input to button 16, all `md`. Button is secondary like "Make an admin", full width on the phone and its own width on the laptop, as the siblings |
| `settings-owner-reset` (a link just made) | FAIL | Row, below. The new-link block itself matches Invites' to the pixel: label 8, link 8, button 8, then 16 to the first row |
| `settings-owner-resets` (two open) | FAIL | Rows, below |
| `settings-owner-resets-taking` | FAIL | Rows, below. "Take it back" / "Keep the link" are the invites' words and the slot keeps the row still at the tap: good |
| `settings-owner-reset-unknown` | FAIL | Refusal, below |
| `settings-owner-reset-own` | FAIL | Refusal look, below. The words are right |

## Problems

1. **Rows in one list drawn two ways, phone.** `settings-owner-resets` at 412: "dilan, until 20:08
   today" has "Take back" beside it (x=212, same line); "sachi, until 10:08 tomorrow" has it under
   the words (x=36, next line), because the row is `flex-wrap` and only the shorter line fits. In
   `-taking` the same thing happens with "Take it back / Keep the link". Two rows, two heights, the
   link in two places. Breaks DESIGN.md Invites and Admins ("on a phone ... the line of links stands
   under them") and the row rule that a list's rows are one height. Invites' rows are always under.
   Fix in `client/src/ui/people.module.css`: under 720px give the slot its own line in every row,
   `.slot { flex-basis: 100%; }` inside a `@media (max-width: 719.98px)` (or the inverse of the
   existing 720 query). Invites already wrap, so they do not change.
2. **"Take back" off the right edge, laptop.** `settings-owner-resets` at 1440: the link spans
   x=1228 to 1289; the row, Invites' "Take back" and Admins' "Back to member" all end at 1392.
   103px of nothing after it. Cause: `.slot` is one grid cell as wide as the hidden "Take it back
   Keep the link", and the shown set sits at its start. Invites never shows this because its
   shown set is the wider one. Breaks Consistency (same job, same look) and One left edge's
   mirror, the right edge the siblings keep. Fix in `people.module.css`, inside the `min-width:
   720px` query: `.slot > * { justify-self: end; }`. Shared by both panels; Invites is unchanged
   by it.
3. **The refusal is drawn as a note.** `settings-owner-reset-unknown` and `-own`: the sentence is
   `p.note` in `muted` inside `<Fold role="status">`. Admins' refusal for the same mistake
   (`settings-owner-unknown`) is a plain `p` in `ink` inside `<Fold role="alert">`. DESIGN.md "An
   error has its own line ... in ink, with role=alert". Fix in `ResetsPanel`
   (`client/src/ui/people.tsx`): hold refusals apart from "Copied." and "Taken back.", and draw
   them as Admins does, `<Fold role="alert">{refused && <p>{refused}</p>}</Fold>`; keep the
   muted status Fold for the two reports. (Invites has the same muted refusal; that is older than
   this section, see the note at the end.)
4. **One refusal, two wordings.** Reset says "No account by that name on this server.", Admins
   says "Nobody by that name is on this server." for the same answer to the same kind of field.
   DESIGN.md, "One word for one thing, everywhere". Fix in `strings.ts`: `reset.errors.unknown`
   becomes "Nobody by that name is on this server." (`people` is declared after `reset` in that
   file, so the words are written again rather than pointed at).
5. **"until" where Invites says "runs out".** An open invite reads "…2f8Lw0 runs out on Mon 30
   Nov"; an open reset reads "dilan, until 20:08 today". Same job (when a link you gave stops
   working), two words, and "dilan, until 20:08" alone does not say what is until then: a stranger
   reads it as dilan being somewhere. Fix in `strings.ts`: `reset.whose` returns the name with no
   comma (the bold comma goes with it), and `reset.until` says `runs out at 20:08 today` /
   `runs out at 10:08 tomorrow` / `runs out on Fri 27 Nov`. The row then reads like an invite's:
   **dilan** runs out at 20:08 today.

## Words

| String | Verdict |
|---|---|
| "A way back in" | PASS. Plain, and it sits as "Your copy" does among the titles |
| "For someone who forgot their password. The link sets a new one, once, and works for 24 hours. Using it signs their devices out." | PASS. Says what the link does, for how long, and what it does to the other person before it is made |
| "Username" | PASS. Optional: Admins' field carries "Someone who already has an account here."; a hint here such as "Theirs, the name they sign in with." would head off the own-name refusal before it happens |
| "Make a reset link" | PASS. Says what it makes |
| "The new link" | PASS, the invites' label |
| "Give it to dilan yourself. It is shown only now." | PASS. Who to give it to, and why to copy it now. The best line in the block |
| "Copy the link" | PASS, the one name it has everywhere |
| "dilan," / "until 20:08 today" | FAIL, problem 5 |
| "Take back" / "Take it back" / "Keep the link" / "Taken back. That link no longer works." | PASS, the invites' words |
| "No account by that name on this server." | FAIL, problem 4 |
| "Your own password is reset on the server itself, with heirloomd -reset." | PASS. Specific, and the owner is the one person who has the server. Optional: name the whole command with their own name, "with heirloomd -reset ravi", since the flag takes a username |

No em dash, no "recover", nothing asks for an email.

## Must survive

The new link is told with whose it is and why it must be copied now ("Give it to dilan yourself.
It is shown only now."), and it stays after Copy: a link that cannot be shown again is never
taken off the screen by the act of copying it.

## Not this section's, for the lead

- Invites' own refusals ("This server has 50 invites open...") are also a muted `role="status"`
  note, against DESIGN.md's error rule. Fixing problem 3 in a way both panels share would close it.
- Both people panels put a refusal under the button it answers; DESIGN.md says directly above.
  The panels' comment gives a reason (nothing moves under the finger). Either DESIGN.md names the
  Settings panels as the exception or the panels follow the rule; today the two disagree.

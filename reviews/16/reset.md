# Section 16, the page a reset link opens

Pictures: `reviews/16/shots/reset*` at 412x915 and 1440x900, light and dark, all opened.
`node tools/design-audit.mjs`: 217 states, 0 violations. Measured on a build of the demo beside
the sign-in form (`signed-out`, `signin-wrong`).

## Verdict: FAIL (one thing)

The live page is right. A dead link swaps the whole form for another between two frames.

## Per state

| State | Verdict | Why |
|---|---|---|
| `reset` | PASS | Heading at y=56 (phone) / 32 (laptop), the same as Sign in's. Heading to name line 16, name line to label 16, input to hint 4, hint to button 16: the sign-in form's rhythm exactly. One field, one primary button, the form's button after its last field. The name line holds its 23.2px from the first frame, so "For sachi, on ..." arriving moves nothing |
| `reset-short` | PASS | The error opens above the button in ink with `role="alert"`, 39.2px (line plus `md`), the same as `signin-wrong`. The hint "8 characters or more" stays. Words: see below |
| `reset-dead` | FAIL | In the demo `look()` answers in a microtask, so the picture is clean. On a real server the form (field, hint, red button) stands for one round trip and is then replaced in one frame by the sentence and "Back to sign in". DESIGN.md: "Don't let anything appear, go or move between two frames." The sentence lands on the name line's place (both y=100.8), so only what is under it has to move. Fix in `client/src/ui/reset.tsx`: one form for both cases; under the heading a kit `Fold` whose parts are either [name line, field, error and button] or [the dead sentence, "Back to sign in"], keyed, so the field closes and the button arrives in `fill` time. The same path covers a link found dead on submit |
| `reset-signed-in` | PASS | Heading, one sentence, one secondary button, the same 16px steps; no nav item is lit, right for a page that is none of the five |

## Problems

1. `reset-dead`: the form is swapped for the dead page between two frames on any real network.
   Fix above.
2. Not a FAIL, for the lead: a username of 25 or more characters (32 are allowed) wraps "For
   <name>, on <host>." to two lines at both sizes (measured: 46.4 against the 23.2 reserved), so
   the field drops 23px when the name arrives. Rare; if it matters, reserve `2lh` in `.whose` and
   write the line to two lines' length, as `.intro` does on the sign-in form.

## Words

| String | Verdict |
|---|---|
| "A new password" | PASS. Says what the page is for, in every state |
| "For sachi, on heirloom.example." | PASS. Whose and where, the two things a stranger handed a link needs |
| "New password" / "8 characters or more" | PASS |
| "Set it and sign in" | PASS. Says both things the one tap does |
| "A password is 8 characters or more." | PASS, with a note: it repeats the hint right above it word for word, a rule and not what happened. "That is 5 characters. A password is 8 or more." (`reset.short` taking the length) says what happened, then the way on (Voice 1 and 2) |
| "This link no longer works. Ask whoever runs the server for a new one." | PASS. Says so and who to ask, as DESIGN.md asks. Optional and warmer: the link came from a person by hand ("Give it to dilan yourself"), so "Ask whoever gave it to you for a new one." names someone they actually know |
| "Back to sign in" | PASS. The page is not a dead end |
| "Sign out first to use this link." / "Settings" | PASS. Optional: the page does not say whose link it is; "This link sets a new password for sachi. Sign out first to use it." would stop an owner who opened a link they made for someone else from signing out and landing in that account |

No em dash, no "recover", nothing asks for an email.

## Must survive

The name line is held empty from the first frame and filled in place, so the field never moves
while the server is asked. Keep that when the dead state is folded in.

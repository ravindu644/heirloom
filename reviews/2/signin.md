# Section 2: sign in

## Second pass, 2026-11-25. Verdict: PASS (no regression)

All 213 pictures opened (taken 01:47 to 01:48, after the last UI change at 01:46): phone, small,
and the light laptop and tablet sets at full size or close to it, the dark laptop and tablet sets at
about 80%. DESIGN.md read again: Colors, Layout, Components.

- The username hint reads "3 to 32 characters: a to z, 0 to 9 and _" (`signed-out-join-*`), and
  the `bad_request` sentence matches. Fixed.
- The three missing pictures exist. `signed-out-busy-*`: "Signing in". `refused-again-*`: the
  username filled in and "Not now". `signed-out-joinerror-*`: the longest error fits the two kept
  lines at 412 and nothing below it moves.
- **The join form above the keyboard: pass.** `signed-out-join-keyboard-phone-light` (412x500):
  the focused field, its hint and the Join button are all in view with 16px to spare, the focus
  ring is 2px ink, and the page scrolls so the heading is reachable. A 500px window is a stand-in:
  the user should type on the real keyboard once.

Not blocking:

- `signed-out-joinerror-*`: "...or it has been used. A / code works once." leaves "A" hanging at
  the end of line one. `text-wrap: pretty` or balance on the intro and error line ends it.
- `account.error` `unsaved` ("Not yet. Your last changes could not be saved here...") is new and
  has no picture. It is about three lines at 412 in a two-line slot, so the form will move one line.
  Words pass the voice.
- The button grows from "Sign in" to "Signing in" and pushes "I have an invite" 22px right for
  the length of the request. Leave it.

## First pass, 2026-11-25 (kept as written)

Pictures: `signed-out`, `signed-out-join`, `signed-out-error`, each at 412x915 and 1440x900, light
and dark. All 12 opened.

### Verdict: PASS

Two word fixes for the copy pass and three pictures to add. Nothing blocks.

### Problems

1. **The username hint reads like a pattern.** `signed-out-join-*`: "3 to 32 of a to z, 0 to 9
   and _" has three "to"s and no noun. Voice rule 6, short sentences with one idea. Fix: "3 to 32
   characters: a to z, 0 to 9 and _". The same phrase is in `account.error` `bad_request`.
2. **Three states have no picture.** The busy button ("Signing in", "Joining"), signing in again
   after the server signed the device out ("Not now" in place of "I have an invite"), and an error
   on the join form, where the longest one is ("That invite is not known here, or it has been
   used. A code works once."). The intro keeps two lines; check that this error fits them at 412.

Not blocking:

- On the laptop the form is a 396px column alone in the middle of 1440. That is every sign-in
  page. It passes because the mark and the sentence carry it; do not add decoration to fix it.

### The Look table

| Test | Result |
|---|---|
| Squint | Pass. The heading, then the one filled button. |
| One action | Pass. "Sign in" or "Join" is the only `you` button; the switch is a text button. |
| Reference | No sign-in in the reference. Fields on `surface` with a 1px `line` border, 4px radius, 48px tall, no shadow: inside DESIGN.md. |
| Logo test | Pass, by the words. "Your laps live on your own server" would be wrong under any other name. |
| Thumb | Pass. The button sits at y=623 to 671 of 915. |
| Dark | Pass. Fields step by tone (`surface` on `ground`), text 7.3:1 or better. |

### The words

Every string in `account` read against the Voice section.

- Pass: "Your laps live on your own server. Sign in and this phone keeps step with your other
  devices." Says why to sign in, in the product's own picture.
- Pass: "Accounts here are by invite. One code makes one account."
- Pass: "Too many tries. This username can sign in again in 12 minutes." A number, no blame.
- Pass: "That username and password do not match.", "That username is taken. Pick another.",
  "Needs a connection. Nothing was sent.", "The server tripped over that. Nothing was stored. Try
  again." Each says what is safe.
- Fix: the username hint and the `bad_request` sentence, problem 1.
- No exclamation mark, sentence case on every button, no padding word, no em dash.

### Keep

The error takes the place of the intro sentence, in `ink` instead of `muted`, and the form does
not move. No red (red means you), no banner, no shake. A later change must not add an error
colour.

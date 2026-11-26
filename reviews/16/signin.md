# Section 16, the sign-in screen: where a forgotten password leads

Pictures: `reviews/16/shots/signed-out*` (browser) and `signin-phone*` (phone app) at 412x915 and
1440x900, light and dark, all opened. `node tools/design-audit.mjs`: 0 violations. Measured on a
build of the demo, with `signin-wrong` beside them.

## Verdict: PASS

## Per state

| State | Verdict | Why |
|---|---|---|
| `signed-out` | PASS | The line stands 16px (`md`) under the buttons at the form's edge (x=20 / 264), `body` in `muted`, two lines. It is text and does nothing, and it looks like it does nothing. In `signin-wrong` the error opens above the buttons and the line moves down with them, still right under "Sign in", where someone who just got "That username and password do not match" looks next |
| `signin-phone` | PASS | The same place and rhythm; three lines (69.6) where the browser's has two, then the divider and "Server: heirloom.example / Change" as before |

## Words

| String | Verdict |
|---|---|
| "Forgot your password? Whoever runs this server can give you a link that sets a new one." | PASS. Says where it leads and who; no email, no "recover", no blame |
| "Forgot your password? Whoever runs this server can give you a link. It opens in a browser: set the new password there, then sign in here." | PASS. The browser detour is the one thing a phone user would not guess, and it is said. Optional, nearer DESIGN.md's "one muted line": "Forgot your password? Whoever runs this server can give you a link. Open it in a browser, then sign in here." (setting the password is what the page itself asks for) |

## Problems

None. ("this laptop" in the phone picture is the capture: `s.device()` reads `pointer: coarse`,
which a headless browser does not have.)

## Must survive

The line appears only on the sign-in form, never on join or setup, where there is no password yet
to have forgotten, and it is a sentence, not a "Forgot password?" link to a page that could only
say the same thing.

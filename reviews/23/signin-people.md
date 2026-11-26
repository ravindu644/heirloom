# Review 23: the browser's sign-in in two halves, People's line, circles on their way

Measured on a build of the demo (as `tools/design-audit.mjs` builds it) at 412, 320, 720, 760,
800, 900 to 1280 in steps, 1024, 1440 and 1920, light and dark; the phone pictures compared pixel
for pixel with a build of HEAD. `node tools/design-audit.mjs`: 255 states, 0 violations. The audit
does not run at 720 or 1024 and has no state with a call picker opened at the end of a page, so
everything below was found with a ruler.

## Verdict: FAIL

Five things fail: two left edges 8px apart on every signed-out screen from 720px, an empty 32px
gap between the tabs and the hours, the call picker opening behind the bottom bar, circles that
lose their letters for good when a picture cannot be fetched, and the reset page. The halves
themselves are built as drawn and pass.

## The points the lead asked about

| Point | Mark | Measured, and the fix |
|---|---|---|
| Halves split at 50% | PASS | Ground 0 to 720 and `surface` 720 to 1440 at 1440; 512/512 at 1024; 360/360 at 720. The surface half runs to the content's end when the window is short (1280x600: 671px, scrolls in `main`) |
| Both tops 112px down | PASS | Drawing top 112.0 and h1 top 112.0 at 720, 1024, 1440, 1920, in all three states (signed out, join link, setup). The heading's cap stands about 5px under its box top; within what the eye forgives at 300px apart |
| Form 44ch, centred on `surface` | PASS | 396px at 1024 and up (882 to 1278 in 720 to 1440, centre 1080); 296px at 720 (half less a gutter each side), centre 540 |
| Left block centred in its half | PASS | Centre 360 at 1440 (143 to 577). Title, drawing and sentence share one left edge in every width measured |
| The drawing's size | PASS | 56px squares at 1440, 39.9 at 1024, 36 at 720 (the floor holds to about 940 wide, then grows). Matches DESIGN.md |
| Contrast in dark | PASS | Same tokens as the welcome; `muted` on `dark-surface`, `edge` around fields on `dark-surface` (4.5:1), the quiet "I have an invite" (`key-quiet` on `dark-surface`) still reads as a fill. Nothing navy, nothing glowing |
| Nothing orphaned or floating | FAIL (small) | At 720 to 800 the sentence ends "...nowhere else. It / is free.": one short word left on the last line. Fix: `text-wrap: pretty` on `.about .words p` in `client/src/ui/welcome.module.css` |
| Mark and the left block share an edge | FAIL | See finding 1 |
| Reset page (not split) looks intended | FAIL | See finding 5 |
| Phone layout unchanged | PASS | signed-out, join-link, setup, reset, signin-phone at 412, 471 and 320, light and dark: pixel-identical to HEAD (with the port in "localhost:NNNN" made the same) |
| People line: one line of two links | PASS | One line at 412 and at 320 ("Make or join another room" ink 21 to 170, "Call a lap together" 195 to 299, 25px apart at 320, at least `md`). Ink ends 1px inside the panels' edges at both ends, which is the underline's bearing |
| Hours row no longer touches the first panel | PASS | Hours row bottom 226.6, first panel top 234.6: 8.0px, `space-sm`. Panels 8.0px apart |

## Problems

1. **Two left edges 8px apart on every signed-out screen from 720px.** The mark's ink starts at x=24 (the
   sidebar's place, the same as when signed in, which is right). Content starts at 32: the
   reset page's heading, field and buttons at every width; the left half's title and drawing
   from 720 to about 940; and in the phone app turned sideways (915x412), sign-in, welcome and
   server step. Breaks DESIGN.md Layout, "One left edge", and taste-gate "One left edge". Fix: in
   `client/src/ui/shell.module.css`, give the `.out` frame's canvas a `layout.gap` (24px) inline
   inset so content meets the mark. In `client/src/ui/welcome.module.css`, change `.block`'s
   `max-width` to subtract `2 * var(--layout-gap)` instead of the gutter, so a narrow half puts
   the block on 24 exactly.
2. **People has an empty 32px gap between the tabs and the hours** (tabs bottom 169.7, hours top 201.7
   on a phone; 145.7 to 177.7 at 1440). The empty `Fold` that holds "You started this lap
   together" still takes a grid row, so `.tab`'s `md` gap is paid twice. 32 is not a spacing
   step. Breaks DESIGN.md Rhythm ("every vertical space is a step of the spacing scale"). With
   the line there it is 16 + 16 and correct. Fix in `client/src/ui/room/room.tsx`: move the
   together `Fold` inside `.people`, or drop the empty fold's slot (`.tab > :empty { display: none }`
   in `room.module.css`), so the tabs stand `md` above the hours.
3. **On a phone the call picker opens behind the bottom bar.** At 412x915, scrolled to the end as
   a person must be to reach "Call a lap together", the tap opens the picker in the line's place:
   "When it starts" at y=786, the stepper cut by the bar at 850, and "Call the lap" and "Not now"
   at 867 to 915, under the bar. Nothing on screen answers the tap. Before this change it opened
   under the tabs, in view. This breaks taste-gate section 9 ("the field has room above and below")
   and DESIGN.md Motion ("script scrolls only as the direct answer to a tap that asks for it":
   this tap asks). Fix in `client/src/ui/room/room.tsx`: once the `Caller` has opened, bring its
   last button into view with `block: 'nearest'`, as the answer to that tap only.
4. **A circle whose picture cannot be fetched keeps its hue and never gets its letters.** `Face` shows
   letters only on the `Image`'s `onerror`. But when `rooms.picture(hash)` resolves `null`
   (offline, a 404, another account), `usePictures` and `usePicture` never get a URL. `pending`
   stays true, so the circle is `.pictured` (transparent letters) for good. On a room opened
   offline, friends with pictures are blank coloured discs. The header chip does the same when
   your own picture is not kept. Breaks DESIGN.md Components, "A person's circle ... otherwise
   their colour and letters, everywhere", and the lead's own "letters only when it fails". A
   fetch that answers nothing is a failure. `room-pictures-broken` only tries a URL that fails to
   load. Fix: in `client/src/ui/picture.ts` and `usePictures` in `room.tsx`, record a fetch that
   settled with no URL, and pass `pending={false}` for that hash. Add a demo state where
   `engine.picture` answers `null`, so the audit sees it.
5. **The reset page hangs in the top left of the laptop.** At 1440 a 396px column (32 to 428) sits
   under the mark with 1000px of empty ground to its right. Its heading is at 92.8 while the
   sign-in it returns to ("Back to sign in") puts its heading at 112, so the heading jumps 19px
   between two screens of one flow. Breaks DESIGN.md Layout, "Free space goes to one place" (here
   it is at the right and the bottom), and Consistency (a signed-out form's heading is in two
   places). Fix: draw the reset page in the same frame as sign-in, with the form in the `surface`
   half at 112px and the left half as on sign-in. Or, if the user wants it plain, keep the one
   column but start its heading at 112 and fix its edge as in 1. Either way, DESIGN.md gets one
   line for it under "A way back in".

## DESIGN.md's to fix

- Line 578 says "nothing stands between the tabs and the hours". Line 598 still says "When it starts,
  People opens with 'lina and you started together at 15:00.' and the link 'Call a lap
  together'". The line does stand there, and the link has moved under the last panel. Make 578 say
  "nothing but the line that says a lap was started together". Make 598 say the link is in its
  place under the last panel.

## Words

Read against Voice:

- "Your laps live on this server. Sign in and this laptop keeps step with your other devices."
  stands level with "Laps, tasks and habits live on a server that you or a friend runs, and
  nowhere else." in the other half. One screen now says the same fact twice, side by side at one
  height. Taste-gate section 13: "say a state once". Fix in `client/src/ui/strings.ts`, only where
  `About` is shown: `signInIntro` keeps "Sign in and this laptop keeps step with your other
  devices." The phone app's sign-in, which has no `About`, keeps both sentences.
- "Forgot your password? Whoever runs this server can give you a link that sets a new one. If
  that is you, run heirloomd -reset with your username on the server." This is three lines at
  1440, where DESIGN.md asks for "one muted line". It was there before this change and is not
  failed here. The lead's copy pass should decide whether the second sentence moves to the
  owner's Settings.
- "Your days stay yours.", "Join with an invite", "Set up this server", "There is no account
  here yet. The first one runs this server: it can invite people, and decides who else can.",
  "A new password", "For sachi, on ...", "Set it and sign in", "Back to sign in", "Make or join
  another room", "Call a lap together", "When it starts", "Call the lap", "Not now": plain,
  specific, sentence case, no padding, no exclamation marks. PASS.
- "You started this lap together at 16:34." does not say who with, where DESIGN.md's sample
  names them ("lina and you started together at 15:00."). It is older than this change; noted
  for the copy pass.

## Keep

The two tops on one line, 112px down, with the drawing's squares grown from the half's own width
(36 to 56px) and not from the window. At every width from 720 to 1920 the drawing and the form's
heading start on the same line, and the drawing is never a stamp in a big half. Do not lose that
when the halves get a third thing.

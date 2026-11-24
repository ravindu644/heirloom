# Section 2: the shell

Navigation, the account line, the quiet indicator, the pages not built yet.
Pictures: `idle`, `offline`, `refused`, `unsaved`, `idle-today`, `idle-progress`, `elsewhere`, each at
412x915 and 1440x900, light and dark. All opened.

## Verdict: FAIL

Four things to fix in the ui lane, one for the lead. The shell's bones are right.

## Problems

1. **Laptop frame is lopsided.** Every laptop picture: the canvas runs x=240 to 1384, so 8px after
   the sidebar and 56px before the right edge. DESIGN.md Layout: "the canvas at 32px gutters"
   (232 + 32 + 1144 + 32 = 1440). The reference ends at 1408 too. Fix: in the 720px block `.main`
   takes `--layout-gutter` on the left as well, so the canvas runs 264 to 1408.
2. **The status line touches the buttons on the phone.** `offline-phone-*`, `unsaved-phone-*`: the
   Pause button ends at y=824, the sentence starts at y=829. 4px is `xs`, the gap inside a lap bar;
   here it makes the sentence read as Pause's caption. Fix: `sm` (8px) above the line in `.status`.
3. **Being signed out moves the buttons and contradicts itself.** `refused-phone-*`: the status
   grows by the 48px "Sign in again" target and Pause jumps from y=777 to 729, against the lane's
   own rule in `app.module.css` ("losing the connection must not move the buttons"). The header
   still offers "Sign out" beside "The server signed this phone out." Fix: while refused, the
   account line's action is "Sign in again" (it replaces "Sign out"); the status keeps its one line.
4. **The worst state has no picture and an unclear word.** `status.unsaved` with no connection
   ("No connection, and this phone cannot save right now. Keep heirloom open until one comes
   back.") runs to two or three lines at 412, so it will move the buttons, and "one" could be the
   connection or the save. Fix: "...until the connection comes back."; capture it on the phone;
   make it fit the kept line or accept the move in writing.
5. **For the lead: sizes and colours outside DESIGN.md.** DESIGN.md Layout says 720px is "the one
   size written in CSS". `focus.module.css` also holds `411px`, `1280px` and `168 / 412`;
   `button.module.css` mixes the hover and press colours at 12% and 24%. `style-check` passes
   because it does not look at sizes or `color-mix`. Fix: name them in DESIGN.md (two breakpoints, the
   figure ratio, hover and press) and let `tokens.mjs` write them.

Not blocking:

- 80 of the 104 pictures were taken at 01:25; `focus.tsx`, `focus.module.css`, `app.tsx` and
  `app.module.css` changed at 01:29 to 01:30 and `strings.ts` at 01:31. Only `idle`,
  `running-behind`, `undo-*` and `elsewhere` show the current layout (phone digits 12px higher).
  Take the whole set again before the user gate.
- Sidebar rows are 36px. A tablet 720px or wider gets this layout with a finger. DESIGN.md says
  48px with no exception: make them 48, or write the fine-pointer exception into DESIGN.md.
- The account line holds the sidebar's foot, where section 7's room list goes in the reference.
  Decide in section 7 which one moves.
- No picture between 720 and 1279 wide (sidebar with 168px digits). Add one at 1024x768.

## The Look table

| Test | Result |
|---|---|
| One action | Pass. The shell adds no filled button. |
| Reference | Sidebar, nav pill on `raised`, bottom bar with the 2px `you` line: match. The frame drifts, problem 1. |
| Logo test | Pass. The tomato dot beside the dashed ghost ring is this product and no other. |
| Empty state | Pass. The four later pages say what will live there, no picture, no "Nothing here yet". |
| Thumb | Pass. Five labelled destinations, 64px tall, at the bottom. |
| Dark | Pass. Ground #0E100E is neutral, nothing glows, muted is 7.3:1 or better. |

## Rulings

- **"Not built yet." pages: upheld.** Honest, specific, and each names what the laps already do
  for it ("Every lap you run now is kept for it."). Each string is deleted by the section that
  builds its screen; none ships in v1.
- **Saying nothing when in step: upheld.** PRODUCT.md asks for a quiet indicator. Silence when
  synced and one plain sentence when not is the quiet version.

## The words

Read against the Voice section: `nav`, `later`, `status`, `elsewhere`, `brand`.

- Pass: "No connection. 3 changes are safe on this phone." What happened, then what is safe, and it
  names the device.
- Pass: "This laptop cannot save right now. Your laps still reach the server."
- Pass: "Needs a connection. 3 changes are only on this phone, so you stay signed in until they
  are sent." A refusal that explains itself.
- Pass: "heirloom is open in another tab of this browser. Close that one and this one takes over
  by itself."
- Fix: "until one comes back", problem 4.
- No exclamation mark, no title case, no padding word, no em dash.

## Keep

The status line. It keeps its row when it has nothing to say, so losing the connection moves
nothing, and when it speaks it says where the laps are in a person's words. On the laptop it sits
in the sidebar's foot in `label` and `muted`. Do not turn it into a badge, an icon or a toast.

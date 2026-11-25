# Section 10: the server step, setup, joining by a link, Invites and Admins

## First pass, 2026-11-25

| Screen | Verdict |
|---|---|
| The server step | PASS |
| Setting up a fresh server | PASS |
| Joining from a link | PASS |
| Sign in, in the phone app | FAIL, one sentence |
| Invites | PASS |
| Admins | PASS |
| Settings as a whole, for the owner | PASS |

Pictures: 200 in `reviews/10/shots/`, 20 states at phone, wide (471), laptop and whole pages,
light and dark. Every one opened: the light phone states and four laptop states at reading size,
the rest as sheets. Taken 11:31, before two strings changed, so the words were read from
`strings.ts` (`server`, `people`, `account`) and the positions from the running demo at 412,
1440 and 320. `node tools/design-audit.mjs`: 130 states, 0 violations.

## Problems

1. **Sign in tells a friend the server is their own.** `account.signInIntro`: "Your laps live on
   your own server." One tap earlier the server step says "a server that you or a friend runs",
   and with three roles most people who read this line are members on someone else's. Voice:
   specific. Fix: "Your laps live on this server. Sign in and this phone keeps step with your
   other devices."

Nothing else breaks a written rule.

## What was looked at hardest

- **The server step as a first screen.** It reads as written by a person: "Which server?",
  "Say where it is.", and a button that turns to "Asking it". One field, one button, the mark.
  The lower 598px of a 412x915 screen are empty and that is right: a form's button follows its
  last field, and the keyboard takes that half the moment the field is touched. It is a config
  form only in the sense that it is honest about being one.
- **Refusals.** At 412 all four stand on the intro's two lines (y 101 to 147) and the field stays
  at y=184. At 320 a refusal takes three lines and the field moves 23px; see the ruling.
- **The plain-http line.** On the server step it shows when the screen opens on a plain address
  (`server-plain`), not while typing, so nothing jumps under a thumb. On sign-in it stands under
  a hairline, 33px below the buttons, muted, after "Server: 192.168.1.20:8787" and "Change". It
  is where a person reads it before typing a password. A fact, not an alarm, and it does not
  crowd the form. At 320 it takes three lines and still fits above the fold.
- **The fresh link.** Whole, in `body`, `user-select: all`, never past the edge at 412 or 320.
  It breaks wherever the line ends: see "one thing to look at".
- **Invite rows on a phone.** Words, then the three links under them at 36 to 89, 105 to 153 and
  169 to 230, each 48px to touch, the same at 320. Rows are 70px.
- **The second tap on "Take back".** "Take it back" appears at the left, where "Copy link" was,
  away from the finger; on the laptop "Keep it" takes the place "Take back" had. A double tap
  never takes a link back. Good.
- **Admins.** The owner's row is the admins' row without a link: a circle, a name, the word
  "owner" in the label grey that "admin" uses. No crown, no order of merit, no colour. "Back to
  member" works at once and leaves "dilan is a member again." with Undo. The field follows the
  list and its button the field. Nothing reads as rank.

## PRODUCT.md section 7, the three new rows

| Row | Delivered | Where |
|---|---|---|
| The phone app asks which server: an address or a pasted invite link, typed once, changed only while signed out. Plain `http` is allowed and said plainly | Yes. The hint names both; "Change" lives on sign-in only; a signed-in phone is told to sign out first; the plain line is said on the step and under the account. | `server-*`, `signin-phone-*`, `settings-plain-*` |
| A fresh server is set up from the app: the first account needs no invite and is the owner | Yes. "There is no account here yet. The first one runs this server: it can invite people, and decides who else can." No invite field. | `setup-*` |
| Three roles: member, admin, owner | Yes. A member's Settings has neither panel (nothing drawn disabled); an admin has Invites with make, renew and take back; the owner has Admins too. An admin lowered meanwhile reads "Inviting is no longer yours on this server." | `settings-plain-*`, `settings-admin-*`, `settings-owner-*`, `settings-demoted-*` |

## The Look table

| Row | Result |
|---|---|
| Tells (logo wall, steps counter, role badges, a red warning box) | Pass. None. |
| The header | Pass. Mark and name; no person while nobody is signed in. |
| One left edge | Pass. 20 on the forms, 36 in the panels, measured. |
| Rhythm | Pass. The audit holds it; the server line sits 33px under the buttons behind a hairline. |
| Free space | Pass. Forms stand at the top, the rest lies under them. |
| Pressable | Pass. Secondary buttons for making and copying, links in a line for the rest. |
| Down to 320 | Pass. Nothing scrolls sideways; "minutes" drops under its stepper, the link wraps. |
| Dark | Pass. |

## Rulings on the lane's two decisions

- **The row's links under the words on a phone: upheld.** Words and three links need about 420px
  and the panel has 340. Under the words they are one line at 412 and at 320.
- **A refusal held to two lines at 412: upheld.** That is the width the phone is drawn for and
  every wider one. At 320 it costs one line and the field moves 23px, once, while the thumb is
  on the keyboard and not on the field.

## What the audit cannot see

The words. Whether a refusal keeps the field still below 412. How the link breaks. Where a second
tap lands. The order and the length of Settings for an owner. Whether a first screen feels cared
for. All of that is above or below, by hand.

## The words

Read as the tenth time. Kept as written unless named.

- The server step: all four refusals say what happened and what to do, with no "error" and no
  "invalid". "Nothing answered at that address. Is this phone on the same network as the
  server?" is the best line in the section.
- `people.*`: "You can invite people here." and "You decide who can invite." name the role by
  what it does. "No invite is open." "Taken back. That link no longer works." "The owner stays
  the owner. Nothing was changed." "Nobody by that name is on this server." All plain.
- "Inviting is no longer yours on this server. Whoever runs it changed that." is firm and does
  not blame. Keep.
- `account.setup*`: right, and it explains owner without the word.
- `linkRefused` is three lines and every clause earns its place.
- Problem 1.
- Small: the new link's button is "Copy the link" and a row's link is "Copy link". Same job,
  one name: "Copy the link" fits the row (the three would end near x=250; the panel's edge is 376).

## One thing to look at

Taste, not rule, in the order I would do them:

1. **The owner's Settings on a phone is 2,929px, and the timer's own settings start at y=1387.**
   A member's page is 1,911. The owner opens Settings to change a break and meets Invites and
   Admins first. On the laptop the people panels sit in the right column and cost nothing. On the
   phone I would keep Account first, then the timer's panels, then Invites, Admins, Rooms and
   Your copy: the things about other people together, after the things about your own laps.
   DESIGN.md says "under Account"; if that stays, it stays for a reason worth writing down.
2. **The link breaks inside its code at 412:** "...#/join/Hy6c2WfT9oD" and "n5s1B" alone on the
   next line, while the row under it is named by the last six, "...Dn5s1B". A break allowed after
   "/join/" would keep the code in one piece on the second line.
3. **The empty Server field shows no example.** The shape of an address is taught only by the
   first wrong try ("An address looks like 192.168.1.20:8787."). The same example as the field's
   placeholder would spare that try.

## Keep

"Asking it" on the button while the app looks for the server, and "Nothing answered at that
address." when it finds none. The app talks about the server as a thing in a room somewhere,
which is what it is. Do not let a later change turn these into "Connecting..." and "Network error".

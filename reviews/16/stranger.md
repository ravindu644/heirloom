# Section 16, the stranger's walk: a way back in

Walked from the phone-light pictures of every state in `reviews/16/shots/` (laptop where the
layout differs: `settings-owner-resets`, `reset`), the `reset` block of `client/src/ui/strings.ts`,
and the handlers in `client/src/ui/people.tsx` (`ResetsPanel`), `client/src/ui/reset.tsx`,
`client/src/ui/app.tsx` (`useReset`), `client/src/ui/signin.tsx`, `client/src/sync/resets.ts`,
`client/src/sync/server.ts` (`inviteIn`) and `server/cmd/heirloomd/main.go` (`-reset`). Left out as
already known: the rows' layout, refusal look and wording in `settings.md`, the dead-link fold and
the long-name wrap in `reset.md`, and plain http's Copy (findings.md [10]).

## 1. The owner, making a link for dilan

- **Finding the block.** The Settings titles read "The bell", "A finished lap", "Invites",
  "Admins", "A way back in", "Rooms", "Your copy". Looking for "password", no title has it; I find
  it by the note's first words, "For someone who forgot their password." Slight hesitation only.
- **"Username".** Clear enough beside "ravi" in the header. Typing my own name to try it gives
  "Your own password is reset on the server itself, with heirloomd -reset." Run as written,
  `heirloomd -reset` fails: the flag needs the name (`heirloomd -reset ravi`), and the data path
  if it is not the default.
- **"Make a reset link".** The link, "Give it to dilan yourself. It is shown only now.", "Copy the
  link": the best moment of the walk. Under it the row "dilan runs out at 14:15 tomorrow" with
  "Take back" reads at first glance as a second link, but the name and the hour tie it to the one
  above.
- **A second link for dilan.** Say dilan says "it did not work" and I press "Make a reset link"
  again. The first one dies at that moment (`resets.ts`: "one it already had is dead from this
  moment"); nothing on screen says so. If I had sent both, dilan may open the old one first. The
  dead page handles it ("Ask whoever gave it to you"), so dilan comes back to me, but I would not
  know why.
- **Three names for one thing.** "A way back in" (title), "reset link" (button), "A new password"
  (the page dilan sees), `-reset` (the server). Each reads fine alone; the owner telling dilan
  "I sent you a reset link" and dilan seeing "A new password" still match up. No change needed.

## 2. The owner who forgot their own password

- **Stuck.** Signed out, I see "Forgot your password? Whoever runs this server can give you a link
  that sets a new one." I am whoever runs this server. Nothing on this screen says what I do.
  The only place `heirloomd -reset` is named is a refusal in Settings, which I can see only signed
  in, and only after typing my own name there. Dead end.
- If I do find the command, it prints "This is the last part of the link to give ravi:
  <server>/#/reset/..."; I must put my own address in place of `<server>`. Fine for someone at a
  terminal.
- For the user, not a wording fix: findings.md [10] says a server on a phone is set up from the
  app with no terminal. An owner without a terminal has no way back at all.

## 3. dilan, opening the link on a laptop

- **"A new password" / "For sachi, on heirloom.example." / "New password" / "Set it and sign
  in".** Clear: whose, where, one field, what the button does. No hesitation.
- **Nothing says my phone is signed out.** The owner was told ("Using it signs their devices
  out"); I am not. Later the phone says "The server signed this phone out. Your laps are safe on
  it." I can probably connect the two, but the page I was on could have said it.
- **Already signed in on this laptop** (`reset-signed-in`): "This link sets a new password for
  sachi. Sign out first to use it." and one button, "Settings". I hesitate: the button does not
  say sign out is there, and I assume that after signing out I must find the link in my messages
  again. In fact the app holds the link and shows the reset page the moment I am signed out
  (`app.tsx`, `!account && link.reset`). The words could promise that.
- **No way off the live page.** The live form has no "Back to sign in" (only the dead one does).
  If I remember my password halfway, a reload is the only way out; the address already says
  `#/focus`, so a reload works, but a stranger does not know that.
- **A reloaded tab loses the link.** The link is read once and the address made `#/focus`.
  If the browser reloads the tab (a phone browser does this after an app switch to a password
  manager), I land on Sign in with no trace of the link. The link still works if I tap it again
  in my messages; nothing says so, and the sign-in line sends me to ask the owner for a new one,
  which kills the first.

## 4. sachi, who only uses the phone app

- **"Forgot your password? Whoever runs this server can give you a link. It opens in a browser:
  set the new password there, then sign in here."** Clear before the fact.
- **Pasting the link into the app.** Holding "a link" from the owner, the one button on this
  screen about links is "I have an invite". I tap it and paste the whole link into "Invite". It
  says "There is no invite in that. Paste the whole link, or its last part." I did paste the whole
  link. Wrong advice, and the reset line that would have helped is gone with the sign-in form.
  (`inviteIn` matches only `#/join/`, so a `#/reset/` link gives `noInvite`.) Pasting only the key
  is worse: it is sent as an invite and refused as an unknown one.
- **In the browser.** "Set it and sign in" works and I am now looking at a full heirloom in
  Chrome: Focus, Today, the nav. Nothing here says "now go back to the app". The sign-in line said
  it minutes ago, in another app. I hesitate: is this the app? Do I keep using it here?
- **The link's address is the owner's.** The link is `engine.server` of the device that made it.
  If the owner made it in the phone app on a home address (`192.168.1.20:8787`) and I am elsewhere,
  the browser says the site cannot be reached, with no heirloom words at all. Invites share this;
  not new here.

## Top problems, each with the smallest fix

1. **The owner who forgot their own password is stuck on the sign-in screen.** Fix in
   `strings.ts`: `reset.forgot` and `reset.forgotApp` gain one sentence, "If you run it: heirloomd
   -reset with your username, on the server." and `reset.errors.bad_request` names the whole
   command: "Your own password is reset on the server itself: heirloomd -reset ravi." (taking the
   name). Whether an owner with no terminal needs a way back is the user's call.
2. **A reset link pasted as an invite gets "Paste the whole link".** Fix in `signin.tsx`, where
   `noInvite` is set: when what was pasted contains `#/reset/`, say a new `reset.notInvite`: "This
   link sets a new password. Open it in a browser, set the password there, then sign in here."
3. **The reset page never says the other devices are signed out, nor that the app is next.**
   Fix: one static note under the button on the live page (there from the first frame, so nothing
   moves): "Your other devices are signed out. Sign in on them with the new password."
4. **Signed in, "Sign out first to use it." + "Settings" does not say the link waits.** Fix in
   `strings.ts`: `reset.signedInFor` becomes "This link sets a new password for sachi. Sign out in
   Settings and this page comes back." (and `signedIn` the same without the name). True today: the
   app holds the link until it is used or let go.
5. **A second link for the same name ends the first without a word.** Fix in `strings.ts`:
   `reset.note` gains "A new link for the same name ends the one before." Lesser, same block: the
   live reset page could carry "Back to sign in" as a link under the button, for whoever opened
   the link by mistake.

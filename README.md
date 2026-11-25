# heirloom

A free Pomodoro, tasks and habits app for people who want to learn hard things and keep putting it
off. Your past records run beside you as a ghost you can beat; friends study with you in a room;
your phone and laptop show the same timer, live, and both keep working offline. It runs on your
own server: one small Go binary and one SQLite file, light enough for an old phone.

**Status:** version 1 is built and under test. The five screens (Focus, Today, Progress, Habits,
Room), Settings, the sync server and the Android app all run; [ROADMAP.md](ROADMAP.md) says which
gates are still open.

## A friend gave you an invite

They run the server and sent you a link. For your phone they also sent the APK.

1. **In a browser.** Open the link. Pick a username (3 to 32 characters: a to z, 0 to 9 and _) and a
   password of 8 characters or more. A link makes one account, once, and is good for 7 days.
2. **On an Android phone.** Install the APK (Android will ask you to allow installs from wherever
   you opened it). It asks for the server: paste the same link to join there, or type the server's
   address and sign in with the account you just made. The first time you start a lap the app asks
   to send notifications: say yes, or the bell cannot ring with the screen off.
3. **Start a lap** on either one. The other shows the same timer within a second. With no
   connection both keep working, and what you did is sent when the connection is back.
4. **Join their room.** Open Room, choose "Join a room" and type the code of the room (eight
   characters, not the invite). They see that you are on a lap, the phase and the time left. They
   do not see what you are working on unless you turn on "Show the room what I am on" in Settings.

Everything you make is yours: Settings, "Your copy", "Save a copy" gives you all of it as one file.

## Running your own

You need Go 1.26, Node 22 and pnpm 12 ([TOOLCHAINS.md](TOOLCHAINS.md) has the exact pins).

```
pnpm install
make dev        # the app on http://localhost:5173 beside a server on 127.0.0.1:8787
make check      # every check, each one reported
```

For a server that stays up, `make server` builds one binary for this machine and one for linux
arm64, each with the web app inside it: the server's address in a browser is the app.
[server/deploy/README.md](server/deploy/README.md) says how it runs as a service and how backups
are kept.

**The first account.** Open the server's address. A server with no account yet shows "Set up this
server": the account you make there is its owner. Do this before you give the address to anyone,
because the first to arrive owns it.

**Everyone after.** In Settings the owner has "Invites": make a link, send it. The owner can also
let others invite, under "Admins", and take that back.

**The phone app.** `make apk` builds an app that asks for its server. Over a home network that is
plain http, such as `http://192.168.1.20:8787`: it works, and whoever is on that network can read
what is sent. A tunnel or a reverse proxy with a certificate gives you https.

## Reading

| Read | For |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | What version 1 does, and why each part is there |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it is built, and what happens when two offline devices disagree |
| [DESIGN.md](DESIGN.md) | Every colour, size and duration, and the voice of the words |
| [contracts/protocol.md](contracts/protocol.md) | What devices and the server say to each other |
| [ROADMAP.md](ROADMAP.md) | Version 1 in sections |
| [docs/research/](docs/research/README.md) | The evidence: Focus To-Do, Pomodoist, motivation, sync, stack |
| [AGENTS.md](AGENTS.md) | How the agent team builds it |

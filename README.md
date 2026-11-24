# heirloom

A free Pomodoro, tasks and habits app for people who want to learn hard things and keep putting it
off. Your past records run beside you as a ghost you can beat; friends study with you in a room;
your phone and laptop show the same timer, live, and both keep working offline. It runs on your
own server: one small Go binary and one SQLite file, light enough for an old phone.

**Status:** version 1 is built and under test. The five screens (Focus, Today, Progress, Habits,
Room), Settings, the sync server and the Android app all run; [ROADMAP.md](ROADMAP.md) says which
gates are still open.

## A friend gave you an invite

They run the server. You need three things from them: the server's address, an invite code, and,
for your phone, the APK.

1. **In a browser.** Open the address. Choose "I have an invite", type the code, pick a username
   (3 to 32 characters: a to z, 0 to 9 and _) and a password of 8 characters or more. A code makes
   one account, once.
2. **On an Android phone.** Install the APK they sent (Android will ask you to allow installs from
   wherever you opened it). Sign in with the same username and password. The first time you start
   a lap the app asks to send notifications: say yes, or the bell cannot ring with the screen off.
3. **Start a lap** on either one. The other shows the same timer within a second. With no
   connection both keep working, and what you did is sent when the connection is back.
4. **Join their room.** Open Room, choose "Join a room" and type the code of the room (eight
   characters, not the invite code). They see that you are on a lap, the phase and the time left.
   They do not see what you are working on unless you turn on "Show the room what I am on" in
   Settings.

Everything you make is yours: Settings, "Your copy", "Save a copy" gives you all of it as one file.

## Running your own

You need Go 1.26, Node 22 and pnpm 12 ([TOOLCHAINS.md](TOOLCHAINS.md) has the exact pins).

```
pnpm install
make dev        # the app on http://localhost:5173 beside a server on 127.0.0.1:8787
make check      # every check, each one reported
```

An account needs an invite, and the server makes one:

```
cd server && go run ./cmd/heirloomd -data ../.local/data -invite
```

For a server that stays up, `make server` builds one binary for this machine and one for linux
arm64, each with the web app inside it. [server/deploy/README.md](server/deploy/README.md) says
how it runs as a service, how backups are kept and how to give out invites.
`make apk SERVER=https://your.address` builds the Android app for that server.

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

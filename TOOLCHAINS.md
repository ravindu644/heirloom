# Toolchains

The versions heirloom is built and run with, read from the machines on 2026-11-24. Build with
these; a newer one is a decision with a line here, not a surprise in a lockfile.

## The laptop (Fedora 44, x86_64)

| Tool | Version | Pinned in | Install |
|---|---|---|---|
| Go | 1.26.11 | `server/go.mod` (`go 1.26.0`, the floor the SQLite driver sets) | `sudo dnf install golang`. Fedora sets `GOTOOLCHAIN=local`, so Go never fetches another toolchain behind our back |
| Node | 22.22.2 | `package.json` `engines` (22.18 or later: it runs `.ts` files itself) | system |
| pnpm | 12.23.0 | `package.json` `packageManager` | `npm i -g pnpm@12.23.0 --prefix ~/.local` |
| TypeScript | 7.0.2 | `pnpm-lock.yaml` | `pnpm install` |
| Vite | 8.3.8 | `pnpm-lock.yaml` | `pnpm install` |
| Preact, signals | 11.2.0, 2.11.4 | `pnpm-lock.yaml` | `pnpm install` |
| Playwright | 1.65.1, with its own Chromium | `pnpm-lock.yaml` | `pnpm exec playwright install chromium`. If that build will not start, set `BROWSER_PATH=/usr/bin/brave-browser` |
| GNU Make | 4.4.1 | | system |

## Android

| Tool | Version | Note |
|---|---|---|
| Capacitor | 8.6.2 (arrives in roadmap section 3) | Needs Node 22 or later and JDK 21 |
| JDK | Temurin 21.0.12.1 at `~/.jdks/jdk-21`. Capacitor 8 compiles with Java 21 | `java` on the PATH is 17.0.19, so the Android build sets `JAVA_HOME=$HOME/.jdks/jdk-21` |
| Android SDK | platforms 34, 36, 37; build-tools 34.0.0, 35.0.0, 36.0.0 | `~/Android/Sdk` |
| `compileSdk` / `targetSdk` | 36 | Capacitor 8's default |
| `minSdk` | 24 | Capacitor 8's floor; `setChronometerCountDown` needs 24 |
| adb | 37.0.0 | |
| The phone | Android 15 (API 35) | Serial in `.local/ENV.md` |

## The S10 container (the server)

| | |
|---|---|
| OS | Ubuntu 24.04.5 LTS, aarch64, glibc 2.39, systemd 255 |
| Kernel | 4.14.356. Go supports 3.2 and later; Node does not run here at all |
| Memory | 1024 MB, no swap, about 15 MB in use before heirloomd |
| Installed for us | Nothing, on purpose. `heirloomd` is one static binary (`CGO_ENABLED=0`, `linux/arm64`). `cloudflared` arrives in section 9 |
| SQLite | 3.54.1, the one inside the binary (`modernc.org/sqlite` v1.63.0). The system has none, and Ubuntu's 3.45.1 would have the WAL bug |
| heirloomd, idle | 11.5 MB RSS as a systemd service on 2026-11-25, sync, rooms, the web app and a start-up backup included (budget 50 MB). The skeleton of section 0 was 6.8 to 8.0 MB. The binary is 10.3 MB (budget 25 MB) |
| heirloomd under load | Measured 2026-11-25 on a throwaway copy of the same binary on the S10, 20 devices of 4 accounts in one room: 14.1 MB connected and idle, 17.0 MB after a minute of pushing, 32.7 MB at the peak of 20 sign-ins at once (argon2id), all under the 50 MB budget. A timer change crossed from one device to another in 160 ms at the median through an ssh forward |
| An hour's soak | 2026-11-25, a throwaway copy on the S10: 4 accounts by 5 devices in one room, 7,179 seeded events (seed 20261125) with 695 drops, 318 restarts from disk and 267 refused sockets. No divergence: every device of an account held the same cells as a fresh one, every session, check-in and field there. VmRSS 12.5 MB at the start, 19.0 at most, 17.3 at the end and flat over the second half hour; the database 1.4 MB |
| The unit on this kernel | Runs under every hardening option but one: systemd logs `bpf-firewall: Preparation of BPF allow maps failed`, so `IPAddressDeny`/`IPAddressAllow` do nothing on 4.14 (the server binds to 127.0.0.1 anyway). `MemoryCurrent` reads `[not set]`: the container does no memory accounting, so `MemoryMax` is not enforced and `GOMEMLIMIT=64MiB` is the limit that counts |
| Already there | `nginx.service` and `sp-webdav.service`, the user's own. heirloomd uses port 8787 on localhost, which was free |

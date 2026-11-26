# Running a heirloom server

`heirloomd` is one file. The web app is built into it and its data lives in one SQLite file, so a
machine that runs it needs nothing else: no Go, no Node, no database server. It runs on Linux,
x86_64 or arm64, in about 50 MB of memory.

## 1. Get heirloomd

**Download it.** Each [release](https://github.com/ravindu644/heirloom/releases/latest) carries
`heirloomd-linux-amd64` and `heirloomd-linux-arm64` (`uname -m` says `x86_64` or `aarch64`),
the service file `heirloomd.service`, and `SHA256SUMS`.

```
ARCH=arm64   # or amd64
curl -LO https://github.com/ravindu644/heirloom/releases/latest/download/heirloomd-linux-$ARCH
curl -LO https://github.com/ravindu644/heirloom/releases/latest/download/heirloomd.service
curl -LO https://github.com/ravindu644/heirloom/releases/latest/download/SHA256SUMS
sha256sum --ignore-missing -c SHA256SUMS
mv heirloomd-linux-$ARCH heirloomd
```

**Or build it** with Go 1.26, Node 22 and pnpm 12 ([TOOLCHAINS.md](../TOOLCHAINS.md) has the pins).
The web app is built first, then copied into the binary:

```
pnpm install
make server   # server/bin/heirloomd for this machine, server/bin/heirloomd-arm64 for linux arm64
```

The service file is `server/deploy/heirloomd.service`. Either way, `./heirloomd -version` prints
what you have.

## 2. Install it as a service

```
id heirloomd || sudo useradd --system --home-dir /var/lib/heirloomd --shell /usr/sbin/nologin heirloomd
sudo install -m 0755 heirloomd /usr/local/bin/heirloomd
sudo install -m 0644 heirloomd.service /etc/systemd/system/heirloomd.service
sudo systemctl daemon-reload
sudo systemctl enable --now heirloomd
```

The unit makes `/var/lib/heirloomd` itself, owned by `heirloomd` and closed to everyone else, and
locks the server down to what it uses; each line of the file says why it is there.
`systemctl status heirloomd` and `journalctl -u heirloomd` say how it is doing. The log holds a
start line and errors, never anything a person wrote.

It listens on port 8787 of every address the machine has. To change that, edit `-addr` in the
unit's `ExecStart` and run the last two lines again. Behind a tunnel or a proxy on the same
machine, `-addr 127.0.0.1:8787` keeps it off the network.

To update, install the new binary the same way and `sudo systemctl restart heirloomd`.

## 3. Set it up, before anyone else

A server nobody has signed up on belongs to whoever signs up first. Open its address in a
browser: it shows **Set up this server**, and the account made there is the **owner**. Do this
before you give the address to anyone or open a tunnel to it. Until then the journal says
`no account yet` at each start.

The owner makes invite links in Settings, and can let others invite under **Admins**. A link makes
one account, once, and is good for 7 days. From a shell on the server:

```
sudo -u heirloomd /usr/local/bin/heirloomd -data /var/lib/heirloomd -invite
```

prints one, the last part of `<server>/#/join/<invite>`. Run it as `heirloomd`, not as root: root
would leave files in the data directory the server cannot open. Someone who forgot their password
gets one from `-reset <username>` in place of `-invite`: the last part of `<server>/#/reset/<code>`.

## 4. Reach it from outside

- **The home network**, at `http://<the machine's address>:8787`. Plain http: anyone on the same
  wifi can read a password as it is typed. A browser also treats it as not secure, so a laptop
  gets no bell with the tab closed and the app is not kept for offline use. Fine for a house you
  trust.
- **https**, through a Cloudflare tunnel or a reverse proxy with a certificate, pointed at
  `http://127.0.0.1:8787`. Reachable from anywhere, and everything works. This is the address to
  give friends. Proxies must pass WebSockets on `/api/ws`.

## 5. Let browsers ring

At a bell the server sends a Web Push to each browser that asked for one. Push services want to
know who is sending, and some refuse a sender they cannot write to. Add
`-contact mailto:you@example.org` (or an `https:` address) to the unit's `ExecStart`. The key for
this is made at the first start and lives in the database.

## Backups and restoring

Once a day, soon after midnight UTC, the server writes a checked copy of the database to
`/var/lib/heirloomd/backups/heirloom-YYYY-MM-DD.db` and keeps the last seven. A copy that fails is
one `backup:` line in the journal and is tried again the next day. To restore one:

```
sudo systemctl stop heirloomd
sudo -u heirloomd cp /var/lib/heirloomd/backups/heirloom-YYYY-MM-DD.db /var/lib/heirloomd/heirloom.db
sudo rm -f /var/lib/heirloomd/heirloom.db-wal /var/lib/heirloomd/heirloom.db-shm
sudo systemctl start heirloomd
```

The third line matters after a crash: a `-wal` file left from the old database must not be read
into the restored one. What devices sent after the copy was made is no longer on the server, but
every device still holds its own data, and a device that is ahead of the restored database is
sent all of it again.

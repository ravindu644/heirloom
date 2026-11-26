# Running a heirloom server

`heirloomd` is one file. The web app is built into it and its data lives in one SQLite file, so a
machine that runs it needs nothing else: no Go, no Node, no database server. It runs on Linux,
x86_64 or aarch64, in about 50 MB of memory.

## 1. Install it

On Linux with systemd running, on x86_64 or aarch64 (nothing else is supported):

```
curl -fsSL https://github.com/ravindu644/heirloom/releases/latest/download/install.sh | sudo sh
```

[install.sh](../install.sh) downloads the latest `heirloomd` for the machine, checks it against the
release's `SHA256SUMS`, gives it a user of its own and installs it as the `heirloomd` service,
with its data in `/var/lib/heirloomd`. Run it again to update; the address and contact already
set are kept. Options go after `sudo sh -s --`, or after `install.sh` in a checkout:

- `--addr 127.0.0.1:8787`: where it listens (all addresses, port 8787, by default). Use
  `127.0.0.1` behind a tunnel or a proxy on the same machine.
- `--contact mailto:you@example.org`: who a browser's push service can write to (step 4).
- `--binary` and `--service`: install your own build instead. With Go 1.26, Node 22 and pnpm 12
  ([TOOLCHAINS.md](../TOOLCHAINS.md)):

  ```
  pnpm install && make server
  sudo sh install.sh --binary server/bin/heirloomd --service server/deploy/heirloomd.service
  ```

`systemctl status heirloomd` and `journalctl -u heirloomd` say how it is doing. The log holds a
start line and errors, never anything a person wrote. Each line of
[heirloomd.service](../server/deploy/heirloomd.service) says why it is there.

## 2. Set it up, before anyone else

The first account made on a new server owns it. Open the server's address in a browser, choose
**Set up this server**, and do it before you give the address to anyone or open a tunnel to it.

The owner makes invite links in Settings (one account each, good for 7 days) and can let others
invite under **Admins**. From a shell, as the service's user so the files stay its own:

```
sudo -u heirloomd /usr/local/bin/heirloomd -data /var/lib/heirloomd -invite            # <server>/#/join/<this>
sudo -u heirloomd /usr/local/bin/heirloomd -data /var/lib/heirloomd -reset <username>  # <server>/#/reset/<this>
```

## 3. Reach it from outside

`http://<the machine's address>:8787` works on a home network you trust, but it is plain http: a
password crosses the wifi as typed, and browsers give such a page no bell with the tab closed and
no offline copy. For friends, put https in front: a Cloudflare tunnel or a reverse proxy with a
certificate, pointed at `http://127.0.0.1:8787`, passing WebSockets on `/api/ws`.

## 4. Let browsers ring

A browser's bell is a Web Push, and some push services refuse a sender they cannot write to. Run
install.sh again with `--contact mailto:you@example.org` (or an `https:` address).

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

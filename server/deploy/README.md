# Running heirloomd on the S10

One binary, one unit, one directory. `make deploy` does the installing; this page says what
it does and what to do by hand when something has gone wrong.

## Installing

```
id heirloomd || sudo useradd --system --home-dir /var/lib/heirloomd --shell /usr/sbin/nologin heirloomd
sudo install -m 0755 heirloomd /usr/local/bin/heirloomd
sudo install -m 0644 heirloomd.service /etc/systemd/system/heirloomd.service
sudo systemctl daemon-reload && sudo systemctl enable heirloomd && sudo systemctl restart heirloomd
```

The unit makes `/var/lib/heirloomd` itself, owned by `heirloomd` and closed to everyone else.
The server listens on `127.0.0.1:8787`; the Cloudflare tunnel is the only way in.
`systemctl status heirloomd` and `journalctl -u heirloomd` say how it is doing. The log holds a
start line and errors, never anything a person wrote.

## Ringing browsers

At a bell the server sends a Web Push to each browser that asked for one. Push services want to
know who is sending, in case something goes wrong. Until the unit's `ExecStart` is given
`-contact mailto:you@example.org` (or an `https:` address), they are told
`mailto:contact-not-set@heirloom.invalid`, which says what it is. Some push services refuse a
sender they cannot write to, so set it before relying on the bell.

The server's key for this is made at the first start and lives in the database. Restoring a
backup from before that first start would make a new key, and every browser would have to
subscribe again.

## An invite

```
sudo -u heirloomd /usr/local/bin/heirloomd -data /var/lib/heirloomd -invite
```

It works while the server is running. As `heirloomd`, not as root: root would leave files in the
data directory that the server cannot open.

## Backups

Once a day, soon after midnight UTC and at the first start of a day, the server writes a whole
copy of the database to `/var/lib/heirloomd/backups/heirloom-YYYY-MM-DD.db`, checks it, and only
then removes the oldest, so there are always seven. A copy that fails is one `backup:` line in
the journal and is tried again the next day. Pushes are stored as usual while a copy is made.

## Restoring

```
sudo systemctl stop heirloomd
sudo -u heirloomd cp /var/lib/heirloomd/backups/heirloom-YYYY-MM-DD.db /var/lib/heirloomd/heirloom.db
sudo rm -f /var/lib/heirloomd/heirloom.db-wal /var/lib/heirloomd/heirloom.db-shm
sudo systemctl start heirloomd
```

The third line matters after a crash: a `-wal` file left from the old database must not be read
into the restored one. What devices sent after that copy was made is no longer on the server.
Every device still holds its own data and whatever it had received, and a device whose cursor is
past the restored database is sent all of it again.

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
`systemctl status heirloomd` and `journalctl -u heirloomd` say how it is doing. The log holds a
start line and errors, never anything a person wrote.

## The two ways in

The server listens on port 8787 of every address the container has.

- **The home network**, at `http://<the container's address>:8787`. This is plain http: whoever
  is on the same wifi can read a password as it is typed in and a token as it is used. A browser
  also treats such an address as not secure, so the laptop there gets no bell with the tab
  closed (Web Push and notifications need https) and the app is not kept for offline use.
  Fine for a house you trust; not for anything further.
- **A Cloudflare tunnel** to `127.0.0.1:8787`, on a name of your own. https, reachable from
  anywhere, and everything works. This is the address to give friends.

## Setting it up

A server nobody has registered on belongs to whoever registers first: open its address in the
app, choose a username and a password, and that account is the **owner**. Do this before the
address is given to anyone, and before the tunnel is switched on. The journal says
`no account yet` at each start until it is done, and `/healthz` says `"setup":true`.

## Inviting people

The owner, and anyone the owner has made an admin, makes invite links in the app's settings.
A link makes one account, once, and is good for 7 days; it can be renewed or taken back there.
Only the owner chooses who the admins are, and nobody can change who the owner is.

From a shell on the server, without the app:

```
sudo -u heirloomd /usr/local/bin/heirloomd -data /var/lib/heirloomd -invite
```

It prints the invite, which is the last part of the link `<server>/#/join/<invite>`, and works
while the server is running. As `heirloomd`, not as root: root would leave files in the data
directory that the server cannot open. On a server nobody has registered on yet, the account
made with it is the owner.

## Ringing browsers

At a bell the server sends a Web Push to each browser that asked for one. Push services want to
know who is sending, in case something goes wrong. Until the unit's `ExecStart` is given
`-contact mailto:you@example.org` (or an `https:` address), they are told
`mailto:contact-not-set@heirloom.invalid`, which says what it is. Some push services refuse a
sender they cannot write to, so set it before relying on the bell. Once it is set, a browser
whose push service answers 401 or 403 is taken to have subscribed under an older key and is
dropped; the app subscribes again by itself. While it is not set, such a browser is kept.

The server's key for this is made at the first start and lives in the database. Restoring a
backup from before that first start would make a new key, and every browser would have to
subscribe again.

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

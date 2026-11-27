# Running a heirloom server

`heirloomd` is one file with the web app inside and its data in one SQLite file. It runs on Linux
with systemd, on x86_64 or aarch64, in about 50 MB of memory.

## Install

```
curl -fsSL https://github.com/ravindu644/heirloom/releases/latest/download/install.sh | sudo sh
```

It downloads the latest `heirloomd`, checks it, and starts it as a service on port 8787, where
anyone on your network can open it. Run the same line again to update.

## Set it up

Open `http://<the machine's address>:8787` in a browser and set it up. The first account made
there owns the server, so do it before you share the address. Invite friends from Settings.

Someone forgot their password? On the server:

```
sudo -u heirloomd /usr/local/bin/heirloomd -data /var/lib/heirloomd -reset <username>
```

prints the last part of the link that sets a new one, `<server>/#/reset/<this>`.

## Beyond your network

Port 8787 is plain http, fine for a home network you trust. For friends elsewhere, put https in
front of it with a Cloudflare tunnel or a reverse proxy pointed at `http://127.0.0.1:8787`. Over
https a closed browser tab still rings, and the app keeps working offline.

## Backups

Every day the server keeps a copy of its database in `/var/lib/heirloomd/backups/`, the last
seven. To go back to one:

```
sudo systemctl stop heirloomd
sudo -u heirloomd cp /var/lib/heirloomd/backups/heirloom-YYYY-MM-DD.db /var/lib/heirloomd/heirloom.db
sudo rm -f /var/lib/heirloomd/heirloom.db-wal /var/lib/heirloomd/heirloom.db-shm
sudo systemctl start heirloomd
```

To keep copies on another machine too, give it a key that can do nothing but stream that folder.
In the server's `~/.ssh/authorized_keys`, for a user with sudo:

```
restrict,command="sudo -n tar -C /var/lib/heirloomd/backups -cf - ." ssh-ed25519 AAAA... backup
```

and on the other machine, from a timer: `ssh -i ~/.ssh/that-key user@server | tar -C ~/heirloom-backups -xf -`.

## Moving to another machine

Install it on the new machine first, then carry the whole data directory across while both are
stopped, so no edit lands on the old one after the copy:

```
old$ sudo systemctl disable --now heirloomd
new$ sudo systemctl stop heirloomd
old$ sudo tar -C /var/lib/heirloomd -cf - . | ssh new 'sudo tar -C /var/lib/heirloomd -xpf - && sudo chown -R heirloomd:heirloomd /var/lib/heirloomd'
new$ sudo systemctl start heirloomd
```

Then point your tunnel or proxy at the new machine. Phones and browsers keep their edits while
the server is away and send them when it is back at the same address.

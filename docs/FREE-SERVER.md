# A free server that stays up

How heirloom's own server runs for $0 a month: an Oracle Cloud Always Free VM, reached by your
friends through a Cloudflare tunnel and by you through Tailscale, with nothing open to the
internet and its backups copied to a second machine. Every step here was done for real on
2026-11-27; the console's menus are named as they were that day.

You need a card (Oracle checks it and, with the setup below, never charges it), a domain on
Cloudflare, and a free Tailscale account. Plan an evening.

| Piece | What it costs | What it gives |
|---|---|---|
| Oracle VM.Standard.E2.1.Micro, 47 GB disk | $0, Always Free | heirloomd, the tunnel and Tailscale, in about 15, 40 and 35 MB of its 1 GB |
| Cloudflare tunnel | $0 | https at your own address, no open port |
| Tailscale | $0 | SSH and `make deploy` for you alone |
| A second Linux machine you already have | $0 | backup copies off the VM |

## 1. Sign up to Oracle Cloud

- At signup.cloud.oracle.com pick your **home region** with care: it can never change, and the
  free VMs live there. Pick the one nearest your friends (we chose India South, Hyderabad, for
  Sri Lanka).
- Sign up in a plain browser with **no ad or DNS blocker** (Brave Shields, AdGuard, Pi-hole) and
  no VPN. Oracle runs a fraud check from a third-party domain during signup; when a blocker
  stops it, all you see is "an error occurred while creating your account". If that happens,
  wait a few hours before the next try, or the card may be flagged.
- Use the card's **billing address**, the one your bank sends statements to.

## 2. Create the VM

Compute, Instances, Create instance:

- **Image:** Canonical Ubuntu 24.04.
- **Shape:** Specialty and previous generation, `VM.Standard.E2.1.Micro`, marked
  "Always Free-eligible" (x86_64, 1 GB). heirloomd fits in it many times over. The bigger
  Ampere `VM.Standard.A1.Flex` is free too, but regions with one availability domain often
  answer "Out of capacity"; you can move to it later with section 7.
- **Networking:** Create new virtual cloud network, Create new public subnet. The switch for a
  public IPv4 address stays greyed out while the subnet does not exist yet: leave it and add the
  address after (below).
- **SSH keys:** Paste public key, your laptop's `~/.ssh/id_ed25519.pub`.
- **Storage:** leave the default boot volume (46.6 GB; the free allowance is 200 GB).
- On Review, every line should be free. Create.

Once it runs: the instance, Networking, the VNIC, IP administration, the primary IP's menu, Edit,
**Ephemeral public IP**, Update. That address is only for the next step; it stops mattering in
section 5.

```
ssh ubuntu@<public IP>
```

## 3. Install heirloom

On the VM:

```
curl -fsSL https://github.com/ravindu644/heirloom/releases/latest/download/install.sh | sudo sh
```

It listens on port 8787, which Oracle's firewall does not let in, so nobody can reach the new
server yet. **Make the owner account before the server goes public:** from your laptop,

```
ssh -L 8787:localhost:8787 ubuntu@<public IP>
```

then open `http://localhost:8787` and set it up. Moving an existing server instead? Skip the
setup and carry the data across as in [DEPLOY.md](DEPLOY.md#moving-to-another-machine).

## 4. Put it on the internet with a Cloudflare tunnel

In Cloudflare: Zero Trust, Networks, Tunnels, create a tunnel, add a public hostname (for us
`heirloom.<your domain>`) whose service is `http://localhost:8787`. Cloudflare shows a token.

On the VM:

```
curl -fsSLo cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb && rm cloudflared.deb
sudo cloudflared service install <token>
```

Type the token yourself, on the VM; never paste it into a chat, a file in a repository or a
command you share. Already running the tunnel on another machine? Copy its token machine to
machine, stop the old connector, then start the new one, so requests never reach a stopped
server:

```
ssh old 'sudo tar -C / -cf - etc/cloudflared etc/systemd/system/cloudflared.service' | ssh new 'sudo tar -C / -xpf - && sudo systemctl daemon-reload'
ssh old 'sudo systemctl disable --now cloudflared'
ssh new 'sudo systemctl enable --now cloudflared'
```

Check: `curl https://heirloom.<your domain>/healthz` answers `{"ok":true,...}`.

## 5. Close every port: SSH over Tailscale

Install Tailscale on the VM and join it to your tailnet (it prints a link to approve):

```
curl -fsSL https://tailscale.com/install.sh | sudo sh
sudo tailscale up --hostname=heirloom-server
```

In the Tailscale admin console, Machines, the server's menu, **Disable key expiry**. Without it
the server leaves your tailnet after 180 days and SSH stops working (the site keeps going).

From your laptop, prove `ssh ubuntu@<tailnet IP>` works. **Only then** remove the door: in
Oracle, Networking, your VCN, Security, the Default Security List, Security rules, and remove
the ingress rule for TCP port 22 from 0.0.0.0/0. Keep the two ICMP rules; they open nothing and
keep connections from stalling. Check from outside that the public address now refuses:

```
timeout 8 bash -c '</dev/tcp/<public IP>/22' && echo open || echo closed
```

If Tailscale ever breaks, Oracle's Cloud Shell and the instance's console connection still get
you in. Do not reopen port 22 to the world.

Put the tailnet address in `.local/ENV.md` as the server's `Address`, with `ubuntu` as the SSH
user, and `make deploy` builds for the VM's CPU and installs there.

## 6. Keep it free, and keep it

- **Upgrade to Pay As You Go.** Oracle reclaims an Always Free VM that sits nearly idle for 7
  days, and a quiet heirloom looks idle. Pay As You Go accounts are exempt, and Always Free stays
  free on them. Billing & Cost Management, Upgrade and Manage Payment. The card checked at signup
  is not saved as a payment method: add it first with the menu on the Payment Method row, then
  Upgrade your account, Pay As You Go, nothing else offered. Oracle emails when it is done
  ("Your cloud account and services are ready").
- **Add a budget alarm.** Billing & Cost Management, Budgets, Create Budget: the root
  compartment, monthly, amount 1, an alert at **1% of actual spend** (the first cent) and a
  second rule at **100% of forecast spend**, both emailing you. A budget is an alarm, not a cap:
  nothing stops a charge, and the check runs a few times a day. What keeps the bill at $0 is that
  nothing outside Always Free exists. Governance, Resource Explorer lists everything; ours is one
  instance, its boot volume, an ephemeral IP, and the VCN with its parts, all free.
- **Copy the backups off the VM.** heirloomd keeps a copy of its database each day in
  `/var/lib/heirloomd/backups/`, the last seven, on the VM's own disk. A second machine on your
  tailnet can pull them, with a key that can do nothing else. On that machine:

  ```
  ssh-keygen -t ed25519 -N "" -C "heirloom backup pull" -f ~/.ssh/heirloom_backup
  ```

  On the VM, one line in `~/.ssh/authorized_keys` (the key from the `.pub` file):

  ```
  restrict,command="sudo -n /usr/bin/tar -C /var/lib/heirloomd/backups -cf - ." ssh-ed25519 AAAA... heirloom backup pull
  ```

  Whatever that key asks for, it gets the backup folder as a tar and nothing else: no shell, no
  port forwarding. Then on the second machine, `/usr/local/bin/heirloom-pull-backup` (set `HOST`):

  ```sh
  #!/bin/sh
  # Copies the heirloom server's daily backups here, retrying through a dropped connection.
  set -u
  HOST=ubuntu@<tailnet IP>
  KEY=$HOME/.ssh/heirloom_backup
  DEST=$HOME/heirloom-backups
  KEEP_DAYS=90
  TRIES=6
  WAIT=600

  mkdir -p "$DEST"
  tmp=$(mktemp -d "$DEST/.pull.XXXXXX")
  trap 'rm -rf "$tmp"' EXIT
  i=1
  until ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 \
      "$HOST" >"$tmp/b.tar" 2>"$tmp/err" && tar -C "$tmp" -xf "$tmp/b.tar" 2>>"$tmp/err"; do
    [ "$i" -ge "$TRIES" ] && { echo "gave up after $TRIES tries: $(tail -n1 "$tmp/err")"; exit 1; }
    echo "try $i failed ($(tail -n1 "$tmp/err")), next in $((WAIT / 60)) min"
    i=$((i + 1))
    sleep "$WAIT"
  done
  n=0
  for f in "$tmp"/heirloom-*.db; do
    [ -e "$f" ] || continue
    # Only a whole SQLite file replaces a kept one.
    [ "$(head -c 15 "$f")" = "SQLite format 3" ] || { echo "skipped $(basename "$f")"; continue; }
    mv -f "$f" "$DEST/"
    n=$((n + 1))
  done
  find "$DEST" -maxdepth 1 -name 'heirloom-*.db' -mtime +"$KEEP_DAYS" -delete
  echo "pulled $n backups; $(ls "$DEST"/heirloom-*.db 2>/dev/null | wc -l) kept in $DEST"
  ```

  and a timer for it, `/etc/systemd/system/heirloom-pull-backup.service` (set `User`):

  ```ini
  [Unit]
  Description=Copy the heirloom server's backups here
  Wants=network-online.target
  After=network-online.target tailscaled.service

  [Service]
  Type=oneshot
  User=<you>
  ExecStart=/usr/local/bin/heirloom-pull-backup
  TimeoutStartSec=1h
  Nice=10
  IOSchedulingClass=idle
  ```

  and `/etc/systemd/system/heirloom-pull-backup.timer`:

  ```ini
  [Unit]
  Description=Copy the heirloom server's backups here every six hours

  [Timer]
  OnCalendar=00/6:30
  RandomizedDelaySec=15min
  Persistent=true

  [Install]
  WantedBy=timers.target
  ```

  `sudo systemctl daemon-reload && sudo systemctl enable --now heirloom-pull-backup.timer`, then
  `sudo systemctl start heirloom-pull-backup` once and look in `~/heirloom-backups`. A machine
  that was off catches up when it starts; one with no internet tries six times, gives up for
  that round and harms nothing. Disable key expiry for this machine in Tailscale too.

## 7. Later

- **Update:** `make deploy` from the repository, or the install line again on the VM.
- **Move to another machine** (the free Ampere shape when it has room, or anywhere else):
  [DEPLOY.md](DEPLOY.md#moving-to-another-machine), then the tunnel as in section 4.
- **Restore a backup:** [DEPLOY.md](DEPLOY.md#backups).

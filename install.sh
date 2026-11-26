#!/bin/sh
# Installs or updates heirloomd as a systemd service on port 8787, from the latest release.
# Usage: curl -fsSL https://github.com/ravindu644/heirloom/releases/latest/download/install.sh | sudo sh
# Run again to update. A line added to the unit's ExecStart by hand (-contact, another -addr) is kept.
# For a build of your own (make deploy does this): HEIRLOOMD_BINARY=server/bin/heirloomd sudo -E sh install.sh
set -eu

RELEASE=https://github.com/ravindu644/heirloom/releases/latest/download
UNIT=/etc/systemd/system/heirloomd.service

[ "$(id -u)" = 0 ] || { echo "Run it as root: sudo sh install.sh" >&2; exit 1; }
# systemd running as the init, not only installed: a container may carry systemctl without it.
[ -d /run/systemd/system ] && command -v systemctl >/dev/null ||
  { echo "heirloomd runs as a systemd service, and systemd is not running on this machine." >&2; exit 1; }
# The two the releases are built for.
case $(uname -m) in
  x86_64) ARCH=amd64 ;;
  aarch64) ARCH=arm64 ;;
  *) echo "heirloomd runs on x86_64 and aarch64 only, and this machine is $(uname -m)." >&2; exit 1 ;;
esac

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

BINARY=${HEIRLOOMD_BINARY:-}
if [ -z "$BINARY" ]; then
  for f in "heirloomd-linux-$ARCH" SHA256SUMS; do
    if command -v curl >/dev/null; then curl -fsSL -o "$TMP/$f" "$RELEASE/$f"; else wget -qO "$TMP/$f" "$RELEASE/$f"; fi
  done
  # Nothing is installed unless it is the file the release lists.
  (cd "$TMP" && grep " heirloomd-linux-$ARCH\$" SHA256SUMS | sha256sum -c - >/dev/null) ||
    { echo "The download does not match SHA256SUMS. Nothing was installed." >&2; exit 1; }
  BINARY=$TMP/heirloomd-linux-$ARCH
fi

cat >"$TMP/unit" <<'UNIT'
# heirloomd as a systemd service, written by install.sh. Every line says why it is there.

[Unit]
Description=heirloom server
After=network.target
# A binary that cannot start is not started for ever: five tries in a minute, then it
# waits for a person. Each start opens the database, and the phone's flash is not free.
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
# Its own user, with nothing but the data directory to its name.
User=heirloomd
Group=heirloomd

# Every address of the container, port 8787. There are two ways in. The home network
# reaches it as http://<the container's address>:8787: plain http, so a password or a
# token crosses the house's wifi unencrypted, and a browser there will not ring with the
# tab closed (Web Push and notifications want https). A Cloudflare tunnel to
# 127.0.0.1:8787 is the other way, and the one for anywhere beyond the house: https, and
# everything works. Either way, set the server up (register its first account, which
# owns it) before giving its address to anyone: until then the first to arrive owns it.
ExecStart=/usr/local/bin/heirloomd -addr 0.0.0.0:8787 -data /var/lib/heirloomd

# /var/lib/heirloomd, made by systemd, owned by the user above, closed to everyone else.
# UMask makes the database, its -wal and the backups 0600 as well.
StateDirectory=heirloomd
StateDirectoryMode=0700
UMask=0077

# The budget is 50 MB. Go starts collecting harder as it nears this, instead of growing.
Environment=GOMEMLIMIT=64MiB
# And the wall behind that: the container is shared, so a leak here is stopped here.
# Twice the soft limit, because a sign-in holds 19 MiB for a moment on top of the rest.
MemoryMax=128M

# A crash is restarted; a clean stop is left stopped.
Restart=on-failure
RestartSec=2
# A stop closes the sockets and lets a backup in the making finish. Half a minute is plenty.
TimeoutStopSec=30

# What follows takes away what a static Go binary with one data directory never uses.
# Where the container cannot do one of them, systemd says so in the journal and goes on.

# It can never gain a privilege it did not start with, by a setuid file or any other way.
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
RestrictSUIDSGID=yes

# The whole file system is read-only to it except the data directory, and home
# directories are not there at all.
ProtectSystem=strict
ProtectHome=yes
# Its own empty /tmp. SQLite may put a temporary file there; nobody else sees it.
PrivateTmp=yes
# No disks, no input devices: /dev/null and /dev/urandom are all it needs.
PrivateDevices=yes

# It has no business with the kernel's settings, modules, log, clock, name or cgroups.
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes

# Internet sockets and nothing else: no raw sockets, no netlink, no Bluetooth. It listens
# on one port (see ExecStart), and it calls out for one thing: at a bell it sends
# a Web Push to the browser's push service over HTTPS, after asking DNS where that is.
# There is no IPAddressDeny here because those services (Google's, Mozilla's, Apple's,
# Microsoft's) have no fixed addresses to allow, and systemd can filter by address but
# not by name or port. The narrowing is in the server instead: an endpoint must be
# https, redirects are not followed, and no private or loopback address is ever dialled.
RestrictAddressFamilies=AF_INET AF_INET6

# It makes no containers, does not change how it is run, wants no real-time priority,
# and never runs memory it wrote: there is no JIT in it, the SQLite is plain Go.
RestrictNamespaces=yes
LockPersonality=yes
RestrictRealtime=yes
MemoryDenyWriteExecute=yes

# The system calls of an ordinary service, for this machine's own architecture. One
# outside the list fails with an error rather than killing the server.
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM

[Install]
WantedBy=multi-user.target
UNIT
# An update keeps the ExecStart of the unit already there.
if [ -f "$UNIT" ]; then
  KEEP=$(grep '^ExecStart=' "$UNIT")
  sed -i "s#^ExecStart=.*#$KEEP#" "$TMP/unit"
fi

id heirloomd >/dev/null 2>&1 || useradd --system --home-dir /var/lib/heirloomd --shell /usr/sbin/nologin heirloomd
install -m 0755 "$BINARY" /usr/local/bin/heirloomd
install -m 0644 "$TMP/unit" "$UNIT"
systemctl daemon-reload
systemctl enable heirloomd >/dev/null 2>&1
systemctl restart heirloomd
sleep 2
systemctl is-active --quiet heirloomd || { journalctl -u heirloomd -n 20 --no-pager >&2; exit 1; }
/usr/local/bin/heirloomd -version

# A server nobody has signed up on says so at /healthz.
HEALTH=$( (curl -fsS http://127.0.0.1:8787/healthz || wget -qO- http://127.0.0.1:8787/healthz) 2>/dev/null || true)
IP=$(hostname -I 2>/dev/null | cut -d' ' -f1)
case $HEALTH in
  *'"setup":true'*) echo "Open http://${IP:-<this machine>}:8787 in a browser and set it up: the first account made there owns the server." ;;
  *) echo "Running on http://${IP:-<this machine>}:8787." ;;
esac

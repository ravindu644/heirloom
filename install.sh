#!/bin/sh
# Installs or updates heirloomd as a systemd service, from the latest release or a binary you built.
# Usage:
#   curl -fsSL https://github.com/ravindu644/heirloom/releases/latest/download/install.sh | sudo sh
#   sudo sh install.sh [--addr 127.0.0.1:8787] [--contact mailto:you@example.org]
#                      [--binary server/bin/heirloomd --service server/deploy/heirloomd.service]
# Run again to update: the address and contact already set are kept unless given anew.
set -eu

RELEASE=https://github.com/ravindu644/heirloom/releases/latest/download
UNIT=/etc/systemd/system/heirloomd.service
ADDR='' CONTACT='' BINARY='' SERVICE=''
while [ $# -gt 0 ]; do
  case $1 in
    --addr) ADDR=$2 ;;
    --contact) CONTACT=$2 ;;
    --binary) BINARY=$2 ;;
    --service) SERVICE=$2 ;;
    *) echo "install.sh: unknown option $1" >&2; exit 2 ;;
  esac
  shift 2
done

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

if [ -z "$BINARY" ]; then
  for f in "heirloomd-linux-$ARCH" heirloomd.service SHA256SUMS; do
    if command -v curl >/dev/null; then curl -fsSL -o "$TMP/$f" "$RELEASE/$f"; else wget -qO "$TMP/$f" "$RELEASE/$f"; fi
  done
  # Nothing is installed unless both files are the ones the release lists.
  (cd "$TMP" && grep -E " (heirloomd-linux-$ARCH|heirloomd\.service)\$" SHA256SUMS | sha256sum -c - >/dev/null) ||
    { echo "The download does not match SHA256SUMS. Nothing was installed." >&2; exit 1; }
  BINARY=$TMP/heirloomd-linux-$ARCH
  SERVICE=$TMP/heirloomd.service
fi
[ -n "$SERVICE" ] || { echo "With --binary, pass --service too (server/deploy/heirloomd.service)." >&2; exit 1; }

# An update keeps what the unit already says.
if [ -f "$UNIT" ]; then
  [ -n "$ADDR" ] || ADDR=$(sed -n 's/^ExecStart=.* -addr \([^ ]*\).*/\1/p' "$UNIT")
  [ -n "$CONTACT" ] || CONTACT=$(sed -n 's/^ExecStart=.* -contact \([^ ]*\).*/\1/p' "$UNIT")
fi
ADDR=${ADDR:-0.0.0.0:8787}

id heirloomd >/dev/null 2>&1 || useradd --system --home-dir /var/lib/heirloomd --shell /usr/sbin/nologin heirloomd
install -m 0755 "$BINARY" /usr/local/bin/heirloomd
sed "/^ExecStart=/s#-addr [^ ]*#-addr $ADDR#" "$SERVICE" >"$TMP/unit"
if [ -n "$CONTACT" ]; then sed -i "/^ExecStart=/s#\$# -contact $CONTACT#" "$TMP/unit"; fi
install -m 0644 "$TMP/unit" "$UNIT"

systemctl daemon-reload
systemctl enable heirloomd >/dev/null 2>&1
systemctl restart heirloomd
sleep 2
systemctl is-active --quiet heirloomd || { journalctl -u heirloomd -n 20 --no-pager >&2; exit 1; }
/usr/local/bin/heirloomd -version

# A server nobody has signed up on says so at /healthz.
HOST=${ADDR%:*}
[ "$HOST" != 0.0.0.0 ] && [ -n "$HOST" ] || HOST=127.0.0.1
HEALTH=$( (curl -fsS "http://$HOST:${ADDR##*:}/healthz" || wget -qO- "http://$HOST:${ADDR##*:}/healthz") 2>/dev/null || true)
case $HEALTH in
  *'"setup":true'*) echo "Listening on $ADDR. Open it in a browser and set it up now: the first account made there owns the server." ;;
  *) echo "Listening on $ADDR." ;;
esac

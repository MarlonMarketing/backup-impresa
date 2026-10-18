#!/bin/bash
# Install from an inspected local checkout. Never downloads or executes remote scripts.
# Leaves the service stopped until the administrator prepares the storage and starts it.
set -euo pipefail

[[ "$EUID" -eq 0 ]] || { echo 'Run with sudo on a Linux systemd host.' >&2; exit 1; }
for command in node npm rsync restic ssh ssh-keygen ssh-keyscan runuser useradd install systemctl; do
  command -v "$command" >/dev/null || { echo "Missing prerequisite: $command" >&2; exit 1; }
done
[[ -d /run/systemd/system ]] || { echo 'systemd must be the running service manager.' >&2; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || {
  echo 'Node.js 22 or newer is required; Node.js 24 is recommended.' >&2; exit 1;
}
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
version=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version' "$source_dir/package.json")
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid release version.' >&2; exit 1; }
release_dir="/opt/backup-impresa/releases/$version"
[[ ! -e /opt/backup-impresa/current && ! -L /opt/backup-impresa/current && ! -e "$release_dir" ]] || {
  echo 'Existing installation found. No files changed. Follow the manual upgrade guide.' >&2; exit 1;
}
if ! id backup-impresa >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/backup-impresa --shell /usr/sbin/nologin --user-group backup-impresa
fi
install -d -m 0755 /opt/backup-impresa /opt/backup-impresa/releases
install -d -m 0755 -o backup-impresa -g backup-impresa "$release_dir"
install -d -m 0700 -o backup-impresa -g backup-impresa /var/lib/backup-impresa /var/cache/backup-impresa
install -d -m 0700 /etc/backup-impresa
install -m 0644 "$source_dir/package.json" "$source_dir/package-lock.json" "$source_dir/server.mjs" "$release_dir/"
cp -R -- "$source_dir/lib" "$source_dir/public" "$release_dir/"
chown -R backup-impresa:backup-impresa "$release_dir"
# npm lifecycle scripts stay disabled; dependencies are installed as the service account.
runuser -u backup-impresa -- env PATH="$PATH" npm --prefix "$release_dir" ci --omit=dev --ignore-scripts --cache /var/cache/backup-impresa
chown -R root:root "$release_dir"
chmod -R go-w "$release_dir"
ln -s "$release_dir" /opt/backup-impresa/current
if [[ ! -e /etc/backup-impresa/backup-impresa.env ]]; then
  install -m 0600 "$source_dir/deploy/native.env.example" /etc/backup-impresa/backup-impresa.env
fi
install -m 0644 "$source_dir/deploy/backup-impresa.service" /etc/systemd/system/backup-impresa.service
systemctl daemon-reload
printf '\nInstalled %s. Service is NOT started.\n' "$version"
printf 'Prepare storage and permissions; edit /etc/backup-impresa/backup-impresa.env.\n'
printf 'Then: sudo systemctl enable --now backup-impresa\n'
printf 'Guide: https://github.com/MarlonMarketing/backup-impresa/blob/main/docs/INSTALL.it.md\n'

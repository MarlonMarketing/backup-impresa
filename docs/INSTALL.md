# Install on your own server

For graphical SSH, Restic and n8n setup, follow [the complete 0.2 guide](GUIDE.en.md).
[Italiano](INSTALL.it.md) · [Español](INSTALL.es.md)

Choose **Docker Compose**, **Docker CLI without Portainer**, or **native Linux/systemd without Docker**. The dashboard always runs on your machine; no hosted subscription is required. A VPS provides compute, not a second backup disk: choose a separate destination and check capacity before copying. This release copies files visible on the server; it does not automatically connect to arbitrary cloud services or remote servers.

## 1. Prepare storage

Decide which directories hold source files, backup copies and restores. The examples use:

| Purpose | Host directory |
| --- | --- |
| Source | `/srv/backup-impresa/source` |
| Destination | `/srv/backup-impresa/target` |
| Restores | `/srv/backup-impresa/restores` |

For an external disk or attached VPS volume, configure its persistent mount first and check `findmnt -T /srv/backup-impresa/target`. The source and destination should be on separate storage for disk-failure protection. Directories on the same disk are suitable for a smoke test, not that protection. Do not format a disk or change ownership recursively to follow these examples. Use existing, dedicated directories with the necessary permissions.

**Only after confirming the destination is the intended mounted filesystem**, prepare the marker files:

```sh
sudo touch /srv/backup-impresa/source/.backup-impresa-source
printf '%s\n' 'backup-usb-v1' | sudo tee /srv/backup-impresa/target/.backup-impresa-target >/dev/null
```

The destination marker must match `TARGET_ID`. Never create it on a fallback directory when a disk is absent. Choose a fresh destination dedicated to this application. Before first use, test dry run, copy, verification and recovery with disposable files.

## 2A. Docker Compose, without Portainer

Requires Docker Engine and the Compose v2 plugin. Clone the versioned release:

```sh
git clone --branch v0.4.0 --depth 1 https://github.com/MarlonMarketing/backup-impresa.git
cd backup-impresa
cp .env.example .env
chmod 600 .env
```

Edit `.env`: set the three host paths, `TARGET_ID`, `TZ` and notification settings. Keep `BIND_ADDRESS=127.0.0.1` on a public VPS. Source must be readable and destination/restores writable by container UID 0 as mapped by your Docker/LXC host.

```sh
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail 50
docker compose exec backup-impresa cat /data/setup-token
```

Use the token to create your account in the UI. Stop with `docker compose stop`; restart with `docker compose up -d`. Keep the `app-data` volume: **do not use `down -v`** if you want to retain accounts/jobs. Keep the same Compose project name and directory when upgrading so the same data volume is reused.

## 2B. Docker CLI, without Compose

Download the release sources as above, then prepare a private **Docker env-file**. It differs from the Compose `.env`: it contains container settings and source JSON, not host path interpolation.

```sh
cp deploy/docker.env.example docker.env
chmod 600 docker.env
# Edit docker.env before starting.
docker volume create backup-impresa-data
docker run -d --name backup-impresa \
  --init --restart unless-stopped \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --memory 512m --cpus 1 --tmpfs /tmp:size=64m,mode=1777 \
  -p 127.0.0.1:9899:9899 \
  --env-file ./docker.env \
  --mount type=volume,source=backup-impresa-data,target=/data \
  --mount type=bind,source=/srv/backup-impresa/source,target=/sources/files,readonly \
  --mount type=bind,source=/srv/backup-impresa/target,target=/destinations/usb \
  --mount type=bind,source=/srv/backup-impresa/restores,target=/restores \
  ghcr.io/marlonmarketing/backup-impresa:0.4.0
docker logs --tail 50 backup-impresa
docker exec backup-impresa cat /data/setup-token
```

Change the host-side mount paths to your prepared directories. `--mount` deliberately fails when a bind source is absent. Do not run a Compose instance and a CLI instance against the same state or destination simultaneously. There is no `latest` tag; choose a released version explicitly.

## 2C. Native VPS/Linux, without Docker

Requires a Linux host with **systemd running as service manager**, Node.js **22 or newer** (24 recommended), npm, rsync, git and standard Linux account tools. Supported installation layout: Debian/Ubuntu style systemd servers. Other service managers require a custom service definition. Node.js must be installed system-wide, not only in an interactive user's nvm profile. Check:

```sh
node --version
npm --version
rsync --version
systemctl --version
```

Install prerequisites using your OS/vendor's supported packages; the installer deliberately does not replace Node.js or change package repositories. Clone the versioned release as in 2A, inspect `deploy/install-native.sh`, then:

```sh
sudo bash deploy/install-native.sh
```

The installer creates service account `backup-impresa`, installs application files in `/opt/backup-impresa/releases/0.3.0`, creates the `current` link, installs dependencies as that account with npm scripts disabled, and installs the unit. **It does not start the service, create storage markers or overwrite an existing installation.** A failed dependency installation can leave a partial release directory; inspect it before retrying. Environment file is `/etc/backup-impresa/backup-impresa.env` (root-only); persistent application state is `/var/lib/backup-impresa`.

Prepare the three storage directories from section 1. For a new, empty test layout only, after the account exists:

```sh
sudo install -d -m 0750 -o backup-impresa -g backup-impresa \
  /srv/backup-impresa/source /srv/backup-impresa/target /srv/backup-impresa/restores
```

For existing files use appropriate ownership or ACLs to give that account source read and destination/restore write access; do not recursively change unrelated data. The service maps `/srv/backup-impresa/source` read-only to `/sources/files` in its private mount namespace. Application code is owned by root; writable application directories are restricted by systemd.

Create the two markers **after mount verification**, then edit configuration:

```sh
sudoedit /etc/backup-impresa/backup-impresa.env
sudo systemd-analyze verify /etc/systemd/system/backup-impresa.service
sudo systemctl enable --now backup-impresa
sudo systemctl status backup-impresa --no-pager
sudo journalctl -u backup-impresa -n 50 --no-pager
sudo cat /var/lib/backup-impresa/setup-token
```

The env-file uses systemd syntax: no `export`; preserve the quotes around JSON. For different host storage paths create a systemd override with `sudo systemctl edit backup-impresa`: update/reset `BindReadOnlyPaths`, `ReadWritePaths`, `RequiresMountsFor` and `ConditionPathExists` consistently, then update `TARGET_ROOT`/`RESTORE_ROOT` in the env-file. Source paths in `BACKUP_SOURCES` must remain under `/sources`. Keep source mounts read-only. Run `sudo systemctl daemon-reload` and restart after changes. A missing marker causes the unit to be skipped; inspect `systemctl status` and the journal.

Restart after configuration changes with `sudo systemctl restart backup-impresa`. Stop with `sudo systemctl stop backup-impresa`. Save `/var/lib/backup-impresa`, `/etc/backup-impresa` and your unit overrides privately as part of your existing backup policy. Native files are not automatically included in Docker or Proxmox backups.

## 3. Open the panel on a public VPS

Keep port 9899 bound to loopback. From your own computer:

```sh
ssh -N -L 9899:127.0.0.1:9899 YOUR_USER@YOUR_VPS
```

Open `http://127.0.0.1:9899` locally while the tunnel is connected. If local port 9899 is busy, use `-L 19999:127.0.0.1:9899` and open local port 19999 instead. Alternatively put a trusted HTTPS reverse proxy in front and set `COOKIE_SECURE=true`; do not open plain HTTP to the internet. For LAN Docker access only, change the binding to the server's LAN IP. First-time setup token comes from the commands above and is deleted after account creation.

Create a job with schedules disabled. Run dry run, copy, checksum verification and recovery; compare the restored file with the source. Then configure email/Telegram, send a test, and enable scheduling. Check disk capacity independently; install an external uptime monitor to detect a stopped server. For remote services, first arrange consistent dumps/exports into the allowlisted local source; neither this installer nor the dashboard collects them automatically.

## Updates and removal

Back up configuration/state first and wait for running work to finish. Docker: pull a chosen released version and recreate the container with **the same state volume, mounts and env-file**. For Compose edit `BACKUP_VERSION` before `pull` and `up -d`. Do not switch back and forth between native and Docker state without a migration/recovery test.

Native: the installer is for new installs and refuses existing installations. To upgrade, stop the service, stage a reviewed release in a new `/opt/backup-impresa/releases/VERSION` directory, install dependencies as the service account with npm scripts disabled, restore root ownership of code, then repoint `current`. Review release notes and unit changes, verify the service and restart. Preserve `/var/lib/backup-impresa` and the env-file. Do not overwrite the running code in place. Rollback is safe only when state-format compatibility has been checked; otherwise restore the saved matching state too.

To retire an installation, stop/disable its service or container first. Keep state, destination, versions and restores until you have verified they are no longer needed. No uninstall script deletes backup data.

## Connections / Collegamenti / Conexiones (0.4)

See [English](CONNECTIONS.en.md), [Italiano](CONNECTIONS.it.md), [Español](CONNECTIONS.es.md). Native installation additionally needs a recent Rclone (1.75.2 tested; check `rclone help backend smb` for SMB). The Docker image includes the pinned Rclone binary. On a native host set LOCAL_CONNECTOR_ROOTS to the actual mounted paths and allow them in the systemd filesystem sandbox; use dedicated subfolders. Never grant access to the entire host.

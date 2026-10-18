# Backup Impresa 0.2 — start here

[Italiano](GUIDE.it.md) · [Español](GUIDE.es.md)

This guide starts with a test. Do not connect your only copy of important files until you have completed the recovery exercise.

## 1. Understand the three kinds of copy

| What you choose | What you get | How to recover |
|---|---|---|
| Readable file copy | Ordinary files in `current/JOB`; replaced files in `versions/JOB/RUN` | Open the disk or use Explore and recover |
| SSH download | Ordinary files downloaded from another server | Open the download folder; copy its archives to the service that restores them |
| Restic repository | Encrypted, deduplicated snapshots | Use this panel or Restic with the repository password |

A **snapshot** is a saved view of files at a particular time. A **checksum** is a content fingerprint used to detect differences. A **dump** is a database export prepared by its application. Copying a running database's storage directory does not make a consistent database backup.

Two folders on one disk are useful for testing, but do not protect against that disk failing. A backup result and successful notification delivery are separate outcomes. A 10% Restic data check is a sample, not a complete read of all repository data.

## 2. Install with Docker Compose

Prerequisites: a Linux Docker host, Docker Compose v2, Git and permission to manage Docker. Docker Desktop can be used for a test. A NAS/unprivileged LXC may require an administrator to prepare mount permissions.

For a **new test installation only**, create three empty folders:

```sh
sudo mkdir -p /srv/backup-impresa/source /srv/backup-impresa/target /srv/backup-impresa/restores
printf 'My first backup test\n' | sudo tee /srv/backup-impresa/source/hello.txt >/dev/null
sudo touch /srv/backup-impresa/source/.backup-impresa-source
printf 'backup-usb-v1\n' | sudo tee /srv/backup-impresa/target/.backup-impresa-target >/dev/null
git clone --branch v0.2.3 --depth 1 https://github.com/MarlonMarketing/backup-impresa.git
cd backup-impresa
cp .env.example .env
chmod 600 .env
docker compose config --quiet
docker compose up -d
docker compose exec backup-impresa cat /data/setup-token
```

The last command shows your one-time setup token. Enter it **in the panel**, not in a public issue or chat. Choose an administrator name and a password of at least 12 characters.

The default address is `http://127.0.0.1:9899` **on the Docker host**. If the host is elsewhere, use an SSH tunnel (`ssh -N -L 9899:127.0.0.1:9899 USER@HOST`) or configure the host's LAN address in `.env` as `BIND_ADDRESS`. Use a trusted HTTPS reverse proxy and `COOKIE_SECURE=true` for remote access. Do not publish plain HTTP to the Internet.

For a real external disk, first check `findmnt -T /your/folder`. Create markers only after confirming the expected disk is mounted. Do not format a disk or recursively change ownership of existing files to follow this guide.

## 3. Install with Portainer instead

1. Prepare the same folders and markers on the **Docker host**, not your desktop computer.
2. In Portainer select the environment, then **Stacks → Add stack → Repository**.
3. Name: `backup-impresa`. Repository: `https://github.com/MarlonMarketing/backup-impresa`.
4. Reference: `refs/tags/v0.2.3`. Compose file: `compose.yaml`.
5. Copy the values from `.env.example` into stack environment variables. Set your real host paths. Keep `TARGET_ID` equal to the target marker's content.
6. Deploy. Open the container console and run `cat /data/setup-token` to complete the first login.

Do not deploy a second instance over the same state or repository. Never mount the Docker socket in this application. Docker without Compose and native Linux/systemd installation are documented in [INSTALL.md](INSTALL.md).

## 4. Complete your first recovery test

1. Under **Your jobs**, click **New job**. ID: `first-test`; name: `My first test`; source: `Files`.
2. Leave automatic copy and verification **off**, then save.
3. Click **Simulate**, open Details and check the result. No files should be copied yet.
4. Click **Copy now**. Wait for Success.
5. Click **Verify**. This reads and compares content.
6. Open **Files and versions**, find `hello.txt`, then click **Recover copy**.
7. The recovered file is under the separate restores folder. Compare it with the source. The source must remain unchanged.

To test versions, change the test file, run another copy and choose its previous version in the browser. `versions/` contains only replaced files, not full historical snapshots. Source deletions do not delete the readable current copy. No readable-copy retention or automatic cleanup is enabled in 0.2; monitor capacity.

## 5. Add a server from the panel

1. Under **Servers**, click **Add server**. Choose ID `remote-demo` and a descriptive name.
2. Enter host, SSH port, dedicated user and an absolute folder, for example `/srv/exported-backups`. Spaces and shell characters are not supported in remote paths.
3. Click **Read server fingerprint**. Independently compare it in the server console with `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. Only then tick the confirmation. A scan alone does not authenticate a server.
4. Click **Generate a dedicated access key**. The panel displays its **public** key. Ask the server administrator to authorize that key for read-only backup access. This one-time step must happen on the remote server; the panel cannot grant itself access.
5. Alternatively paste an existing dedicated private key. Encrypted/passphrase-protected SSH keys are not supported by unattended jobs; do not use your personal administrator key.
6. Save, then **Test connection**. A successful test checks authentication and folder access; it does not prove every file is readable.
7. In **Remote and Restic tasks**, add a task, choose **Download from a server**, select the server and choose the profile. Start manually.

**Ordinary files** downloads a folder, keeping replaced file versions. Run Verify afterward. It does not prepare databases. **Oracle native backups** requires the completed JSON manifests produced by our Oracle backup scripts; it downloads completed sets and verifies every listed file against SHA256. It is not a generic Virtualmin discovery API. Sites and Docker containers listed in those manifests appear in the panel after a successful download.

Download files stay on disk independently of remote retention. No automatic download deletion is enabled. The Oracle catalog is refreshed separately; refreshing it never deletes downloaded backup sets.

You can also enable weekly verification in each task, with its own day and time. It is off for new tasks. Automatic copies using a scheduled remote source wait for a successful download on that local calendar day.


Oracle tasks require a recent completed backup for both sites and Docker/host by default. The maximum age defaults to 30 hours and can be changed in the task (1–720); disable a category only if you intentionally do not back it up. Missing categories, invalid/future dates or stale source backups fail the download, even when an older archive transfers successfully.


Independent weekly Docker copies produced by the native Oracle script are recognized even when their copied manifest still names the matching daily folder. A changed manifest for an already verified local set blocks the operation and preserves the local archives; diagnose the source rather than deleting the local verification marker.

## 6. Choose the physical disks

By default downloads and local Restic repositories are inside the application state volume. This supports a trial without changing an existing deployment, but can fill the system disk and is not a separate-disk backup.

For production use [compose.storage.yaml](../compose.storage.yaml) with dedicated host folders. After checking their actual mounts, create `.backup-impresa-staging` containing `backup-staging-v1` in the download folder and `.backup-impresa-repositories` containing `backup-repositories-v1` in the repository folder. Set `STAGING_PATH` and `REPOSITORIES_PATH` in `.env`, then run:

```sh
docker compose -f compose.yaml -f compose.storage.yaml config --quiet
docker compose -f compose.yaml -f compose.storage.yaml up -d
```

For Portainer, the stack editor must include the corresponding bind mounts and environment values from that override. Host folders must already exist. The application refuses an external root without the matching identity marker. It does not mount disks, change NTFS UID mappings or alter Proxmox LXC mount points.

After a remote task exists it becomes a source in the readable-copy job selector. Use it for a second copy onto your NTFS USB disk. Keep archive passwords and configuration secrets private even when the archives are ordinary readable files.

## 7. Create a Restic backup

1. Add a repository, for example ID `photos-test`. Select a local mounted disk or SFTP server/folder.
2. Enter a strong repository password and save it independently in a password manager. Losing the password prevents recovery.
3. Check **Backup Impresa is the only manager** only for a repository this application will own. Existing Backrest repositories should start unchecked: listing, checks and recovery only.
4. Save. For a **new empty** repository, click Initialize and type its ID. Existing repositories are never initialized automatically.
5. Create a Restic task, select repository and source, and run it manually. Remote downloads may be selected as a source after a successful download.
6. List snapshots. Choose Recover copy beside a snapshot to recover it into a new folder. Existing source files are not overwritten.
7. Run Check integrity. The button checks structure and a 10% data sample. For a full read, an administrator can run `restic check --read-data` with the same repository and securely supplied password.

Restic retention preview uses seven daily and four weekly snapshots carrying the `backup-impresa` tag. The preview itself deletes nothing. Applying it requires a managed repository and typing its ID within five minutes; only the exact snapshot IDs shown are removed, followed by prune. This is irreversible. It is never scheduled automatically. Do not allow Backrest and this panel to manage retention simultaneously. Restic's repository locks remain enabled; the app does not force-unlock repositories.


Retention counts can be edited in the repository form: daily 1–365, weekly 0–104 and monthly 0–36; zero disables that weekly/monthly category. Defaults are seven daily, four weekly and no monthly snapshots. Editing a repository invalidates an earlier deletion preview. Restic deduplication can save less space for newly regenerated compressed archives than for original unchanged files.

## 8. Configure notifications in the browser

Open **Notifications and n8n settings**. Fill SMTP host, port, username, password, sender and recipient, then Save. Port 587 requires STARTTLS; 465 uses TLS immediately. Certificate validation stays enabled. For Gmail use an app password where your account permits it, not your normal login password. Existing environment-variable credentials remain supported; blank password fields keep the current secret.

For Telegram, create your own bot, start a conversation with it and enter token/chat ID. Save, then use **Send test**. Confirm receipt on the real channel. By default successes are quiet; failures and tests send messages. You can select all results. Notification failure is shown separately from backup failure.

Enabled tasks with no successful backup/download for 30 hours generate an application warning. This cannot detect the panel/server being powered off: use an independent external heartbeat monitor.

## 9. Connect n8n

**Outgoing:** create a Webhook workflow in n8n, method POST, with Header Auth configured as `Authorization: Bearer YOUR_OUTGOING_TOKEN`. Activate/publish the workflow and copy its **production HTTPS URL**. Put URL and matching token in Backup Impresa. Events contain ID, job, operation, status, time and error; not passwords. Use `eventId` to deduplicate. Failed delivery retries up to four total attempts. Redirects are refused; destination changes do not forward pending events to the new URL. Delivery history shows the result.

**Incoming:** in Backup Impresa allow specific task IDs (comma-separated). Local readable jobs use `legacy:JOB_ID`. Create an incoming token with **Create / rotate incoming token** and save it in n8n's credential store. Rotation invalidates the previous token.

In an n8n HTTP Request node:

```text
GET https://YOUR-PANEL/api/integrations/status
Authorization: Bearer YOUR_INCOMING_TOKEN

POST https://YOUR-PANEL/api/integrations/run
Authorization: Bearer YOUR_INCOMING_TOKEN
Content-Type: application/json
Idempotency-Key: unique-workflow-execution-id

{"taskId":"remote-demo","mode":"pull"}
```

Use a different idempotency key for each intended execution; reuse it only when retrying that request. A 202 response means queued, not completed. Poll status and inspect the returned run ID before starting dependent work. Allowed actions: remote `pull`, Restic `backup`/`check`, local `copy`/`verify`/`preview`. Incoming calls cannot change settings, initialize repositories, restore or delete snapshots, or execute arbitrary shell commands.

## 10. Practical examples

- **Family photos:** prepare a consistent Immich SQL dump; copy the entire media directory plus that dump to NTFS for readable recovery. Optionally create a Restic snapshot on another disk. Copying only the SQL dump does not protect photos; media alone does not restore users/albums.
- **VPS websites and Docker:** Virtualmin/application scripts create coherent archives. Home pulls completed manifests, verifies checksums, then copies the downloaded source to USB. Keep independent home retention. A restored website still needs its application-specific restore procedure.
- **Unreliable Internet:** home initiates SSH, so a dynamic home IP needs no incoming router port. A failed download does not become Success. Retry manually or at the next schedule; existing completed sets remain.
- **n8n escalation:** failure event → email immediately from Backup Impresa → n8n filters/reports/retries a permitted task. A retry uses the same event/request ID to avoid duplicate operations. Backups and direct email/Telegram do not depend on n8n being online.

## 11. Upgrade, recover the panel and troubleshoot

Before upgrading: wait until no job is running; save the entire `/data` volume and your private deployment configuration. Keep the same volume, mounts, project name and passwords. Review release notes; pull the chosen version and recreate the container. Never use `docker compose down -v`. Do not delete existing Backrest repositories during migration.

Secrets are encrypted in `secrets.json` using `secrets/master.key` (or `MASTER_KEY_FILE`). Save the key separately and protect both. The default same-volume key does not protect against theft of the whole volume. A missing key causes startup to fail instead of silently generating a replacement. Do not publish state, secrets, keys, `.env` files or real logs in GitHub issues.

If SSH fails: confirm address/port, host fingerprint, authorized dedicated key, folder permissions and required remote `rsync`. If Restic fails: check password, compatible Restic version, repository ownership, disk space and locks; never force-unlock blindly. If external storage is absent: reconnect the correct disk rather than creating a new marker on a fallback folder. If recovery fails: keep original backups, inspect the specific error and test on an isolated destination.

The panel coordinates tools; it cannot promise perfect backups of every application. Test recovery periodically, and maintain an independent/offline copy.

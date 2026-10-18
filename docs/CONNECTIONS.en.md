# Connections: step-by-step guide

A connection is an account/transport; a location is one dedicated folder; a plan joins source and destination. Existing local/SSH plans keep working in their original sections.

1. Open **Connections → Add connection**. Choose a short ID, clear name and protocol. Secrets are encrypted in the existing vault.
2. **Test connection** with the intended folder. Successful login is not a completed backup.
3. **Add folder** twice: source and separate destination. Destination must be a dedicated empty subfolder, never a disk root or active application directory.
4. **Confirm folder identity**, typing its ID. This writes `.backup-impresa-location` with the displayed value. Sources may contain data. For a read-only source, ask its administrator to create that exact marker manually. No fallback folder is used.
5. **Create connected backup**: readable or protected archive. Leave schedules OFF. Save archive passwords independently.
6. Readable: **Preview → Copy → Verify → Browse → recover a file**. Protected: **Initialize** (type plan ID) **→ Backup → Check → Recovery points → restore snapshot**.
7. Compare recovered bytes with the original. Only then enable daily copying and weekly verification. Check the displayed time zone.
8. Review **Activity**, notification failures and the restore path. Keep an independent off-server availability monitor.

## Protocol fields

| Protocol | Required settings | Notes |
|---|---|---|
| Local / USB / NFS | Folder below an allowed local root | Mount on host first; dedicated Docker bind, `create_host_path: false`. NFS uses that mount; the app does not mount it. |
| SFTP | Host, port, user, password/dedicated key, full public host key | Compare fingerprint out of band. Verification is never disabled. Existing Oracle reader permits rsync only and cannot be reused for SFTP. |
| FTP | Host, port, user, password | Explicit insecure transport acknowledgement. Prefer SFTP/FTPS. |
| FTPS | FTP fields; explicit/implicit TLS | Certificate verification mandatory; optional private CA PEM. |
| SMB/CIFS | Host, share/subfolder, user, password, optional domain | Direct SMB connector; use a dedicated share over LAN/VPN. |
| WebDAV / Nextcloud | HTTPS URL, user, app password, vendor | Example `https://cloud.example.com/remote.php/dav/files/USER/`; location is a relative subfolder. |
| S3 compatible | HTTPS endpoint if non-AWS, region, access key, secret | Location `bucket/subfolder`; restrict credentials to that prefix. Provider fees remain yours. |
| Google Drive | Authorized OAuth JSON; optional client/root-folder IDs | On trusted PC: `rclone authorize drive`; paste JSON after personally completing consent. |
| OneDrive | OAuth JSON, drive ID/type | `rclone authorize onedrive`; obtain ID/type by selecting the drive in `rclone config`. |
| Dropbox | Authorized OAuth JSON | `rclone authorize dropbox`; renewed tokens persist encrypted. |

## Versions and consistency

`current/PLAN` is an ordinary file tree. Replacements move to `versions/PLAN/RUN-ID`. Source deletions remain in current. Version folders contain **replaced files only**, not complete historical snapshots. Renames can leave both names. No automatic delete/mirror/cleanup is enabled. Protected archives use Restic encryption, deduplication and complete snapshots; new connected plans keep all snapshots initially.

New connectors stage a **full source download**, verify bytes, publish, then verify destination bytes. Staging needs space for the whole source plus the configured reserve. Full checks transfer/read all content; destination copying reuses unchanged files. Existing SSH/rsync plans retain their incremental workflow. Readable copies do not preserve every Unix ACL/permission or replace machine images. Create consistent database/application dumps before copying live services.

Restores create a NEW folder under `/restores`, never overwrite active data, and can work while the source is offline. Keep archive passwords and `/data`, vault and master key in a separate secure recovery kit. Never publish those files.

## Mounts

Expose dedicated paths below `/sources` or `/destinations`, sources read-only, `create_host_path: false`. `LOCAL_CONNECTOR_ROOTS` is a JSON allowlist; select subfolders, not roots. Existing USB/staging/repository identity markers remain required. A disk mounted after container startup may require container recreation to become visible. No privileged container or Docker socket is needed.

## Validation limits

Automated tests use disposable folders and loopback servers. OAuth adapter tests do not authorize or certify a real Google/Microsoft/Dropbox account. SMB/NFS require an acceptance test on your share/mount. Every new provider must pass login, copy, full verification and recovery before scheduling. No backup software guarantees compatibility with every provider or future release.

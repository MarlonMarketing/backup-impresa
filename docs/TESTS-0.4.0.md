# Release 0.4.0 validation

Local Linux Docker run on 18 October 2026: **60 tests passed, 0 failed, 0 skipped**, 64.97 seconds. Disposable fixtures, `--network none`, 1 GiB RAM, 2 CPUs. Latest translation/asset checks separately passed after the final form-label adjustments. Publication CI repeats the full suite and adds native systemd installation/recovery and Compose validation before publishing the image.

## Tested with real disposable engines/protocol servers

| Component | Evidence |
|---|---|
| Rsync local | Incremental copies, replacements retained, source deletions kept, checksum verification, separate recovery |
| Restic local | Explicit init, backup, snapshots, read-data check, restored bytes |
| Rclone local | Preview without publishing, content verification, retained replacements/deletions, offline-source recovery, wrong-marker refusal |
| SFTP | OpenSSH server, pinned key, real transfer/check, wrong-key refusal |
| FTP | Authenticated server, same-size/time content replacement detected, version retained and byte check |
| FTPS | TLS server with private CA, authenticated copy, versions, byte check |
| SMB | Samba server, authenticated dedicated SMB2 share, versioned copy/check/recovery |
| S3 compatible | Authenticated HTTPS loopback S3 server, copies, replacements, verification |
| WebDAV HTTPS | Authenticated server, mandatory CA validation, readable copy and remote Restic archive backup/check |

Google Drive, OneDrive and Dropbox: adapter/configuration tests, OAuth refresh persistence and secret redaction; **no real customer account authorized or certified**. NFS: uses the tested local engine over a host-provided mount; no NFS server provisioned by this application. Real USB/NTFS and provider acceptance must still be tested on the owner's storage before enabling any new plans.

## Access and regression tests

Invitations/single use, disabled users/session refusal, role/resource isolation, wrong token channel, revocation, owner-only credential administration, MCP tool filtering, forbidden execution, CSRF, rejected cross-origin access, exact-draft review, disabled approved schedules, duplicate request prevention, no arbitrary shell/path traversal, private temporary configuration, vault encryption/key preservation and OAuth renewal.

Upgrade fixture preserves old owner, jobs, history, control settings, encrypted secret bytes and master-key bytes. Legacy n8n cannot overlap a new connector operation or smuggle a foreign repository through an allowed task ID. Partial/failed transfers are not marked successful.

## Codex client

Codex CLI `0.163.0-alpha.10.2` App Server connected to a disposable localhost MCP fixture using a temporary read-only bearer token. `mcpServerStatus/list` reported server `backup-impresa`, version `0.4.0`, `authStatus: bearerToken`, tools `backup_catalog` and `backup_status`, and no tool discovery error. No model turn, production credential or real backup was used.

## Limits

These are integration and regression results, not a certification or independent security audit. They do not demonstrate SaaS tenant isolation, commercial SLAs, every cloud account or a complete physical-server disaster recovery. Production upgrade additionally requires an idle engine, a private configuration snapshot and post-start comparison. No existing backup archive is rewritten as part of release validation or upgrade.

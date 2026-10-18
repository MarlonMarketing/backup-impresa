# 0.4.0 — Connections, delegated access, API and MCP

Adds a separate connector engine without migrating, enabling or deleting existing jobs/backups. Existing SSH/rsync, Restic, n8n integration token and notification settings remain compatible.

- Connections and locations for local/USB, NFS through host mounts, SFTP, FTP/FTPS, SMB, HTTPS WebDAV/Nextcloud, S3, Drive, OneDrive and Dropbox.
- Encrypted connector credentials, strict TLS and pinned SSH public host keys, local-root allowlist, folder identity markers, isolated restore directories and shared execution locks.
- Readable versioned copies retain source deletions and replaced files. Byte comparison selects changes even on FTP where hash/modification time cannot be trusted. New connector transfers stage a full source download and require temporary space; full verification reads all bytes.
- Protected archives use Restic through local or Rclone destinations. Explicit initialization, backup, snapshots, full-data check and recovery. No automatic retention deletion on new connector plans.
- Invited users, delegated resource roles, scoped/expiring/revocable API/MCP tokens, audit and exact-draft owner review. Approved proposals are disabled; no agent self-approval or shell/secret access.
- Sidebar Connections, Access, API and MCP pages; EN/IT/ES guides and [OpenAPI](openapi.yaml). Codex manual bearer-token configuration supported; no OAuth authorization server or embedded AI model.

## Acceptance and limits

Use the release test report for the final counts. Automated protocol servers use temporary test data; they are not the user's production storage. Cloud OAuth profiles are adapter-tested, not live-account certified. NFS needs a real host-mount test; provider-specific quotas, OAuth consent and remote permissions require owner configuration. A live Codex App Server test discovered `backup_catalog` and `backup_status` with bearer-token authentication against the localhost fixture.

This is a single-owner self-hosted edition with resource delegation, not multi-tenant SaaS. The future commercial design is packaged separately and is not deployed on the home server.

## Upgrade and rollback

Before upgrading: ensure all engines idle, take a private copy of `/data` including state, logs, secrets and master key, and preserve current Compose/environment. Update only the image, keeping mounts and environment unchanged. Compare old jobs/tasks, schedules, history, owner password hash, vault ciphertext and master-key bytes after startup. New state namespaces `access` and `transports` are additive.

To roll back before using new connector plans: stop the new instance, restore the complete pre-upgrade `/data` snapshot with the old image/Compose, then start and verify. Do not overwrite newer history or secrets blindly after operating the new release. No cleanup of pre-existing backup files is part of the upgrade.

# 0.3.0 — Sidebar, clear terminology and guided configuration

## User-facing changes

- Overview, backup plans, sources, destinations, protected backups, activity, recovery, alerts/n8n, guides and preferences are separate sidebar pages.
- Overview combines existing readable, remote and protected plans. Last successful copy, last successful integrity check and latest operation result are distinct. Protected-archive checks are explicitly labeled as 10% sampling.
- New backup starts with three explained choices: readable copy, existing remote archives, encrypted/versioned backup.
- Readable-copy and remote/protected plan forms guide the user through source, destination, schedule and review. SSH setup separates connection, host identity and dedicated key access. Archive creation separates location/password and retention.
- Forms validate visible steps before advancing. Enter cannot bypass the review step. Passwords/private keys are omitted from summaries. Saving a plan is not represented as a successful backup or restore test.
- Sources includes local mounts and dedicated SSH connections. Protected backups keeps the Restic engine attribution, archive compatibility and existing safety controls.
- Light, dark and device appearance, optional explanatory text, mobile menu and English/Italian/Spanish navigation/guides.
- Additional capacity metadata for configured staging/repository paths. Paths sharing a filesystem do not represent separate physical copies.

## Compatibility

No storage format, authentication model, source identity, task ID or schedule migration. Existing jobs, settings, secret vault, repository format and run history are preserved. New schedules remain disabled unless explicitly selected. Existing Backrest and Proxmox jobs are not imported or modified.

## External agents

Documented HTTPS integration capabilities for OpenClaw, Pi, Codex and Claude Code. This is documentation-based compatibility assessment, not an end-to-end test of those agents. Existing token API reads status and starts allowlisted plans; it does not create plans or expose admin routes. A scoped draft/review/approval design is documented for a future release. AI models and MCP server are not included.

## Validation

The existing 45 Linux integration/security tests cover real rsync incremental copies, versions, checks and recovery; Restic init/backup/check/restore/retention; pinned SSH, corrupt manifests and read-only access; vault preservation, CSRF, integration authorization/idempotency and HTTPS webhook delivery. Asset-serving tests now include the sidebar/wizard modules and ensure loading the UI does not create or run jobs. Storage metadata assertions check reported capacity.

Browser checks use isolated, disposable data: readable and remote plan creation with schedules off; SSH identity steps; all navigation pages; English/Italian/Spanish; no horizontal overflow at 320px overview / 356px functional navigation and 1280px desktop overview. No browser console errors during the functional flow. Production backup operations are not used as UI fixtures.

## Deployment and rollback

Before update, wait for idle operations and snapshot `state.json`, the secret vault/master key, logs and deployment settings privately. Keep mounts and environment unchanged; update only the pinned image reference. After update verify health, jobs, schedules, run history, vault/key equality and notification configuration. Do not regenerate keys or tokens during a UI upgrade. Roll back the image and, if needed, the private pre-upgrade state snapshot while idle; never overwrite newer backup data.

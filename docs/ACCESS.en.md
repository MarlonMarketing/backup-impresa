# People, secrets and permissions

The existing administrator remains Owner. Installation does not rotate existing keys/passwords.

1. Open **Access and permissions → Resource catalog** and copy exact allowed IDs.
2. **Invite a person**: name, role, one resource ID per line. Empty means none; `*` grants all resources, including future ones. Avoid it for clients.
3. Save the invitation token shown once; transmit privately. It expires after 48 hours and can be revoked before use.
4. The recipient opens login → **Accept invitation**, enters token and chooses username/password (12+ characters). One use only; then sign in normally.
5. Verify isolation; edit role/resources or disable the account. Disabling rejects its existing session on the next request.

| Role | Allowed actions on assigned resources |
|---|---|
| viewer | Read plan names and outcomes; no file browsing/recovery or runs. |
| operator | Read and execute supported operations; no recovery. |
| proposer | Read and propose disabled plans using allowed source/destination locations; cannot approve. |
| maintainer | Read/run/restore; configure schedules of assigned existing connector plans. No connections, users, tokens or source/destination changes. |
| owner | All resources, configuration, access administration and approvals. |

Resource IDs: `legacy:PLAN` for old local plans, `control:PLAN` for existing SSH/Restic, `transport:PLAN` for connected plans. Proposals require `location:SOURCE` and `location:DESTINATION`. Permissions are enforced server-side, including crafted browser requests. File browsing requires restore scope, not read alone.

## Service tokens

API/MCP page → **Create access token**: channel API/MCP/both, 1–365 days, exact resources, minimum actions. Shown once; only SHA-256 digest stored. Rotate by issuing replacement and revoking old. Independent service identities: disabling a human does not revoke unrelated tokens; review separately. Limit 60 requests/token/minute. Never put tokens in URLs or Git.

Vault: existing AES-256-GCM with separate master key. A host administrator who reads both can decrypt; this is not an HSM. Blank secret fields in connection editor keep existing values. Disable dependent schedules before changing connection identity. Renewed OAuth tokens stay encrypted. API/MCP cannot fetch secrets or run arbitrary shell commands. Local audit retains 3,000 recent actions/decisions; GUI shows 200. It is not tamper-proof compliance storage.

## Agent proposals

Owner reviews exact saved draft and approves/rejects against its digest and expiry. Approval always creates a disabled plan; protected drafts need owner-supplied archive password. Test copy/check/restore before enabling schedules. Agents have no approval tool.

This is **single-owner self-hosted software with delegated resources**, not a multi-tenant SaaS boundary. Do not host independent paying tenants in one process before implementing/testing the separate SaaS architecture.

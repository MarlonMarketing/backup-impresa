# API, n8n and Codex MCP

Scoped API and stateless Streamable HTTP MCP. No embedded AI model. External agents may transmit authorized outputs (names/status) to their AI provider; grant minimal resources.

1. Owner creates an **API** token with **read** and one test plan resource. Store in the caller's encrypted credentials.
2. `GET /api/v1/catalog`, header `Authorization: Bearer TOKEN`: allowed plans/locations only.
3. `GET /api/v1/status`: allowed outcomes. 401 invalid/expired/revoked/wrong channel; 403 insufficient access; 429 rate limit.
4. Add **run** only when needed. `POST /api/v1/run` needs JSON and `Idempotency-Key` (8–128 simple characters). Same key+body returns prior operation; changed body is rejected. Use one unique key per intended operation.

```json
{"resource":"transport:family-test","mode":"preview"}
```

Modes: readable copy/preview/verify/restore; protected backup/check/snapshots/restore; existing SSH pull/verify-pull. Restore needs its own scope. No agent archive initialization or deletion. Existing `/api/integrations` n8n endpoints and old token/allowlist remain unchanged and distinct.

## Proposals

`POST /api/v1/proposals`: propose scope, both allowed location IDs, Idempotency-Key. No secrets.

```json
{"id":"family-proposal","name":"Family test","sourceId":"family-source","destinationId":"usb-test","format":"readable"}
```

Expires in 48 hours. Owner reviews exact draft in Access, approves as disabled, tests recovery, then enables schedules. Agents cannot approve or create arbitrary mounts/connections.

## Codex

1. Valid HTTPS domain; reverse proxy forwards `/mcp` and Authorization unchanged. No additional public Docker port. Stateless JSON HTTP, not WebSocket. Manual bearer tokens, **not a full OAuth authorization server**.
2. Create MCP-channel read token for one test plan. Set `BACKUP_IMPRESA_MCP_TOKEN` in the environment launching Codex. Never paste token in chat or config.toml.
3. Configure actual domain:

```toml
[mcp_servers.backup_impresa]
url = "https://backup.example.com/mcp"
bearer_token_env_var = "BACKUP_IMPRESA_MCP_TOKEN"
startup_timeout_sec = 20
```

4. Restart MCP/client. Read exposes `backup_catalog`, `backup_status`. Ask for authorized plan status.
5. Add run/propose only as needed. `backup_run`: resource, mode, idempotencyKey. `backup_propose`: draft and idempotencyKey. Revocation applies next request. No approval, key retrieval, arbitrary shell or deletion tools.

Negotiated MCP versions: 2025-03-26, 2025-06-18, 2025-11-25. First target client Codex; other agents require separate validation.

## n8n example

HTTP Request GET `https://backup.example.com/api/v1/status`, encrypted Bearer credential with read scope. Manual run node: POST `/api/v1/run`, JSON above and unique workflow execution ID as Idempotency-Key. Never embed tokens in exported node text. Existing outgoing result webhooks retain event IDs/retries; incoming idempotency is separate. Email/Telegram retain existing settings.

Official references: [Codex MCP](https://developers.openai.com/codex/mcp), [Codex App Server](https://developers.openai.com/codex/app-server), [Rclone](https://rclone.org/overview/), [Restic](https://restic.readthedocs.io/). No affiliation; retain upstream licenses when redistributing/selling derivatives.

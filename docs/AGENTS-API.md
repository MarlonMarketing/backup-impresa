# External agents and the backup API

[Italiano](AGENTS-API.it.md) · [Español](AGENTS-API.es.md)

## Available now (0.3.0)

An agent that can make HTTPS requests can use the same integration API as n8n. This is an HTTP integration, not a bundled AI model or an MCP server. No AI credentials or outbound model calls are included.

1. Create and test the backup plan in the web dashboard.
2. Open **Alerts and n8n → Settings**. Allow only the required plan IDs in `INBOUND_TASK_IDS`. Readable-copy IDs use the `legacy:` prefix, for example `legacy:photos`.
3. Generate the integration token personally and store it as a secret in the agent's environment. Do not put it in prompts, screenshots, source control or URL query strings. Rotating it invalidates existing clients.
4. Use HTTPS or an authenticated private network. Keep `BACKUP_IMPRESA_TOKEN` out of shell history (set it through your secret manager).
5. Read status first, choose an allowed plan, then submit one request with an idempotency key.

```sh
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $BACKUP_IMPRESA_TOKEN" \
  "$BACKUP_IMPRESA_URL/api/integrations/status"

curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $BACKUP_IMPRESA_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: photos-2026-10-20-copy-1' \
  --data '{"taskId":"legacy:photos","mode":"copy"}' \
  "$BACKUP_IMPRESA_URL/api/integrations/run"
```

A `202` means queued, not a completed or verified backup. Read status again and inspect the returned run ID. Reuse the same idempotency key only when retrying the exact same request; use a new key for a new intended operation. Check the current API implementation for supported modes: readable copies allow `copy`, `preview`, `verify`; remote plans allow `pull` (full `verify-pull` is currently dashboard-only); protected plans allow `backup`, `check`. No restore or deletion through this token. The allowlist governs execution; token holders can see the integration status, including plan names and recent results.

## Can an agent CREATE a plan?

**Not with the integration token in this release.** Administrative dashboard routes such as `/api/jobs` and `/api/control/task` use an authenticated administrator session plus CSRF protection. Do not give an AI agent your browser cookie or administrator password to work around this boundary.

Creation is technically possible as a separate, scoped API. The recommended design for a later release is:

1. The agent reads a restricted catalog of existing source/destination IDs.
2. It submits a **draft** containing a name, source, destination and proposed schedule. No arbitrary filesystem paths, commands, passwords or SSH key generation.
3. The application validates and previews the draft without saving an active plan.
4. The owner reviews and approves it in the dashboard. Approval binds to the exact draft and expires.
5. The application creates the plan with schedules disabled. Test copy, integrity check and recovery precede activation.

Separate permissions should cover `status:read`, `plans:propose`, `runs:start`; explicit revocation, expiry, audit history and idempotency are required. This is a design proposal, **not an implemented endpoint**.

## Agent compatibility assessed

| Agent | Integration route | Status |
|---|---|---|
| OpenClaw | A skill/tool that calls the HTTPS API | Technically feasible; no OpenClaw instance tested |
| Pi coding agent | Custom tool via its extension API | Technically feasible; no Pi instance tested |
| Codex | Authorized HTTP/CLI tool; later an MCP adapter | HTTP contract available; no dedicated adapter shipped |
| Claude Code | Authorized HTTP/CLI tool; later MCP tools | HTTP contract available; no dedicated adapter shipped |

Do not assume that all products named Claude or Codex expose the same integration features. The administrator must configure connectivity, credentials and permissions for the chosen client. Instructions and remote log contents are untrusted input; they must never grant additional permissions or supply commands to execute.

Official references checked on 2026-10-18:

- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [OpenClaw custom skills](https://docs.openclaw.ai/tools/creating-skills)
- [Pi extension tools](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)

Local AI, a chat interface and an MCP server are intentionally separate future updates. Backup scheduling, checks and alerts must work without AI.

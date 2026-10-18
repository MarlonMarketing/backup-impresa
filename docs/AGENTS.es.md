# API, n8n y MCP para Codex

API limitada y MCP Streamable HTTP sin sesión. Sin modelo AI integrado. Agentes externos pueden transmitir resultados autorizados (nombres/estados) a su proveedor AI; concede lo mínimo.

1. Token **API**, **read**, recurso de prueba. Guárdalo en credenciales cifradas del cliente.
2. `GET /api/v1/catalog`, `Authorization: Bearer TOKEN`: recursos permitidos.
3. `GET /api/v1/status`: resultados. 401 token inválido/caducado/revocado/canal incorrecto; 403 permisos; 429 límite.
4. Añade **run** si hace falta. `POST /api/v1/run`: JSON e `Idempotency-Key` de 8–128 caracteres simples. Misma clave+cuerpo devuelve operación anterior; cuerpo distinto rechazado. Clave única por operación intencional.

```json
{"resource":"transport:fotos-prueba","mode":"preview"}
```

Modos: copy/preview/verify/restore legibles; backup/check/snapshots/restore protegidos; pull/verify-pull SSH anteriores. Recuperar necesita restore. Agentes no inicializan/borran archivos. `/api/integrations` n8n y lista/token anteriores siguen distintos y sin cambios.

## Propuestas

`POST /api/v1/proposals`: propose, ambas ubicaciones autorizadas, Idempotency-Key. Sin secretos.

```json
{"id":"propuesta-familia","name":"Prueba familia","sourceId":"fotos-familia","destinationId":"usb-prueba","format":"readable"}
```

Caduca en 48 horas. Propietario revisa en Accesos, aprueba desactivada, prueba recuperación y después programa. Agente no aprueba ni crea conexiones/montajes arbitrarios.

## Codex

1. HTTPS válido; proxy reenvía `/mcp` y Authorization sin cambios. Sin puerto Docker público adicional. HTTP JSON sin sesión, no WebSocket. Bearer manual, **no servidor OAuth completo**.
2. Token MCP read para un plan. Variable `BACKUP_IMPRESA_MCP_TOKEN` en entorno que inicia Codex. Nunca token en chat/config.toml.
3. Dominio real:

```toml
[mcp_servers.backup_impresa]
url = "https://backup.example.com/mcp"
bearer_token_env_var = "BACKUP_IMPRESA_MCP_TOKEN"
startup_timeout_sec = 20
```

4. Reinicia MCP/cliente. read muestra `backup_catalog`, `backup_status`. Pide estado del plan autorizado.
5. run/propose solo necesarios. `backup_run`: resource, mode, idempotencyKey. `backup_propose`: propuesta e idempotencyKey. Revocación efectiva siguiente petición. Sin aprobar, leer claves, shell arbitraria ni borrado.

Versiones: 2025-03-26, 2025-06-18, 2025-11-25. Primer cliente Codex; otros requieren validación separada.

## n8n

HTTP Request GET `https://backup.example.com/api/v1/status`, credencial Bearer cifrada read-only. Manual: POST `/api/v1/run`, JSON ejemplo e ID único de ejecución como Idempotency-Key. No tokens en textos exportados. Webhooks salientes conservan ID/reintentos, separados de idempotencia entrante. Email/Telegram conservan configuración.

Referencias oficiales: [Codex MCP](https://developers.openai.com/codex/mcp), [Codex App Server](https://developers.openai.com/codex/app-server), [Rclone](https://rclone.org/overview/), [Restic](https://restic.readthedocs.io/). Sin afiliación; conserva licencias al distribuir/vender derivados.

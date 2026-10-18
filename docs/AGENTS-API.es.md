> Legacy integration guide (0.3). For the new scoped API and MCP use [the 0.4 guide](AGENTS.es.md). Existing endpoints remain compatible.

# API y agentes externos

[Contrato técnico y ejemplos completos en inglés](AGENTS-API.md) · [Italiano](AGENTS-API.it.md)

## Disponible ahora

Un agente que pueda usar HTTPS puede consultar el estado y ejecutar **planes existentes y autorizados**, mediante la misma API de n8n. No necesita un modelo AI integrado en Backup Impresa.

1. Crea el plan en el panel y prueba copia, verificación y recuperación.
2. En **Avisos y n8n → Configuración**, permite solo los IDs necesarios en `INBOUND_TASK_IDS`. Las copias legibles usan `legacy:ID`, por ejemplo `legacy:fotos`.
3. Genera personalmente el token y guárdalo en el gestor de secretos del agente. Nunca en chats, URLs ni repositorios. Rotarlo invalida los clientes existentes.
4. Usa `GET /api/integrations/status` y `POST /api/integrations/run`, autenticación Bearer y una clave de idempotencia.
5. Comprueba el resultado por ID de ejecución: **202 significa en cola**, no copia completada.

El token no permite restaurar, borrar ni cambiar configuración. Sí permite leer nombres y resultados del estado: trátalo como un secreto.

## Creación de planes

El token actual **no crea nuevos planes**. Las rutas administrativas necesitan sesión y protección CSRF; no compartas la contraseña ni la cookie del administrador con el agente.

Una futura API podrá seguir este flujo: catálogo limitado de orígenes → borrador del agente → validación → aprobación del propietario en el panel → creación con horarios desactivados → pruebas → activación. Sin shell, rutas arbitrarias ni acceso a secretos. Estos endpoints **todavía no están implementados**.

## Compatibilidad evaluada

- **OpenClaw:** skill que llama a HTTPS.
- **Pi:** herramienta registrada mediante una extensión.
- **Codex y Claude Code:** herramientas autorizadas HTTP/CLI; adaptador MCP en otra versión.

Es una evaluación de documentación, no una prueba con cuatro agentes reales. Referencias oficiales y ejemplos en la [guía técnica](AGENTS-API.md). AI local, chat y MCP serán actualizaciones separadas. Los backups funcionan sin AI.

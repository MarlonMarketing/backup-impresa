# API, n8n e MCP per Codex

API limitate e MCP Streamable HTTP senza sessione. Nessun modello AI integrato. Gli agenti esterni possono trasmettere gli esiti autorizzati (nomi/stati) al fornitore AI: concedi il minimo.

1. Crea token **API**, **read**, una risorsa di prova. Salvalo nelle credenziali cifrate dello strumento chiamante.
2. `GET /api/v1/catalog`, intestazione `Authorization: Bearer TOKEN`: solo risorse consentite.
3. `GET /api/v1/status`: esiti consentiti. 401 token errato/scaduto/revocato/canale sbagliato; 403 permessi; 429 limite richieste.
4. Aggiungi **run** solo se serve. `POST /api/v1/run`: JSON e `Idempotency-Key` di 8–128 caratteri semplici. Stessa chiave+corpo restituisce operazione precedente; corpo diverso rifiutato. Chiave unica per ogni operazione voluta.

```json
{"resource":"transport:foto-prova","mode":"preview"}
```

Modalità: copy/preview/verify/restore leggibili; backup/check/snapshots/restore protetti; pull/verify-pull SSH esistenti. Recupero richiede restore. Agenti non inizializzano/cancellano archivi. Vecchie `/api/integrations` n8n e relativa lista/token restano distinti e invariati.

## Proposte

`POST /api/v1/proposals`: propose, entrambe le posizioni autorizzate, Idempotency-Key. Non inviare segreti.

```json
{"id":"proposta-famiglia","name":"Prova famiglia","sourceId":"foto-famiglia","destinationId":"usb-prova","format":"readable"}
```

Scade in 48 ore. Il proprietario esamina la bozza in Accessi, approva disattivata, prova recupero e poi abilita orari. Agenti non approvano né creano montaggi/collegamenti arbitrari.

## Codex

1. Dominio HTTPS valido; proxy inoltra `/mcp` e Authorization inalterati. Nessuna porta pubblica Docker aggiuntiva. HTTP JSON senza sessione, non WebSocket. Bearer token manuali, **non server OAuth completo**.
2. Token MCP read per una risorsa di prova. Imposta `BACKUP_IMPRESA_MCP_TOKEN` nell’ambiente che avvia Codex. Mai token in chat/config.toml.
3. Configura il dominio reale:

```toml
[mcp_servers.backup_impresa]
url = "https://backup.example.com/mcp"
bearer_token_env_var = "BACKUP_IMPRESA_MCP_TOKEN"
startup_timeout_sec = 20
```

4. Riavvia client/MCP. read espone `backup_catalog`, `backup_status`. Chiedi lo stato del piano autorizzato.
5. Aggiungi run/propose solo se necessario. `backup_run`: resource, mode, idempotencyKey. `backup_propose`: bozza e idempotencyKey. Revoca dalla richiesta successiva. Nessuno strumento approva, legge chiavi, esegue shell arbitraria o cancella.

Versioni MCP: 2025-03-26, 2025-06-18, 2025-11-25. Primo client Codex; altri da verificare separatamente.

## Esempio n8n

HTTP Request GET `https://backup.example.com/api/v1/status`, credenziale Bearer cifrata read-only. Avvio manuale: POST `/api/v1/run`, JSON esempio e ID esecuzione workflow univoco come Idempotency-Key. Mai token nei testi esportati. Webhook in uscita mantengono ID/ritentativi; idempotenza in ingresso separata. Impostazioni email/Telegram conservate.

Riferimenti ufficiali: [Codex MCP](https://developers.openai.com/codex/mcp), [Codex App Server](https://developers.openai.com/codex/app-server), [Rclone](https://rclone.org/overview/), [Restic](https://restic.readthedocs.io/). Nessuna affiliazione; conserva licenze quando distribuisci/vendi derivati.

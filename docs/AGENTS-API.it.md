# API e agenti esterni

[Contratto tecnico ed esempi completi in inglese](AGENTS-API.md) · [Español](AGENTS-API.es.md)

## Cosa puoi fare adesso

Un agente capace di usare HTTPS può leggere lo stato e avviare **piani già configurati e autorizzati**, usando le stesse API di n8n. Non serve installare un modello AI dentro Backup Impresa.

1. Crea il piano dalla grafica e prova copia, verifica e recupero.
2. In **Avvisi e n8n → Impostazioni**, autorizza solo gli ID necessari in `INBOUND_TASK_IDS`. Per le copie leggibili usa `legacy:ID`, per esempio `legacy:foto`.
3. Genera personalmente il token integrazioni e salvalo nel gestore segreti dell’agente. Non inserirlo in chat, URL o repository. La rotazione invalida i client esistenti.
4. Configura l’agente per leggere `GET /api/integrations/status` e avviare `POST /api/integrations/run`, con autenticazione Bearer e una chiave di idempotenza.
5. Controlla l’esito tramite l’ID dell’esecuzione: **202 significa in coda**, non backup riuscito.

Il token non consente recuperi, cancellazioni o modifiche alle impostazioni. Permette però di leggere nomi e risultati nell’API di stato: va trattato come un segreto.

## Può creare automaticamente nuovi backup?

Può avviare un piano esistente. **Non può creare nuovi piani con il token integrazioni attuale.** Le API amministrative della grafica richiedono sessione e protezione CSRF: non bisogna consegnare all’agente la password o il cookie dell’amministratore.

La prossima estensione potrà offrire: catalogo limitato delle sorgenti → bozza proposta dall’agente → validazione → approvazione tua nella grafica → piano creato con orari disattivati → prove → attivazione. Nessuna shell, percorso libero, lettura di segreti o cancellazione. Questi endpoint di creazione **non sono ancora implementati**.

## Compatibilità verificata sulla documentazione

- **OpenClaw:** una skill può richiamare le API HTTPS.
- **Pi:** un’estensione può registrare uno strumento dedicato.
- **Codex e Claude Code:** possono usare strumenti autorizzati per HTTP/CLI; un adattatore MCP potrà essere aggiunto separatamente.

È una verifica delle possibilità di integrazione, non un collaudo reale di quattro agenti. I collegamenti alle fonti ufficiali e gli esempi sono nella [guida tecnica](AGENTS-API.md). AI locale, chat e MCP saranno aggiornamenti separati. I backup continuano a funzionare senza AI.

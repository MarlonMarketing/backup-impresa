# Backup Impresa — Italiano

**Versione 0.2:** server SSH, Restic locale/SFTP, notifiche configurabili dalla grafica e API n8n. [Guida completa passo passo con esempi](GUIDE.it.md).
Pannello Docker per copie rsync leggibili, versioni dei file sostituiti, verifica dei contenuti e recupero in una cartella separata. Interfaccia disponibile in italiano, inglese e spagnolo dal selettore in alto.

**Prima versione, da collaudare sui propri dati.** [Documentazione tecnica completa e limiti](../README.md).

## Docker diretto e VPS

Portainer è facoltativo. La [guida di installazione in italiano](INSTALL.it.md) comprende Docker Compose, Docker con `docker run` e installazione nativa su VPS Linux senza Docker. Sono inclusi installatore, utente dedicato e servizio systemd; per l'accesso alla VPS trovi le istruzioni del tunnel SSH. Il servizio nativo rimane fermo finché non prepari dati e configurazione.

## Installazione in Portainer

1. Prepara le cartelle sorgente, destinazione e recuperi sul server Docker. Se usi un disco USB, controlla prima con `findmnt -T /percorso/destinazione` che sia davvero montato il disco previsto.
2. Crea `.backup-impresa-source` nella sorgente. Nella destinazione crea `.backup-impresa-target` contenente `backup-usb-v1`, oppure l'identificativo scelto in `TARGET_ID`. Non creare questo file nella cartella di ripiego di un disco assente.
3. Apri **Stacks → Add stack → Repository**. Repository: `https://github.com/MarlonMarketing/backup-impresa`; riferimento: `refs/tags/v0.2.1`; file: `compose.yaml`.
4. Imposta `SOURCE_PATH`, `TARGET_PATH`, `RESTORE_PATH`, `TARGET_ID`, `TZ=Europe/Rome` e `BIND_ADDRESS` con l'IP LAN del server. Il valore predefinito `127.0.0.1` permette accesso soltanto dal server. Nei container LXC non privilegiati controlla la mappatura UID: non usare permessi aperti a tutti per aggirarla.
5. Distribuisci lo stack. Nella console del container esegui `cat /data/setup-token`. Apri `http://IP_SERVER:9899`, seleziona italiano e crea l'account. Il token viene rimosso dopo la configurazione.
6. Crea un lavoro senza pianificazione. Esegui **Simula → Copia ora → Verifica → Recupera copia** di un file di prova. Confronta il recupero con l'originale prima di attivare le pianificazioni.
7. Inserisci le variabili SMTP e Telegram indicate in [.env.example](../.env.example), imposta `NOTIFICATION_LANGUAGE=it`, ridistribuisci e premi **Invia prova**. Gli errori di consegna sono separati dagli esiti delle copie.

## Cosa viene conservato

`current/NOME-LAVORO` contiene file normali. `versions/NOME-LAVORO/ESECUZIONE` conserva solo i file sostituiti: non è un archivio completo a una data passata. I file eliminati dalla sorgente restano nella copia. Nessuna cancellazione automatica; controlla lo spazio di versioni, log e recuperi.

La copia usa dimensioni e date dei file; **Verifica** legge i contenuti e controlla le differenze. Il recupero avviene in `/restores`, senza sovrascrivere i dati attivi. Il pannello non crea dump di database: per Immich serve tutta la libreria e un dump recente, con una prova completa di recupero dell'applicazione. Non copiare il database PostgreSQL acceso come unico backup.

Conserva privatamente il volume `/data` e le credenziali dello stack. Backrest e Proxmox continuano a gestire i rispettivi backup. Serve un controllo esterno per segnalare lo spegnimento del pannello. Per accessi esterni usa VPN o HTTPS e `COOKIE_SECURE=true`.

Immagine pubblica: `ghcr.io/marlonmarketing/backup-impresa:0.2.1` (Linux amd64). Per altre architetture usa la compilazione locale descritta nella [guida completa](../README.md). Licenza MIT; segnalazioni e contributi tramite GitHub.

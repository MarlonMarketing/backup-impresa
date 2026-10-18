# Backup Impresa 0.2 — comincia da qui

[English](GUIDE.en.md) · [Español](GUIDE.es.md)

Parti da una prova. Collega i dati importanti soltanto dopo aver copiato, verificato e recuperato un file dimostrativo.

## 1. Scegli il tipo di copia

| Scelta | Risultato | Recupero |
|---|---|---|
| Copia leggibile | File normali in `current/LAVORO`; precedenti file sostituiti in `versions/LAVORO/ESECUZIONE` | Apri il disco oppure usa Esplora e recupera |
| Download SSH | File scaricati da un altro server | Apri la cartella; usa gli archivi con lo strumento che ripristina quel servizio |
| Repository Restic | Snapshot cifrati e deduplicati | Usa il pannello o Restic con la password del repository |

Uno **snapshot** rappresenta i file a una certa data. Il **checksum** è un’impronta del contenuto che permette di rilevare differenze. Un **dump** è un’esportazione coerente del database. Copiare la cartella di un database acceso non equivale a fare un dump.

Due cartelle sullo stesso disco servono per provare, ma non proteggono dal guasto del disco. Un backup riuscito e una notifica consegnata sono risultati distinti. Il controllo Restic al 10% legge un campione dei dati, non l’intero repository.

## 2. Installa con Docker Compose

Servono un computer/server Linux con Docker, Compose v2, Git e l’autorizzazione a gestire Docker. Docker Desktop va bene per una prova. Su NAS e LXC non privilegiati può servire un amministratore per preparare montaggi e permessi.

Per una **nuova installazione di prova**, prepara cartelle vuote:

```sh
sudo mkdir -p /srv/backup-impresa/source /srv/backup-impresa/target /srv/backup-impresa/restores
printf 'Il mio primo backup di prova\n' | sudo tee /srv/backup-impresa/source/ciao.txt >/dev/null
sudo touch /srv/backup-impresa/source/.backup-impresa-source
printf 'backup-usb-v1\n' | sudo tee /srv/backup-impresa/target/.backup-impresa-target >/dev/null
git clone --branch v0.2.2 --depth 1 https://github.com/MarlonMarketing/backup-impresa.git
cd backup-impresa
cp .env.example .env
chmod 600 .env
docker compose config --quiet
docker compose up -d
docker compose exec backup-impresa cat /data/setup-token
```

L’ultimo comando mostra il token di primo accesso. Inseriscilo **nel pannello**, mai in una chat o segnalazione pubblica. Scegli un nome amministratore e una password di almeno 12 caratteri. Dal selettore in alto scegli Italiano.

L’indirizzo iniziale è `http://127.0.0.1:9899` **sul computer che esegue Docker**. Se Docker gira su un altro server, usa un tunnel (`ssh -N -L 9899:127.0.0.1:9899 UTENTE@SERVER`) oppure imposta in `.env` il suo indirizzo LAN come `BIND_ADDRESS`. Per accessi remoti usa un reverse proxy HTTPS affidabile e `COOKIE_SECURE=true`. Non pubblicare HTTP semplice su Internet.

Per dischi reali controlla prima `findmnt -T /tua/cartella`: deve essere montato il dispositivo previsto. Crea i marcatori soltanto dopo questo controllo. Questa guida non richiede di formattare dischi né cambiare ricorsivamente i proprietari di dati esistenti.

## 3. Oppure installa con Portainer

1. Prepara le stesse cartelle e i marcatori **sul server Docker**, non sul PC dal quale apri il browser.
2. In Portainer scegli l’ambiente, poi **Stacks → Add stack → Repository**.
3. Nome stack: `backup-impresa`. Repository: `https://github.com/MarlonMarketing/backup-impresa`.
4. Riferimento: `refs/tags/v0.2.2`. File Compose: `compose.yaml`.
5. Riporta i valori di `.env.example` nelle variabili dello stack e inserisci i percorsi reali. `TARGET_ID` deve coincidere con il contenuto del marcatore di destinazione.
6. Distribuisci lo stack. Apri la console del container e usa `cat /data/setup-token` per completare il primo accesso.

Non avviare due istanze sugli stessi dati o repository. Non montare il socket Docker nell’applicazione. Per Docker senza Compose e VPS Linux senza Docker consulta [INSTALL.it.md](INSTALL.it.md).

## 4. Fai una copia e un recupero di prova

1. In **I tuoi lavori** premi **Nuovo lavoro**. ID `prima-prova`, nome `La mia prima prova`, sorgente `Files`.
2. Lascia copia e verifica automatiche **disattivate**. Salva.
3. Premi **Simula** e apri Dettagli. La simulazione non deve copiare file.
4. Premi **Copia ora** e attendi l’esito riuscito.
5. Premi **Verifica**: viene confrontato il contenuto.
6. Apri **File e versioni**, trova `ciao.txt` e premi **Recupera copia**.
7. Apri la cartella dei recuperi, separata dalla sorgente. Il file recuperato deve essere uguale e l’originale deve essere ancora presente.

Per provare le versioni modifica il file dimostrativo e rifai la copia. Nel selettore puoi aprire la versione precedente. Le cartelle `versions` contengono **soltanto file sostituiti**, non snapshot completi. I file eliminati dalla sorgente restano nella copia corrente. La versione 0.2 non elimina automaticamente copie leggibili o versioni: controlla la capacità.

## 5. Aggiungi Oracle o un altro server dalla grafica

1. In **Server**, premi **Aggiungi server**. Scegli un ID breve, per esempio `server-remoto`, e un nome riconoscibile.
2. Inserisci indirizzo, porta SSH, utente dedicato e cartella assoluta, per esempio `/srv/exported-backups`. Nei percorsi remoti non sono supportati spazi e caratteri di comando.
3. Premi **Leggi impronta del server**. Confrontala, dalla console del server, con `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. Spunta la conferma soltanto se coincide. La scansione da sola non prova l’identità del server.
4. Premi **Genera una chiave di accesso dedicata**. Il pannello mostra la chiave **pubblica**: deve essere autorizzata sul server per leggere i backup. Questo passaggio iniziale va eseguito dall’amministratore remoto; il pannello non può autorizzarsi da solo.
5. In alternativa inserisci una chiave privata già dedicata ai backup. Le chiavi SSH protette da passphrase non sono supportate nelle attività automatiche. Non usare la chiave personale dell’amministratore.
6. Salva e premi **Prova collegamento**. La prova controlla autenticazione e cartella; non garantisce ancora la lettura di ogni singolo file.
7. In **Attività remote e Restic** aggiungi un’attività **Scarica da un server**, scegli server e formato e avviala manualmente.

Il formato **File normali** scarica una cartella e conserva le versioni dei file sostituiti. Esegui poi Verifica. Non prepara database. **Backup nativi Oracle** usa i manifest JSON di completamento prodotti dai nostri script Oracle: scarica le esecuzioni complete e verifica ogni file elencato mediante SHA256. Non è una ricerca universale dei siti Virtualmin. Dopo il download nel pannello compaiono i siti e i container dichiarati nei manifest.

I download rimangono a casa anche quando Oracle elimina i propri backup vecchi. La pulizia del catalogo temporaneo non elimina gli archivi scaricati. La cancellazione automatica dei download non è attiva: controlla lo spazio.

Puoi abilitare anche la verifica settimanale di ogni attività, con giorno e orario distinti. È disattivata inizialmente. Le copie automatiche che usano una sorgente remota pianificata aspettano un download riuscito nella giornata locale.


Le attività Oracle richiedono inizialmente un backup recente sia dei siti sia di Docker/host. L’età massima è 30 ore e si modifica nell’attività (1–720); disattiva una categoria soltanto se volutamente non la proteggi. Categorie assenti, date non valide/future o backup sorgenti troppo vecchi fanno fallire il lavoro, anche se un vecchio archivio viene trasferito correttamente.


Le copie settimanali Docker indipendenti dello script nativo Oracle vengono riconosciute anche quando il manifest copiato indica ancora il giornaliero corrispondente. Un manifest cambiato per un gruppo già verificato a casa blocca il lavoro e conserva gli archivi locali: controlla la sorgente, senza cancellare il marcatore di verifica locale.

## 6. Scegli i dischi fisici

Inizialmente download e repository locali sono nel volume dati dell’applicazione. È una scelta utile per provare senza modificare un’installazione esistente, ma può riempire il disco di sistema e non rappresenta un disco indipendente.

Per l’uso reale impiega [compose.storage.yaml](../compose.storage.yaml) con cartelle dedicate. Dopo aver verificato i montaggi, crea nella cartella dei download il file `.backup-impresa-staging` con contenuto `backup-staging-v1`, e nella cartella dei repository `.backup-impresa-repositories` con contenuto `backup-repositories-v1`. Imposta `STAGING_PATH` e `REPOSITORIES_PATH` in `.env`, poi:

```sh
docker compose -f compose.yaml -f compose.storage.yaml config --quiet
docker compose -f compose.yaml -f compose.storage.yaml up -d
```

Su Portainer riporta nello stack i montaggi e le variabili di questo file aggiuntivo. Le cartelle host devono già esistere. Il programma rifiuta una destinazione esterna senza il marcatore corretto. Non monta dischi, non modifica la mappatura UID di NTFS e non cambia i mount point LXC di Proxmox.

Dopo la creazione di un’attività remota, questa compare come sorgente nei lavori delle copie leggibili. Puoi quindi usarla per la seconda copia su USB NTFS. Gli archivi possono contenere password e configurazioni private anche quando sono normali file `.tar.gz`.

## 7. Crea un backup Restic

1. Aggiungi un repository, per esempio ID `foto-prova`. Scegli disco locale montato oppure server/cartella SFTP.
2. Inserisci una password robusta e salvala anche nel tuo gestore password. Senza password non puoi recuperare i dati.
3. Spunta **Backup Impresa è l’unico gestore** soltanto per un repository affidato a questo programma. Per quelli Backrest esistenti lascia disattivato: potrai elencare, verificare e recuperare, senza avviare backup o pulizia da questo pannello.
4. Salva. Solo per un repository **nuovo e vuoto**, premi Inizializza e digita il suo ID. Non viene mai inizializzato automaticamente un repository esistente.
5. Crea un’attività Restic con repository e sorgente; avviala manualmente. Puoi scegliere un download remoto dopo che è stato completato.
6. Premi **Elenca snapshot** e poi **Recupera copia** accanto alla data desiderata. Il recupero va in una nuova cartella e non sovrascrive la sorgente.
7. Premi **Controlla integrità**. Viene verificata la struttura e letto un campione del 10% dei dati. Per una lettura completa un amministratore può usare `restic check --read-data`, con repository e password forniti in modo sicuro.

L’anteprima di conservazione propone sette giornalieri e quattro settimanali per gli snapshot con tag `backup-impresa`. L’anteprima non cancella nulla. Per applicarla servono un repository gestito, il suo ID digitato e un’anteprima di meno di cinque minuti. Sono eliminati solo gli ID mostrati e vengono liberati i dati inutilizzati tramite prune. È irreversibile e **non è pianificato automaticamente**. Non assegnare la pulizia contemporaneamente a Backrest e Backup Impresa. I blocchi di sicurezza Restic restano attivi; non vengono forzati gli sblocchi.


Le quantità sono modificabili nel repository: giornalieri 1–365, settimanali 0–104 e mensili 0–36. Zero disattiva la categoria settimanale/mensile. Valori iniziali: sette giornalieri, quattro settimanali, nessun mensile. Modificare il repository annulla una precedente anteprima di eliminazione. Archivi compressi rigenerati possono deduplicarsi meno dei file originali invariati.

## 8. Configura email e Telegram dal browser

Apri **Impostazioni notifiche e n8n**. Inserisci server SMTP, porta, utente, password, mittente e destinatario e salva. La porta 587 richiede STARTTLS; la 465 usa TLS immediato. Il controllo dei certificati resta attivo. Per Gmail usa una password per app, quando consentita dall’account, non la normale password di accesso.

Le credenziali già nelle variabili dello stack continuano a funzionare. Lascia vuoto un campo password per conservare il segreto esistente. Per Telegram crea il tuo bot, avvia una conversazione e inserisci token e ID chat. Dopo il salvataggio usa **Invia prova** e verifica di ricevere il messaggio.

Normalmente vengono inviati errori e prove; puoi abilitare anche i successi. Un errore di notifica non trasforma un backup riuscito in fallito. Per attività abilitate senza un backup/download riuscito da 30 ore compare un avviso. Il pannello non può rilevare il proprio server spento: serve un controllo indipendente esterno.

## 9. Collega n8n

**Eventi in uscita:** crea in n8n un workflow con nodo Webhook POST e Header Auth `Authorization: Bearer TUO_TOKEN_USCITA`. Attiva/pubblica il workflow e copia il suo URL **di produzione HTTPS**. Inserisci URL e token corrispondente in Backup Impresa. Il messaggio contiene ID evento, lavoro, operazione, risultato, data ed errore; non password. Usa `eventId` per evitare elaborazioni duplicate.

Le consegne fallite sono ritentate fino a quattro tentativi complessivi. I redirect vengono rifiutati. Cambiare URL non inoltra al nuovo indirizzo gli eventi vecchi in attesa. La cronologia webhook mostra gli esiti.

**Comandi in ingresso:** indica nel pannello gli ID delle attività che n8n può avviare, separati da virgole. Per i lavori locali usa `legacy:ID_LAVORO`. Premi **Crea / cambia token in ingresso**, salvalo nel gestore credenziali di n8n e non inserirlo in chat. Un nuovo token invalida il precedente.

Nel nodo HTTP Request di n8n:

```text
GET https://TUO-PANNELLO/api/integrations/status
Authorization: Bearer TUO_TOKEN_INGRESSO

POST https://TUO-PANNELLO/api/integrations/run
Authorization: Bearer TUO_TOKEN_INGRESSO
Content-Type: application/json
Idempotency-Key: identificativo-unico-esecuzione-workflow

{"taskId":"server-remoto","mode":"pull"}
```

Usa una chiave diversa per ogni nuova esecuzione voluta; riusa la stessa solo quando ritenti quella richiesta. La risposta 202 significa **in coda**, non completato. Interroga lo stato e controlla l’ID dell’esecuzione prima di avviare il passo successivo. Operazioni consentite: `pull` remoto, `backup`/`check` Restic, `copy`/`verify`/`preview` per lavori locali. L’API n8n non può cambiare configurazioni, inizializzare repository, recuperare o cancellare snapshot né eseguire comandi shell arbitrari.

## 10. Esempi pratici

- **Foto di famiglia:** genera prima un dump SQL coerente di Immich; copia l’intera libreria multimediale e il dump su NTFS. Puoi aggiungere uno snapshot Restic su un altro disco. Solo SQL non protegge le foto; solo media non ripristina utenti e album.
- **Siti e Docker di una VPS:** Virtualmin e procedure applicative producono archivi coerenti. Casa scarica i manifest completi, verifica le copie e le copia su USB. La conservazione domestica è indipendente. Per ripristinare un sito usa la procedura dello strumento che ha creato l’archivio.
- **Connessione instabile:** il collegamento parte da casa, quindi un IP domestico dinamico non richiede porte in ingresso sul router. Un download fallito non è dichiarato riuscito. Ritenta manualmente o alla prossima pianificazione; le copie complete restano.
- **Automazioni n8n:** errore → email diretta da Backup Impresa → n8n prepara un riepilogo o ritenta un’attività autorizzata. Usa gli identificativi per evitare duplicazioni. Backup ed email/Telegram non dipendono dalla disponibilità di n8n.

## 11. Aggiornamento e problemi frequenti

Prima di aggiornare attendi la fine dei lavori e salva **tutto il volume `/data`** e la configurazione privata dello stack. Mantieni volume, percorsi, nome progetto e password. Leggi le note, scarica la versione scelta e ricrea il container. Non usare `docker compose down -v`. Non cancellare i repository Backrest durante il passaggio.

I segreti sono cifrati in `secrets.json` usando `secrets/master.key` oppure `MASTER_KEY_FILE`. Conserva anche una copia separata e protetta della chiave. La chiave nello stesso volume non protegge dal furto dell’intero volume. Se manca, il programma si ferma invece di crearne silenziosamente un’altra. Non pubblicare su GitHub stato, chiavi, `.env`, password e log reali.

Se SSH fallisce controlla indirizzo, porta, impronta, autorizzazione della chiave, permessi e presenza di `rsync` sul server remoto. Se Restic fallisce controlla password, versione compatibile, permessi, spazio e blocchi; non forzare uno sblocco alla cieca. Se manca un disco ricollega quello corretto: non creare un nuovo marcatore su una cartella di ripiego. Se un recupero fallisce conserva gli archivi originali e prova in un ambiente isolato.

Il pannello coordina gli strumenti, ma non può garantire backup perfetti di ogni applicazione. Ripeti periodicamente le prove di recupero e mantieni una copia indipendente/offline.

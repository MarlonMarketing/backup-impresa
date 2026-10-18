# Collegamenti: guida passo passo

Un collegamento è un account/protocollo; una posizione è una cartella dedicata; un piano unisce sorgente e destinazione. I piani locali/SSH precedenti restano nelle loro sezioni.

1. Apri **Collegamenti → Aggiungi collegamento**. Scegli ID breve, nome e protocollo. I segreti vengono cifrati nella cassaforte esistente.
2. **Prova collegamento** indicando la cartella. L’accesso riuscito non è un backup completato.
3. **Aggiungi cartella** per sorgente e destinazione separate. La destinazione deve essere una sottocartella dedicata vuota, mai la radice del disco o un servizio attivo.
4. **Conferma identità cartella** digitando il suo ID. Crea `.backup-impresa-location` con il valore mostrato. La sorgente può contenere dati. Se è in sola lettura chiedi all’amministratore di creare quel file con il valore esatto. Nessuna cartella di ripiego.
5. **Crea backup collegato** leggibile o protetto. Lascia gli orari disattivati. Conserva separatamente la password archivio.
6. Leggibile: **Simula → Copia → Verifica → Esplora → recupera un file**. Protetto: **Inizializza** digitando ID piano **→ Backup → Verifica → Punti di recupero → recupera snapshot**.
7. Confronta il recupero con l’originale. Solo dopo abilita copia giornaliera e verifica settimanale. Controlla il fuso del pannello.
8. Controlla **Attività**, errori di notifica e percorso di recupero. Un controllo esterno serve anche per rilevare il server spento.

## Campi dei protocolli

| Protocollo | Configurazione | Dettagli |
|---|---|---|
| Locale / USB / NFS | Cartella sotto una radice consentita | Monta prima sul nodo; bind Docker dedicato con `create_host_path: false`. Il programma non monta NFS direttamente. |
| SFTP | Server, porta, utente, password/chiave dedicata, chiave pubblica del server | Confronta l’impronta con l’amministratore. Verifica mai disabilitata. Il lettore Oracle esistente permette solo rsync e non serve per SFTP. |
| FTP | Server, porta, utente, password | Richiede accettazione del trasporto non cifrato. Preferisci SFTP/FTPS. |
| FTPS | Dati FTP, TLS esplicito/implicito | Certificato sempre verificato; CA privata PEM facoltativa. |
| SMB/CIFS | Server, condivisione/sottocartella, utente, password, dominio facoltativo | Collegamento diretto SMB; condivisione dedicata su LAN/VPN. |
| WebDAV / Nextcloud | URL HTTPS, utente, password applicativa, fornitore | Esempio `https://cloud.example.com/remote.php/dav/files/UTENTE/`; posizione relativa. |
| S3 compatibile | Endpoint HTTPS se non AWS, regione, access key e secret | Percorso `bucket/sottocartella`; permessi limitati al prefisso. Costi del fornitore a tuo carico. |
| Google Drive | JSON OAuth autorizzato; client/ID cartella facoltativi | Sul PC fidato `rclone authorize drive`; completa personalmente il consenso e incolla il JSON. |
| OneDrive | JSON OAuth, ID/tipo drive | `rclone authorize onedrive`; seleziona il drive in `rclone config` per ottenere ID/tipo. |
| Dropbox | JSON OAuth autorizzato | `rclone authorize dropbox`; rinnovi conservati cifrati. |

## Versioni e coerenza

`current/PIANO` contiene file normali. Le sostituzioni passano a `versions/PIANO/ID-ESECUZIONE`. I file eliminati dalla sorgente restano in current. Le versioni contengono **solo file sostituiti**, non una fotografia completa di tutto l’archivio. Un cambio nome può lasciare entrambi i nomi. Nessun delete/mirror/pulizia automatica. Gli archivi protetti usano cifratura, deduplicazione e snapshot Restic completi; i nuovi piani inizialmente conservano tutti i punti.

I nuovi collegamenti scaricano **l’intera sorgente** nell’area di preparazione, verificano i byte, pubblicano e verificano la destinazione. Serve spazio per tutta la sorgente più la riserva minima. Le verifiche complete leggono/trasferiscono tutti i contenuti; la destinazione riutilizza i file invariati. I vecchi piani SSH/rsync mantengono il funzionamento incrementale. Le copie leggibili non preservano ogni permesso/ACL Unix e non sostituiscono immagini delle macchine. Prima di copiare servizi attivi genera dump coerenti dei database.

I recuperi creano una NUOVA cartella sotto `/restores`, non sovrascrivono dati attivi e possono funzionare con sorgente offline. Conserva password archivi e `/data`, cassaforte e chiave master in un kit di recupero separato e sicuro. Non pubblicarli mai.

## Montaggi

Esponi solo percorsi dedicati sotto `/sources` o `/destinations`, sorgenti in sola lettura, `create_host_path: false`. `LOCAL_CONNECTOR_ROOTS` è un elenco JSON delle radici: seleziona sottocartelle, non le radici stesse. Restano obbligatori i marcatori USB/staging/repository esistenti. Un disco montato dopo l’avvio può richiedere la ricreazione del container. Non servono privilegi speciali o socket Docker.

## Limiti del collaudo

I test usano cartelle usa e getta e server di protocollo locali. I test OAuth non autorizzano/certificano account Google/Microsoft/Dropbox reali. SMB/NFS richiedono una prova sulla tua condivisione/montaggio. Ogni nuovo fornitore deve superare accesso, copia, verifica e recupero prima degli orari automatici.

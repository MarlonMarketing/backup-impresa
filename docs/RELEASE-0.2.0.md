# 0.2.0 — Servers, Restic and automations

## English

Graphical SSH profiles with key generation, host-key pinning and connection checks; generic and Oracle-manifest downloads; local/SFTP Restic initialization, backup, snapshots, integrity sampling, verified recovery, and retention preview/explicit apply. SMTP, Telegram and webhook settings can be saved in the browser. Outgoing HTTPS events have persistent retries and stable IDs; incoming n8n calls require a dedicated token, allowlisted task and idempotency key. Practical guides are provided in English, Italian and Spanish and inside the application.

**Upgrade:** wait for idle, back up the entire state volume and deployment configuration, preserve volume/mounts/environment, then change only the image version. Existing schema-1 accounts, USB jobs, schedules, versions and runs are preserved. No current repository is imported, initialized or deleted automatically. New tasks start disabled. Existing environment credentials are still used until overridden in the panel.

**Important:** default download and Restic directories are in the app data volume; mount dedicated disks with identity markers for production. Back up `secrets.json` AND the master key privately. Default same-volume encryption does not protect against whole-volume theft. Restic retention deletion requires a managed repository and a preview less than five minutes old. It targets this app's tagged snapshots, not unrelated snapshots, and is never automatically scheduled. Readable-copy and downloaded-archive automatic retention is not implemented. The integrity button reads metadata and a 10% data sample. API calls do not permit arbitrary commands or deletion. A separate external monitor is needed for complete server outages.

The Docker image includes Debian's Restic and OpenSSH clients. Repository compatibility depends on the bundled Restic version; no automatic repository upgrade is attempted. Published images are Linux amd64; ARM64 users can build from source with Docker's native architecture. The disposable SSH fixture image is for tests only and must never be deployed or published as the application.

## Italiano

Profili SSH configurabili dalla grafica, generazione chiavi, verifica identità e prova collegamento. Download normali o con manifest Oracle. Restic locale/SFTP con backup, snapshot, verifica a campione, recupero verificato e conservazione con anteprima e applicazione esplicita. Impostazioni email, Telegram e webhook dal browser. Eventi HTTPS con ritentativi persistenti; API n8n con token separato, attività autorizzate e idempotenza. Guide pratiche nelle tre lingue anche nel pannello.

**Aggiornamento:** attendi la fine dei lavori, salva l'intero volume dati e la configurazione dello stack, conserva montaggi/variabili/volume e cambia soltanto la versione dell'immagine. Account e lavori USB esistenti, pianificazioni, versioni e storico sono conservati. Nessun repository è importato, inizializzato o cancellato automaticamente. Le nuove attività sono disattivate; le credenziali nelle variabili continuano a funzionare.

Download e repository inizialmente usano il volume dati: per l'uso reale monta dischi dedicati con marcatori. Salva privatamente segreti e chiave principale. La chiave nello stesso volume non protegge dal furto del volume. La pulizia Restic è manuale, riguarda gli snapshot con tag del programma e richiede conferma; le copie leggibili e i download non vengono eliminati automaticamente. Il pulsante integrità legge struttura e 10% dei dati. Il monitor locale non rileva il server spento. Immagine pubblicata amd64; ARM64 compilabile dai sorgenti. Non distribuire l'immagine di collaudo con server SSH.

## Español

Perfiles SSH gráficos con generación de claves, comprobación de identidad y conexión. Descargas normales o con manifiestos Oracle. Restic local/SFTP con copias, instantáneas, verificación de muestra, recuperación verificada y conservación con vista previa/aplicación explícita. Configuración email, Telegram y webhook desde el navegador. Eventos HTTPS con reintentos persistentes; API n8n con token separado, tareas permitidas e idempotencia. Guías prácticas en los tres idiomas y dentro del panel.

**Actualización:** espera a que terminen las tareas, guarda el volumen completo y la configuración, conserva montajes/variables/volumen y cambia solo la versión de la imagen. Se mantienen cuenta, tareas USB, programación, versiones e historial existentes. Ningún repositorio se importa, inicializa o elimina automáticamente. Las tareas nuevas están desactivadas; las credenciales en variables siguen funcionando.

Las descargas y repositorios utilizan inicialmente el volumen de datos: para producción monta discos dedicados con marcadores. Guarda secretos y clave principal de forma privada. La clave en el mismo volumen no protege frente al robo del volumen. La limpieza Restic es manual, selecciona instantáneas etiquetadas por la aplicación y requiere confirmación. Las copias legibles y descargas no se eliminan automáticamente. La verificación lee estructura y un 10% de datos. El monitor local no detecta un servidor apagado. Imagen publicada amd64; ARM64 compilable desde el código. No despliegues la imagen de pruebas con servidor SSH.

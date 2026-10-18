const rows = {
  backupMaxAge: [
    "Maximum Oracle backup age in hours (1–720)",
    "Età massima backup Oracle in ore (1–720)",
    "Antigüedad máxima de copias Oracle en horas (1–720)",
  ],
  backupAgeHelp: [
    "Checks when the remote backup completed, not when it was downloaded. Default: 30 hours.",
    "Controlla quando è terminato il backup remoto, non quando è stato scaricato. Valore iniziale: 30 ore.",
    "Comprueba cuándo terminó la copia remota, no cuándo se descargó. Valor inicial: 30 horas.",
  ],
  requireSiteBackups: [
    "Require recent Virtualmin site backups",
    "Richiedi backup recenti dei siti Virtualmin",
    "Exigir copias recientes de sitios Virtualmin",
  ],
  requireDockerBackups: [
    "Require recent Docker and host backups",
    "Richiedi backup recenti di Docker e configurazioni host",
    "Exigir copias recientes de Docker y configuración del servidor",
  ],
  keepDaily: [
    "Daily snapshots to keep (1–365)",
    "Snapshot giornalieri da conservare (1–365)",
    "Instantáneas diarias que conservar (1–365)",
  ],
  keepWeekly: [
    "Weekly snapshots to keep (0–104)",
    "Snapshot settimanali da conservare (0–104)",
    "Instantáneas semanales que conservar (0–104)",
  ],
  keepMonthly: [
    "Monthly snapshots to keep (0–36)",
    "Snapshot mensili da conservare (0–36)",
    "Instantáneas mensuales que conservar (0–36)",
  ],
  internalStorageWarning: [
    "Downloads/local Restic currently use the application volume. For production choose dedicated disk mounts using the guide.",
    "Download/Restic locale usano ora il volume dell’applicazione. Per l’uso reale prepara montaggi su dischi dedicati seguendo la guida.",
    "Las descargas/Restic local utilizan el volumen de la aplicación. Para producción prepara montajes de discos dedicados siguiendo la guía.",
  ],
  protectedServices: [
    "Protected websites and containers",
    "Siti e container protetti",
    "Sitios y contenedores protegidos",
  ],
  sitesLabel: ["Websites", "Siti web", "Sitios web"],
  checksumConfirmed: [
    "Downloaded files verified against the source manifest.",
    "File scaricati verificati rispetto al manifest sorgente.",
    "Archivos descargados verificados con el manifiesto de origen.",
  ],
  controlTitle: [
    "Servers, Restic and automations",
    "Server, Restic e automazioni",
    "Servidores, Restic y automatizaciones",
  ],
  controlHelp: [
    "Start with a test folder. New schedules are off until you enable them.",
    "Inizia con una cartella di prova. Le nuove pianificazioni sono disattivate.",
    "Empieza con una carpeta de prueba. Las nuevas programaciones están desactivadas.",
  ],
  controlServers: ["Servers", "Server", "Servidores"],
  controlRepositories: [
    "Restic repositories",
    "Repository Restic",
    "Repositorios Restic",
  ],
  controlTasks: [
    "Remote and Restic tasks",
    "Attività remote e Restic",
    "Tareas remotas y Restic",
  ],
  controlSettings: [
    "Notifications and n8n settings",
    "Impostazioni notifiche e n8n",
    "Configuración de avisos y n8n",
  ],
  controlSettingsTitle: ["Settings", "Impostazioni", "Configuración"],
  controlDetails: [
    "Details — copy the information you need",
    "Dettagli — copia le informazioni necessarie",
    "Detalles — copia la información necesaria",
  ],
  controlId: [
    "Short ID (example: oracle)",
    "ID breve (esempio: oracle)",
    "ID corto (ejemplo: oracle)",
  ],
  serverWizard: [
    "1. Enter the server address. 2. Verify its identity. 3. Authorize a dedicated read-only key on that server. 4. Save and test.",
    "1. Inserisci l’indirizzo. 2. Verifica l’identità. 3. Autorizza sul server una chiave dedicata in sola lettura. 4. Salva e prova.",
    "1. Introduce la dirección. 2. Verifica la identidad. 3. Autoriza una clave dedicada de solo lectura en el servidor. 4. Guarda y prueba.",
  ],
  serverHost: [
    "Address (example: 203.0.113.10)",
    "Indirizzo (esempio: 203.0.113.10)",
    "Dirección (ejemplo: 203.0.113.10)",
  ],
  serverPort: [
    "SSH port (usually 22)",
    "Porta SSH (di solito 22)",
    "Puerto SSH (normalmente 22)",
  ],
  serverUser: [
    "Dedicated SSH user",
    "Utente SSH dedicato",
    "Usuario SSH dedicado",
  ],
  serverFolder: [
    "Remote folder to download",
    "Cartella remota da scaricare",
    "Carpeta remota que se descargará",
  ],
  serverFolderHelp: [
    "Absolute Linux path, without spaces. Only this folder is requested.",
    "Percorso Linux assoluto, senza spazi. Viene richiesta soltanto questa cartella.",
    "Ruta Linux absoluta, sin espacios. Solo se solicita esta carpeta.",
  ],
  scanHost: [
    "Read server fingerprint",
    "Leggi impronta del server",
    "Leer huella del servidor",
  ],
  serverHostKey: [
    "Server public host key",
    "Chiave pubblica identificativa del server",
    "Clave pública de identificación del servidor",
  ],
  hostVerified: [
    "I compared the fingerprint with the server console",
    "Ho confrontato l’impronta con la console del server",
    "He comparado la huella con la consola del servidor",
  ],
  compareFingerprint: [
    "Compare with the server console. Do not trust a scan alone.",
    "Confronta con la console del server. La sola scansione non basta.",
    "Compárala con la consola del servidor. El escaneo por sí solo no basta.",
  ],
  generateKey: [
    "Generate a dedicated access key",
    "Genera una chiave di accesso dedicata",
    "Generar una clave de acceso dedicada",
  ],
  privateKey: [
    "Private access key (optional after generation)",
    "Chiave privata di accesso (facoltativa dopo la generazione)",
    "Clave privada de acceso (opcional tras generarla)",
  ],
  secretUnchanged: [
    "Leave blank to keep the existing secret.",
    "Lascia vuoto per conservare il segreto esistente.",
    "Déjalo vacío para conservar el secreto existente.",
  ],
  keyHelp: [
    "Authorize the generated PUBLIC key on the server. Never paste your personal key or password here. Private keys stay encrypted in the application.",
    "Autorizza la chiave PUBBLICA generata sul server. Non usare la tua chiave personale. Le chiavi private sono conservate cifrate nell’applicazione.",
    "Autoriza la clave PÚBLICA generada en el servidor. No uses tu clave personal. Las claves privadas se guardan cifradas en la aplicación.",
  ],
  repositoryType: [
    "Where is the repository?",
    "Dove si trova il repository?",
    "¿Dónde está el repositorio?",
  ],
  localRepository: [
    "Mounted local disk",
    "Disco locale montato",
    "Disco local montado",
  ],
  repositoryLocationHelp: [
    "A local repository uses a subfolder named after its ID inside:",
    "Un repository locale usa una sottocartella con il suo ID dentro:",
    "Un repositorio local utiliza una subcarpeta con su ID dentro de:",
  ],
  remoteRepositoryPath: [
    "Remote repository folder (SFTP only)",
    "Cartella remota del repository (solo SFTP)",
    "Carpeta remota del repositorio (solo SFTP)",
  ],
  repositoryPassword: [
    "Restic repository password",
    "Password del repository Restic",
    "Contraseña del repositorio Restic",
  ],
  passwordRecoveryHelp: [
    "Save this password independently. Without it you cannot recover the repository.",
    "Conserva questa password anche separatamente. Senza di essa non puoi recuperare il repository.",
    "Guarda esta contraseña también por separado. Sin ella no podrás recuperar el repositorio.",
  ],
  managedRepository: [
    "Backup Impresa is the only manager of this repository",
    "Backup Impresa è l’unico gestore di questo repository",
    "Backup Impresa es el único gestor de este repositorio",
  ],
  managedWarning: [
    "Leave unchecked for an existing Backrest repository: listing, checks and recovery only. Never let two panels manage retention.",
    "Lascia disattivato per un repository Backrest esistente: solo elenco, controlli e recupero. Non affidare la pulizia a due pannelli.",
    "Déjalo desactivado para un repositorio Backrest existente: solo consulta, verificación y recuperación. No permitas que dos paneles gestionen la limpieza.",
  ],
  taskType: [
    "What should this task do?",
    "Cosa deve fare questa attività?",
    "¿Qué debe hacer esta tarea?",
  ],
  pullTask: [
    "Download from a server",
    "Scarica da un server",
    "Descargar de un servidor",
  ],
  resticTask: [
    "Back up with Restic",
    "Esegui backup con Restic",
    "Crear copia con Restic",
  ],
  pullProfile: [
    "Download format",
    "Formato del download",
    "Formato de descarga",
  ],
  oracleProfile: [
    "Oracle native backups — verify manifests",
    "Backup nativi Oracle — verifica manifest",
    "Copias nativas Oracle — verificar manifiestos",
  ],
  filesProfile: [
    "Ordinary files — no database preparation",
    "File normali — nessuna preparazione database",
    "Archivos normales — sin preparación de base de datos",
  ],
  taskHelp: [
    "Start manually with schedules OFF. For live databases prepare a consistent dump first. Remote downloads stay on disk until you remove them; watch free space.",
    "Inizia manualmente con pianificazioni DISATTIVATE. Per database attivi prepara prima un dump coerente. I download restano sul disco: controlla lo spazio.",
    "Empieza manualmente con programación DESACTIVADA. Prepara un volcado coherente de las bases de datos activas. Las descargas permanecen en disco: controla el espacio.",
  ],
  smtpHost: [
    "SMTP server (example: smtp.gmail.com)",
    "Server SMTP (esempio: smtp.gmail.com)",
    "Servidor SMTP (ejemplo: smtp.gmail.com)",
  ],
  smtpPort: [
    "SMTP port (587 TLS or 465 TLS)",
    "Porta SMTP (587 TLS o 465 TLS)",
    "Puerto SMTP (587 TLS o 465 TLS)",
  ],
  mailFrom: [
    "Sender email address",
    "Indirizzo email mittente",
    "Correo del remitente",
  ],
  mailTo: [
    "Recipient email address",
    "Indirizzo email destinatario",
    "Correo del destinatario",
  ],
  botToken: [
    "Telegram bot token",
    "Token bot Telegram",
    "Token del bot de Telegram",
  ],
  chatId: ["Telegram chat ID", "ID chat Telegram", "ID del chat de Telegram"],
  webhookUrl: [
    "n8n production webhook URL (HTTPS)",
    "URL webhook di produzione n8n (HTTPS)",
    "URL de producción del webhook n8n (HTTPS)",
  ],
  webhookToken: [
    "Outgoing webhook Bearer token",
    "Token Bearer del webhook in uscita",
    "Token Bearer del webhook saliente",
  ],
  inboundTasks: [
    "Task IDs n8n may start (comma-separated)",
    "ID attività avviabili da n8n (separati da virgole)",
    "ID de tareas que n8n puede iniciar (separados por comas)",
  ],
  inboundHelp: [
    "Empty means no task can be started remotely. Status access uses a separate token.",
    "Vuoto significa che nessuna attività può essere avviata da remoto. L’accesso usa un token separato.",
    "Vacío significa que ninguna tarea puede iniciarse remotamente. El acceso utiliza un token separado.",
  ],
  successNotifications: [
    "When should notifications be sent?",
    "Quando inviare le notifiche?",
    "¿Cuándo se deben enviar avisos?",
  ],
  errorsOnly: [
    "Errors and tests only",
    "Solo errori e prove",
    "Solo errores y pruebas",
  ],
  allResults: [
    "Successes and errors",
    "Successi ed errori",
    "Éxitos y errores",
  ],
  monitorHelp: [
    "Backup and email/Telegram work without n8n. An independent monitor is needed to detect this server being offline.",
    "Backup ed email/Telegram funzionano senza n8n. Serve un controllo esterno per rilevare il server spento.",
    "Las copias y email/Telegram funcionan sin n8n. Se necesita un monitor externo para detectar que este servidor está apagado.",
  ],
  saveConfiguration: [
    "Save configuration",
    "Salva configurazione",
    "Guardar configuración",
  ],
  connectionOk: [
    "Connection successful",
    "Collegamento riuscito",
    "Conexión correcta",
  ],
  serverSummary: [
    "Read-only download from SSH servers. No public port needs to be opened at home.",
    "Download in sola lettura tramite SSH. Non serve aprire porte pubbliche a casa.",
    "Descarga de solo lectura mediante SSH. No necesitas abrir puertos públicos en casa.",
  ],
  noServers: [
    "Add your first server and test the connection.",
    "Aggiungi il primo server e prova il collegamento.",
    "Añade el primer servidor y prueba la conexión.",
  ],
  addServer: ["+ Add server", "+ Aggiungi server", "+ Añadir servidor"],
  addRepository: [
    "+ Add repository",
    "+ Aggiungi repository",
    "+ Añadir repositorio",
  ],
  addTask: ["+ Add task", "+ Aggiungi attività", "+ Añadir tarea"],
  testConnection: ["Test connection", "Prova collegamento", "Probar conexión"],
  repositorySummary: [
    "Encrypted snapshots require Restic and the password for recovery. They are different from readable file copies.",
    "Gli snapshot cifrati richiedono Restic e la password per il recupero. Sono diversi dalle copie leggibili.",
    "Las instantáneas cifradas requieren Restic y la contraseña para recuperarlas. Son distintas de las copias legibles.",
  ],
  noRepositories: [
    "Start with a new empty test repository.",
    "Inizia con un nuovo repository vuoto di prova.",
    "Empieza con un repositorio de prueba nuevo y vacío.",
  ],
  managedLabel: ["Managed here", "Gestito qui", "Gestionado aquí"],
  readOnlyLabel: [
    "Read-only management",
    "Gestione in sola lettura",
    "Gestión de solo lectura",
  ],
  initializeRepository: [
    "Initialize empty repository",
    "Inizializza repository vuoto",
    "Inicializar repositorio vacío",
  ],
  listSnapshots: ["List snapshots", "Elenca snapshot", "Listar instantáneas"],
  checkRepository: [
    "Check integrity (10% data sample)",
    "Controlla integrità (campione dati 10%)",
    "Verificar integridad (muestra de datos del 10%)",
  ],
  retentionPreview: [
    "Preview retention policy",
    "Anteprima delle regole di conservazione",
    "Vista previa de las reglas de conservación",
  ],
  applyRetention: [
    "Apply reviewed deletion",
    "Applica eliminazione verificata",
    "Aplicar eliminación revisada",
  ],
  taskSummary: [
    "Download first, verify it, then create a Restic task if you want encrypted history. Existing USB jobs remain below.",
    "Prima scarica e verifica, poi crea un’attività Restic se vuoi uno storico cifrato. I lavori USB esistenti restano sotto.",
    "Primero descarga y verifica; después crea una tarea Restic si quieres historial cifrado. Las tareas USB existentes siguen abajo.",
  ],
  noControlTasks: [
    "Create a download or Restic task. Start it manually before enabling its schedule.",
    "Crea un’attività download o Restic. Avviala manualmente prima di abilitarne la pianificazione.",
    "Crea una tarea de descarga o Restic. Iníciala manualmente antes de activar su programación.",
  ],
  runNow: ["Run now", "Avvia ora", "Ejecutar ahora"],
  stagingLocation: [
    "Downloaded readable copies",
    "Copie leggibili scaricate",
    "Copias legibles descargadas",
  ],
  automationTitle: [
    "Automations and notification delivery",
    "Automazioni e consegna notifiche",
    "Automatizaciones y entrega de avisos",
  ],
  automationHelp: [
    "Outgoing events use HTTPS. Incoming calls require a separate Bearer token and an Idempotency-Key. Only allowlisted tasks may start.",
    "Gli eventi in uscita usano HTTPS. Le chiamate in ingresso richiedono un token Bearer separato e Idempotency-Key. Si avviano solo le attività autorizzate.",
    "Los eventos salientes utilizan HTTPS. Las llamadas entrantes requieren un token Bearer separado e Idempotency-Key. Solo se inician tareas autorizadas.",
  ],
  rotateToken: [
    "Create / rotate incoming token",
    "Crea / cambia token in ingresso",
    "Crear / cambiar token entrante",
  ],
  deliveryHistory: [
    "Webhook deliveries",
    "Consegne webhook",
    "Entregas webhook",
  ],
  controlHistory: [
    "Server and Restic activity",
    "Attività server e Restic",
    "Actividad de servidores y Restic",
  ],
  initPrompt: [
    "Initialize ONLY a new empty repository. Type its ID: {id}",
    "Inizializza SOLO un repository nuovo e vuoto. Digita il suo ID: {id}",
    "Inicializa SOLO un repositorio nuevo y vacío. Escribe su ID: {id}",
  ],
  snapshotPrompt: [
    "Paste the full 64-character snapshot ID from the snapshot list.",
    "Incolla l’ID completo dello snapshot (64 caratteri) dall’elenco snapshot.",
    "Pega el ID completo de la instantánea (64 caracteres) de la lista.",
  ],
  retentionPrompt: [
    "This permanently deletes the snapshots shown in the preview and reclaims unused data. Type the repository ID: {id}",
    "Elimina definitivamente gli snapshot mostrati nell’anteprima e libera i dati inutilizzati. Digita l’ID del repository: {id}",
    "Elimina permanentemente las instantáneas mostradas y libera datos no utilizados. Escribe el ID del repositorio: {id}",
  ],
  tokenWarning: [
    "Creating a new token invalidates the previous one. Continue?",
    "Un nuovo token rende inutilizzabile il precedente. Continuare?",
    "Un token nuevo invalida el anterior. ¿Continuar?",
  ],
  tokenOnce: [
    "Save this token in your password manager and configure it in n8n. Do not send it in chat.",
    "Salva il token nel gestore password e configuralo in n8n. Non inviarlo in chat.",
    "Guarda el token en tu gestor de contraseñas y configúralo en n8n. No lo envíes por chat.",
  ],
  notificationHelp: [
    "Configure email, Telegram and n8n in Notifications and n8n settings. An independent monitor detects this panel being offline.",
    "Configura email, Telegram e n8n nelle Impostazioni notifiche e n8n. Un controllo esterno rileva il pannello spento.",
    "Configura email, Telegram y n8n en Configuración de avisos y n8n. Un monitor externo detecta que el panel está apagado.",
  ],
  otherTools: [
    "Existing Backrest and Proxmox jobs remain independent until you explicitly migrate them.",
    "I lavori Backrest e Proxmox esistenti restano indipendenti finché non li migri esplicitamente.",
    "Las tareas existentes de Backrest y Proxmox siguen siendo independientes hasta que las migres explícitamente.",
  ],
};
export const controlTranslations = Object.fromEntries(
  ["en", "it", "es"].map((lang, i) => [
    lang,
    Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v[i]])),
  ]),
);

export const controlMessages = [
  [
    "Choose an age limit from 1 to 720 hours and at least one backup category.",
    "Scegli un limite da 1 a 720 ore e almeno una categoria di backup.",
    "Elige un límite de 1 a 720 horas y al menos una categoría de copia.",
  ],
  [
    "Oracle backup category missing or completion date invalid: sites",
    "Backup siti Oracle assente o data di completamento non valida.",
    "Falta la copia de sitios Oracle o su fecha de finalización no es válida.",
  ],
  [
    "Oracle backup category missing or completion date invalid: docker",
    "Backup Docker Oracle assente o data di completamento non valida.",
    "Falta la copia Docker Oracle o su fecha de finalización no es válida.",
  ],
  [
    "Oracle backup too old: sites",
    "Backup dei siti Oracle troppo vecchio: controlla il backup su Oracle.",
    "La copia de sitios Oracle es demasiado antigua: revisa la copia en Oracle.",
  ],
  [
    "Oracle backup too old: docker",
    "Backup Docker Oracle troppo vecchio: controlla il backup su Oracle.",
    "La copia Docker Oracle es demasiado antigua: revisa la copia en Oracle.",
  ],
  [
    "Wait until all queued operations finish before changing configuration.",
    "Attendi la fine di tutte le operazioni prima di modificare la configurazione.",
    "Espera a que terminen todas las operaciones antes de cambiar la configuración.",
  ],
  [
    "Another operation is active. Try again after it finishes.",
    "È attiva un’altra operazione. Riprova quando termina.",
    "Hay otra operación activa. Inténtalo cuando termine.",
  ],
  [
    "Select a configured SSH server.",
    "Seleziona un server SSH configurato.",
    "Selecciona un servidor SSH configurado.",
  ],
  [
    "Confirm the host key fingerprint using the server console first.",
    "Prima confronta e conferma l’impronta nella console del server.",
    "Primero compara y confirma la huella en la consola del servidor.",
  ],
  [
    "Invalid host, SSH user or port.",
    "Indirizzo, utente SSH o porta non validi.",
    "Dirección, usuario SSH o puerto no válidos.",
  ],
  [
    "Generate or paste a dedicated SSH private key first.",
    "Prima genera o inserisci una chiave SSH privata dedicata.",
    "Primero genera o introduce una clave privada SSH dedicada.",
  ],
  [
    "Key already exists. Existing keys are never replaced automatically.",
    "La chiave esiste già e non viene sostituita automaticamente.",
    "La clave ya existe y no se sustituye automáticamente.",
  ],
  [
    "Paste the server public host key, not a private key.",
    "Inserisci la chiave pubblica identificativa del server, non una chiave privata.",
    "Introduce la clave pública de identificación del servidor, no una clave privada.",
  ],
  [
    "Remote path: use an absolute path without spaces, shell characters or dot segments.",
    "Usa un percorso remoto assoluto senza spazi, caratteri di comando o segmenti punto.",
    "Utiliza una ruta remota absoluta sin espacios, caracteres de comandos ni segmentos de punto.",
  ],
  [
    "Create a new server profile to change the source of existing tasks.",
    "Per cambiare la sorgente di attività esistenti crea un nuovo profilo server.",
    "Crea un perfil nuevo para cambiar el origen de tareas existentes.",
  ],
  [
    "Run and verify the remote download first.",
    "Prima completa e verifica il download remoto.",
    "Primero completa y verifica la descarga remota.",
  ],
  [
    "No completed Oracle backups found.",
    "Non sono stati trovati backup Oracle completi.",
    "No se encontraron copias Oracle completas.",
  ],
  [
    "Incomplete or invalid backup manifest.",
    "Manifest del backup incompleto o non valido.",
    "Manifiesto de copia incompleto o no válido.",
  ],
  [
    "Some backup files are missing or differ from their manifest.",
    "Alcuni file del backup mancano o differiscono dal manifest.",
    "Faltan archivos de la copia o difieren del manifiesto.",
  ],
  [
    "Downloaded file checksum mismatch.",
    "Il checksum del file scaricato non coincide.",
    "La suma de comprobación del archivo descargado no coincide.",
  ],
  [
    "Free space below safety threshold.",
    "Spazio libero inferiore alla soglia di sicurezza.",
    "El espacio libre está por debajo del umbral de seguridad.",
  ],
  [
    "Insufficient space for the remote backup.",
    "Spazio insufficiente per il backup remoto.",
    "Espacio insuficiente para la copia remota.",
  ],
  [
    "Storage identity missing or incorrect. No fallback folder will be used.",
    "Identità del disco assente o errata. Non viene usata una cartella di ripiego.",
    "Identidad del disco ausente o incorrecta. No se utilizará una carpeta alternativa.",
  ],
  [
    "Repository is read-only in this panel.",
    "Il repository è gestito in sola lettura da questo pannello.",
    "El repositorio se gestiona en modo de solo lectura desde este panel.",
  ],
  [
    "Repository password required.",
    "È necessaria la password del repository.",
    "Se necesita la contraseña del repositorio.",
  ],
  [
    "Initialization requires an empty directory.",
    "Per inizializzare serve una cartella vuota.",
    "La inicialización necesita una carpeta vacía.",
  ],
  [
    "Type the repository ID to initialize a new managed repository.",
    "Digita l’ID per inizializzare un nuovo repository gestito.",
    "Escribe el ID para inicializar un repositorio gestionado nuevo.",
  ],
  [
    "Choose a full snapshot ID from the snapshot list.",
    "Scegli lo snapshot dall’elenco oppure usa il suo ID completo.",
    "Selecciona la instantánea de la lista o utiliza su ID completo.",
  ],
  [
    "Preview retention first, then confirm the repository ID within five minutes.",
    "Prima genera l’anteprima, poi conferma l’ID del repository entro cinque minuti.",
    "Primero genera la vista previa y confirma el ID del repositorio en cinco minutos.",
  ],
  [
    "No snapshots selected for deletion.",
    "Nessuno snapshot selezionato per l’eliminazione.",
    "No se han seleccionado instantáneas para eliminar.",
  ],
  [
    "Insufficient restore space.",
    "Spazio insufficiente per il recupero.",
    "Espacio insuficiente para la recuperación.",
  ],
  [
    "Database dump missing or stale.",
    "Il dump del database manca o è troppo vecchio.",
    "El volcado de la base de datos falta o es demasiado antiguo.",
  ],
  [
    "Webhook requires HTTPS without embedded credentials.",
    "Il webhook richiede HTTPS senza credenziali nell’indirizzo.",
    "El webhook necesita HTTPS sin credenciales en la dirección.",
  ],
  [
    "Webhook delivery failed.",
    "Consegna webhook non riuscita.",
    "La entrega del webhook ha fallado.",
  ],
  [
    "Invalid integration token",
    "Token dell’integrazione non valido",
    "Token de integración no válido",
  ],
  [
    "Task not allowed for incoming automation.",
    "L’attività non è autorizzata per le automazioni in ingresso.",
    "La tarea no está autorizada para automatizaciones entrantes.",
  ],
  [
    "Incoming automation must reference existing task IDs.",
    "Le automazioni devono indicare ID di attività esistenti.",
    "Las automatizaciones deben indicar ID de tareas existentes.",
  ],
  [
    "Idempotency-Key header required (8–128 characters).",
    "Serve l’intestazione Idempotency-Key (8–128 caratteri).",
    "Se necesita la cabecera Idempotency-Key (8–128 caracteres).",
  ],
  [
    "Idempotency key already used for a different request.",
    "La chiave di idempotenza è già stata usata per un’altra richiesta.",
    "La clave de idempotencia ya se utilizó para otra solicitud.",
  ],
  [
    "Operation timed out",
    "Tempo massimo dell’operazione superato",
    "La operación superó el tiempo máximo",
  ],
  [
    "Output limit exceeded",
    "Limite dei risultati superato",
    "Se superó el límite de resultados",
  ],
  ["Task not found.", "Attività non trovata.", "Tarea no encontrada."],
  ["Select a source.", "Seleziona una sorgente.", "Selecciona un origen."],
  [
    "Select a repository.",
    "Seleziona un repository.",
    "Selecciona un repositorio.",
  ],
  [
    "Required field missing or too long.",
    "Un campo obbligatorio manca o è troppo lungo.",
    "Falta un campo obligatorio o es demasiado largo.",
  ],
];

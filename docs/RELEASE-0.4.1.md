# 0.4.1 — efficient incremental NAS copies

## English

Existing jobs, archives and credentials keep their current behavior. The new **Efficient incremental** method is opt-in, for a local source and a readable SMB destination only.

1. Connect the NAS with a dedicated private account. Test the folder using the ordinary HTML form (no browser prompt).
2. Add dedicated source/destination folders and confirm their identity. A missing destination subfolder can now be created; existing non-empty folders are still rejected.
3. Create a readable plan, select Efficient incremental, and leave scheduling off for the first trial. Copy and full-verification duration limits are separate (1–1440 minutes).
4. Copy → copy again unchanged → modify a test file → copy → restore the previous version → full verify. Enable schedules only after these tests pass. Allow more time for the first full copy.

The method compares file size and modification time, with 1-second precision. It transfers only new/changed files, retains replaced files, and downloads only transferred files for content verification. It does not make a full staging copy. A persistent journal forces retry of files whose verification was interrupted. Files removed from the source stay in the destination. Versions have **no automatic expiry**; monitor free space. Full verification is a separate job, reads the whole source/destination, and may take hours on an old NAS. Same-size edits with preserved timestamps or changes within the timestamp precision can only be detected by full verification; a successful incremental copy is not a full archive integrity check. Do not copy live database files: back up coherent dumps.

No changes to Restic, existing local/SSH copy jobs or their schedules. No new requirement for privileged containers or Docker socket access.

## Italiano

I piani, archivi e credenziali esistenti mantengono il comportamento attuale. Il nuovo metodo **Incrementale efficiente** è facoltativo, solo per sorgente locale e destinazione SMB leggibile.

1. Collega il NAS con un utente privato dedicato. La prova usa un normale modulo HTML.
2. Aggiungi cartelle dedicate e conferma l'identità. Una sottocartella destinazione assente può essere creata; cartelle esistenti non vuote restano rifiutate.
3. Crea un piano leggibile, scegli Incrementale efficiente e lascia gli orari disattivati durante la prova. Limiti di durata separati per copia e verifica integrale, da1a1440minuti.
4. Copia → ripeti senza modifiche → modifica un file di prova → copia → recupera la versione precedente → verifica integrale. Attiva gli orari dopo il collaudo. La prima copia completa richiede una finestra maggiore.

Confronta dimensione/data con precisione di1secondo. Trasferisce i soli file nuovi/modificati, conserva quelli sostituiti e rilegge per verifica soltanto quelli trasferiti. Nessuno staging completo. Un registro persistente obbliga a riprovare i file con verifica interrotta. I file eliminati dalla sorgente restano a destinazione. Le versioni **non scadono automaticamente**: controlla lo spazio. La verifica integrale resta separata e può durare ore. Modifiche della stessa dimensione con data preservata o entro la precisione temporale richiedono il controllo integrale: copia incrementale riuscita non significa verifica integrale dell'archivio. Per database attivi usare dump coerenti.

Nessuna modifica ai lavori locali/SSH precedenti, Restic, credenziali o pianificazioni. Non richiede container privilegiato o socketDocker.

## Español

Los trabajos, archivos y credenciales existentes conservan su comportamiento. El nuevo método **Incremental eficiente** es opcional, solo para origen local y destino SMB legible.

1. Conecta el NAS con una cuenta privada dedicada. Prueba la carpeta con el formulario HTML.
2. Añade carpetas dedicadas y confirma su identidad. Se puede crear una subcarpeta de destino inexistente; se siguen rechazando carpetas existentes no vacías.
3. Crea un plan legible, selecciona Incremental eficiente y deja desactivados los horarios durante la prueba. Límites separados para copia/verificación completa, de1a1440minutos.
4. Copia → repite sin cambios → modifica un archivo de prueba → copia → recupera la versión anterior → verificación completa. Activa los horarios después de las pruebas. La primera copia necesita más tiempo.

Compara tamaño/fecha con precisión de1segundo. Transfiere solo archivos nuevos/modificados, conserva versiones anteriores y relee solo los archivos transferidos para verificar contenido. Sin staging completo. Un registro persistente obliga a repetir verificaciones interrumpidas. Los archivos eliminados en origen permanecen en destino. Las versiones **no caducan automáticamente**: controla el espacio. La verificación completa es separada y puede durar horas. Cambios del mismo tamaño con fecha conservada o dentro de la precisión temporal requieren verificación completa. Copia incremental correcta no equivale a integridad completa del archivo. Usa volcados coherentes para bases de datos activas.

No modifica trabajos locales/SSH anteriores, Restic, credenciales ni horarios. No requiere contenedores privilegiados ni acceso al socketDocker.

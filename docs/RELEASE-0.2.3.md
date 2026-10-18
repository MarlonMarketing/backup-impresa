# 0.2.3 — verification preserves downloaded copies

English: SSH verification no longer rewrites completion/verification markers. A later USB checksum check therefore does not report false changes caused only by a successful verification. Archive content, existing schedules and credentials are preserved. Real SSH and generic-file regression checks cover marker bytes and modification times.

Italiano: la verifica SSH non riscrive i marcatori di completamento/verifica. Il successivo confronto USB non segnala differenze provocate soltanto da una verifica riuscita. Archivi, pianificazioni e credenziali restano preservati. Test con SSH reale e file generici controllano contenuto e data dei marcatori.

Español: la verificación SSH ya no reescribe los marcadores de finalización/verificación. La comprobación USB posterior no indica cambios falsos causados únicamente por una verificación correcta. Se conservan los archivos, horarios y credenciales. Las pruebas con SSH real y archivos normales comprueban los bytes y las fechas de los marcadores.

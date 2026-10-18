# Conexiones: paso a paso

Una conexión representa una cuenta/protocolo; una ubicación es una carpeta dedicada; un plan une origen y destino. Los planes anteriores permanecen en sus secciones.

1. Abre **Conexiones → Añadir conexión**. Elige ID corto, nombre y protocolo. Los secretos quedan cifrados en la caja fuerte existente.
2. **Probar conexión** con la carpeta deseada. Inicio de sesión correcto no significa copia completada.
3. **Añadir carpeta** para origen y destino separados. Destino: subcarpeta dedicada vacía, nunca raíz del disco o aplicación activa.
4. **Confirmar identidad** escribiendo el ID. Se crea `.backup-impresa-location` con el valor mostrado. El origen puede contener datos. Si es de solo lectura, el administrador debe crear ese marcador exacto. No se usa carpeta alternativa.
5. **Crear copia conectada**, legible o protegida. Deja horarios desactivados. Guarda aparte la contraseña del archivo.
6. Legible: **Simular → Copiar → Verificar → Explorar → recuperar un archivo**. Protegido: **Inicializar** escribiendo ID **→ Copia → Verificar → Puntos de recuperación → recuperar snapshot**.
7. Compara bytes recuperados con el original. Después activa copia diaria y revisión semanal. Revisa la zona horaria.
8. Revisa **Actividad**, avisos y ruta de recuperación. Mantén supervisión externa para detectar el servidor apagado.

## Protocolos

| Protocolo | Configuración | Detalle |
|---|---|---|
| Local / USB / NFS | Carpeta bajo raíz permitida | Monta primero en host; bind Docker dedicado con `create_host_path: false`. La app no monta NFS. |
| SFTP | Host, puerto, usuario, contraseña/clave dedicada, clave pública del servidor | Compara huella con administrador. Nunca se desactiva verificación. Lector Oracle actual: solo rsync, no SFTP. |
| FTP | Host, puerto, usuario, contraseña | Aceptación explícita de transporte sin cifrar. Prefiere SFTP/FTPS. |
| FTPS | Datos FTP, TLS explícito/implícito | Certificado siempre verificado; CA privada PEM opcional. |
| SMB/CIFS | Host, recurso/subcarpeta, usuario, contraseña, dominio opcional | SMB directo; recurso dedicado sobre LAN/VPN. |
| WebDAV / Nextcloud | URL HTTPS, usuario, contraseña de aplicación, proveedor | Ejemplo `https://cloud.example.com/remote.php/dav/files/USUARIO/`; ubicación relativa. |
| S3 compatible | Endpoint HTTPS si no es AWS, región, access key/secret | Ruta `bucket/subcarpeta`; permisos limitados al prefijo. Costes según proveedor. |
| Google Drive | JSON OAuth autorizado; cliente/carpeta opcionales | En PC fiable `rclone authorize drive`; completa tú el consentimiento y pega JSON. |
| OneDrive | JSON OAuth, ID/tipo unidad | `rclone authorize onedrive`; selecciona unidad en `rclone config` para obtener ID/tipo. |
| Dropbox | JSON OAuth autorizado | `rclone authorize dropbox`; renovaciones conservadas cifradas. |

## Versiones y consistencia

`current/PLAN` contiene archivos normales. Sustituidos pasan a `versions/PLAN/EJECUCION`. Borrados del origen permanecen en current. Versiones contienen **solo sustituidos**, no una imagen completa. Renombrar puede dejar ambos nombres. Sin delete/mirror/limpieza automática. Archivos protegidos: cifrado, deduplicación y snapshots Restic completos; inicialmente se conservan todos los puntos.

Conectores nuevos descargan **todo el origen** en staging, verifican bytes, publican y verifican destino. Necesitan espacio para todo el origen más reserva. Revisiones completas transfieren/leen todos los bytes; destino reutiliza archivos sin cambios. Planes SSH/rsync anteriores mantienen su flujo incremental. Copias legibles no conservan todos los permisos/ACL Unix ni sustituyen imágenes de máquinas. Genera volcados coherentes de bases de datos antes de copiar servicios activos.

Recuperación: NUEVA carpeta en `/restores`, sin sobrescribir datos activos, incluso con origen offline. Guarda aparte contraseñas, `/data`, caja fuerte y clave maestra. No los publiques.

## Docker y validación

Expón carpetas dedicadas bajo `/sources` o `/destinations`, orígenes read-only, `create_host_path: false`. `LOCAL_CONNECTOR_ROOTS` es lista JSON de raíces; elige subcarpetas. Marcadores USB/staging/repositorios existentes siguen obligatorios. Un disco montado después puede requerir recrear el contenedor. Sin privilegios especiales ni socket Docker.

Pruebas automáticas: carpetas desechables y servidores locales. Pruebas OAuth no autorizan/certifican cuentas reales Google/Microsoft/Dropbox. SMB/NFS necesitan prueba de tu recurso/montaje. Cada proveedor debe superar acceso, copia, verificación y recuperación antes de programar.

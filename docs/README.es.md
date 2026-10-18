# Backup Impresa — Español

**Versión 0.2:** servidores SSH, Restic local/SFTP, avisos configurables desde la interfaz y API n8n. [Guía completa paso a paso con ejemplos](GUIDE.es.md).
Panel Docker para copias rsync legibles, versiones de archivos sustituidos, verificación de contenido y recuperación en una carpeta separada. Interfaz en español, italiano e inglés mediante el selector superior.

**Primera versión: prueba la recuperación con tus propios datos.** [Documentación técnica completa y limitaciones](../README.md).

## Docker directo y VPS

Portainer es opcional. La [guía de instalación en español](INSTALL.es.md) incluye Docker Compose, `docker run` e instalación nativa en Linux/systemd sin Docker, con usuario dedicado, instalador y acceso mediante túnel SSH. El servicio nativo permanece detenido hasta preparar datos y configuración.

## Instalación en Portainer

1. Prepara carpetas de origen, destino y recuperaciones en el servidor Docker. Para un disco externo comprueba antes `findmnt -T /ruta/destino`: debe mostrar el disco correcto.
2. Crea `.backup-impresa-source` en el origen y `.backup-impresa-target` en el destino. Este último debe contener `backup-usb-v1` o el valor elegido en `TARGET_ID`. No lo crees en una carpeta alternativa si el disco no está montado.
3. Abre **Stacks → Add stack → Repository**. Repositorio: `https://github.com/MarlonMarketing/backup-impresa`; referencia: `refs/tags/v0.2.0`; archivo: `compose.yaml`.
4. Configura `SOURCE_PATH`, `TARGET_PATH`, `RESTORE_PATH`, `TARGET_ID`, `TZ=Europe/Madrid` y `BIND_ADDRESS` con la IP LAN del servidor. El valor predeterminado `127.0.0.1` permite acceso únicamente desde el servidor. En LXC sin privilegios comprueba la asignación UID; no abras permisos de escritura para todo el mundo.
5. Despliega y ejecuta `cat /data/setup-token` en la consola del contenedor. Abre `http://IP_SERVIDOR:9899`, selecciona español y crea la cuenta con ese token. Se elimina tras la configuración.
6. Crea una tarea con programación desactivada. Ejecuta **Simular → Copiar ahora → Verificar → Recuperar copia** de un archivo de prueba y compáralo con el original. Después activa la programación.
7. Añade las variables SMTP y Telegram de [.env.example](../.env.example), configura `NOTIFICATION_LANGUAGE=es`, vuelve a desplegar y pulsa **Enviar prueba**.

## Qué se conserva

`current/TAREA` contiene archivos normales. `versions/TAREA/EJECUCIÓN` conserva únicamente los archivos sustituidos, no una instantánea completa. Los archivos borrados del origen permanecen en la copia. No hay limpieza automática: controla el espacio de versiones, registros y recuperaciones.

La copia compara tamaño y fecha; **Verificar** lee el contenido. La recuperación utiliza `/restores` sin sobrescribir datos activos. El panel no crea volcados de bases de datos. Para Immich copia toda la biblioteca y un volcado reciente y prueba también su restauración completa. Copiar PostgreSQL mientras está activo no es un respaldo coherente.

Protege el volumen `/data` y las credenciales del stack. Proxmox y Backrest mantienen sus propios trabajos. Necesitas supervisión externa para detectar que el panel está apagado. Usa VPN o HTTPS y `COOKIE_SECURE=true` para acceso externo.

Imagen: `ghcr.io/marlonmarketing/backup-impresa:0.2.0` (Linux amd64). Otras arquitecturas requieren compilación local. Licencia MIT; contribuciones mediante GitHub.

# Backup Impresa 0.2 — empieza aquí

[English](GUIDE.en.md) · [Italiano](GUIDE.it.md)

Empieza con una prueba. Conecta los datos importantes después de copiar, verificar y recuperar un archivo de demostración.

## 1. Elige el tipo de copia

| Opción | Resultado | Recuperación |
|---|---|---|
| Copia legible | Archivos normales en `current/TAREA`; versiones sustituidas en `versions/TAREA/EJECUCIÓN` | Abre el disco o utiliza Explorar y recuperar |
| Descarga SSH | Archivos descargados de otro servidor | Abre la carpeta y utiliza el programa que restaura esos archivos |
| Repositorio Restic | Instantáneas cifradas y deduplicadas | Utiliza este panel o Restic con la contraseña del repositorio |

Una **instantánea** guarda el estado de los archivos en un momento concreto. Una **suma de comprobación** identifica el contenido y permite detectar diferencias. Un **volcado** es una exportación coherente de una base de datos. Copiar la carpeta de una base de datos activa no equivale a crear un volcado.

Dos carpetas en un disco sirven para probar, pero no protegen frente a la avería del disco. El resultado de la copia y la entrega de avisos son resultados independientes. La verificación Restic del 10% lee una muestra, no todos los datos.

## 2. Instala con Docker Compose

Necesitas un equipo/servidor Linux con Docker, Compose v2, Git y permisos para administrar Docker. Docker Desktop sirve para una prueba. En un NAS o LXC sin privilegios puede ser necesario que un administrador prepare los montajes y permisos.

Para una **instalación de prueba nueva**, prepara carpetas vacías:

```sh
sudo mkdir -p /srv/backup-impresa/source /srv/backup-impresa/target /srv/backup-impresa/restores
printf 'Mi primera copia de prueba\n' | sudo tee /srv/backup-impresa/source/hola.txt >/dev/null
sudo touch /srv/backup-impresa/source/.backup-impresa-source
printf 'backup-usb-v1\n' | sudo tee /srv/backup-impresa/target/.backup-impresa-target >/dev/null
git clone --branch v0.2.1 --depth 1 https://github.com/MarlonMarketing/backup-impresa.git
cd backup-impresa
cp .env.example .env
chmod 600 .env
docker compose config --quiet
docker compose up -d
docker compose exec backup-impresa cat /data/setup-token
```

El último comando muestra el token del primer acceso. Introdúcelo **en el panel**, nunca en una conversación o incidencia pública. Elige un nombre de administrador y una contraseña de al menos 12 caracteres. Selecciona Español en la parte superior.

La dirección inicial es `http://127.0.0.1:9899` **en el equipo que ejecuta Docker**. Si Docker está en otro servidor, utiliza un túnel (`ssh -N -L 9899:127.0.0.1:9899 USUARIO@SERVIDOR`) o configura su dirección LAN como `BIND_ADDRESS` en `.env`. Para acceso remoto utiliza un proxy HTTPS fiable y `COOKIE_SECURE=true`. No publiques HTTP sin cifrar en Internet.

Para un disco real comprueba primero `findmnt -T /tu/carpeta`: debe corresponder al dispositivo esperado. Crea los marcadores únicamente después. Esta guía no requiere formatear discos ni cambiar recursivamente propietarios de datos existentes.

## 3. O instala con Portainer

1. Prepara las mismas carpetas y marcadores **en el servidor Docker**, no en el ordenador del navegador.
2. En Portainer selecciona el entorno y abre **Stacks → Add stack → Repository**.
3. Nombre: `backup-impresa`. Repositorio: `https://github.com/MarlonMarketing/backup-impresa`.
4. Referencia: `refs/tags/v0.2.1`. Archivo Compose: `compose.yaml`.
5. Copia los valores de `.env.example` a las variables del stack e introduce las rutas reales. `TARGET_ID` debe coincidir con el contenido del marcador del destino.
6. Despliega. Abre la consola del contenedor y ejecuta `cat /data/setup-token` para completar el primer acceso.

No ejecutes dos instancias sobre el mismo estado o repositorio. Nunca montes el socket Docker en esta aplicación. Para Docker sin Compose y una VPS Linux sin Docker consulta [INSTALL.es.md](INSTALL.es.md).

## 4. Realiza una copia y una recuperación de prueba

1. En **Tus tareas** pulsa **Nueva tarea**. ID `primera-prueba`, nombre `Mi primera prueba`, origen `Files`.
2. Mantén copia y verificación automáticas **desactivadas**. Guarda.
3. Pulsa **Simular** y abre Detalles. No deben copiarse archivos todavía.
4. Pulsa **Copiar ahora** y espera el resultado correcto.
5. Pulsa **Verificar**: se compara el contenido.
6. Abre **Archivos y versiones**, encuentra `hola.txt` y pulsa **Recuperar copia**.
7. Abre la carpeta de recuperaciones, separada del origen. El archivo recuperado debe ser idéntico y el original debe seguir presente.

Para probar versiones modifica el archivo de demostración y repite la copia. Puedes elegir la versión anterior en el explorador. Las carpetas `versions` contienen **solo archivos sustituidos**, no instantáneas completas. Los archivos eliminados del origen permanecen en la copia actual. La versión 0.2 no elimina automáticamente copias legibles ni versiones: controla la capacidad.

## 5. Añade Oracle u otro servidor desde la interfaz

1. En **Servidores** pulsa **Añadir servidor**. Elige un ID corto, por ejemplo `servidor-remoto`, y un nombre claro.
2. Introduce dirección, puerto SSH, usuario dedicado y carpeta absoluta, por ejemplo `/srv/exported-backups`. Las rutas remotas no admiten espacios ni caracteres de comandos.
3. Pulsa **Leer huella del servidor**. Compárala desde la consola del servidor con `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. Confirma solo si coincide. El escaneo por sí solo no autentica al servidor.
4. Pulsa **Generar una clave de acceso dedicada**. El panel muestra la clave **pública**: el administrador remoto debe autorizarla para leer las copias. Este paso inicial debe realizarse en el servidor; el panel no puede concederse acceso a sí mismo.
5. También puedes introducir una clave privada ya dedicada a las copias. Las claves SSH protegidas por frase de paso no se admiten en tareas automáticas. No utilices tu clave personal de administrador.
6. Guarda y pulsa **Probar conexión**. Comprueba autenticación y acceso a la carpeta; todavía no garantiza que todos los archivos sean legibles.
7. En **Tareas remotas y Restic** añade una tarea **Descargar de un servidor**, selecciona servidor y formato, y ejecútala manualmente.

**Archivos normales** descarga una carpeta conservando versiones de archivos sustituidos. Ejecuta después Verificar. No prepara bases de datos. **Copias nativas Oracle** utiliza los manifiestos JSON de finalización de nuestros scripts Oracle: descarga conjuntos completos y verifica cada archivo mediante SHA256. No es una API universal de descubrimiento de Virtualmin. Después de descargar aparecen los sitios y contenedores declarados en los manifiestos.

Las descargas permanecen en casa aunque Oracle elimine sus copias antiguas. Actualizar el catálogo temporal no elimina conjuntos descargados. No hay eliminación automática de descargas: vigila el espacio.

También puedes activar la verificación semanal de cada tarea, con día y hora independientes. Está desactivada inicialmente. Las copias automáticas que utilizan un origen remoto programado esperan una descarga correcta durante ese día local.


Las tareas Oracle exigen inicialmente una copia reciente tanto de sitios como de Docker/servidor. La antigüedad máxima es de 30 horas y se cambia en la tarea (1–720); desactiva una categoría solo si intencionadamente no la proteges. Las categorías ausentes, fechas inválidas/futuras o copias de origen antiguas provocan un fallo aunque un archivo anterior se transfiera correctamente.

## 6. Elige los discos físicos

Inicialmente las descargas y repositorios locales están en el volumen de datos de la aplicación. Permite probar sin modificar una instalación existente, pero puede llenar el disco del sistema y no constituye una copia en otro disco.

Para producción utiliza [compose.storage.yaml](../compose.storage.yaml) con carpetas dedicadas. Después de verificar sus montajes, crea `.backup-impresa-staging` con contenido `backup-staging-v1` en la carpeta de descargas, y `.backup-impresa-repositories` con contenido `backup-repositories-v1` en la de repositorios. Configura `STAGING_PATH` y `REPOSITORIES_PATH` en `.env`, y ejecuta:

```sh
docker compose -f compose.yaml -f compose.storage.yaml config --quiet
docker compose -f compose.yaml -f compose.storage.yaml up -d
```

En Portainer añade al stack los montajes y variables de ese archivo adicional. Las carpetas del host deben existir previamente. La aplicación rechaza una raíz externa sin el marcador correcto. No monta discos, cambia asignaciones UID de NTFS ni modifica puntos de montaje LXC de Proxmox.

Después de crear una tarea remota, aparece como origen en las tareas de copia legible. Puedes usarla para una segunda copia en USB NTFS. Los archivos `.tar.gz` pueden contener contraseñas y configuraciones privadas aunque sean archivos normales.

## 7. Crea una copia Restic

1. Añade un repositorio, por ejemplo ID `fotos-prueba`. Selecciona disco local montado o servidor/carpeta SFTP.
2. Introduce una contraseña robusta y guárdala también en tu gestor de contraseñas. Sin ella no podrás recuperar los datos.
3. Activa **Backup Impresa es el único gestor** solo para un repositorio que gestionará este programa. Para repositorios Backrest existentes déjalo desactivado: podrás consultar, verificar y recuperar, sin iniciar copias ni limpieza desde este panel.
4. Guarda. Solo para un repositorio **nuevo y vacío**, pulsa Inicializar y escribe su ID. Los existentes nunca se inicializan automáticamente.
5. Crea una tarea Restic con repositorio y origen, y ejecútala manualmente. Puedes elegir una descarga remota después de que termine correctamente.
6. Pulsa **Listar instantáneas** y **Recuperar copia** junto a la fecha deseada. La recuperación va a una carpeta nueva y no sobrescribe el origen.
7. Pulsa **Verificar integridad**. Se comprueba la estructura y una muestra del 10% de los datos. Para una lectura completa un administrador puede ejecutar `restic check --read-data`, indicando repositorio y contraseña de forma segura.

La vista previa de conservación propone siete copias diarias y cuatro semanales para instantáneas con etiqueta `backup-impresa`. No elimina nada. Aplicarla requiere un repositorio gestionado, escribir su ID y una vista previa de menos de cinco minutos. Solo se eliminan los ID mostrados y se liberan datos no utilizados con prune. Es irreversible y **no está programado automáticamente**. No asignes la limpieza simultáneamente a Backrest y Backup Impresa. Los bloqueos Restic siguen activos; no se fuerzan desbloqueos.


Puedes cambiar las cantidades en el repositorio: diarias 1–365, semanales 0–104 y mensuales 0–36. Cero desactiva la categoría semanal/mensual. Valores iniciales: siete diarias, cuatro semanales y ninguna mensual. Editar el repositorio invalida una vista previa anterior. Los archivos comprimidos regenerados pueden deduplicarse menos que los originales sin cambios.

## 8. Configura email y Telegram desde el navegador

Abre **Configuración de avisos y n8n**. Introduce servidor SMTP, puerto, usuario, contraseña, remitente y destinatario, y guarda. El puerto 587 requiere STARTTLS; el 465 utiliza TLS inmediato. La validación de certificados permanece activa. Para Gmail utiliza una contraseña de aplicación cuando tu cuenta lo permita, no la contraseña normal.

Las credenciales existentes en variables del stack siguen funcionando. Deja un campo de contraseña vacío para conservar el secreto actual. Para Telegram crea tu bot, inicia una conversación e introduce token e ID del chat. Guarda, pulsa **Enviar prueba** y confirma que recibes el mensaje.

Por defecto se envían errores y pruebas; puedes activar también los éxitos. Un error de aviso no convierte una copia correcta en fallida. Las tareas habilitadas sin copia/descarga correcta durante 30 horas generan una advertencia. El panel no detecta que su propio servidor esté apagado: necesitas un monitor externo independiente.

## 9. Conecta n8n

**Eventos salientes:** crea en n8n un workflow con nodo Webhook POST y Header Auth `Authorization: Bearer TU_TOKEN_SALIENTE`. Activa/publica el workflow y copia su URL **HTTPS de producción**. Introduce URL y token correspondiente en Backup Impresa. El mensaje contiene ID de evento, tarea, operación, resultado, fecha y error; nunca contraseñas. Utiliza `eventId` para evitar procesamientos duplicados.

Las entregas fallidas se reintentan hasta cuatro intentos totales. Se rechazan redirecciones. Cambiar la URL no reenvía al nuevo destino eventos antiguos pendientes. El historial muestra los resultados.

**Solicitudes entrantes:** indica los ID permitidos separados por comas. Para tareas locales utiliza `legacy:ID_TAREA`. Pulsa **Crear / cambiar token entrante** y guárdalo en el almacén de credenciales de n8n, nunca en una conversación. El token nuevo invalida el anterior.

En un nodo HTTP Request de n8n:

```text
GET https://TU-PANEL/api/integrations/status
Authorization: Bearer TU_TOKEN_ENTRANTE

POST https://TU-PANEL/api/integrations/run
Authorization: Bearer TU_TOKEN_ENTRANTE
Content-Type: application/json
Idempotency-Key: identificador-unico-de-ejecucion-workflow

{"taskId":"servidor-remoto","mode":"pull"}
```

Utiliza una clave distinta para cada nueva ejecución deseada; reutilízala solo al reintentar esa misma solicitud. La respuesta 202 significa **en cola**, no completado. Consulta el estado y comprueba el ID antes del siguiente paso. Acciones permitidas: `pull` remoto, `backup`/`check` Restic y `copy`/`verify`/`preview` local. La API no puede cambiar configuración, inicializar repositorios, recuperar o eliminar instantáneas ni ejecutar comandos shell arbitrarios.

## 10. Ejemplos prácticos

- **Fotos familiares:** prepara un volcado SQL coherente de Immich; copia toda la biblioteca multimedia y el volcado a NTFS. Opcionalmente crea una instantánea Restic en otro disco. Solo SQL no protege fotos; solo multimedia no recupera usuarios ni álbumes.
- **Sitios web y Docker de una VPS:** Virtualmin y procedimientos de las aplicaciones generan archivos coherentes. Casa descarga manifiestos completos, verifica las copias y las copia a USB. La conservación doméstica es independiente. Cada sitio necesita el procedimiento de restauración del programa que creó su archivo.
- **Internet inestable:** la conexión sale de casa; una IP doméstica dinámica no requiere puertos entrantes. Una descarga fallida no aparece como correcta. Reintenta manualmente o en la siguiente programación; las copias completas permanecen.
- **Automatizaciones n8n:** error → email directo de Backup Impresa → n8n prepara un resumen o reintenta una tarea permitida. Usa identificadores para evitar duplicados. Las copias y email/Telegram funcionan sin n8n.

## 11. Actualización y problemas frecuentes

Antes de actualizar espera a que terminen las tareas y guarda **todo el volumen `/data`** y la configuración privada del despliegue. Conserva volumen, rutas, nombre de proyecto y contraseñas. Lee las notas, descarga la versión elegida y recrea el contenedor. Nunca uses `docker compose down -v`. No elimines repositorios Backrest durante la migración.

Los secretos se cifran en `secrets.json` usando `secrets/master.key` o `MASTER_KEY_FILE`. Guarda también una copia separada y protegida de la clave. Una clave en el mismo volumen no protege frente al robo del volumen entero. Si falta, el programa se detiene en lugar de crear otra silenciosamente. No publiques estado, claves, `.env`, contraseñas o registros reales en GitHub.

Si falla SSH comprueba dirección, puerto, huella, autorización de clave, permisos y `rsync` remoto. Si falla Restic comprueba contraseña, versión compatible, permisos, espacio y bloqueos; no fuerces desbloqueos a ciegas. Si falta un disco reconecta el correcto: no crees un marcador nuevo en una carpeta alternativa. Si falla una recuperación conserva los archivos originales y prueba en un entorno aislado.

El panel coordina herramientas; no puede garantizar copias perfectas de cualquier aplicación. Repite periódicamente las pruebas de recuperación y conserva una copia independiente/sin conexión.

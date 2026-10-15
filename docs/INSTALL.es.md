# Instalación Docker y VPS sin Portainer

[English, guía técnica completa](INSTALL.md) · [Italiano](INSTALL.it.md)

Puedes usar **Docker Compose**, **Docker CLI sin Compose** o **Linux/systemd sin Docker**. El programa se ejecuta en tu servidor. Una VPS no incluye automáticamente un segundo disco de copias: prepara un destino independiente. Los servicios remotos necesitan exportaciones/volcados o un sistema de archivos ya montado; el panel no los recopila automáticamente.

## 1. Almacenamiento

Los ejemplos usan `/srv/backup-impresa/source`, `/srv/backup-impresa/target` y `/srv/backup-impresa/restores`. Para un disco externo o volumen VPS configura el montaje persistente y comprueba:

```sh
findmnt -T /srv/backup-impresa/target
```

Dos carpetas en el mismo disco sirven para probar, pero no protegen frente a un fallo del disco. Utiliza carpetas dedicadas y no formatees discos ni cambies permisos recursivamente sobre datos existentes. **Después de verificar el disco correcto**, crea los marcadores:

```sh
sudo touch /srv/backup-impresa/source/.backup-impresa-source
printf '%s\n' 'backup-usb-v1' | sudo tee /srv/backup-impresa/target/.backup-impresa-target >/dev/null
```

El segundo debe coincidir con `TARGET_ID`. No lo crees en una carpeta alternativa si el disco está ausente.

## 2. Docker Compose

Requiere Docker Engine, Compose v2 y git:

```sh
git clone --branch v0.1.4 --depth 1 https://github.com/MarlonMarketing/backup-impresa.git
cd backup-impresa
cp .env.example .env
chmod 600 .env
```

Edita `.env`: rutas del host, identificador del destino, `TZ=Europe/Madrid` y `NOTIFICATION_LANGUAGE=es`. En una VPS pública conserva `BIND_ADDRESS=127.0.0.1`. Comprueba permisos de lectura del origen y escritura del destino/recuperaciones, incluida la asignación UID si utilizas LXC.

```sh
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail 50
docker compose exec backup-impresa cat /data/setup-token
```

Utiliza el token para crear tu cuenta. Para detener: `docker compose stop`; para iniciar: `docker compose up -d`. Conserva `app-data`, no uses `down -v` y mantén el mismo nombre del proyecto Compose al actualizar.

## 3. Docker CLI

Sin Portainer ni Compose:

```sh
cp deploy/docker.env.example docker.env
chmod 600 docker.env
```

Edita el archivo y utiliza el **comando completo de [Docker CLI](INSTALL.md#2b-docker-cli-without-compose)**. Este env-file contiene variables del contenedor y JSON de orígenes; no es intercambiable con `.env` de Compose. El comando conserva `/data`, monta el origen en solo lectura y limita directorios de escritura. No ejecutes dos instancias sobre el mismo estado/destino.

## 4. VPS sin Docker

Necesitas Debian/Ubuntu con systemd activo, **Node.js 22 o posterior** instalado para todo el sistema (24 recomendado), npm, rsync, git y herramientas de usuarios. El instalador no cambia repositorios ni instala otra versión de Node.js. Comprueba:

```sh
node --version
npm --version
rsync --version
systemctl --version
```

Clona el repositorio como en la sección 2, revisa `deploy/install-native.sh` y ejecuta:

```sh
sudo bash deploy/install-native.sh
```

Crea el usuario `backup-impresa`, instala la versión en `/opt/backup-impresa/releases/0.1.4` y prepara systemd. **No inicia el servicio**, no crea marcadores y no sobrescribe instalaciones existentes. Un fallo de npm puede dejar un directorio parcial que debes revisar antes de reintentar.

Prepara las carpetas con lectura del origen y escritura del destino/recuperaciones para el usuario del servicio. Solo para una prueba con carpetas nuevas y vacías:

```sh
sudo install -d -m 0750 -o backup-impresa -g backup-impresa \
  /srv/backup-impresa/source /srv/backup-impresa/target /srv/backup-impresa/restores
```

Verifica montajes y crea los marcadores de la sección 1. El servicio presenta el origen como `/sources/files` en solo lectura. Después:

```sh
sudoedit /etc/backup-impresa/backup-impresa.env
sudo systemd-analyze verify /etc/systemd/system/backup-impresa.service
sudo systemctl enable --now backup-impresa
sudo systemctl status backup-impresa --no-pager
sudo journalctl -u backup-impresa -n 50 --no-pager
sudo cat /var/lib/backup-impresa/setup-token
```

Configura idioma, zona horaria y notificaciones. El archivo usa sintaxis systemd: sin `export`, conservando las comillas del JSON. Estado: `/var/lib/backup-impresa`; credenciales privadas: `/etc/backup-impresa/backup-impresa.env`. Haz copia de ambos. Para otras rutas debes modificar también las restricciones de la unidad systemd: consulta la [guía completa](INSTALL.md#2c-native-vpslinux-without-docker). Si falta un marcador, systemd omite el inicio. Reinicia tras cambios con `sudo systemctl restart backup-impresa`.

## 5. Acceso y comprobación

Desde tu equipo:

```sh
ssh -N -L 9899:127.0.0.1:9899 TU_USUARIO@TU_VPS
```

Abre `http://127.0.0.1:9899` mientras el túnel está conectado. También puedes usar un proxy HTTPS y `COOKIE_SECURE=true`. No expongas HTTP directamente a Internet.

Crea tu cuenta y una tarea sin programación. Ejecuta **Simular → Copiar ahora → Verificar → Recuperar copia** y compara el archivo recuperado. Configura y prueba correo/Telegram antes de programar. Necesitas supervisión externa para detectar una VPS apagada.

Para actualizar conserva estado y credenciales. Docker debe recrearse con los mismos volúmenes; el instalador nativo solo sirve para instalaciones nuevas. Sigue las [instrucciones de actualización](INSTALL.md#updates-and-removal). No hay un desinstalador que borre automáticamente los datos de backup.

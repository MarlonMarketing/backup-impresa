# Installazione Docker e VPS senza Portainer

Per configurare server SSH, Restic e n8n dalla grafica, segui [la guida completa 0.2](GUIDE.it.md).
[English, guida tecnica completa](INSTALL.md) · [Español](INSTALL.es.md)

Puoi usare **Docker Compose**, **Docker senza Compose** oppure una **VPS Linux con systemd, senza Docker**. Il software gira sul tuo server. Una VPS non fornisce automaticamente un secondo disco di backup: occorre scegliere dove conservare le copie. I servizi remoti richiedono esportazioni/dump o filesystem già collegati; il pannello non li acquisisce automaticamente.

## 1. Prepara le cartelle

Gli esempi usano `/srv/backup-impresa/source` per i dati, `/srv/backup-impresa/target` per le copie e `/srv/backup-impresa/restores` per i recuperi. Con un disco esterno o volume VPS verifica prima il montaggio persistente:

```sh
findmnt -T /srv/backup-impresa/target
```

La destinazione deve corrispondere al disco previsto. Due cartelle sullo stesso disco vanno bene per una prova, ma non proteggono dal guasto del disco. Usa cartelle dedicate; non formattare dischi e non cambiare ricorsivamente i permessi dei dati esistenti.

**Soltanto dopo la verifica del montaggio**, crea i marcatori:

```sh
sudo touch /srv/backup-impresa/source/.backup-impresa-source
printf '%s\n' 'backup-usb-v1' | sudo tee /srv/backup-impresa/target/.backup-impresa-target >/dev/null
```

Il secondo valore deve coincidere con `TARGET_ID`. Non crearlo nella cartella di ripiego di un disco assente.

## 2. Docker Compose

Servono Docker Engine, Compose v2 e git:

```sh
git clone --branch v0.3.0 --depth 1 https://github.com/MarlonMarketing/backup-impresa.git
cd backup-impresa
cp .env.example .env
chmod 600 .env
```

Modifica `.env` indicando i tre percorsi, identificativo destinazione, `TZ=Europe/Rome` e `NOTIFICATION_LANGUAGE=it`. Sulla VPS mantieni `BIND_ADDRESS=127.0.0.1`. Verifica che il container possa leggere la sorgente e scrivere destinazione/recuperi, considerando la mappatura UID se Docker è dentro LXC.

```sh
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail 50
docker compose exec backup-impresa cat /data/setup-token
```

Il token serve per creare l'account dal browser. Per fermare usa `docker compose stop`; per riavviare `docker compose up -d`. Conserva il volume `app-data`: non usare `down -v`. Mantieni lo stesso nome progetto Compose negli aggiornamenti.

## 3. Docker con un singolo comando di avvio

Puoi usare anche `docker run`, senza Portainer né Compose. Dalla cartella del repository:

```sh
cp deploy/docker.env.example docker.env
chmod 600 docker.env
```

Modifica `docker.env`, imposta lingua e fuso e usa **il comando completo della [sezione Docker CLI](INSTALL.md#2b-docker-cli-without-compose)**. Il file `docker.env` contiene configurazione del container e JSON delle sorgenti; `.env` di Compose contiene anche i percorsi host e non è intercambiabile. Il comando mantiene `/data` in un volume persistente, sorgente in sola lettura e cartelle separate per destinazione/recuperi. Non eseguire due istanze sugli stessi dati.

## 4. VPS Linux senza Docker

Servono Linux Debian/Ubuntu con systemd attivo, **Node.js 22 o superiore** installato per tutto il sistema (consigliato 24), npm, rsync, git e strumenti standard per gli utenti. Il programma di installazione non modifica i repository del sistema né sostituisce Node.js. Verifica prima:

```sh
node --version
npm --version
rsync --version
systemctl --version
```

Scarica il repository come nella sezione 2, leggi `deploy/install-native.sh` ed esegui:

```sh
sudo bash deploy/install-native.sh
```

Viene creato l'utente di servizio `backup-impresa`, installato il programma in `/opt/backup-impresa/releases/0.3.0` e predisposto systemd. **Il servizio resta fermo**: l'installazione non crea marcatori sui dischi e non sovrascrive installazioni esistenti. Se npm fallisce può rimanere una cartella parziale da controllare prima di riprovare.

Prepara le cartelle e assegna all'utente soltanto lettura della sorgente e scrittura su destinazione/recuperi. Solo per una prova con cartelle nuove e vuote:

```sh
sudo install -d -m 0750 -o backup-impresa -g backup-impresa \
  /srv/backup-impresa/source /srv/backup-impresa/target /srv/backup-impresa/restores
```

Verifica i montaggi e crea i marcatori come nella sezione 1. Il servizio rende la sorgente accessibile in sola lettura come `/sources/files`. Poi:

```sh
sudoedit /etc/backup-impresa/backup-impresa.env
sudo systemd-analyze verify /etc/systemd/system/backup-impresa.service
sudo systemctl enable --now backup-impresa
sudo systemctl status backup-impresa --no-pager
sudo journalctl -u backup-impresa -n 50 --no-pager
sudo cat /var/lib/backup-impresa/setup-token
```

Imposta nel file lingua, fuso, notifiche e identificativo destinazione. È un file systemd, non uno script shell: niente `export`; mantieni le virgolette del JSON. I dati del pannello sono in `/var/lib/backup-impresa`; le credenziali sono nel file root-only `/etc/backup-impresa/backup-impresa.env`. Salva entrambi con il tuo sistema di backup.

Per percorsi diversi occorre aggiornare anche l'unità systemd tramite override: vedi la [guida tecnica](INSTALL.md#2c-native-vpslinux-without-docker). Non basta cambiare il file env: sono previste restrizioni alle cartelle scrivibili. Per riavviare dopo modifiche usa `sudo systemctl restart backup-impresa`. Se manca un marcatore, systemd salta l'avvio: controlla stato e journal.

## 5. Accesso alla VPS e primo collaudo

Dal tuo computer crea un tunnel:

```sh
ssh -N -L 9899:127.0.0.1:9899 TUO_UTENTE@TUA_VPS
```

Apri `http://127.0.0.1:9899` mentre il tunnel è attivo. In alternativa configura un reverse proxy HTTPS e `COOKIE_SECURE=true`. Non aprire direttamente la porta HTTP su Internet.

Crea l'account con il token e un lavoro senza pianificazione. Esegui **Simula → Copia ora → Verifica → Recupera copia**, confrontando il recupero con l'originale. Configura email e Telegram, premi **Invia prova** e soltanto dopo abilita la pianificazione. Un controllo esterno serve per rilevare lo spegnimento della VPS.

Per gli aggiornamenti conserva dati e credenziali e scegli una versione esplicita. Docker va ricreato con gli stessi volumi; l'installatore nativo rifiuta installazioni esistenti: segui la [procedura di aggiornamento manuale](INSTALL.md#updates-and-removal). Nessuna disinstallazione automatica cancella le copie di backup.

import {extendedMessages} from './extended-i18n.mjs';
import {normalizeLanguage} from '../public/i18n.js';
import {controlMessages} from './control-i18n.mjs';

// Technical tool output is kept verbatim; these messages belong to the application.
const messages=[
 ['Origine non consentita','Origin not allowed','Origen no permitido'],
 ['Troppi tentativi. Riprovare tra 15 minuti.','Too many attempts. Try again in 15 minutes.','Demasiados intentos. Inténtalo en 15 minutos.'],
 ['Primo accesso già completato','Initial setup already completed','Configuración inicial ya completada'],
 ['Token non valido','Invalid token','Token no válido'],
 ['Nome utente da 3 a 40 caratteri','Username must contain 3 to 40 characters','El usuario debe tener entre 3 y 40 caracteres'],
 ['Password da 12 a 200 caratteri','Password must contain 12 to 200 characters','La contraseña debe tener entre 12 y 200 caracteres'],
 ['Credenziali non valide','Invalid credentials','Credenciales no válidas'],
 ['Non trovato','Not found','No encontrado'],
 ['Accesso richiesto','Sign in required','Debes iniciar sesión'],
 ['Richiesta non valida. Ricaricare la pagina.','Invalid request. Reload the page.','Solicitud no válida. Recarga la página.'],
 ['Richiesta troppo grande','Request too large','Solicitud demasiado grande'],
 ['JSON non valido','Invalid JSON','JSON no válido'],
 ['Attendere la fine del lavoro prima di modificarlo','Wait for the job to finish before editing it','Espera a que termine la tarea antes de editarla'],
 ['Massimo 30 lavori','Maximum 30 jobs','Máximo 30 tareas'],
 ['Lavoro non trovato','Job not found','Tarea no encontrada'],
 ['Percorso recupero obbligatorio','Recovery path is required','La ruta de recuperación es obligatoria'],
 ['Operazione non disponibile','Operation unavailable','Operación no disponible'],
 ['Percorso fuori dalla cartella consentita','Path is outside the allowed directory','Ruta fuera de la carpeta permitida'],
 ['Collegamento simbolico fuori dalla cartella consentita','Symlink is outside the allowed directory','Enlace simbólico fuera de la carpeta permitida'],
 ['Collegamento simbolico non consentito','Symlinks are not allowed','No se permiten enlaces simbólicos'],
 ['Percorso non valido','Invalid path','Ruta no válida'],
 ['Destinazione non sicura','Unsafe destination','Destino no seguro'],
 ['Spazio insufficiente nel volume di recupero per i file selezionati','Insufficient recovery space for selected files','Espacio insuficiente para recuperar los archivos seleccionados'],
 ['ID: lettere minuscole, numeri e trattini; deve iniziare con una lettera','ID: lowercase letters, numbers and hyphens; start with a letter','ID: letras minúsculas, números y guiones; debe empezar por una letra'],
 ['Sorgente non disponibile','Source unavailable','Origen no disponible'],
 ['Per cambiare sorgente creare un nuovo lavoro: le copie non devono mescolarsi','Create a new job to change source: copies must not be mixed','Crea una tarea nueva para cambiar el origen: las copias no deben mezclarse'],
 ['Nome obbligatorio, massimo 100 caratteri','Name is required, maximum 100 characters','Nombre obligatorio, máximo 100 caracteres'],
 ['Orario non valido','Invalid time','Hora no válida'],
 ['Orario verifica non valido','Invalid verification time','Hora de verificación no válida'],
 ['Giorno verifica non valido','Invalid verification day','Día de verificación no válido'],
 ['Disco di destinazione assente o identificativo errato','Destination disk missing or identifier does not match','Disco de destino ausente o identificador incorrecto'],
 ['Sorgente non configurata','Source not configured','Origen sin configurar'],
 ['Sorgente e destinazione sovrapposte','Source and destination overlap','El origen y el destino se solapan'],
 ['Dump database assente o troppo vecchio: aggiornare il dump prima della copia','Database dump is missing or too old: refresh it before copying','Volcado de base de datos ausente o demasiado antiguo: actualízalo antes de copiar'],
 ['Operazione non valida','Invalid operation','Operación no válida'],
 ['Questo lavoro ha già una esecuzione in corso o in coda','This job is already running or queued','Esta tarea ya está en ejecución o en cola'],
 ['Coda piena','Queue full','Cola llena'],
 ['Spazio libero sotto la soglia: operazione bloccata','Free space below threshold: operation blocked','Espacio libre por debajo del límite: operación bloqueada'],
 ['Versione non valida','Invalid version','Versión no válida'],
 ['Spazio insufficiente nel volume di recupero','Insufficient recovery space','Espacio insuficiente para la recuperación'],
 ['Il controllo dei contenuti recuperati segnala differenze','Recovered content verification found differences','La verificación del contenido recuperado detectó diferencias'],
 ['Checksum del file recuperato non corrispondente','Recovered file checksum does not match','La suma de comprobación del archivo recuperado no coincide'],
 ['Spazio insufficiente per i nuovi file e le modifiche: copia bloccata','Insufficient space for new and changed files: copy blocked','Espacio insuficiente para archivos nuevos y modificados: copia bloqueada'],
 ['Lavoro non valido','Invalid job','Tarea no válida'],
 ['Selezionare una cartella','Select a directory','Selecciona una carpeta'],
 ['Esecuzione non trovata','Run not found','Ejecución no encontrada']
];
export function localize(message,language='en'){
 const lang=normalizeLanguage(language),value=String(message||'');
 const extended=extendedMessages.find(row=>row[0]===value);if(extended)return extended[{en:0,it:1,es:2}[lang]];
 const control=controlMessages.find(row=>row[0]===value);if(control)return control[{en:0,it:1,es:2}[lang]];
 const cli=value.match(/^([a-zA-Z0-9_-]+): exit ([^.]+)\./);if(cli&&lang!=='en')return lang==='it'?`${cli[1]}: uscita ${cli[2]}. Controlla collegamento, permessi e configurazione.`:`${cli[1]}: salida ${cli[2]}. Comprueba conexión, permisos y configuración.`;
 const remoteStale=value.match(/^No successful backup in the last 30 hours: (.*)$/);if(remoteStale&&lang!=='en')return (lang==='it'?'Nessun backup riuscito nelle ultime 30 ore: ':'Ninguna copia correcta en las últimas 30 horas: ')+remoteStale[1];
 if(lang==='it')return value;
 const row=messages.find(item=>item[0]===value);
 if(row)return row[lang==='es'?2:1];
 const stale=value.match(/^Nessuna copia riuscita nelle ultime 30 ore: (.*)$/);
 if(stale)return (lang==='es'?'Ninguna copia correcta en las últimas 30 horas: ':'No successful copy in the last 30 hours: ')+stale[1];
 const diff=value.match(/^Verifica: (\d+) differenze/);
 if(diff)return lang==='es'?`Verificación: ${diff[1]} diferencias; actualiza la copia y vuelve a verificar`:`Verification: ${diff[1]} differences; update the copy and verify again`;
 return value;
}
export function localizePayload(payload,language){
 if(Array.isArray(payload))return payload.map(value=>localizePayload(value,language));
 if(!payload||typeof payload!=='object')return payload;
 return Object.fromEntries(Object.entries(payload).map(([key,value])=>[key,['error','message','notificationError'].includes(key)&&typeof value==='string'?localize(value,language):localizePayload(value,language)]));
}

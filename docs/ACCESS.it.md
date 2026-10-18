# Persone, segreti e permessi

L’amministratore attuale resta Owner/Proprietario. L’installazione non cambia password o chiavi esistenti.

1. Apri **Accessi e permessi → Catalogo risorse**, copia gli ID precisi da autorizzare.
2. **Invita una persona**: nome, ruolo, un ID per riga. Vuoto significa nessuno; `*` comprende tutto, anche risorse future. Evitalo per i clienti.
3. Conserva il token mostrato una volta e invialo privatamente. Scade dopo 48 ore, revocabile prima dell’utilizzo.
4. Il destinatario apre login → **Accetta invito**, inserisce token e sceglie nome/password di almeno 12 caratteri. Vale una volta; poi accede normalmente.
5. Verifica cosa vede. Cambia ruolo/risorse o disabilita la persona: la sessione è rifiutata dalla richiesta successiva.

| Ruolo | Azioni sulle risorse assegnate |
|---|---|
| viewer | Legge nomi/esiti, non esplora/recupera file né esegue. |
| operator | Legge ed esegue le operazioni consentite, senza recupero. |
| proposer | Legge e propone piani disattivati con posizioni autorizzate; non approva. |
| maintainer | Legge/esegue/recupera, configura orari dei piani collegati assegnati già esistenti. Non gestisce collegamenti/utenti/token né cambia sorgente/destinazione. |
| owner | Gestisce tutto, inclusi accessi, credenziali e approvazioni. |

ID: `legacy:PIANO` per vecchie copie locali, `control:PIANO` per SSH/Restic esistenti, `transport:PIANO` per nuovi collegamenti. Proposte: `location:SORGENTE` e `location:DESTINAZIONE`. Controlli sul server, anche per richieste manipolate. Esplorare file richiede restore, non basta read.

## Token dei servizi

Pagina API/MCP → **Crea token**: canale API/MCP/entrambi, 1–365 giorni, risorse precise, azioni minime. Si vede una volta; si conserva solo impronta SHA-256. Per sostituirlo crea il nuovo e revoca il vecchio. Sono identità indipendenti: disabilitare una persona non revoca altri token; esaminali separatamente. Limite 60 richieste/token/minuto. Mai token in URL o Git.

Cassaforte AES-256-GCM esistente con chiave master separata. L’amministratore del nodo che legge entrambe può decifrare: non è un HSM. Campi segreti vuoti nell’editor conservano i valori attuali. Disabilita gli orari dipendenti prima di cambiare identità del collegamento. Rinnovi OAuth conservati cifrati. API/MCP non leggono segreti né eseguono shell arbitraria. Audit locale: 3.000 azioni/decisioni recenti, 200 nel pannello; non è un registro di conformità immodificabile.

## Proposte degli agenti

Il proprietario esamina la bozza esatta e approva/rifiuta verificando impronta e scadenza. Il piano approvato è sempre disattivato; per archivi protetti il proprietario aggiunge la password. Prima prova copia/verifica/recupero, poi abilita gli orari. Gli agenti non hanno uno strumento di approvazione.

È un software **self-hosted con un proprietario e permessi delegati**, non isolamento multi-tenant da SaaS. Prima di ospitare clienti indipendenti nello stesso processo va implementata e collaudata l’architettura SaaS separata.

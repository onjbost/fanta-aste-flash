# Aste Flash · Fanta Mansarda

## v1.0 — 28 agosto 2026

Prima versione completa. Il ciclo del mercato svincolati vive tutto nell'app:
chiamata, adesione, sala d'asta, movimenti, messaggi per il gruppo.

### Per l'allenatore
- Rosa con prezzo pagato e valore di svincolo già calcolato, badge su
  infortunati, fuori Serie A e fuori lista.
- Crediti residui e quattro contatori di cambi per ruolo, con il bonus di
  febbraio segnalato in anticipo.
- Listone svincolati con ricerca e filtri per ruolo.
- Chiamata all'asta con validazione immediata: ruolo, cambi, budget,
  svincolando unico, finestra di gennaio, giocatori bloccati dall'asta prima.
- Adesione ai lotti chiamati da altri, con offerta massima facoltativa che il
  server usa al posto tuo se non puoi collegarti.
- Sala d'asta in tempo reale: rilanci a un tocco, timer che riparte a ogni
  offerta, budget residuo sempre visibile.
- Richiesta di svincolo gratuito con un pulsante.

### Per l'admin
- Coda operativa con la riga esatta da replicare su Leghe Fantacalcio.
- Decisione sulle richieste di svincolo gratuito: accetta (100%), declina (75%)
  o annulla l'operazione, con i due esiti già calcolati a confronto.
- Regia della serata: apertura sala, apertura e chiusura dei lotti, chiusura
  dell'asta.
- Centro messaggi con i cinque testi pronti da incollare su WhatsApp.
- Correzione delle rose a mano e ri-sincronizzazione da un nuovo export, con
  anteprima delle differenze prima di scrivere.
- Notifiche Telegram in privato.

### Sotto il cofano
- I crediti non sono un campo: sono la somma dei movimenti, sempre
  ricostruibili.
- I contratti non si cancellano mai, si chiudono: lo storico resta intero.
- Svincolandi, budget e offerte massime protetti dalle policy del database,
  non dall'interfaccia — invisibili anche all'admin fino al momento giusto.
- Il rilancio è una funzione Postgres che blocca la riga del lotto: due offerte
  simultanee non passano entrambe.
- Le fasi delle aste si ricalcolano dall'orologio a ogni pagina: se il cron
  salta un giro, l'app resta corretta.
- 132 test automatici, inclusa la simulazione di una serata intera.

### Fuori scopo, per scelta della lega
Scambi diretti tra squadre e asta di riparazione di febbraio restano fuori
dall'app: si continuano a fare come si è sempre fatto.

### Regole integrative decise con la lega
1. Base d'asta di un lotto conteso: 1 credito, rilancio minimo 1.
2. Chi entra e chi esce sono dello stesso ruolo.
3. Una chiamata o adesione per ogni svincolando: mai lo stesso due volte in una
   sessione.
4. Il 75% si arrotonda per difetto, ma non scende mai sotto 1 credito.
5. Chiamate modificabili o ritirabili fino a T−5.
6. Gli svincoli gratuiti non consumano il cambio di ruolo.
7. Chi non può essere in sala lascia un'offerta massima; senza, vale zero.
8. Non si partecipa a più lotti di un ruolo di quanti cambi restano.
9. Una richiesta di svincolo gratuito congela l'operazione collegata finché
   l'admin non decide.

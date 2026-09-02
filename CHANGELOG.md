# Aste Flash · Fanta Mansarda

## v2.0 — 1 settembre 2026

Il Torneo dei Tipster entra nell'app. Stessa autenticazione, stesse squadre,
una voce in più nella barra in basso: ogni giornata si quota, si gioca e si
conta da sola.

### Per l'allenatore
- Le quattro sfide di campionato della giornata (più le quattro di coppa nelle
  giornate di coppa) con le quote di tutti e quattro i mercati: 1X2,
  Over/Under, Goal/NoGoal e risultato esatto.
- Carrello delle giocate con i punti potenziali in tempo reale e il countdown
  alla chiusura, un'ora prima della prima partita vera.
- Fino a tre giocate per sfida; più giocate sulla stessa sfida dividono il
  moltiplicatore, così coprire due esiti non è né furbo né stupido.
- Schedina privata, con la scelta di condividerla agli altri una giornata per
  volta.
- Classifica generale e classifica di giornata, storico delle proprie giornate
  e vista delle giocate altrui condivise.

### Per l'admin
- Generazione delle quote dalle rose di adesso, da guardare prima di
  pubblicarle: finché non pubblichi, in lega non si vede niente.
- Inserimento dei risultati e chiusura della giornata, che risolve i mercati,
  applica il 10/n e aggiorna le due classifiche.
- Gestione degli orari: sposti la prima partita del turno e la chiusura delle
  schedine si sposta da sola.
- Rinvii di Serie A con la politica scelta partita per partita — sei politico
  oppure si aspetta il recupero — e quote da rigenerare tenendone conto.
- Accoppiamenti di semifinali e finale di Coppa Mansarda inseriti a mano
  quando si sanno le qualificate.
- Taratura del modello: una correzione sulla media che sposta quanti gol ci si
  aspetta, senza toccare chi è favorito.

### Sotto il cofano
- Un solo modello genera tutti e quattro i mercati dalla griglia congiunta dei
  due punteggi: quotare mercato per mercato produrrebbe quote che si
  contraddicono, così è impossibile per costruzione.
- I fantapunti di una squadra sono una distribuzione, non un numero; la scala
  del fanta (66 il primo gol, poi uno ogni 6) la trasforma in gol.
- Quote eque, senza margine: qui non c'è un banco che deve guadagnare, e il
  valore atteso di ogni giocata è esattamente il moltiplicatore.
- La quota si congela al momento della giocata, come il prezzo di un
  contratto: rigenerare le quote non tocca una schedina già inviata.
- Una schedina per squadra e giornata, tetto di tre giocate per sfida e
  appartenenza della sfida alla giornata sono imposti dal database, non
  dall'interfaccia.
- Calendari di Serie A, campionato e Coppa Mansarda importati una volta e
  verificati: 380 accoppiamenti, nessun doppione, ritorno speculare.
- Il ricalcolo di una giornata è idempotente: si corregge un risultato e la
  giornata si riapre invece di riscriversi.

### Regole decise con la lega
1. Si gioca sulle sfide di campionato; nelle giornate di coppa anche su quelle
   di coppa.
2. Almeno una giocata per sfida di campionato, massimo tre per sfida.
3. Punti = dieci volte la quota; n giocate sulla stessa sfida valgono 10/n.
4. Si può giocare sulla propria sfida, anche contro sé stessi.
5. Chi non gioca una sfida prende zero, senza penalità.
6. Ogni schedina è privata finché il suo allenatore non la condivide.
7. Le schedine si chiudono un'ora prima della prima partita vera del turno.

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

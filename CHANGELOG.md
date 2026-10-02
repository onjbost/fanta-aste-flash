# Aste Flash · Fanta Mansarda

## v5.1 — 2 ottobre 2026

Infortuni più leggibili, e due fonti nuove da fantacalcio.it: le quotazioni
aggiornate e i voti di giornata, che entrano anche nelle quote.

### Indisponibili
- **La didascalia della fonte su ogni riga.** Sotto la stima di rientro
  dell'app c'è il testo intero di fantacalcio.it, e la frase da cui la stima
  è stata dedotta: il controllo si fa qui, senza aprire il sito.
- **Gli svincolati indisponibili**, in una tabella loro: chi è fermo e non è
  in nessuna rosa della lega.
- **Nella pagina Svincolati tutti vedono l'etichetta** «Infortunato»,
  «Squalificato», «In dubbio» o «Diffidato», con il rientro stimato.
  Nel foglio del giocatore si legge la didascalia.

### Quotazioni e voti
- **Le quotazioni aggiornate** di fantacalcio.it, lette ogni mattina, accanto
  a quelle del listone (che restano quelle delle aste). Negli Svincolati la
  carta mostra la quotazione attuale con la freccia se è salita o scesa, e
  si può ordinare per «Qt. attuale».
- **I voti di ogni giornata di Serie A**, letti ogni mattina; le giornate
  arretrate si recuperano tre alla volta.
- Tutte e due si possono rileggere subito da Indisponibili → «Aggiorna
  quotazioni e voti».

### Le quote del Torneo dei Tipster
- **La forma conta.** Il fantavoto atteso di ogni giocatore parte dalla
  quotazione (quella aggiornata, se c'è) e si sposta con la fantamedia
  delle ultime cinque giornate, pesando di più le recenti.
- **I tabellini della lega** entrano nel conto: per chi è stato schierato
  vale il fantavoto calcolato con le nostre regole di bonus.
- **Chi non gioca scivola fuori dall'undici stimato**: un titolare che non
  prende voto da tre giornate lascia il posto a chi gioca davvero.
- **Le quote nascono da un Monte Carlo.** La giornata si gioca ventimila
  volte, giocatore per giocatore: voto, gol, assist, cartellini, gol subiti
  dei portieri, titolari che non giocano e riserve che entrano. Ogni club di
  Serie A ha la sua giornata buona o cattiva, condivisa da tutti i suoi
  giocatori: due fantasquadre con mezzo undici della stessa squadra salgono
  e scendono insieme, e le quote lo sanno. Il livello delle squadre resta
  quello tarato di prima; cambia la forma: gol a scatti, code più vere.
  Le stesse quote escono rigenerando con gli stessi dati.

### In diretta
- **La partita del fanta in diretta.** A giornata cominciata, la card della
  partita nel banner della Home apre la diretta: voti live di fantacalcio.it,
  bonus e malus, fantavoto per fantavoto, totale e gol, con le riserve che
  entrano per chi finisce senza voto. Si aggiorna da sola ogni minuto.
- **Simula partita**: chi non ha ancora voto prende 6, più quello che ha già
  fatto in campo. Dice dove sta andando la partita prima che finisca.
- La formazione è quella vera quando la lega l'ha importata; altrimenti la
  probabile del motore delle quote, e la pagina lo dice.
- **Modificatore difesa e fattore capitano**, con le fasce della lega. Il
  modificatore vale solo con la difesa schierata almeno a quattro: media dei
  voti puri del portiere e dei tre difensori migliori. Il fattore capitano
  guarda il voto puro del capitano, o del vice se il capitano resta senza
  voto. La diretta mostra i punti e il conto da cui vengono.
- Il tabellino della lega ora salva anche il **vicecapitano** (migrazione
  0031); finché la migrazione non c'è, l'import va avanti senza.

### Leghe Fantacalcio senza preferito
- **L'app legge da sola** da Leghe Fantacalcio, con il token di sessione
  incollato una volta in /admin/redazione (c'è il comando da copiare nella
  console del browser): le **formazioni** della giornata in corso quando si
  apre una diretta, la **giornata conclusa** e le **classifiche** ogni
  mattina, appena la lega l'ha calcolata.
- La giornata letta dall'API passa dallo **stesso import del preferito**:
  stessa verifica dei conti, stesso tabellino, stessa chiusura delle
  schedine. Se i conti non tornano non scrive niente e lo dice su Telegram.
- Telegram avvisa tre giorni prima che il token scada. Il preferito resta
  come ripiego (migrazione 0032).

### La diretta
- **Anteprima**: la card della partita nel banner apre la diretta anche prima
  del calcio d'inizio, con le formazioni probabili. Dagli «Ultimi incontri»
  si riapre la diretta di ogni partita già giocata.
- **Si rilegge ogni minuto** mentre c'è una partita in campo, ogni cinque fra
  una partita e l'altra di una giornata lunga, e subito quando si torna
  sulla scheda.

### La giornata conclusa, al momento giusto
- I risultati e le classifiche si leggono da Leghe Fantacalcio **il giorno
  dopo l'ultima partita di Serie A** della giornata, col calendario
  aggiornato del live (anticipi, posticipi; i rinvii non si aspettano). Se a
  quel punto la lega non ha ancora calcolato, Telegram lo dice e si riprova
  la mattina dopo.
- **Il nostro calendario di Serie A si aggiorna dal live**: ogni volta che
  l'app legge il live (la diretta, l'import, il cron del mattino sulle
  giornate vicine) riallinea orari, partite giocate e rinvii, e il calcio
  d'inizio della giornata — da cui si ricalcola la chiusura delle schedine.
  Un rinvio che compare o sparisce arriva su Telegram: la scelta fra 6
  politico e recupero resta all'admin.
- **Reimporta una giornata** in /admin/redazione: per un ricalcolo fatto dopo,
  o un calcolo arrivato tardi. Riscrive tabellino, risultati e classifiche e
  richiude le schedine con i punti nuovi.

## v5.0 — 2 ottobre 2026

L'app cambia faccia: «Coppa sotto i fari». Le regole restano quelle di prima,
cambia tutto quello che si vede e si tocca.

### Il nuovo aspetto
- **Un tema solo, scuro**: verde notte di campo, un solo oro, i numeri in
  caratteri condensati da tabellone.
- **La barra in basso** ha cinque voci, con l'**Asta** in una bolla d'oro al
  centro. Quando la sala è aperta diventa «Sala live» con un pallino rosso.
- **Il cassetto ☰** raccoglie Registro, Regolamento e, per l'admin, tutti gli
  strumenti. In testata c'è sempre la pillola dei crediti.
- **Gli stemmi** delle squadre: li carica l'admin, e compaiono ovunque.
- I dettagli si aprono in **fogli dal basso** invece di cambiare pagina.

### Home e classifiche
- La prossima partita in campionato e in Coppa Mansarda, in un banner che scorre.
- «Ultimi incontri»: la forma a pallini, i precedenti e lo storico della competizione.
- Le quattro scadenze con il conto alla rovescia.
- Una pagina sola per le classifiche: Campionato, Coppa e Tipster.

### Asta e sala
- La linea delle fasi e un solo countdown grande. «Aderisci» e «Chiama» si
  fanno da un foglio, con lo svincolando da scegliere a pillole e il budget in
  chiaro.
- In sala: l'anello del timer intorno all'offerta, gli stemmi dei contendenti
  col pallino di presenza, e un pannello di rilancio con +1/+5/+10, − / + e
  «Rilancia a X». Se l'offerta supera la cifra scelta, la cifra si rimette al
  minimo valido da sola.
- La regia dell'admin è un cassetto da tirare su dal fondo.

### Schedine
- L'1X2 sempre in vista, gli altri mercati a tendina, e in fondo quanto vale la
  schedina se le prendi tutte.
- Le schedine giocate diventano biglietti. In «Altri» c'è anche **Cosa gioca la
  lega**: le caselle più giocate sono le più dorate.

### Rosa, Svincolati, Registro, Regolamento
- Giocatori in card: un tocco apre il foglio con le azioni. Da uno svincolato,
  «Chiama all'asta» apre la chiamata già compilata.
- Il registro è una timeline, anche per le aste passate. Il regolamento è a schede.

## v4.1 — 1 ottobre 2026

La coda operativa smette di essere un elenco che si guarda e basta.

### La coda, in due viste
- **«Da fare» e «Fatte»**, con i conti in cima. Si passa dall'una all'altra
  con un tocco, e una riga si sposta da una parte all'altra col suo bottone
  — «Fatto», o «Da fare» per rimetterla indietro.
- **A righe multiple**: si spuntano quelle che servono e si segnano tutte
  insieme col bottone in alto a destra. Ogni squadra ha il suo «tutte».
- **Raggruppate per squadra**, perché il travaso si fa una rosa per volta:
  si apre la rosa di una squadra e si fanno i suoi movimenti. Saltare avanti
  e indietro fra due squadre è il modo di svincolare il giocatore sbagliato.
- La spunta **resta**: sta nel database, non nel browser. Si può cominciare
  dal computer e finire dal telefono.
- Niente più tetto di venti righe: con una coda che non si svuotava mai,
  erano proprio le righe più vecchie a sparire dal fondo. Il 1º ottobre in
  cima c'erano ancora quattro richieste di svincolo del 1º settembre, decise
  da un mese: la colonna «fatto» esisteva dal primo giorno, ma non c'era
  niente, in tutta l'app, che la scrivesse.
- La coda compare **anche in sala**, con le sole righe della serata: finita
  l'asta si riportano i movimenti senza cambiare pagina.

### La richiesta di svincolo si chiude da sé
- Quando approvi, respingi o annulli uno svincolo gratuito — e quando
  l'allenatore ritira la richiesta — **la riga della coda si chiude da sola**
  e cambia verbo: «Svincolo gratuito approvato · FC CANEPARDO: NERES (A)».
  Deciderla *è* farla, e quella riga non chiede più niente a nessuno. Resta
  scritta fra le fatte, perché quello che è successo si deve poter rileggere.
- Si riconosce per squadra **e** giocatore: due squadre che chiedono un
  omonimo non si chiudono la riga a vicenda. Se non si chiude, il messaggio
  della decisione te lo dice, invece di lasciarti credere che sia a posto.

### Sistemato
- **In sala, l'anteprima dei lotti che si assegnano senza asta diceva
  «svincolando mancante» su ogni riga** appena aperta la sala: cercava chi
  esce nella rosa, e l'assegnazione lo aveva appena tolto da lì. Perdeva
  l'unica informazione per cui esiste, e proprio nel momento in cui serve.
  Lo stesso errore finiva nel messaggio Telegram di apertura.
- Le righe dell'anteprima **non si spuntano più**: quelle spunte vivevano
  nella pagina e ricaricando sparivano. Le righe da spuntare sono quelle
  della coda, che restano.
- Le righe della coda erano scritte in **maiuscoletto grigio**, perché
  prendevano lo stile delle etichette dei campi: a schermo erano quasi
  illeggibili.
- **Le caselle di selezione** erano quelle di sistema: un puntino grigio da
  centrare col dito in mezzo a una riga di testo. Adesso sono quadrati
  disegnati, grandi abbastanza, con la riga scelta che si colora; «Tutte»
  è diventato un comando invece di un testo sottolineato, e si accende
  quando il gruppo è tutto scelto.

## v4.0 — 1 ottobre 2026

La prima asta vera, e tutto quello che ha insegnato. Più il registro della
lega: una riga per ogni cosa che succede, leggibile da tutti.

### In sala, quello che è cambiato
- **Un lotto aperto aspetta le presenze.** Appena lo apri, sugli schermi delle
  squadre in corsa compare una finestra con «Conferma presenza»: il countdown
  parte quando ha confermato l'ultima di loro, 15 secondi per tutti nello
  stesso istante. Prima partiva all'apertura, e chi arrivava con dieci secondi
  di ritardo aveva già perso il lotto.
- **Qualche secondo di grazia** oltre lo scadere: un rilancio lì dentro vale
  ancora e rimette il countdown a pieno. Fra il dito e il server c'è una rete.
- **Il lotto si chiude quando lo chiudi tu**, con un bottone che dice nome e
  cifra. Nessun browser chiude più niente da sé, e se un rilancio arriva
  nell'istante del martello il server rifiuta invece di aggiudicare al prezzo
  vecchio.
- **Si può annullare un'aggiudicazione**: il giocatore torna da dove è venuto,
  i crediti tornano come prima, il cambio di ruolo si libera e il lotto torna
  in programma, pronto da ribattere. Si ferma da sé se intanto il giocatore è
  stato scambiato o ri-svincolato.
- **Si può assegnare un lotto a mano**, scegliendo fra le squadre in corsa, per
  le aste che si decidono a voce.
- **La coda operativa** dei lotti senza contendenti arriva su Telegram appena
  apri la sala: è la metà del lavoro che va riportata a mano su Leghe
  Fantacalcio, e prima non stava scritta da nessuna parte.
- La sala si apre **tutto il giorno dell'asta**, non solo alle 21:30.

### I crediti
- **Il budget su un lotto è il saldo di adesso più il rimborso dello
  svincolando.** Era «saldo meno i lotti già chiusi stasera», e quei prezzi
  erano già dentro il saldo: alla prima asta una squadra con tre lotti vinti si
  è trovata un budget negativo e l'ultimo lotto impossibile da assegnare.
- La sala mostra il budget vero e non lo snapshot dell'adesione: quello che
  leggi è quello che il server accetta.

### Il calendario
- **Chiudere una serata apre la successiva.** L'asta attiva è la prima non
  chiusa, non la prima con la data nel futuro: chiudendo in mattinata un'asta
  in calendario per la sera, le chiamate della prossima si aprono subito.

### Il registro della lega
- Una pagina nuova, **visibile a tutti**: una riga per ogni azione, in ordine
  di tempo, scritta in italiano. Chiamate, adesioni, giocatori presi all'asta,
  scambi, schedine, svincoli gratuiti chiesti e decisi; e le azioni di regia —
  apertura della sala, assegnazioni a mano, annullamenti, modifiche alle rose e
  ai crediti, import.
- **Ognuno scrive come si chiama**: un nome scelto da te al posto dell'email,
  che si cambia quando vuoi e cambia in tutto il registro.
- Si filtra per azione, allenatore, giocatore e periodo.
- **C'è dentro anche il passato**: tutta la storia della lega da settembre,
  ricostruita dai dati che c'erano già. Per quelle righe il database sa quale
  squadra ha agito, non quale dei due allenatori: da adesso c'è il nome.
- **Lo svincolando non compare** nelle chiamate e nelle adesioni: fino
  all'apertura della sala è segreto, e il registro lo leggono tutti. Per lo
  stesso motivo uno svincolo gratuito chiesto su un'asta ancora in corso non
  nomina il giocatore — il nome compare quando la sala si apre. Una richiesta
  ritirata esce dal registro: non è una richiesta fatta.

### L'archivio delle aste
- Accanto al registro, il tabellone di ogni serata **chiusa**: lotto per lotto
  chi ha chiamato, chi se lo contendeva, chi l'ha preso e a quanto, chi è
  uscito e con quale rimborso. Solo chiusa, e solo della propria lega: una
  serata ancora da giocare non si apre nemmeno scrivendone l'indirizzo a mano.

### Questa pagina
- Il changelog che stai leggendo: arriva dal file del progetto, quindi dice
  sempre quello che c'è davvero in produzione.

### Sotto il cofano
- La fase di un lotto non è una colonna del database: si deduce da stato e
  timer. Uno stato «congelato» scritto da qualche parte avrebbe bisogno di
  qualcuno che lo scriva nell'istante in cui il tempo finisce, e quel qualcuno
  è proprio quello che non c'è.
- Presenze e rilanci passano da due funzioni Postgres che bloccano la riga del
  lotto: due allenatori che premono nello stesso istante non possono accendere
  due timer, né rilanciare due volte lo stesso prezzo.
- Le frasi del registro si compongono in lettura da funzioni pure con i test:
  correggere una formulazione sistema tutto il registro, comprese le righe di
  mesi prima, senza toccare il database.
- L'orologio del telefono non decide più niente: la fase del lotto si calcola
  sull'ora del server, corretta dallo scarto misurato al caricamento.
- Regia e sala leggono lo stesso canale realtime. Prima la regia riceveva una
  fotografia, e l'admin non vedeva mai partire il countdown.

## v3.0 — 2 settembre 2026

La Redazione. A giornata conclusa il tabellino entra nell'app, i risultati e le
schedine si chiudono da soli, e il pezzo della giornata arriva scritto.

### Per l'admin
- Un preferito del browser importa la giornata dalla pagina della lega: legge
  le quattro sfide, mostra cosa ha trovato, e aspetta che sia tu a premere
  invio. Nessuna credenziale della lega custodita da nessuna parte.
- Da quel momento i risultati delle sfide e la risoluzione delle schedine
  avvengono da soli: l'inserimento a mano dei risultati non serve più.
- «Scrivi il pezzo», con «più cattivo» e «più morbido» accanto. Ogni pressione
  è una versione nuova: quella di prima resta e si può sempre mandare quella.
- Bozza su Telegram, da copiare nel gruppo — lo stesso patto del centro
  messaggi: l'app propone, tu approvi.
- Schede delle squadre: soprannomi, tormentoni, cosa rinfacciare, e un campo
  per dire di cosa **non** si scherza, che finisce nel prompt come divieto.
- Tono di base da 1 a 5, parole minime per sfida, elenco di parole vietate.

### Sotto il cofano
- La pagina della lega non si legge come testo, si legge come componenti: id
  del listone, ruolo, voto, fantavoto, fascia di capitano ed eventi tipizzati
  vengono dagli attributi. L'aggancio ai nostri giocatori è per id, non per
  somiglianza di nome.
- I subentri li ricava applicando le regole del Classico — primo pari ruolo
  della panchina che ha preso voto, tre sostituzioni al massimo, altrimenti si
  gioca in dieci — e la somma dei fantavoti deve tornare col totale scritto
  dalla lega. Se non torna, non si scrive niente.
- Gli spunti della giornata li calcola il codice, non il modello: le strisce di
  risultati, il digiuno, la nemesi e la panchina beffarda si vedono solo
  contando fra le giornate, e a un modello lasciato solo verrebbe da
  inventarle.
- Prima di partire, ogni numero del pezzo dev'essere uno di quelli che gli
  abbiamo dato. Se ne compare uno inventato si rigenera dicendogli cosa non
  andava; al secondo fallimento parte la versione con i template — asciutta,
  ma corretta e puntuale.
- Il grezzo di ogni import resta salvato: quando l'estrattore migliora si
  rifà l'import con un pulsante, senza ricopiare la giornata.
- 278 test automatici.

### Fuori scopo, per scelta
Le notizie non si pubblicano da sole in app e non finiscono su WhatsApp senza
passare da te. Il canale ufficiale della lega resta il gruppo.

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

# Redesign «Coppa sotto i fari» — stile app di betting

Data: 2026-10-02 · Stato: approvato in chat, fase 1 in corso

## Obiettivo

Cambiare l'intera interfaccia dell'app (colori, tipografia, navigazione, menu,
dashboard, login, tutte le pagine) ispirandosi alle app di betting sportivo
(riferimenti: Dribbble «Sport betting app design mobile app» e «AI sports
betting app design» di LazyInterface). Il contenuto e le regole del gioco non
cambiano: cambia l'interfaccia. Il telefono resta il dispositivo principale.
Sostituisce il sistema «La Sala d'Aste» descritto in `DESIGN.md`.

## Sistema visivo

- **Solo tema scuro.** Niente variante chiara.
- **Palette** — fondo `#0C1410` (verde notte), superfici `#16211B` e
  `#213029`, testo `#EFEDE4`, testo tenue `#9AA59C`, accento oro `#F2C14E`
  (testo sull'oro `#2A1F04`). Esiti: verde `#3FD17F` (presa, ok), arancio
  `#FF9F43` (attesa, avviso), rosso `#F2665A` (persa, blocco, live). I colori
  d'esito non decorano mai; le statistiche di popolarità usano l'oro.
- **Tipografia** — Barlow Condensed (600/700, maiuscolo) per titoli, banner e
  cifre grandi; Barlow (400/600) per il testo. Ogni cifra in `tabular-nums`.
  I testi da incollare (messaggi WhatsApp) restano in monospaziato di sistema.
- **Forme** — card raggio 14px, chip e bottoni a pillola, fogli dal basso
  (bottom sheet) per le azioni di dettaglio.

## Navigazione

- **Tab bar a 5 voci**: Home · Svincolati · **Asta** (bottone d'oro rialzato
  al centro) · Schedine · Rosa.
- **Testata**: ☰ a sinistra, marchio, pillola dei crediti a destra.
- **Cassetto ☰ unico** (sostituisce il menù admin): squadra con stemma e
  crediti in testa, Registro, Regolamento, sezione Admin raggruppata, Esci.
- **Schermo pieno senza tab bar**, con ← per uscire: sala live, classifiche.

## Pagine

| Pagina | Decisione |
|---|---|
| Login | Card d'accesso: marchio, frase, tre numeri della lega, form magic link in una card |
| Home | Banner a scorrimento Campionato / Coppa Mansarda con la prossima partita della propria squadra. Tasti: Classifica (apre quella della slide attiva), Ultimi incontri, Schedina, Asta. Quattro tessere scadenze con countdown: chiusura chiamate e adesioni della prossima asta, formazione (prima partita di giornata −15′), chiusura schedine (`matchdays.lock_at`, orario reale) |
| Ultimi incontri | Foglio: ultime cinque di ciascuna squadra a pallini (verde vinta, bianco pari, rosso persa) + precedenti diretti |
| Asta | Linea delle fasi, un grande countdown, lotti in righe compatte; «Aderisci» apre un foglio con lo svincolo a pillole e l'offerta massima |
| Sala live | Anello del timer intorno all'offerta, chip dei lotti della serata, avatar dei contendenti con pallino di presenza; pannello di rilancio con chip +1/+5/+10, stepper − / + e bottone «Rilancia a X». Se il minimo sale oltre la cifra scelta, la cifra si riallinea al minimo valido. Admin: cassetto di regia da tirare su |
| Schedine · Gioca | Palinsesto: 1X2 in vista, sfida espandibile per gli altri mercati, barra schedina fissa in fondo |
| Schedine · Le mie | Biglietti richiudibili (l'ultimo aperto), pillola d'esito, barretta colorata per giocata |
| Schedine · Altri | Biglietti per squadra richiudibili + «Cosa gioca la lega»: per sfida, quote sfumate in oro secondo quante volte sono state giocate |
| Classifiche | Tabella (#, Squadra, V, N, P, DR, Pt; altre colonne in scorrimento) con tre tab: Campionato · Coppa Mansarda (gironi) · Tipster (giocate, prese, punti). Unica pagina, aperta da Home e da Schedine |
| Rosa / Svincolati | Card giocatore con chip del ruolo; tocco → foglio azioni (Chiama, Svincolo gratuito). Svincolati: ricerca, ordinamento, foglio filtri |
| Registro | Solo timeline, anche per le aste passate; chip per tipo, foglio per gli altri filtri |
| Regolamento | Schede regola con il numero in grande, divise per chip |
| Admin | Home: coda delle decisioni in card con i bottoni inline + scorciatoie agli strumenti. Le altre pagine admin: solo restyling con i nuovi componenti |

## Stemmi delle squadre

Caricati a mano dall'admin nella pagina Allenatori (carica, sostituisci,
rimuovi, con anteprima nel cerchio). File PNG, WebP o SVG fino a ~500 KB,
salvati nel bucket Supabase `stemmi` (lettura pubblica, scrittura solo admin).
Colonna nuova `teams.logo_url`. Senza stemma: monogramma con le iniziali.
Compaiono ovunque c'è una squadra.

## Fuori ambito

- Nessuna regola cambia. Aperto a parte: le schedine oggi chiudono un'ora prima
  della prima partita; l'utente aveva ipotizzato «all'inizio». Da decidere
  separatamente.
- Precedenti della 1ª edizione negli Ultimi incontri: solo se presenti nel
  database, altrimenti dalla stagione in corso.

## Fasi

1. Sistema di base: token, font, componenti, tab bar, testata, cassetto, login, stemmi.
2. Home: carosello, scadenze, Ultimi incontri, classifiche.
3. Asta e sala live.
4. Schedine.
5. Rosa, Svincolati, Registro, Regolamento.
6. Restyling admin e riscrittura di `DESIGN.md`.

Ogni fase si verifica nel browser prima della successiva.

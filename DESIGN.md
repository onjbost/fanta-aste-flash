---
name: Aste Flash · Fanta Mansarda
description: Coppa sotto i fari — verde notte di campo, un solo oro, numeri da tabellone. Un'app da tenere in mano durante la serata.
colors:
  verde-notte: "#0C1410"
  superficie: "#16211B"
  superficie-2: "#213029"
  superficie-3: "#2A3B32"
  filetto: "#24332B"
  gesso: "#EFEDE4"
  gesso-tenue: "#9AA59C"
  oro: "#F2C14E"
  su-oro: "#2A1F04"
  oro-pastiglia: "rgba(242,193,78,.14)"
  verde-esito: "#3FD17F"
  arancio-attesa: "#FF9F43"
  rosso-live: "#F2665A"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.05
    textTransform: "uppercase"
  numero:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "3.2rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tabular-nums"
  body:
    fontFamily: "Barlow, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.74rem"
    fontWeight: 600
    letterSpacing: "0.08em"
    textTransform: "uppercase"
  codice:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "0.8rem"
rounded:
  piccolo: "10px"
  card: "14px"
  foglio: "22px"
  pillola: "99px"
spacing:
  gutter: "16px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button:
    backgroundColor: "{colors.superficie-2}"
    textColor: "{colors.gesso}"
    rounded: "{rounded.pillola}"
    padding: "8px 16px"
  button-primary:
    backgroundColor: "{colors.oro}"
    textColor: "{colors.su-oro}"
    rounded: "{rounded.pillola}"
  card:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.card}"
  chip:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.gesso-tenue}"
    rounded: "{rounded.pillola}"
  chip-active:
    backgroundColor: "{colors.oro}"
    textColor: "{colors.su-oro}"
  foglio:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.foglio} {rounded.foglio} 0 0"
  quota:
    backgroundColor: "{colors.superficie-2}"
    rounded: "{rounded.piccolo}"
  quota-selected:
    backgroundColor: "{colors.oro}"
    textColor: "{colors.su-oro}"
---

# Design System: Aste Flash · Fanta Mansarda

## Overview

**Creative North Star: «Coppa sotto i fari»**

Uno stadio di sera: il campo è verde scuro, le luci cadono sull'oro della coppa,
e i numeri stanno sul tabellone in caratteri condensati, maiuscoli, leggibili da
lontano. L'interfaccia prende in prestito il linguaggio delle app di scommesse
sportive — tab bar con il tasto centrale, chip, fogli che salgono dal basso,
piastrelle di quota — ma lo usa per una lega fra amici: niente banco, niente
promozioni, niente luci che lampeggiano per farti giocare.

Il telefono è il dispositivo principale. Tutto si pensa per il pollice: le azioni
stanno in basso, i dettagli si aprono in un foglio invece di cambiare pagina, e le
schermate in cui serve tutto lo spazio (la sala live, le classifiche) tolgono la
barra in basso e mettono una freccia ← per uscire.

**Key Characteristics:**
- Un solo tema, scuro. Nessuna variante chiara.
- Un solo accento, l'oro, e compare dove c'è qualcosa da fare o da guardare.
- Verde, arancio e rosso dicono solo l'esito. Mai decorazione, mai marca.
- Il testo più grande di ogni schermata è un numero, in condensato tabulare.
- Card a 14px, comandi a pillola, fogli dal basso a 22px.
- Ogni animazione ha la sua versione a movimento ridotto.

## Colors

Verde notte di campo come fondo, tre superfici che si staccano per tono (non per
ombra), gesso per il testo. L'oro è l'unico colore di marca.

### Primary
- **Oro** (`#F2C14E`), testo sopra l'oro **Su-oro** (`#2A1F04`). Il bottone
  primario, la voce attiva, la chip scelta, la cifra che conta, la bolla
  dell'Asta nella tab bar. Il suo velo, **Oro pastiglia**, fa da fondo ai
  richiami e alla casella scelta senza riempirla.

### Neutral
- **Verde notte** (`#0C1410`): il fondo di ogni pagina.
- **Superficie** (`#16211B`), **Superficie 2** (`#213029`), **Superficie 3**
  (`#2A3B32`): card, comandi, bordi dei comandi. Una superficie dentro l'altra
  sale di un gradino.
- **Gesso** (`#EFEDE4`) e **Gesso tenue** (`#9AA59C`): testo e testo secondario.

### Outcome
- **Verde esito** (`#3FD17F`): presa, approvata, in sala, ok.
- **Arancio attesa** (`#FF9F43`): in attesa, avviso, ultimi dieci secondi.
- **Rosso live** (`#F2665A`): persa, blocco, errore, *live*, ultimi tre secondi.

### Named Rules

**La Regola dell'Oro per la Popolarità.** Quando si misura quanto è giocata una
cosa («Cosa gioca la lega»), si sfuma l'oro, non il verde: «la più giocata» non è
«quella uscita».

**La Regola dell'Allarme Raro.** Il timer di un lotto dura pochi secondi: è
arancio solo negli ultimi dieci e rosso negli ultimi tre. Un allarme acceso sempre
non è un allarme.

## Typography

- **Barlow Condensed** 600/700, maiuscolo: titoli, banner, cifre grandi, etichette
  del tabellone (l'anello della sala, i countdown, i punti).
- **Barlow** 400/600: tutto il resto del testo.
- Ogni cifra è in `tabular-nums`, così i numeri si incolonnano e una cifra a tre
  posti non allarga la pillola che la contiene.
- I testi da incollare su WhatsApp restano in monospaziato di sistema: lì
  l'allineamento delle righe è il contenuto.

### Hierarchy
- `h1` 2rem condensato maiuscolo; `h2` 1.2rem condensato maiuscolo con un
  contatore tenue accanto quando elenca qualcosa (`.h2-conta`).
- L'**eyebrow** (0.72rem, oro, maiuscoletto spaziato) sta sopra l'`h1` e dice
  dove sei: «Asta flash #4», «Torneo dei tipster».
- Le **label** dei dati (0.74rem, gesso tenue, maiuscoletto) nominano un valore;
  non si usano per frasi o bottoni.

## Layout

- Colonna unica da 720px al massimo, gutter di 16px, nessuno scorrimento
  orizzontale della pagina. Le righe che non ci stanno (chip, contendenti, lotti
  della serata) scorrono dentro di sé.
- **Testata** fissa in alto: ☰ (o ← nelle pagine a schermo pieno), marchio,
  pillola d'oro dei crediti.
- **Tab bar** a cinque voci: Home · Svincolati · **Asta** · Schedine · Rosa.
  L'Asta è una bolla d'oro rialzata al centro; quando la sala è aperta porta un
  pallino rosso e diventa «Sala live».
- **Cassetto ☰** unico, a tutto schermo sul telefono: squadra con stemma e
  crediti, Registro, Regolamento, area Admin raggruppata, Esci.
- Le pagine riservano in fondo lo spazio della tab bar più l'area sicura.

## Elevation & Depth

La profondità è tonale: una card è Superficie su Verde notte, un comando è
Superficie 2 dentro una card. L'ombra serve solo a ciò che galleggia davvero —
fogli, barra della schedina, pannello di rilancio, cassetto di regia — ed è larga
e scura, mai colorata.

## Shapes

- **Card** 14px (`--r`), **elementi piccoli** 10px (`--r-sm`): quote, richiami,
  esiti affiancati.
- **Pillola** per tutto ciò che si preme: bottoni, chip, svincolandi, pillola
  d'esito, saldo crediti, barra della schedina.
- **Foglio** 22px sui soli angoli alti: è un pezzo di pagina che sale dal basso.

## Components

### Buttons
- **Secondario** (per difetto): Superficie 2, bordo Superficie 3, testo gesso.
  Hover: bordo e testo in oro.
- **Primario** (`.primary`): oro pieno, testo su-oro. Uno per vista.
- **Misure:** `.largo` (tutta la riga, 48px: il primario di un foglio),
  `.piccolo` (dentro una riga).
- **Pericolo:** `.pericolo` (testo rosso: ritira, annulla, chiudi subito) e
  `.pericolo-pieno` (fondo rosso, per l'annullo dell'admin).
- **Active:** affonda a `scale(.97)`; le quote a `.94`.

### Chip
Pillole su Superficie, testo gesso tenue; la scelta è oro pieno (`aria-pressed`,
`aria-current`). Servono per filtrare (ruoli, tipi d'azione, sezioni del
regolamento), ordinare (Svincolati: primo tocco entra, secondo gira il verso,
terzo esce; il numerino dice la priorità) e scegliere (le aste passate).

### Foglio dal basso (`Foglio`)
Il dettaglio che si apre sopra la pagina invece di cambiarla: maniglia, titolo
condensato, ✕. È un `<dialog>` vero (fuoco intrappolato, Esc chiude, velo che
chiude al tocco). Il contenuto si monta all'apertura, così un form riparte pulito.
`bloccato` toglie le uscite: lo usa solo la conferma di presenza in sala.
Usi: Aderisci, Chiama, Cambia svincolando, annullo dell'admin, foglio giocatore
(Rosa, Svincolati), lotto della serata, filtri, Ultimi incontri.

### Pillole di svincolo (`SceltaSvincolo`)
Chi metti sul piatto, una pillola per giocatore con nome e rimborso (`+22`).
Sotto sono radio veri con `name="releaseId"`. Accanto, la **riga del budget**:
etichetta a sinistra, cifra d'oro grande a destra, il conto (`48 + 22`) sotto.

### Card giocatore (`.carta`)
Chip del ruolo, nome e club (con le etichette di stato), cifra d'oro a destra
(prezzo in Rosa, quotazione in Svincolati). Il tocco apre il foglio azioni.

### Asta
- **Linea delle fasi:** Chiamate · Adesioni · Attesa · Sala, un punto per tappa;
  fatte in oro pieno, quella di adesso cerchiata.
- **Un countdown solo**, grande e d'oro: la prossima porta che si chiude. Sotto,
  crediti, lotti e cambi.
- **Lotti in righe** compatte: ruolo, giocatore, chi l'ha chiamato, quanti sono
  in corsa, «Aderisci». La propria partecipazione si apre sotto la riga.

### Sala live (componenti firma)
- **Chip dei lotti** della serata in cima: il lotto live ha il bordo rosso,
  quelli chiusi si spengono e portano il prezzo. Il tocco apre il foglio del lotto.
- **Anello del timer** intorno all'offerta: si svuota col countdown, oro → arancio
  → rosso; grigio mentre si aspettano le presenze o il martello, e allora il
  tempo si scrive a parole.
- **Contendenti:** stemma con pallino di presenza (verde = in sala), budget, chi
  esce; chi è in testa ha il bordo d'oro.
- **Pannello di rilancio**, fisso in fondo: +1/+5/+10, stepper − / +, e un solo
  bottone «Rilancia a X». Se l'offerta supera la cifra scelta, la cifra si
  riallinea al minimo valido.
- **Cassetto di regia** (solo admin): barra in fondo che dice a che punto è la
  serata; tirata su, porta tutti i comandi. Non è modale: l'anello resta visibile.

### Schedine
- **Palinsesto:** per sfida, l'1X2 in vista su tre colonne fisse; gli altri
  mercati in una tendina che si apre da sola se contiene una giocata.
- **Piastrella di quota** (`.quota`): esito, quota condensata, punti potenziali
  quando è scelta. Scelta = oro pieno.
- **Barra della schedina** a pillola, fissa sopra la tab bar: giocate, «fino a X
  pt», avviso sulle sfide scoperte, «Salva».
- **Biglietto** (`.biglietto`): schedina richiudibile con linea tratteggiata
  fra testa e giocate, **pillola d'esito** (verde se ha portato punti), una
  **barretta colorata** a sinistra di ogni giocata (verde presa, rosso persa).
- **Cosa gioca la lega:** le caselle giocate di ogni sfida, con l'oro tanto più
  pieno quanto più sono state scelte.

### Registro e Regolamento
- **Timeline:** un filo verticale, un punto d'oro per voce (spento se il lotto
  non è andato a nessuno), l'ora o il numero del lotto in oro sopra la frase.
- **Scheda regola:** il numero in grande, condensato e d'oro, a sinistra; titolo,
  testo e la fonte in un'etichetta.

### Stemmi
Cerchio con lo stemma caricato dall'admin; senza stemma, il monogramma con le
iniziali. Compare ovunque c'è una squadra.

### Loading Veil
Velo sopra la pagina; l'anello d'oro e il pallone che rotola compaiono solo se
l'attesa supera 2,5 secondi, la nota dopo 5.

## Do's and Don'ts

### Do:
- **Do** aprire il dettaglio in un foglio dal basso invece di cambiare pagina.
- **Do** tenere un solo primario d'oro per vista.
- **Do** far vincere il numero: condensato, tabulare, il più grande della schermata.
- **Do** usare le chip per filtrare e ordinare, e un foglio per i filtri che non
  ci stanno in una riga.
- **Do** definire ogni colore come token in `:root` dentro `globals.css`.
- **Do** scrivere a mano la variante `prefers-reduced-motion` di ogni animazione.
- **Do** disegnare le icone in linea, a tratto su `currentColor`.

### Don't:
- **Don't** usare verde, arancio o rosso per qualcosa che non sia un esito.
- **Don't** copiare dalle app di scommesse le cose che spingono a giocare: banner
  promozionali, quote lampeggianti, effetti da vincita, contatori urlati.
- **Don't** introdurre un tema chiaro o un secondo colore di marca.
- **Don't** mettere più di un bottone d'oro pieno nella stessa vista.
- **Don't** usare emoji nell'interfaccia: lo scherzo sta nei testi della
  Redazione, non nei pixel.
- **Don't** importare librerie di icone o componenti: un solo foglio di stile e
  icone disegnate a mano, perché l'app deve restare gratis e leggera.

---
name: Aste Flash · Fanta Mansarda
description: La sala d'aste della lega — carta, feltro e ottone, con i numeri sempre in colonna.
colors:
  oro-di-coppa: "#8A6A15"
  oro-tenue: "#F0E4C4"
  oro-pastiglia: "rgba(138,106,21,.14)"
  carta: "#F1F3F0"
  foglio: "#FFFFFF"
  feltro: "#E9EDE8"
  inchiostro: "#141C18"
  inchiostro-tenue: "#5B6660"
  filetto: "#D7DED8"
  verde-esito: "#1B7A44"
  ambra-attesa: "#9A6B0B"
  rosso-blocco: "#A8261F"
  vetro: "rgba(255,255,255,.58)"
  vetro-bordo: "rgba(255,255,255,.85)"
typography:
  display:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "2.4rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  headline:
    fontFamily: "Chivo, system-ui, -apple-system, sans-serif"
    fontSize: "1.7rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Chivo, system-ui, -apple-system, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Chivo, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Chivo, system-ui, -apple-system, sans-serif"
    fontSize: "0.68rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.14em"
rounded:
  vivo: "2px"
  base: "3px"
  scheda: "20px"
  capsula: "26px"
  pastiglia: "99px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button:
    backgroundColor: "{colors.foglio}"
    textColor: "{colors.inchiostro}"
    rounded: "{rounded.vivo}"
    padding: "6px 12px"
  button-hover:
    textColor: "{colors.oro-di-coppa}"
  button-primary:
    backgroundColor: "{colors.oro-di-coppa}"
    textColor: "{colors.carta}"
    rounded: "{rounded.vivo}"
    padding: "6px 12px"
  input:
    backgroundColor: "{colors.foglio}"
    textColor: "{colors.inchiostro}"
    rounded: "{rounded.vivo}"
    padding: "8px 10px"
    width: "100%"
  panel:
    backgroundColor: "{colors.foglio}"
    rounded: "{rounded.base}"
  stat:
    backgroundColor: "{colors.foglio}"
    rounded: "{rounded.base}"
    padding: "14px 16px"
  tag:
    rounded: "{rounded.vivo}"
    padding: "2px 6px"
    typography: "{typography.label}"
  callout:
    backgroundColor: "{colors.oro-tenue}"
    textColor: "{colors.inchiostro}"
    padding: "12px 16px"
  quota:
    backgroundColor: "{colors.foglio}"
    textColor: "{colors.inchiostro}"
    rounded: "{rounded.base}"
    padding: "8px 10px"
  quota-selected:
    backgroundColor: "{colors.oro-tenue}"
    textColor: "{colors.oro-di-coppa}"
  dock-capsule:
    backgroundColor: "{colors.vetro}"
    rounded: "{rounded.capsula}"
    padding: "6px"
  dock-tab:
    textColor: "{colors.inchiostro-tenue}"
    rounded: "{rounded.scheda}"
    padding: "8px 10px 7px"
  dock-tab-active:
    backgroundColor: "{colors.oro-pastiglia}"
    textColor: "{colors.oro-di-coppa}"
---

# Design System: Aste Flash · Fanta Mansarda

## Overview

**Creative North Star: "La Sala d'Aste"**

Il contegno di una casa d'aste, non l'eccitazione di un botteghino. Le superfici
sono sobrie — carta verdolina, feltro, filetti sottili — e l'ottone compare solo
sui dettagli che contano: l'azione da fare adesso, la voce dove sei, la cifra in
gioco. Intorno all'oggetto in vendita c'è silenzio, e quel silenzio è quello che
rende leggibile il numero al centro. Il sistema non decora: allestisce.

Il carattere è **denso e sportivo**. Non è un archivio: è fantacalcio fra amici, e
la densità serve a metterti sotto gli occhi tutto quello che serve per decidere
in fretta, dal telefono, mentre la serata va avanti. Testi piccoli, righe strette,
quattro contatori affiancati, tabelle che si incolonnano. Il contrasto e il colore
lavorano per far emergere l'esito — preso, perso, in corso, esaurito — non per
fare atmosfera.

I comandi si comportano come **cartellini d'asta**: oggetti che rispondono al
dito. Affondano quando li premi, il bordo si accende quando li sfiori, lo stato
scelto resta visibilmente scelto. La barra di vetro in fondo allo schermo è il
primo membro di una famiglia, non un'eccezione: dove qualcosa galleggia davvero
sopra il contenuto che scorre, può essere vetro.

**Key Characteristics:**
- Un solo accento, l'Oro di Coppa, e compare dove c'è qualcosa in gioco.
- Il testo più grande di ogni schermata è un numero, non una parola.
- Due linguaggi di forma soltanto: il contenuto è squadrato, la navigazione è tonda.
- Profondità per tonalità e filetti; l'ombra è larga, bassa e quasi invisibile.
- Chiaro e scuro sono pari grado, non tema e variante.
- Ogni animazione ha la sua versione a movimento ridotto, scritta a mano.

## Colors

Una carta verdolina fredda con l'inchiostro quasi nero, attraversata da un unico
ottone caldo; i soli altri colori sono i tre esiti, e non hanno alcun ruolo
decorativo. Il tema scuro non è una variante smorzata: è la stessa tavolozza
ricalibrata, con l'ottone che sale di luminosità per reggere il fondo scuro.

### Primary
- **Oro di Coppa** (`#8A6A15` chiaro / `#E2B44E` scuro): l'unico colore di marca.
  Riempie il bottone primario, tinge la voce attiva della barra, disegna l'arco
  dell'anello di caricamento, marca l'ordinamento attivo di una colonna e i punti
  potenziali di una giocata. È il colore di ciò che è in gioco adesso.
- **Oro Tenue** (`#F0E4C4` chiaro / `#2C2718` scuro): il fondo dell'ottone. Riempie
  i richiami, le quote selezionate, le pastiglie contatore. Non porta mai testo
  che non sia esso stesso oro.
- **Oro Pastiglia** (`rgba(138,106,21,.14)` chiaro / `rgba(226,180,78,.18)` scuro):
  la sola tinta translucida dell'accento, riservata alla voce attiva dentro il
  vetro, dove un fondo opaco spegnerebbe la trasparenza.

### Neutral
- **Carta** (`#F1F3F0` chiaro / `#101614` scuro): il fondo pagina. Verdolina
  fredda, mai bianca: è quello che dà al sistema il suo tono di campo da gioco.
- **Foglio** (`#FFFFFF` chiaro / `#171F1C` scuro): la superficie di ogni pannello,
  scheda, campo e bottone a riposo. Il piano su cui si appoggia il contenuto.
- **Feltro** (`#E9EDE8` chiaro / `#1E2724` scuro): il tono di servizio — teste di
  tabella, piedi di finestra, righe sorvolate, fondo dello scheletro di
  caricamento. È il panno sotto gli oggetti, mai un contenitore a sé.
- **Inchiostro** (`#141C18` chiaro / `#E6EDE8` scuro): tutto il testo che conta, e
  la riga spessa da 2px sotto l'intestazione.
- **Inchiostro Tenue** (`#5B6660` chiaro / `#97A39C` scuro): etichette, sottotitoli,
  metadati, voci di navigazione a riposo. Tutto ciò che si legge dopo.
- **Filetto** (`#D7DED8` chiaro / `#28332E` scuro): ogni bordo e ogni divisorio, a
  1px. Non esistono divisori più spessi tranne la riga d'inchiostro sotto
  l'intestazione.

### Outcome
- **Verde Esito** (`#1B7A44` chiaro / `#4FBF80` scuro): giocata presa, svincolo al
  100%, conferma andata a buon fine.
- **Ambra Attesa** (`#9A6B0B` chiaro / `#E0A93F` scuro): richiesta in sospeso, un
  solo cambio rimasto, avviso che non blocca.
- **Rosso Blocco** (`#A8261F` chiaro / `#E8746B` scuro): zero cambi, giocata persa,
  lotto in corso, errore che ferma l'operazione.

### Named Rules

**La Regola dell'Oro Raro.** In una schermata l'Oro di Coppa tocca al massimo un
elemento per gerarchia: un bottone primario, una voce di navigazione attiva, una
cifra viva. Se due cose sono d'oro nella stessa vista, una delle due non era in
gioco davvero.

**La Regola dei Tre Semafori.** Verde, ambra e rosso comunicano **esiti**, mai
marca, mai categoria, mai decorazione. Un verde che non significa «è andata bene»
è un errore, non una scelta cromatica.

**La Regola del Fondo Verdolino.** Il bianco puro esiste solo come superficie
(`Foglio`), mai come fondo pagina. Il fondo è sempre Carta: è quel mezzo grado di
verde che impedisce al sistema di sembrare un modulo d'ufficio.

## Typography

**Display Font:** Chivo (con `system-ui`, `-apple-system`, `sans-serif`), pesi 400 / 600 / 800
**Body Font:** Chivo — stessa famiglia, il sistema non ha un'accoppiata display/testo
**Label/Mono Font:** JetBrains Mono (con `ui-monospace`, `monospace`), pesi 400 / 600

**Character:** Un grottesco compatto con l'800 usato senza timidezza per i titoli e
l'occhio grande che regge le dimensioni minuscole delle etichette; accanto, un
monospaziato che non è una scelta da programmatore ma una necessità contabile —
crediti, quote, punti e budget devono incolonnarsi da soli. La coppia dice
insieme le due nature del prodotto: la lega che parla e il registro che conta.

### Hierarchy
- **Display** (JetBrains Mono 600, 2.4rem, interlinea 1): l'offerta viva nella sala
  d'asta. La cifra più grande che il sistema sappia mostrare, e compare in una
  schermata sola.
- **Headline** (Chivo 800, 1.7rem, `-0.02em`, `text-wrap: balance`): il titolo di
  pagina, uno per schermata, sempre sotto un'etichetta occhiello.
- **Title** (Chivo 800, 1.05rem, `-0.01em`, margine superiore 32px): l'intestazione
  di sezione. Il salto di corpo verso il testo è minimo: a separare è lo spazio
  sopra, non la dimensione.
- **Body** (Chivo 400, 1rem, interlinea 1.55): il testo corrente. Dentro le tabelle
  e i pannelli densi scende a `.9rem`, e nei metadati a `.86rem`.
- **Label** (Chivo 600, 0.68rem, `0.14em`, maiuscolo): occhielli, etichette di
  campo, teste di tabella, chiavi delle schede numeriche. Il maiuscoletto spaziato
  è il tono di voce di tutto ciò che nomina un dato invece di dirlo.

### Metric styles
- **Valore di scheda** (JetBrains Mono 600, 1.8rem, interlinea 1.2): crediti
  residui, budget, punti.
- **Contatore di cambi** (JetBrains Mono 600, 1.5rem): i quattro riquadri per
  ruolo, con il numero che vira ad Ambra a uno e a Rosso a zero.
- **Numero in linea** (`.num` / `.mono`, `font-variant-numeric: tabular-nums`):
  ogni cifra dentro una tabella, allineata a destra, che non va a capo.

### La scala

Il sistema non ha cinque corpi: ne ha diciannove, perché è denso e ogni riga di
un'interfaccia densa vuole il suo peso esatto. Non è però una scala libera —
questi sono i gradini, e non se ne aggiungono altri:

`.62` `.64` `.66` `.68` `.7` `.72` `.76` `.8` `.82` `.86` `.9` `.95` ·
`1` `1.05` · `1.3` `1.5` `1.6` `1.7` `1.8` · `2.4` (rem)

Sotto `1rem` vivono etichette, distintivi, metadati e comandi; sopra, titoli e
cifre. I gradini stretti in basso servono a distinguere undici livelli di
servizio dentro una tabella; quelli larghi in alto a far vincere i numeri.

**La Regola del Gradino Esistente.** Un corpo nuovo si prende dalla scala. Se
serve davvero un gradino che non c'è, si aggiunge **qui** e poi nel codice — mai
il contrario, perché è così che si arriva ad avere `.84`, `.85`, `.86` e `.88`
nella stessa app, quattro misure che nessuno distingue e che nessuno aveva scelto.

### Named Rules

**La Regola del Numero Più Grande.** In ogni schermata il testo più grande è un
numero in JetBrains Mono, non una parola. Il valore di una scheda (1.8rem) batte
il titolo di pagina (1.7rem), e l'offerta viva (2.4rem) batte tutto. Se un titolo
è la cosa più grande che si vede, quella schermata non ha ancora capito cosa
l'utente è venuto a leggere.

**La Regola dell'Incolonnamento.** Qualunque cifra che qualcuno possa voler
confrontare con quella della riga sopra porta `.num` o `.mono`, cifre tabulari e
allineamento a destra. Nessuna eccezione per «tanto sono poche».

**La Regola del Maiuscoletto.** Il maiuscolo spaziato è riservato alle etichette
che **nominano** un dato. Non compare mai in un titolo, in un bottone, in una frase.

## Layout

Una colonna sola, larga al massimo 940px, centrata, con 16px di margine laterale:
non esiste una griglia multi-colonna a livello di pagina, e le viste dell'admin
usano la stessa larghezza delle viste dell'allenatore. La densità è alta per
scelta — corpi piccoli, imbottiture strette, molte righe visibili insieme —
perché la scena d'uso è un telefono durante una serata che va avanti.

Il ritmo verticale è costruito su un passo di 2px, con sei gradini che ricorrono
ovunque: 4, 8, 12, 16, 24, 32. Il codice esistente usa anche valori intermedi
(6, 10, 14, 18, 20) in punti isolati; il lavoro nuovo si tiene sui sei.

**Contenitori ricorrenti.** Le schede numeriche stanno in una griglia
`auto-fit` con minimo 150px, così passano da tre a due a una senza un solo media
query. I quattro contatori di cambi sono una griglia fissa a 4 colonne che
diventa 2×2 sotto i 560px. Le tabelle hanno una larghezza minima di 560px e vivono
dentro un contenitore che scorre orizzontalmente: si preferisce far scorrere una
tabella piuttosto che spezzarla in schede.

**Punti di rottura.** Solo due, e locali: 560px (contatori e righe di giocata
passano a due colonne) e 400px (le voci della barra si stringono). Non c'è un
sistema di breakpoint globale, e non serve inventarne uno.

**Area sicura.** Ogni pagina riserva in fondo `116px + env(safe-area-inset-bottom)`,
e ogni barra fissa si posiziona a partire da `env(safe-area-inset-bottom)`. Il
`viewportFit: 'cover'` del layout rende questo obbligatorio, non facoltativo.

### Named Rules

**La Regola dei 116px.** La barra di navigazione galleggia sopra il contenuto:
qualunque pagina che scorre riserva 116px più l'area sicura in fondo, e qualunque
elemento appiccicato in basso si ancora sopra quella quota (la barra della
schedina sta a 96px + area sicura). Un contenuto che finisce sotto il vetro è un
difetto, non un dettaglio.

**La Regola della Tabella Che Scorre.** Quando i dati non ci stanno in larghezza,
scorre la tabella dentro il suo pannello — la pagina non scorre mai in
orizzontale, e le colonne non si trasformano in schede impilate.

## Elevation & Depth

Il sistema è **quasi piatto**: la profondità viene dalla tonalità e dai filetti,
non dalle ombre. Tre toni impilati (Carta sotto, Foglio sopra, Feltro come panno
di servizio) più un bordo da 1px bastano a separare qualunque cosa da qualunque
altra. L'ombra dei pannelli esiste ma è deliberatamente sottosoglia: una riga
d'attacco da 1px e un alone largo 24px con offset negativo di 16px, cioè un
oggetto che poggia, non che galleggia.

Sopra questo piano stanno due sole eccezioni, e sono entrambe fisiche: la finestra
di dialogo, che si stacca davvero (`0 24px 60px -20px`), e la barra di
navigazione, che è vetro. Il vetro è una famiglia aperta: dove un elemento
galleggia davvero sopra contenuto che scorre — una barra della schedina, un
comando persistente della sala — può essere vetro, purché rispetti la regola qui
sotto.

### Shadow Vocabulary
- **Appoggio** (`0 1px 2px rgba(20,28,24,.05), 0 8px 24px -16px rgba(20,28,24,.25)`):
  pannelli, schede, barre appiccicate. È il valore per difetto di ogni superficie.
- **Distacco** (`0 24px 60px -20px rgba(0,0,0,.5)`): solo la finestra di dialogo,
  l'unico elemento che interrompe davvero il flusso.
- **Vetro** (`0 10px 34px -12px rgba(20,28,24,.42), 0 2px 8px -4px rgba(20,28,24,.24)`,
  più `inset 0 1px 0` di speculare e `inset 0 -1px 0` di bordo inferiore): la
  capsula di navigazione, e ogni futuro oggetto in vetro.

### Named Rules

**La Regola del Vetro Meritato.** Il vetro (`backdrop-filter: blur(22px)
saturate(190%)`) è ammesso solo su elementi che galleggiano davvero sopra
contenuto che scorre, e **deve** portare con sé il riflesso superiore e la
ricaduta `@supports not (backdrop-filter)` che lo riporta a superficie opaca con
bordo normale. Vetro su un elemento fermo nel flusso è decorazione, e va rifiutato.

**La Regola dell'Ombra Impercettibile.** Se si nota l'ombra, è troppo forte.
L'ombra d'appoggio serve a staccare il bianco dal bianco, non a suggerire altezza:
l'altezza la dice il tono.

## Shapes

Il sistema parla **due linguaggi di forma e nessuna via di mezzo.**

Il contenuto è squadrato quasi a spigolo vivo: 2px su bottoni, campi, etichette,
distintivi di ruolo e riquadri numerati; 3px sui pannelli e sulle schede. A questa
scala il raggio non si legge come «arrotondato», si legge come «tagliato con
precisione» — ed è il tratto che più di ogni altro distingue questo sistema da un
cruscotto qualunque.

La navigazione e i contatori sono invece completamente tondi: 26px la capsula,
20px la singola voce, 99px le pastiglie numeriche e i bottoni di condivisione. La
tondezza qui significa «questo non è contenuto, è un comando».

I bordi sono sempre da 1px in Filetto, con due eccezioni volute: la riga da 2px in
Inchiostro sotto l'intestazione, che chiude la testata come un filo di stampa, e il
bordo sinistro da 3px dei richiami e delle righe di giocata, che porta il colore
dell'esito.

### Named Rules

**La Regola dei Due Linguaggi.** Un raggio è 2–3px (contenuto) oppure 20–99px
(comando e contatore). I valori intermedi — 6px, 8px, 12px — non appartengono a
questo sistema e non vanno introdotti: sono la firma visiva esatta di ciò che
questo progetto rifiuta.

**La Regola del Filetto Unico.** Ogni separazione è 1px in Filetto. Se serve più
peso, si cambia il tono del fondo, non lo spessore del bordo.

## Components

### Buttons
- **Shape:** spigolo quasi vivo (2px), bordo 1px in Filetto, corpo 0.82rem peso 600.
- **Secondario (per difetto):** fondo Foglio, testo Inchiostro. È lo stato normale
  di quasi tutti i bottoni del sistema.
- **Primario:** fondo Oro di Coppa, testo Carta. Imbottitura identica al
  secondario: la differenza è solo cromatica, mai dimensionale.
- **Hover:** il bordo e il testo virano a Oro di Coppa — il bottone si accende sul
  perimetro prima di essere premuto.
- **Active:** affonda, con transizione 0.12s. Il tuffo è proporzionato alla forma:
  `scale(.97)` sui bottoni larghi, dove `.94` schiaccerebbe visibilmente la riga di
  testo, e `scale(.94)` sui comandi compatti (voci della barra, piastrelle di quota,
  bottoni di condivisione), dove si legge come una pressione vera. Il bottone-link
  non affonda: non è un oggetto, è una parola.
- **Link:** senza bordo né fondo, testo Oro di Coppa sottolineato. Per le azioni
  distruttive o secondarie dentro una riga.
- **Disabled:** opacità 0.45 e cursore negato. Nessun cambio di colore: resta
  leggibile che cosa sarebbe stato possibile.

### Inputs / Fields
- **Style:** fondo Foglio, bordo 1px Filetto, raggio 2px, imbottitura 8px 10px,
  larghezza piena per difetto.
- **Label:** sopra il campo, maiuscoletto spaziato 0.72rem in Inchiostro Tenue.
- **Focus:** contorno da 2px in Oro di Coppa con offset 2px, via `:focus-visible`
  globale. Vale per ogni elemento focalizzabile del sistema, senza eccezioni.

### Tags
- **Style:** maiuscoletto 0.64rem, imbottitura 2px 6px, raggio 2px, bordo
  `1px solid currentColor` — il bordo prende il colore del testo, così una sola
  regola serve le quattro varianti.
- **Varianti:** Verde Esito, Ambra Attesa, Rosso Blocco, Inchiostro Tenue. Un
  distintivo dice sempre uno stato, mai una categoria.

### Cards / Containers
- **Pannello:** fondo Foglio, bordo 1px Filetto, raggio 3px, ombra d'Appoggio,
  `overflow: hidden` così le tabelle interne si tagliano sull'angolo.
- **Scheda numerica:** imbottitura 14px 16px; chiave in maiuscoletto 0.68rem,
  valore monospaziato 1.8rem, nota 0.76rem in Inchiostro Tenue.
- **Testa e piede:** fondo Feltro, separati da 1px Filetto. È il modo del sistema
  di dare struttura a un contenitore senza aggiungere ombra.

### Tables
- **Testa:** fondo Feltro, maiuscoletto 0.66rem in Inchiostro Tenue, non va a capo.
- **Corpo:** righe da 10px 14px, divisorio 1px Filetto, ultima riga senza
  divisorio, riga sorvolata in Feltro.
- **Colonne numeriche:** monospaziate, cifre tabulari, allineate a destra.
- **Colonne ordinabili:** il `th` cede tutta la sua imbottitura a un bottone
  interno che eredita lo stile della testa; la colonna attiva passa a Inchiostro,
  il segno di direzione è in Oro di Coppa, e una pastiglia tonda in Oro Tenue porta
  il livello di ordinamento quando i criteri sono più d'uno.

### Navigation
- **Barra inferiore (capsula di vetro):** fissa a 18px dal fondo più l'area sicura,
  centrata. Fondo translucido con sfocatura 22px e saturazione 190%, bordo chiaro,
  riflesso superiore su metà altezza, ombra di Vetro.
- **Voce:** icona 22px a tratto 1.7px (`currentColor`, così il colore lo decide la
  voce) sopra un'etichetta da 0.62rem. A riposo Inchiostro Tenue; attiva in Oro di
  Coppa su pastiglia Oro Pastiglia; premuta, affonda a 0.94.
- **Comportamento:** si rimpicciolisce a 0.82 e si smorza a 0.5 di opacità quando
  si scorre verso il basso oltre 48px, torna piena appena si risale, con soglia di
  6px perché un tremolio non la faccia lampeggiare.
- **Icone:** disegnate in linea nel componente, mai da libreria. Ogni icona deve
  dire la cosa specifica che c'è dietro la voce, non la sua categoria.

### Odds Tile (componente firma)
La piastrella di quota del Torneo dei Tipster: colonna di tre righe — esito, quota
monospaziata 0.94rem, punti potenziali 0.64rem in Oro di Coppa — dentro un
riquadro da 76px minimo. A riposo Foglio con bordo Filetto; sorvolata, bordo Oro;
scelta, bordo Oro e fondo Oro Tenue; esaurita, opacità 0.4. I mercati a esiti fissi
la dispongono in griglia rigida da tre colonne, così le righe non si riflowano
mentre si gioca.

### Message Card (componente firma)
La scheda del centro messaggi: testa e piede in Feltro, corpo interamente in
JetBrains Mono 0.79rem con interlinea 1.65 e `white-space: pre-wrap`. Il testo
destinato a WhatsApp si mostra nel carattere in cui verrà incollato: la scheda è
un'anteprima, non una citazione.

### Loading Veil (componente firma)
Velo fisso sopra la pagina, fondo Carta al 55% con sfocatura 4px. Il centro —
anello in Oro di Coppa e pallone che rotola — **non esiste per i primi 2,5
secondi**: compare solo se l'attesa è davvero lunga, e la nota esplicativa solo
dopo 5. Una navigazione normale mostra soltanto il velo sfocato e gli scheletri
che pulsano.

### Named Rules

**La Regola dell'Azione Unica.** Un solo bottone primario per schermata: quello che
l'utente è venuto a premere. Tutto il resto è secondario, anche quando è
importante.

**La Regola del Ritorno.** Ogni animazione porta con sé la sua versione a
`prefers-reduced-motion: reduce`, scritta a mano e non semplicemente spenta: il
movimento ridotto cambia **il come**, mai **il quando**. Il velo di caricamento
conserva il suo ritardo di 2,5 secondi anche senza animazione, perché quel ritardo
è informazione, non decorazione.

**La Regola dell'Icona Che Dice Cosa.** Un'icona di navigazione rappresenta la cosa
specifica che si va a cercare, non la sua categoria: gli svincolati sono un
giocatore libero con un più, non un elenco puntato.

## Do's and Don'ts

### Do:
- **Do** usare l'Oro di Coppa su un solo elemento per gerarchia, e solo dove c'è
  qualcosa in gioco (Regola dell'Oro Raro).
- **Do** dare a ogni comando premibile una risposta al dito: bordo che si accende
  al passaggio, affondamento alla pressione (`scale(.97)` largo, `scale(.94)`
  compatto), stato scelto che resta visibilmente scelto. A movimento ridotto il
  riscontro resta e cambia forma: risponde il fondo invece del moto.
- **Do** far vincere il numero: la cifra monospaziata è il testo più grande della
  schermata, e ogni valore confrontabile porta cifre tabulari allineate a destra.
- **Do** restare su due soli raggi: 2–3px per il contenuto, 20–99px per comandi e
  contatori.
- **Do** definire ogni colore nuovo in entrambi i temi dentro `globals.css`, mai in
  un solo blocco: chiaro e scuro sono pari grado.
- **Do** riservare 116px più l'area sicura in fondo a ogni pagina che scorre.
- **Do** scrivere a mano la variante `prefers-reduced-motion` di ogni animazione
  che si aggiunge, cambiando il come e non il quando.
- **Do** disegnare le icone in linea nel componente, a tratto 1.7px su
  `currentColor`.
- **Do** far scorrere una tabella dentro il suo pannello quando i dati non ci
  stanno, invece di impilarla in schede.

### Don't:
- **Don't** far somigliare niente a **un'app di scommesse**: niente verdi acidi,
  quote lampeggianti, contatori urlati, effetti da vincita. Le quote di questa lega
  sono eque e senza banco, e devono sembrarlo.
- **Don't** far somigliare niente a **un cruscotto SaaS**: niente raggi da 8–12px,
  gradienti pastello, schede arrotondate ovunque, illustrazioni generiche. I 2px di
  raggio esistono proprio per rifiutarlo.
- **Don't** far somigliare niente a **un'app "divertente"**: niente emoji
  nell'interfaccia, colori a coriandoli, animazioni giocose a ogni tocco, microcopy
  ammiccante. Lo scherzo sta nei testi della Redazione, mai nei pixel.
- **Don't** usare Verde, Ambra o Rosso per qualcosa che non sia un esito.
- **Don't** usare il bianco puro come fondo pagina: il fondo è Carta.
- **Don't** introdurre un secondo colore di marca. Il sistema ha un accento solo, e
  la sua rarità è il punto.
- **Don't** mettere il vetro su un elemento che non galleggia sopra contenuto che
  scorre, né spedirlo senza la ricaduta `@supports`.
- **Don't** ingrossare un bordo per dare importanza: si cambia il tono del fondo.
  L'unico bordo spesso del sistema è la riga da 2px sotto l'intestazione.
- **Don't** usare il maiuscoletto spaziato per titoli, bottoni o frasi: è solo per
  le etichette che nominano un dato.
- **Don't** importare una libreria di icone o di componenti. Il sistema è un solo
  foglio di stile e icone disegnate a mano, e questo è un vincolo di progetto
  (l'app deve restare gratis e leggera), non un'abitudine.

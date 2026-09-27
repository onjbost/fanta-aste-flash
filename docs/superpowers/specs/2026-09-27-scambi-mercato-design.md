# Fantacalciomercato — scambi multipli, rose vere, pezzo con giudizio

## Cosa si vuole

Il form degli scambi oggi accetta un giocatore per parte, scritti a mano, e
produce un annuncio piatto: chi cede cosa, il conguaglio, come restano le
rose. Tre cose da cambiare, decise con l'admin:

1. **Scambi multipli**, fra **due** squadre e con un numero qualsiasi di
   giocatori per parte (2-per-2, 3-per-1). Le triangolazioni restano fuori.
2. **Giocatori selezionabili** dalla rosa della squadra scelta, non digitati.
3. **Un pezzo giornalistico che dà un giudizio** sullo scambio, con la stessa
   levetta cattivo/morbido del pezzo di fine giornata.

E una quarta, arrivata dopo: un campo **note** facoltativo, che serve al
modello per *formarsi* il giudizio e non per essere trascritto nel testo.

Riuscita: l'admin registra uno scambio senza scrivere un nome a mano, legge
un annuncio che suona come la rubrica di fine giornata, e le quote della
giornata dopo sono calcolate sulle rose giuste.

## La decisione che cambia l'app

Finora l'app dichiarava, nel codice e nella pagina, di non gestire gli
scambi: «il registro è Leghe Fantacalcio, qui si scrive solo l'annuncio».
Quella scelta cade, per una ragione che non c'entra col form.

`tipsterServer.ts` legge `v_roster` **dal vivo** a ogni generazione di quote.
Con gli scambi fuori dall'app, le quote della giornata successiva a uno
scambio sono calcolate su rose che non esistono più — e nessuno se ne
accorge, perché l'errore non produce nessun sintomo visibile. Lo stesso vale
per i prezzi che la Redazione usa per il «pagato tanto, reso poco».

Il selettore dei giocatori è quindi l'occasione, non il motivo: un selettore
che legge rose stantie proporrebbe giocatori sulla squadra sbagliata, ma le
quote sbagliate le stiamo già pubblicando adesso.

**Lo schema lo aveva già previsto.** `contracts.acquisition_type` e
`release_type` accettano `'trade'`, `credit_movements.reason` pure, e
`usedChanges` in `rules.ts` conta solo i `flash_75` — quindi uno scambio non
consuma un cambio di ruolo senza toccare una riga di regole. Per il registro
non serve nessuna migrazione: serve solo per ricordarsi *cosa* è stato fatto,
e poterlo disfare.

## Impianto

```
supabase/migrations/0018_scambi.sql   NUOVO   trades + trade_items
src/lib/mercato/scambio.ts            NUOVO   tipi, spunti, prompt, verifica, template
src/lib/mercato/scambioServer.ts      NUOVO   raccolta dati + prova/riprova/ripiego
src/lib/mercato/applicaScambio.ts     NUOVO   l'effetto sul registro, e il suo annullamento
src/app/admin/messaggi/TradeForm.tsx  riscr.  due liste, note, due tempi
src/app/admin/messaggi/actions.ts     tocco   scrivi / conferma / annulla / ritono
src/app/admin/messaggi/page.tsx       tocco   passa le rose e gli scambi recenti
src/lib/messages.ts                   tocco   `msgTrade` accetta N giocatori per parte
src/lib/redazione/modello.ts          —       riusata così com'è
src/lib/redazione/verifica.ts         —       `numeriInventati` riusata così com'è
```

`mercato/` e non `redazione/`: la Redazione racconta ciò che è successo in
campo a partire dai tabellini, questa racconta il mercato a partire dalle
rose. Condividono il trasporto verso il modello e la verifica delle cifre,
che sono già moduli a sé.

## Il registro

```sql
create table trades (
  id                uuid primary key default gen_random_uuid(),
  league_id         uuid not null references leagues(id) on delete cascade,
  from_team_id      uuid not null references teams(id),
  to_team_id        uuid not null references teams(id),
  settlement        int  not null default 0 check (settlement >= 0),
  settlement_payer  text check (settlement_payer in ('from','to')),
  note              text,
  spunti            jsonb not null,
  body              text,
  tono              int,
  applied_at        timestamptz,
  reverted_at       timestamptz,
  created_at        timestamptz not null default now(),
  constraint trades_squadre_diverse check (from_team_id <> to_team_id)
);

create table trade_items (
  trade_id            uuid not null references trades(id) on delete cascade,
  player_id           uuid not null references players(id),
  from_team_id        uuid not null references teams(id),
  contract_closed_id  uuid references contracts(id),
  contract_opened_id  uuid references contracts(id),
  primary key (trade_id, player_id)
);
```

Tre scelte da spiegare.

**Gli spunti si congelano**, come in `news_articles`. Rigenerare la prosa non
ricalcola i fatti: se domani il giocatore si infortuna, il pezzo di ieri
resta il pezzo di ieri.

**`trade_items` tiene gli id dei contratti**, non solo i giocatori. L'annullamento
così non ricostruisce niente per somiglianza: riapre esattamente la riga che
aveva chiuso e chiude esattamente quella che aveva aperto. Uno scambio disfatto
per sbaglio a partire da una ricostruzione è il tipo di bug che si scopre tre
settimane dopo, guardando una rosa che non torna.

**I crediti non si cancellano, si compensano.** `credit_movements` è un
registro di movimenti: l'annullamento aggiunge due righe uguali e contrarie,
con `reason='trade'` e una nota che rimanda allo scambio. Il saldo torna
giusto e la storia resta leggibile.

RLS come le altre tabelle di lega: lettura a chi è nella lega, scrittura solo
all'admin.

## Il form

Due select squadra, come adesso. Sotto ciascuna una lista di giocatori a cui
si aggiunge dalla rosa di *quella* squadra — `v_roster` dà nome, ruolo, club,
quotazione e prezzo pagato, che è quanto basta per riconoscere chi si sta
dando. Bottone «aggiungi giocatore», croce per toglierlo. Cambiare squadra
svuota la sua lista, perché quei giocatori non sono più selezionabili.

Conguaglio e «chi li versa» restano come sono. Il campo **note** è un testo
libero facoltativo, **fino a 600 caratteri**: sono materiale per il
giudizio, non il pezzo, e se diventano più lunghe dei fatti finiscono per
dettare l'articolo.

**Avvisa, non blocca**, se lo scambio è sbilanciato per numero o per ruolo:
le regole della lega le conosce l'admin, non l'app.

**Rifiuta**, questo sì, se un giocatore è impegnato in un lotto di un'asta
aperta o ha una richiesta di svincolo gratuito pendente. Lì due registri si
contraddirebbero, e il vincitore del lotto si troverebbe un contratto su una
squadra che nel frattempo l'ha ceduto.

## Due tempi, e un ritorno

**«Scrivi l'annuncio»** genera il testo e non tocca niente: nessun contratto,
nessun credito. Salva un `trade` con `applied_at` nullo.

**«Conferma lo scambio»** applica: per ogni giocatore chiude il contratto con
`release_type='trade'` e ne apre uno per la squadra che lo riceve, **stesso
prezzo** e `acquisition_type='trade'`. Il prezzo si conserva perché «quanto
l'aveva pagato» è il numero che rende leggibile mezzo campionato — chi l'ha
preso non ha pagato quella cifra, e l'`acquisition_type` lo dice. Il
conguaglio sono due righe in `credit_movements`. Tutto in una transazione.

**«Annulla scambio»** rimette com'era, con le compensazioni descritte sopra.

La separazione esiste perché una svista nel form non deve riscrivere il
registro prima che l'admin abbia letto cosa stava per succedere. La pagina
mostra le rose come resteranno, prima della conferma.

## Il pezzo

Stessa meccanica dell'anteprima: materiale → prompt → modello → verifica →
riprova con le correzioni → ripiego a template.

**Il materiale** (`SpuntiScambio`, tutto da dati veri):

- per ogni giocatore scambiato: nome, ruolo, club, prezzo pagato all'asta,
  quotazione di listone, presenze e fantamedia nelle giornate già importate,
  quante volte schierato titolare da chi lo cede;
- per ogni squadra: posizione e punti in classifica, composizione della rosa
  per ruolo prima e dopo, crediti prima e dopo;
- i divari: prezzo totale, quotazione totale, fantamedia dei titolari ceduti.

Su otto rose costruite con budget uguali questi numeri non producono da soli
un verdetto — per quello serve il modello. Ma gli tolgono la possibilità di
inventarselo.

**Le note come lente.** Nel prompt entrano delimitate ed etichettate come
*contesto noto all'admin, da usare per formarsi il giudizio*: il modello può
alludere a quello che contengono, non trascriverle né elencarle. Due ragioni
per questa forma e non per il «riportale»:

- l'admin non vuole leggere le proprie note nel messaggio, vuole che cambino
  il verdetto — Raimondo ⇄ Yildiz senza note è un furto, con l'infortunio di
  Yildiz non lo è più;
- essendo testo libero che finisce in un prompt, vanno trattate come **fatti
  riportati**, non come istruzioni: «scrivi tutto in maiuscolo» dev'essere
  una frase sullo scambio, non un ordine che scavalca le regole del pezzo.

Il limite da tenere presente: se il modello assorbe la nota senza alludere a
niente, il gruppo legge un verdetto che non sa spiegarsi. Per questo la regola
è «puoi alludere, non puoi trascrivere», e non «taci».

**La verifica** riusa `numeriInventati`. Fra i numeri leciti entrano quelli
degli spunti **e quelli che compaiono nelle note**: una cifra scritta
dall'admin non è una cifra inventata dal modello, e un «fino a gennaio» non
dev'essere bocciato. Si aggiungono due controlli. Sui **nomi**: ogni giocatore
citato dev'essere uno degli scambiati o uno delle due rose. Sulla
**trascrizione**: se otto parole consecutive delle note ricompaiono tali e
quali nel pezzo, il pezzo è scartato — è la misura pratica di «puoi alludere,
non puoi trascrivere», e otto parole sono abbastanza da non far scattare un
falso allarme su una coincidenza di tre o quattro.

La verifica protegge i **fatti**, non il **giudizio**. Se il modello dice una
sciocchezza di merito, la difesa sono la levetta e la rigenerazione. È lo
stesso limite dell'anteprima, e va detto all'admin invece che nascosto.

**Il ripiego** è `msgTrade` allargato a N giocatori per parte: un annuncio
secco, **senza giudizio e senza note**. Un template non ragiona su un
infortunio, e se stampasse le note le trascriverebbe — esattamente ciò che
non si vuole. Quando scatta, l'app lo dice in chiaro: «pezzo di ripiego, il
modello non ha risposto: le note non sono state considerate», così l'admin
rigenera invece di mandare al gruppo un verdetto che ignora l'unica cosa che
contava.

**Il tono** riusa `TONI` e `tono(n)` di `modello.ts`, con i bottoni «più
cattivo» / «più morbido» già in uso nella Redazione.

## Test

Funzioni pure, come tutto il resto:

- **regole**: sbilanciamento per numero e per ruolo → avviso, non errore;
  giocatore in un lotto aperto o con svincolo pendente → rifiuto; squadre
  uguali → rifiuto; conguaglio negativo o non intero → rifiuto.
- **spunti**: i divari calcolati su rose finte; un giocatore senza presenze
  non produce una fantamedia inventata ma un'assenza dichiarata.
- **prompt**: le note compaiono delimitate ed etichettate; nessuna nota →
  nessun blocco vuoto nel prompt.
- **verifica**: cifra non fornita → scartata; cifra presa dalle note →
  accettata; giocatore che non esiste → scartato; nota trascritta alla
  lettera → scartata.
- **applicazione e annullamento** su rose finte: contratti chiusi e riaperti
  esattamente, saldo crediti che torna al valore di partenza, e il fatto che
  nessun `flash_75` venga consumato.
- **caso Raimondo ⇄ Yildiz**: stesso scambio generato due volte, con e senza
  nota sull'infortunio. Gli spunti devono essere identici e il prompt diverso.
  È la prova che le note entrano nel giudizio e non nei fatti.

## Fuori portata

Triangolazioni a tre o più squadre. Scambi di crediti senza giocatori. Una
cronologia pubblica degli scambi per gli allenatori — per ora la vede solo
l'admin. La correzione automatica di uno scambio registrato male: si annulla
e si rifà.

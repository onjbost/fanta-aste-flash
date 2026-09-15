# Anteprima di giornata — il messaggio delle quote pubblicate

Quando l'admin pubblica le quote, l'app manda una notifica secca
(«Giornata 4, si gioca fino a…»). Serve invece un testo da inoltrare nel
gruppo: annuncia che si può giocare e presenta la giornata — classifica,
favorite, scontri caldi — col tono di lega, come il pezzo di fine giornata.

È il gemello anteriore della Redazione: stessa meccanica, tempo verbale
opposto. Là si racconta cos'è successo, qui cosa sta per succedere.

## Impianto

Un secondo generatore accanto a quello esistente, che riusa il minimo
necessario invece di allargare i tipi di quello di fine giornata.

`RichiestaPezzo` presuppone che si sia già giocato: gol, fantapunti,
tabellini, spunti ricavati dai voti. Per un'anteprima non esiste niente di
tutto questo. Allargarlo con campi facoltativi produrrebbe un tipo mezzo
vuoto e un prompt che si biforca — due cose in un'unità sola, che è il modo
in cui i due generatori si rompono a vicenda al primo cambiamento.

```
modello.ts          NUOVO   trasporto: chiedi un JSON a Gemini, toni
anteprima.ts        NUOVO   tipi, prompt, verifica, template, montaggio
anteprimaServer.ts  NUOVO   raccolta dati + prova/riprova/ripiego
scrittore.ts        tocco   la chiamata a Gemini passa da modello.ts
verifica.ts         tocco   `numeriInventati` estratta e riusata
messages.ts         —       non tocca: l'anteprima ha il suo montaggio
admin/schedine/actions.ts   `pubblicaQuote` manda l'anteprima
```

Il pezzo di fine giornata non cambia comportamento: i suoi test restano la
prova che il tocco su `scrittore.ts` e `verifica.ts` non ha spostato niente.

### Cosa si riusa, e perché solo quello

- **`numeriDelTesto`** — l'estrattore dei numeri da controllare, con le sue
  regole su moduli, date e interi piccoli. Pura e generica: si riusa com'è.
- **`leggiJson`** — la ripesca delle graffe quando il modello incarta la
  risposta in un blocco di codice. Generica.
- **La chiamata a Gemini** — oggi è dentro `ScrittoreGemini`, tipizzata su
  `RichiestaPezzo`. Si sfila il trasporto (prompt dentro, JSON fuori,
  timeout, errori) e sopra ci stanno tutti e due i generatori.
- **`TONI`** — la tavola dei toni di lega.

Non si riusa `montaMessaggio`: l'anteprima ha sezioni diverse.

## Il materiale

| Cosa | Da dove | Nota |
| --- | --- | --- |
| classifica | `standings_snapshots`, campionato, ultima giornata archiviata | quella ufficiale della lega, non la nostra |
| sfide | `fixtures` della giornata | campionato e coppa |
| favorita e quota | `odds`, mercato `1x2`, appena pubblicate | è la notizia del messaggio |
| scontri caldi | posizioni in classifica delle due squadre | stesse soglie degli spunti |
| tipster | `v_tipster_classifica` | chi guida il torneo |
| chiusura | `matchdays.lock_at` | un'ora prima della prima partita |

Gli **scontri caldi**, stesse soglie della Redazione:
`alta` entrambe nelle prime tre · `bassa` entrambe nelle ultime tre ·
`prima_ultima` quando il divario è quasi tutta la classifica.

Le quote in chiaro sono **solo l'1X2** del favorito. Tutti e quattro i
mercati farebbero del messaggio un tabellone, e quelli stanno già nell'app.

## Il pezzo che torna dal modello

```ts
interface Anteprima {
  apertura: string;                                   // 3-4 righe
  classifica: string;                                 // un paragrafo
  sfide: { fixtureId: string; testo: string }[];      // 2-3 righe l'una
  chiusura: string;                                   // una riga di lancio
}
```

Il minimo di parole per sfida è **25**: è un lancio, non una cronaca.

## La verifica

Stessa severità del pezzo di fine giornata, perché l'errore che si nota in
un gruppo di fantacalcio è sempre lo stesso — un numero sbagliato.

1. ci sono tutte le sfide, con i `fixtureId` giusti, e nessuna in più;
2. nessuna sfida sotto il minimo di parole;
3. **nessun numero che non gli abbiamo dato**: sono leciti i punti e le
   posizioni di classifica, le quote pubblicate, i punti dei tipster, il
   numero di giornata e di Serie A;
4. niente parole vietate;
5. apertura non vuota.

Come per l'articolo: prova, se boccia riprova dicendogli cosa non andava,
se boccia ancora parte il template. Meglio un messaggio asciutto che
nessun messaggio, e meglio nessun numero inventato che una battuta in più.

## Il montaggio

```
🏆 FANTA MANSARDA · GIORNATA 4
────────────────────────────

[apertura]

📊 COME SIAMO MESSI
   1. DEPORTIVO APERITIVO 9 · 2. FC NTONIA 7 · …
   [paragrafo sulla classifica]

⚽ LE SFIDE
   Borussia Alecchiomund – DEPORTIVO APERITIVO
   favorita: DEPORTIVO APERITIVO @ 1,93 · scontro d'alta classifica
   [due o tre righe]

🎯 TORNEO DEI TIPSTER
   [chi guida e con quanti punti]

🔒 Si gioca fino a venerdì 19 settembre alle 19:30
```

Le sfide di coppa vanno in un blocco a parte con la sua intestazione, come
già fa il riepilogo di fine giornata.

## Dove si innesta

`pubblicaQuote` in `src/app/admin/schedine/actions.ts`, al posto della
notifica attuale. Se la generazione fallisce **le quote restano pubblicate**
e l'azione riporta ok con un avviso: pubblicare e annunciare sono due cose,
e la seconda che va storta non deve annullare la prima.

## Test

Tutti sulle funzioni pure, come per la Redazione.

- il prompt contiene classifica, quote e scontri caldi;
- la verifica boccia un numero inventato, una sfida mancante, una sfida di
  troppo, una sfida troppo corta;
- la verifica **promuove** un pezzo che cita solo numeri dati;
- gli scontri caldi: alta, bassa, prima contro ultima, e nessuno quando non
  ce n'è;
- il template di ripiego produce un messaggio completo e senza numeri
  inventati (si verifica da solo, con la stessa funzione);
- il montaggio separa campionato e coppa;
- i test esistenti della Redazione restano verdi: è la prova che il tocco
  su `scrittore.ts` non ha cambiato comportamento.

# Aste Flash · Fanta Mansarda

Mercato degli svincolati della Lega Fanta Mansarda 2026/27.
Ciclo completo: chiamate, adesioni, sala d'asta in tempo reale, movimenti e
messaggi pronti per il gruppo.

## Cosa c'è dentro

```
supabase/migrations/     schema, viste, policy RLS, rilancio atomico
src/lib/rules.ts         il motore delle regole (funzioni pure)
src/lib/messages.ts      i cinque modelli di messaggio per WhatsApp
src/lib/market.ts        stato di mercato di una squadra, offerte massime
src/lib/settlement.ts    apertura sala, chiusura lotti, movimenti
src/lib/csv.ts           parser CSV del listone Fantacalcio.it
src/app/                 login, rosa, asta, sala, listone, admin
scripts/import.ts        import di listone e rose da CSV
scripts/seed-demo.ts     dati finti per provare l'app subito
```

**Per metterla online gratis: vedi [DEPLOY.md](DEPLOY.md).**

## Avvio in 10 minuti

1. **Crea il progetto Supabase** (free tier) su supabase.com.
2. **Esegui le migrazioni**: SQL Editor → incolla `supabase/migrations/0001_schema.sql`,
   poi `0002_rls.sql`.
3. **Copia le chiavi**: `cp .env.example .env.local` e riempi URL, anon key e service role
   (Project Settings → API).
4. **Installa e avvia**:
   ```bash
   npm install
   npx tsx scripts/seed-demo.ts    # opzionale: 8 squadre e un listone finto
   npm run dev
   ```
5. **Collega il tuo account**: entra con la tua email dalla pagina di login, poi in
   Supabase esegui
   ```sql
   update teams set user_id = (select id from auth.users where email = 'tua@email.it'),
                    email   = 'tua@email.it'
   where name = 'Montester United';
   ```
   Ogni allenatore va collegato così, una volta sola.

## Import dei dati veri

Un solo file: l'export **Lista calciatori** della lega su Leghe Fantacalcio
(`.xlsx` o `.csv`). Contiene già tutto — anagrafica, quotazioni, la
fantasquadra proprietaria e il costo pagato all'asta — quindi da lì l'app
ricava squadre, rose, crediti residui e listone degli svincolati in un colpo.

```bash
npm run import -- --file dati/lista_calciatori.xlsx --dry-run
npm run import -- --file dati/lista_calciatori.xlsx --admin "Montester United"
```

Colonne usate: `#`, `Nome`, `Sq.`, `R.`, `QUOT.`, `Fuori lista`,
`FantaSquadra`, `Costo`. L'ordine non conta, il separatore del CSV nemmeno
(`,` o `;`), e le righe di titolo prima dell'intestazione vengono saltate.

`--dry-run` non scrive niente e stampa il controllo di ogni rosa:

```
Rose:
  ✓ FC NTONIA                25 giocatori (3P 8D 8C 6A) · spesi 490 · residui 10
  ✓ Montester United         25 giocatori (3P 8D 8C 6A) · spesi 499 · residui 1
```

Se una rosa non è 3-8-8-6 o ha sforato i 500 crediti, te lo dice prima di
toccare il database. Fallo sempre girare prima dell'import vero.

Opzioni: `--admin "Nome Squadra"` marca la tua squadra come admin,
`--reset` ricarica rose e crediti da zero (cancella contratti e movimenti,
non il listone). Senza `--reset`, un secondo import aggiorna solo il listone:
quotazioni, club e flag "fuori lista", lasciando intatto il mercato in corso.

## Le regole, in un posto solo

`src/lib/rules.ts` contiene tutta l'interpretazione del regolamento:

| Regola | Funzione |
| --- | --- |
| Rimborso 75% arrotondato per difetto, 100% nei casi straordinari | `refundValue` |
| Cambi 1-3-3-2, più 1 per ruolo dal 1° febbraio, cumulativi | `changesAllowance`, `changesLeft` |
| Gli svincoli gratuiti non consumano il cambio | `refundValue` → `free` |
| Budget = crediti residui + rimborso | `auctionBudget` |
| Crediti aggiornati lotto dopo lotto nella stessa serata | `creditsAfter`, `liveBudget` |
| Scadenze T−5 e T−1 dal calendario | `callsCloseAt`, `joinsCloseAt`, `expectedStatus` |
| Validazione di chiamate e adesioni | `validateCall`, `validateJoin` |
| Base 1 credito, rilancio minimo 1, tetto di budget | `validateBid` |
| Offerte massime automatiche stile eBay | `resolveProxyBid` |
| Richiesta di svincolo gratuito e i suoi due esiti | `freeReleaseEligibility`, `freeReleaseScenarios` |

```bash
npm test          # 132 test
```

E per lo schema, una prova a freddo su un Postgres qualsiasi:

```bash
psql -f supabase/migrations/0001_schema.sql   # …e gli altri tre
psql -f supabase/smoke.sql
```

`smoke.sql` verifica sul database vero i vincoli che contano: base d'asta,
rilancio minimo, tetto di budget, divieto di auto-rilancio, estranei al lotto,
lotto chiuso, svincolando unico per sessione, un solo contratto aperto per
giocatore, listone svincolati coerente. Gira in una transazione e fa rollback:
non lascia niente dietro di sé.

Se la lega cambia una regola, si cambia qui e i test dicono subito cosa si rompe.

## La segretezza non è una convenzione

`0002_rls.sql` impone a livello di database che svincolandi, budget e offerte
massime non siano leggibili da nessuno prima del momento giusto — admin compreso.
L'interfaccia non ha modo di mostrarli, nemmeno per errore.

## Il ciclo di una serata

1. **Chiamata** (fino a T−5): `/asta`, si sceglie lo svincolato e il proprio
   giocatore da mettere sul piatto. L'app valida ruolo, cambi, budget e
   svincolando unico prima di accettare.
2. **Adesione** (fino a T−1): stesso posto, con la possibilità di lasciare
   un'offerta massima che il server userà al posto tuo.
3. **Apertura sala** (admin): i lotti senza contendenti vengono assegnati al
   75%, gli altri entrano in programma e svincolandi e budget diventano
   pubblici.
4. **Rilanci**: `/asta/sala`, timer che riparte a ogni offerta, tetto di budget
   imposto dal server, offerte massime automatiche.
5. **Chiusura**: contratti, crediti, blocco del giocatore uscito e riga
   operativa nella coda dell'admin — tutto in un colpo solo.

## Correzioni e ri-sincronizzazione

`/admin/rose` fa due cose diverse.

**A mano**: cambiare il prezzo d'acquisto di un giocatore, toglierlo dalla rosa
(con o senza restituzione dei crediti), aggiungerne uno preso dagli svincolati.
Ogni modifica genera il movimento di credito che la compensa — cambiare un
prezzo da 40 a 35 accredita 5 crediti alla squadra — e finisce nel registro con
il motivo che hai scritto. Il saldo resta sempre la somma dei movimenti.

**Da file**: carichi un nuovo export della lega e l'app mostra **prima** cosa
cambierebbe, riga per riga: prezzi corretti, cambi di squadra, entrate e uscite
dalle rose, novità nel listone. Niente viene scritto finché non spunti la
conferma. Due caselle separate perché sono rischi diversi: il listone
(quotazioni, club, flag fuori lista) è innocuo, le rose no.

Due protezioni: se il file nomina squadre che non esistono nella lega l'import
si ferma, e se sta per far uscire dalle rose un giocatore **preso in un'asta
flash** te lo segnala in rosso — vuol dire che quel file è stato esportato prima
dell'asta e applicarlo cancellerebbe il risultato del mercato.

## Notifiche Telegram

Solo per l'admin: gli allenatori usano l'app e il gruppo WhatsApp. Il bot manda
nuove chiamate, richieste di svincolo gratuito da decidere (con i due esiti a
confronto), cambi di fase, lotti assegnati con la riga da replicare e la
chiusura della serata.

È in sola uscita — non legge e non accetta comandi — e non è mai bloccante: se
il token manca o Telegram non risponde, l'operazione di mercato va avanti
lo stesso. Configurazione in [DEPLOY.md](DEPLOY.md), verifica dal pulsante
«Mandami una prova» in `/admin`.

## Fuori scopo, per scelta

Scambi diretti tra squadre e asta di riparazione di febbraio **non** sono
gestiti da questa app: restano come li fa la lega oggi. Se un giorno servissero,
il posto dove aggiungerli è `rules.ts` più una tabella `trades`.

## Svincolo gratuito: come funziona

Nell'app c'è **un solo pulsante**, «Richiedi svincolo gratuito». Prove, prognosi e
spiegazioni passano dal gruppo WhatsApp: l'app non chiede allegati.

Appena la richiesta parte, la chiamata o l'adesione collegata passa in
`pending_approval` e resta congelata. L'admin ha tre uscite:

| Decisione | Rimborso | Cambio di ruolo | L'operazione |
| --- | --- | --- | --- |
| **Accetta** | 100% | non consumato | confermata |
| **Declina** | 75% | consumato | confermata |
| **Annulla** | — | — | cancellata: la squadra ne fa un'altra con un giocatore diverso |

Finché è in attesa, budget e contatori si mostrano al 75%: se l'admin approva,
salgono da soli. L'allenatore può anche ritirare la richiesta da sé, e in quel
caso l'operazione torna valida come svincolo ordinario.

Il vincolo `unique(session_id, release_player_id) where status <> 'cancelled'`
fa sì che un'operazione annullata liberi subito il giocatore per una scelta nuova.

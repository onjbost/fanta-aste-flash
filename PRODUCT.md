# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Gli allenatori della Lega Fanta Mansarda** (2ª edizione, stagione 2026/27, otto
squadre). Adulti che si conoscono tutti e si parlano ogni giorno in un gruppo
WhatsApp. Il loro lavoro nell'app: capire cosa possono permettersi, chiamare uno
svincolato, aderire ai lotti degli altri, rilanciare in sala, giocare la schedina
della giornata.

**Scena d'uso confermata:** durante la serata d'asta flash ognuno è a casa
propria, sul proprio telefono, con connessione variabile. Nessuno è nella stessa
stanza. Da qui discendono due fatti non negoziabili: l'interfaccia della sala è
un'interfaccia da telefono a pollice singolo, e chi non riesce a collegarsi deve
poter competere lo stesso — è la ragione per cui l'offerta massima vive sul
server e non nel browser.

**L'admin di lega** (una sola persona, `teams.is_admin`), che è anche chi mantiene
l'app. Il suo lavoro: fare la regia della serata, decidere le richieste di
svincolo gratuito, replicare i movimenti su Leghe Fantacalcio, pubblicare quote e
pezzi della Redazione. Non è un utente di supporto: è il collo di bottiglia
volontario che tiene l'app onesta.

## Product Purpose

L'app fa vivere per intero il **mercato degli svincolati** della lega — chiamata,
adesione, sala d'asta in tempo reale, movimenti di credito, messaggi pronti per il
gruppo — più due torneri paralleli cresciuti sopra la stessa base: il **Torneo dei
Tipster** (quote, schedine, classifiche) e la **Redazione** (tabellino importato,
risultati e schedine che si chiudono da soli, pezzo della giornata scritto e
proposto all'admin).

Esiste perché il regolamento della lega è troppo articolato per essere applicato a
mano su WhatsApp senza litigare: rimborsi al 75%, cambi per ruolo cumulativi, tetti
di budget, svincoli gratuiti, offerte massime. Il successo è che una serata d'asta
finisca senza una sola contestazione aritmetica e senza che l'admin debba fare i
conti.

## Positioning

Un'app di mercato per una singola lega la scrive chiunque. Quello che qui non si
può copiare a parole è **dove vivono le garanzie**: il regolamento sta tutto in
`src/lib/rules.ts` come funzioni pure con i test accanto, e la segretezza (chi
stai svincolando, quanto budget hai, qual è la tua offerta massima) è imposta
dalle policy RLS di Postgres — invisibile anche all'admin fino al momento giusto,
perché l'interfaccia non ha proprio modo di mostrarla.

Il resto della posizione: i crediti non sono un campo aggiornabile ma la somma dei
movimenti, i contratti non si cancellano mai ma si chiudono, il rilancio è una
funzione Postgres che blocca la riga del lotto. Le regole non sono descritte
dall'app: sono imposte dal database.

## Operating Context

- **Il gruppo WhatsApp è il canale ufficiale della lega.** L'app prepara i testi
  da incollare; non li manda e non sostituisce la conversazione.
- **Leghe Fantacalcio resta il registro ufficiale delle rose.** L'app produce la
  riga esatta da replicare lì, e l'import può sempre ri-sincronizzare dall'export
  «Lista calciatori». Il passaggio umano non va rimosso.
- **Le notifiche Telegram sono solo per l'admin**, in sola uscita, mai bloccanti:
  se Telegram non risponde, l'operazione di mercato va avanti lo stesso.
- **Il ciclo di una serata** (quindici in stagione): chiamate fino a T−5 giorni,
  adesioni fino a T−1, apertura sala (i lotti senza contendenti si assegnano al
  75%), rilanci con timer che riparte a ogni offerta, chiusura con contratti,
  crediti e riga operativa in un colpo solo.
- **Il ciclo di una giornata**: quote generate e pubblicate dall'admin, schedine
  chiuse un'ora prima della prima partita vera, tabellino importato dalla pagina
  della lega con un preferito del browser, risultati e schedine risolti da soli,
  pezzo proposto all'admin.

## Capabilities and Constraints

**Ambito confermato:** su misura per Fanta Mansarda oggi, **ma riusabile domani.**
Regole, testi e calendari vanno tenuti configurabili perché un'altra lega possa
adottarlo. Lo schema è già coerente con questa scelta: `leagues` porta
`initial_credits`, `roster_p/d/c/a` e `changes_p/d/c/a` come colonne, non come
costanti nel codice. Ogni nuova regola va aggiunta con lo stesso criterio —
parametro di lega, non numero scritto in mezzo a una pagina.

**Non esiste ancora** (e non va spacciato per esistente): iscrizione di una nuova
lega, onboarding, configurazione del regolamento da interfaccia. Oggi una lega si
crea da SQL e dagli script di import. Se serva farlo davvero, e quando, è
esplicitamente **non deciso**.

**Fuori scopo per scelta della lega:** scambi diretti tra squadre e asta di
riparazione di febbraio restano come li fa la lega oggi. Le notizie non si
pubblicano da sole e non finiscono su WhatsApp senza passare dall'admin.

**Vincoli tecnici:** deve restare gratis — Supabase free tier e Vercel free sono un
vincolo di progetto, non un dettaglio di deploy. Niente scelte che richiedano un
piano a pagamento (vale per hosting, code, storage, immagini e font). Le funzioni
girano a Francoforte (`preferredRegion = 'fra1'`) perché il database è a
eu-central-1: la latenza transatlantica era mezzo secondo a pagina.

**Terminologia della lega, da usare sempre così:** svincolati (mai «free agent»),
listone, svincolando, chiamata, adesione, lotto, sala, cambi per ruolo, crediti,
rimborso, schedina, giocata, sfida, giornata, tabellino, Redazione, Coppa Mansarda.

## Brand Commitments

- **Nome:** «Aste Flash · Fanta Mansarda», abbreviato «Aste Flash». PWA
  `standalone` installabile dal telefono.
- **Lingua: italiano, sempre.** Interfaccia, messaggi, errori, codice e commenti.
  Non è una preferenza di localizzazione: è la lingua della lega.
- **Voce osservata** in README, CHANGELOG e microcopy — frasi brevi e dichiarative,
  si spiega sempre *perché* una cosa è fatta così, si dichiara apertamente cosa è
  «fuori scopo, per scelta», nessun entusiasmo di marketing. Coerente ovunque e
  quindi trattata come vincolante finché l'autore non dice il contrario.
- **Nessuna icona app esiste**: `public/manifest.json` ha `icons: []`.

## Evidence on Hand

- `README.md` e `CHANGELOG.md` (v1.0 28 ago 2026 → v3.0 2 set 2026): la fonte più
  ricca di verità di prodotto del repository.
- 278 test automatici (vitest) più `supabase/smoke.sql`, che verifica sul database
  vero i vincoli d'asta in una transazione con rollback.
- Dati veri: l'export «Lista calciatori» della lega da Leghe Fantacalcio
  (`.xlsx`/`.csv`); calendari Serie A, campionato e Coppa Mansarda importati e
  verificati (380 accoppiamenti, nessun doppione, ritorno speculare).
- `public/redazione-bookmarklet.js`: import della giornata senza custodire
  credenziali della lega.
- Un'interfaccia incumbent coerente e matura in `src/app/` con
  `src/app/globals.css` — mondo visivo già deciso, non ancora registrato in un
  DESIGN.md.
- **Assenze da non colmare inventando:** nessun logo, nessuna immagine, nessuna
  icona, nessun testimonial, nessun numero di adozione, nessuna pagina di
  marketing, nessun prezzo. Se una superficie futura ne ha bisogno, si chiedono.

## Product Principles

1. **L'app propone, la lega decide.** Nessun testo, messaggio, pezzo o movimento
   esce senza che una persona prema invio. WhatsApp resta il canale, Leghe
   Fantacalcio resta il registro.
2. **La segretezza è imposta dal database, non dall'interfaccia.** Se un dato non
   deve vedersi, la UI non deve nemmeno poterlo chiedere.
3. **Il regolamento vive in un posto solo, e i suoi numeri sono parametri di
   lega.** Una regola che cambia si cambia lì, e i test dicono subito cosa si rompe.
4. **Niente si cancella.** I crediti sono la somma dei movimenti, i contratti si
   chiudono invece di sparire, il grezzo di ogni import resta salvato.
5. **Restare gratis è un vincolo di progetto**, e vale per ogni scelta futura,
   anche di design.

## Accessibility & Inclusion

La lega non ha stabilito uno standard formale — resta **non deciso**. Quello che è
confermato viene dalla scena d'uso: si usa dal telefono, spesso in fretta e con
una mano, mentre succede altro. Bersagli grandi, numeri leggibili a colpo d'occhio
e nessuna azione irreversibile a un tocco solo sono requisiti d'uso, non
raffinatezze. Il codice esistente tiene già `lang="it"`, focus visibili e
`aria-current`/`aria-label` sulla navigazione: da preservare.

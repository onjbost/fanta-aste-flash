# Metterla online, a costo zero

Tre servizi, tutti nel piano gratuito, nessuna carta di credito richiesta:

| Servizio | A cosa serve | Piano | Limiti che ti riguardano |
| --- | --- | --- | --- |
| **Supabase** | database, login, realtime | Free | 500 MB di database, 50.000 utenti/mese. **Il progetto va in pausa dopo 7 giorni senza attività** — ci pensa il cron |
| **Vercel** | hosting dell'app | Hobby | 1 cron al giorno, uso non commerciale. Perfetto |
| **GitHub** | il codice | Free | repository privata |

Per otto persone che fanno quindici aste in una stagione, questi numeri sono
enormemente sovradimensionati. Non pagherai mai niente.

---

## 1 · Supabase (10 minuti)

1. Vai su **supabase.com** → *Start your project* → entra con GitHub.
2. *New project*: nome `fanta-mansarda`, regione **Frankfurt (eu-central-1)** —
   è la più vicina, l'asta live ne guadagna. Scegli una password del database e
   salvala.
3. Aspetta due minuti che il progetto sia pronto.
4. **SQL Editor** → *New query*: incolla il contenuto di
   `supabase/migrations/0001_schema.sql` e premi *Run*. Poi ripeti con
   `0002_rls.sql`, `0003_auction.sql` e `0004_admin.sql`, in quest'ordine.
5. **Project Settings → API**: copia `Project URL`, `anon public` e
   `service_role`. Servono al punto 3.
6. **Authentication → Providers → Email**: lascia acceso *Enable email provider*
   e spegni *Confirm email* (il magic link fa già da conferma).
7. **Authentication → URL Configuration**: in *Site URL* metterai l'indirizzo
   Vercel dopo il punto 2; per adesso `http://localhost:3000`.

## 2 · Vercel (5 minuti)

1. Metti il codice su GitHub:
   ```bash
   git init && git add . && git commit -m "Aste flash"
   gh repo create fanta-aste-flash --private --source=. --push
   ```
   (senza `gh`: crea la repo dal sito e fai `git remote add origin ... && git push -u origin main`)
2. Vai su **vercel.com** → *Add New → Project* → importa la repo.
3. In *Environment Variables* incolla:
   ```
   NEXT_PUBLIC_SUPABASE_URL      = https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ...
   SUPABASE_SERVICE_ROLE_KEY     = eyJ...
   NEXT_PUBLIC_SITE_URL          = https://fanta-aste-flash.vercel.app
   CRON_SECRET                   = una-frase-a-caso-lunga
   ```
   (le due variabili di Telegram sono facoltative, vedi il punto 3)
   `NEXT_PUBLIC_SITE_URL` è l'indirizzo che Vercel ti assegna: puoi metterlo
   subito, lo conosci già dal nome del progetto.
4. *Deploy*. In un minuto l'app è online.
5. Torna su Supabase → **Authentication → URL Configuration** e metti
   quell'indirizzo in *Site URL*, e `https://.../auth/callback` tra le
   *Redirect URLs*.

Il file `vercel.json` configura già il cron giornaliero: allinea le fasi delle
aste, prepara i riepiloghi e tiene sveglio il database di Supabase.

## 3 · Le notifiche Telegram (5 minuti, facoltative)

Servono solo a te: gli altri allenatori non installano niente.

1. Su Telegram scrivi a **@BotFather** → `/newbot` → scegli nome e username.
   Ti dà un token tipo `123456:AA...`.
2. **Scrivi almeno un messaggio al tuo bot** (un "ciao" basta): finché non lo
   fai, non può risponderti.
3. Apri `https://api.telegram.org/bot<IL_TUO_TOKEN>/getUpdates` nel browser e
   cerca `"chat":{"id":123456789`. Quello è il tuo chat id.
4. Su Vercel aggiungi:
   ```
   TELEGRAM_BOT_TOKEN     = 123456:AA...
   TELEGRAM_ADMIN_CHAT_ID = 123456789
   ```
5. Rifai il deploy, poi da `/admin` premi **«Mandami una prova»**.

Riceverai: nuove chiamate, richieste di svincolo gratuito da decidere con i due
esiti a confronto, cambi di fase delle aste, lotti assegnati con la riga da
replicare, chiusura della serata. Il bot è in sola uscita: non legge, non
accetta comandi, e se Telegram è irraggiungibile l'app va avanti lo stesso.

## 4 · I dati (5 minuti)

In locale, con `.env.local` compilato:

```bash
npm install
npx tsx scripts/seed-demo.ts            # per provare con dati finti
# oppure, con l'export vero della lega:
npm run import -- --file dati/lista_calciatori.xlsx --dry-run
npm run import -- --file dati/lista_calciatori.xlsx --admin "Montester United"
```

Poi collega ogni allenatore alla sua squadra. Ognuno entra una volta dalla
pagina di login con la propria email, e tu esegui in Supabase:

```sql
update teams
   set user_id = (select id from auth.users where email = 'suo@indirizzo.it'),
       email   = 'suo@indirizzo.it'
 where name = 'Nome Squadra';
```

Per te aggiungi anche `is_admin = true`.

## 5 · Sul telefono

Aprono l'indirizzo in Safari o Chrome → *Aggiungi a schermata Home*. Da lì
l'app parte a schermo intero come una qualsiasi altra, e le notifiche del
browser funzionano.

---

## Cose da sapere

**La pausa di Supabase.** I progetti gratuiti si fermano dopo 7 giorni senza
attività, e le aste flash sono ogni due settimane. Il cron giornaliero fa una
query proprio per questo. Se disattivi il cron, ricordati che dopo una pausa il
progetto va risvegliato a mano dalla dashboard (ci mette un minuto, non si
perde nulla).

**Un solo cron al giorno.** È il limite del piano Hobby, ed è il motivo per cui
l'app non si fida dello stato salvato: la fase di ogni asta (chiamate aperte,
adesioni, chiuso) viene ricalcolata dall'orologio a ogni caricamento di pagina.
Il cron serve solo a persistere lo stato e a preparare i riepiloghi.

**Il service role.** La chiave `service_role` scavalca tutte le regole di
sicurezza: sta solo nelle variabili d'ambiente di Vercel, mai nel codice, mai
nel browser. Se pensi che sia trapelata, rigenerala da Supabase e aggiornala
su Vercel.

**Backup.** Supabase Free non fa backup automatici. Prima di ogni asta importante
puoi scaricarti i dati con *Database → Backups → Download* oppure, più
semplice, tenere il CSV delle rose aggiornato: da quello si ricostruisce tutto.

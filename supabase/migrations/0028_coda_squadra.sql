-- =====================================================================
-- La coda operativa raggruppata per squadra
-- =====================================================================
-- `admin_tasks` è la coda operativa dell'admin da sempre: cosa riportare
-- a mano su Leghe Fantacalcio, una riga per movimento. Aveva già `done` e
-- `done_at`, ma niente nell'app li scriveva mai — tranne l'annullamento di
-- un lotto — e la coda non si svuotava: il 1º ottobre c'erano ancora in
-- attesa quattro richieste di svincolo del 1º settembre, decise da un mese.
--
-- Da qui le due viste. Il raggruppamento per squadra è la parte che chiede
-- il database: il lavoro si fa una rosa per volta — aprire la rosa di una
-- squadra e fare i suoi movimenti — e saltare fra due squadre è il modo di
-- svincolare il giocatore sbagliato. È la stessa ragione per cui l'elenco
-- da copiare era già diviso per squadra.
--
-- La colonna resta nullable: una riga della coda non è obbligata a
-- riguardare una squadra sola (un avviso generico non ne riguarda nessuna),
-- e quelle finiscono in fondo sotto «Senza squadra».
-- =====================================================================

alter table admin_tasks add column if not exists team_id uuid references teams(id) on delete set null;

comment on column admin_tasks.team_id is
  'La squadra la cui rosa va toccata. Nullable: le righe che non riguardano una squadra sola stanno in fondo.';

create index if not exists admin_tasks_coda on admin_tasks (league_id, done, team_id);

-- ------------------------------------------------- le righe già scritte
/*
 * Il travaso delle righe vecchie.
 *
 * Il nome della squadra è dentro la frase, scritto uguale a come sta in
 * `teams`: «Nella rosa FC Joga Benito: svincolare …» per le aggiudicazioni,
 * «Svincolo gratuito da decidere · Montester United: …» per le richieste.
 * Si aggancia per contenimento del nome. Oggi nessuno degli otto nomi di
 * questa lega è contenuto in un altro, ma il nome più lungo vince comunque,
 * a parità l'id: se un domani una squadra si chiamasse «FC» la riga
 * andrebbe alla squadra giusta e non a caso, che è il modo in cui una
 * migrazione resta vera anche dopo.
 *
 * Idempotente: tocca solo le righe che non hanno ancora la squadra, quindi
 * rilanciarla non cambia niente. Nessuna fretta se qualche riga resta
 * fuori — finisce sotto «Senza squadra», che è esattamente dov'era prima.
 */
update admin_tasks t
   set team_id = (
         select s.id from teams s
          where s.league_id = t.league_id
            and position(s.name in t.body) > 0
          order by length(s.name) desc, s.id
          limit 1
       )
 where t.team_id is null
   and exists (
         select 1 from teams s
          where s.league_id = t.league_id
            and position(s.name in t.body) > 0
       );

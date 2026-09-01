-- =====================================================================
-- Schedine: la condivisione diventa una scelta di chi le gioca
-- =====================================================================
-- Prima erano pubbliche per regolamento. Adesso ogni schedina nasce
-- privata e il suo allenatore decide se mostrarla agli altri, schedina
-- per schedina: si può condividere quella in cui si è stati bravi e
-- tenersi la prossima.
--
-- Nota per l'admin: da qui in poi nemmeno lui vede le schedine altrui
-- non condivise. È voluto — l'admin gioca il campionato come tutti, e un
-- occhio in più sarebbe un vantaggio.
-- =====================================================================

alter table slips
  add column if not exists shared boolean not null default false;

comment on column slips.shared is
  'true quando l''allenatore ha deciso di mostrarla agli altri';

-- La bandiera di lega resta, ma cambia mestiere: non rende più pubbliche
-- le schedine da subito, le apre a tutti **dopo la chiusura**. Spenta di
-- default: la regola ora è la scelta del singolo.
alter table leagues alter column tipster_slips_public set default false;
update leagues set tipster_slips_public = false where tipster_slips_public;

comment on column leagues.tipster_slips_public is
  'se accesa, a schedine chiuse tutte diventano visibili anche se non condivise';

-- ------------------------------------------------------------------ RLS
drop policy if exists "la lega legge le schedine" on slips;
create policy "la lega legge le schedine" on slips
  for select using (
    league_id = my_league_id() and (
      team_id = my_team_id()
      or shared
      or (
        (select tipster_slips_public from leagues where id = league_id)
        and exists (select 1 from matchdays m where m.id = matchday_id and now() >= m.lock_at)
      )
    ));

drop policy if exists "la lega legge le giocate" on picks;
create policy "la lega legge le giocate" on picks
  for select using (exists (
    select 1 from slips s
     where s.id = slip_id and s.league_id = my_league_id() and (
       s.team_id = my_team_id()
       or s.shared
       or (
         (select tipster_slips_public from leagues where id = s.league_id)
         and exists (select 1 from matchdays m where m.id = s.matchday_id and now() >= m.lock_at)
       )
     )));

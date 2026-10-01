-- =====================================================================
-- Prove del travaso della coda operativa: a quale squadra va una riga
-- =====================================================================
-- La 0028 aggancia le righe già scritte alla squadra leggendo il nome
-- dentro la frase. La regola «il nome più lungo vince» esiste per un caso
-- che oggi non c'è e domani può esserci: una squadra il cui nome è contenuto
-- in quello di un'altra. Senza quella regola la riga andrebbe a caso.
--
-- La prova esegue il file della migrazione, non una copia delle sue
-- istruzioni: si lancia quindi da dentro `supabase/tests/`, o comunque da
-- dove `\ir ../migrations/...` risolve.
--
-- Si eseguono su un database con tutte le migrazioni applicate, e finiscono
-- con un rollback — non lasciano niente dietro.
--
--   psql -d fanta -f supabase/tests/coda.sql
--
-- Ogni `assert` che salta ferma tutto e dice cosa non torna.
-- =====================================================================

begin;

insert into leagues (id, name, season) values
  ('11111111-1111-1111-1111-111111111111', 'Prova', '2026/27'),
  ('11111111-1111-1111-1111-111111111112', 'Altra lega', '2026/27');

insert into teams (id, league_id, name, manager_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'FC', 'Mattia'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'FC NTONIA', 'Teo'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Qarabaggio', 'Ale'),
  /*
   * Un'omonima in un'altra lega, con un id che ordina PRIMA di quella di
   * qui. L'id piccolo è il punto: a parità di nome vince il primo per id,
   * quindi se il travaso si dimenticasse di filtrare per lega la riga
   * finirebbe alla squadra sbagliata e la prova lo direbbe. Con un id più
   * grande passerebbe per caso.
   */
  ('00000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111112', 'Qarabaggio', 'Altro');

insert into admin_tasks (id, league_id, body) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Nella rosa FC NTONIA: svincolare BOGA (+1 cr), acquistare OSMAJIC per 1 cr.'),
  ('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Nella rosa FC: svincolare TIZIO (+1 cr), acquistare CAIO per 1 cr.'),
  ('dddddddd-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Svincolo gratuito da decidere · Qarabaggio: NERES (A)'),
  -- nessuna squadra nominata: resta senza, ed è giusto così
  ('dddddddd-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Controllare i crediti della lega prima dell''asta'),
  -- già assegnata a mano: il travaso non la tocca
  ('dddddddd-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'Nella rosa FC NTONIA: una riga già agganciata a un''altra squadra');

update admin_tasks set team_id = 'aaaaaaaa-0000-0000-0000-000000000003'
  where id = 'dddddddd-0000-0000-0000-000000000005';

-- ------------------------------------------------- il travaso della 0028
-- La migrazione vera, non una sua copia: ricopiarla qui vorrebbe dire
-- provare la copia, e il file potrebbe cambiare senza che la prova se ne
-- accorga.
\ir ../migrations/0028_coda_squadra.sql

do $$
declare v uuid;
begin
  select team_id into v from admin_tasks where id = 'dddddddd-0000-0000-0000-000000000001';
  assert v = 'aaaaaaaa-0000-0000-0000-000000000002',
    'il nome più lungo deve vincere: «FC NTONIA» contiene «FC»';

  select team_id into v from admin_tasks where id = 'dddddddd-0000-0000-0000-000000000002';
  assert v = 'aaaaaaaa-0000-0000-0000-000000000001',
    'una riga che nomina solo «FC» va a «FC»';

  select team_id into v from admin_tasks where id = 'dddddddd-0000-0000-0000-000000000003';
  assert v = 'aaaaaaaa-0000-0000-0000-000000000003',
    'anche le richieste di svincolo si agganciano, e alla squadra della propria lega';

  select team_id into v from admin_tasks where id = 'dddddddd-0000-0000-0000-000000000004';
  assert v is null,
    'una riga che non nomina nessuna squadra resta senza squadra';

  select team_id into v from admin_tasks where id = 'dddddddd-0000-0000-0000-000000000005';
  assert v = 'aaaaaaaa-0000-0000-0000-000000000003',
    'il travaso non tocca le righe che hanno già una squadra';
end $$;

-- ------------------------------------- rilanciarla non cambia niente
-- Una migrazione si rilancia: per sbaglio, o perché il deploy di prima si è
-- fermato a metà. Qui si fotografa, si rilancia davvero, e si confronta.
create temporary table prima_del_bis as
  select id, team_id from admin_tasks;

\ir ../migrations/0028_coda_squadra.sql

do $$
declare quante int;
begin
  select count(*) into quante
    from admin_tasks a join prima_del_bis p on p.id = a.id
   where a.team_id is distinct from p.team_id;
  assert quante = 0, 'la migrazione è idempotente: rilanciarla non deve cambiare niente';
end $$;

-- --------------------------------- la squadra sparita non porta via la riga
do $$
declare v uuid; quante int;
begin
  delete from teams where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into quante from admin_tasks where id = 'dddddddd-0000-0000-0000-000000000002';
  assert quante = 1, 'cancellare una squadra non deve cancellare la riga della coda';
  select team_id into v from admin_tasks where id = 'dddddddd-0000-0000-0000-000000000002';
  assert v is null, 'la riga resta, senza squadra: «on delete set null»';
end $$;

rollback;

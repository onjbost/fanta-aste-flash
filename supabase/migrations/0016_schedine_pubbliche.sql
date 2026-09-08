-- =====================================================================
-- Torneo dei Tipster: le schedine tornano pubbliche, sempre
-- =====================================================================
-- La 0010 aveva fatto il contrario: ogni schedina nasceva privata e il suo
-- allenatore decideva se mostrarla. All'uso non ha funzionato — quasi nessuno
-- premeva il tasto, la tab «Giocate degli altri» restava vuota, e il torneo
-- perdeva la parte che lo rende divertente, cioè vedere cosa ha giocato la
-- gente.
--
-- Adesso una schedina è pubblica dal momento in cui viene salvata.
--
-- Va detto chiaro perché è una scelta con un prezzo: chi gioca per ultimo
-- vede le giocate di tutti gli altri prima di decidere le sue. È un vantaggio
-- reale, e nessuno lo impedisce. Si accetta perché questa competizione è per
-- divertimento e non assegna premi, e perché una tab vuota costa più di un
-- furbo. Se un domani il torneo dovesse valere qualcosa, la risposta non è
-- tornare alla scelta del singolo ma aprire le schedine **alla chiusura**:
-- `leagues.tipster_slips_public` esiste già per quello.
-- =====================================================================

-- La colonna resta per un giro, così l'app vecchia in produzione continua a
-- funzionare mentre Vercel ridistribuisce: chi legge `shared` lo trova true,
-- chi filtra `shared = true` trova tutto. Si toglierà a deploy assestato.
alter table slips alter column shared set default true;
update slips set shared = true where not shared;

comment on column slips.shared is
  'residuo della condivisione a scelta: adesso è sempre true e nessuno la scrive più. Da rimuovere quando il deploy è assestato.';

-- ------------------------------------------------------------------ RLS
-- Le schedine della lega si leggono e basta. Niente più eccezioni da tenere
-- allineate fra policy, query e interfaccia: erano tre posti dove la stessa
-- regola poteva divergere.
drop policy if exists "la lega legge le schedine" on slips;
create policy "la lega legge le schedine" on slips
  for select using (league_id = my_league_id());

drop policy if exists "la lega legge le giocate" on picks;
create policy "la lega legge le giocate" on picks
  for select using (exists (
    select 1 from slips s where s.id = slip_id and s.league_id = my_league_id()
  ));

-- ---------------------------------------------------------------------
-- I pezzi della Redazione: più corti
-- ---------------------------------------------------------------------
-- 150 parole a partita facevano messaggi che su WhatsApp nessuno finiva di
-- leggere. Il minimo scende a 70: resta il pavimento sotto cui la verifica
-- boccia il pezzo, non un obiettivo da centrare.
alter table leagues alter column redazione_min_parole set default 70;
update leagues set redazione_min_parole = 70 where redazione_min_parole > 70;

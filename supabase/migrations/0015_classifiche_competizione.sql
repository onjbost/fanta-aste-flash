-- =====================================================================
-- Le classifiche: una competizione sola per fotografia
-- =====================================================================
-- Al primo import di coppa i due gironi sono finiti archiviati come
-- campionato, accanto alla classifica vera del campionato. Non un errore
-- visibile: otto righe in più, con le stesse squadre e punteggi diversi,
-- dentro la tabella su cui il pezzo costruisce posizioni e sorpassi.
--
-- La causa sta nell'estrattore ed è corretta lì. Ma il dato sbagliato è
-- passato perché nessuno, lungo la strada, si è chiesto se avesse senso: il
-- campionato **non ha gironi**, e una riga di campionato con un gruppo è una
-- riga di cui abbiamo perso la competizione.
--
-- Quel controllo adesso lo fa il database, che è l'unico posto dove non lo si
-- può dimenticare.
-- =====================================================================

-- Prima si toglie quello che c'è già di sbagliato: sono i gironi di coppa
-- travestiti da campionato. Si cancellano invece di correggerli perché la
-- giornata a cui erano attaccati era pure quella sbagliata — il turno di
-- coppa non cade nella giornata di fanta con lo stesso numero. Si rifà
-- l'import della coppa e tornano al posto giusto.
delete from standings_snapshots
where competition = 'campionato' and group_name <> '';

alter table standings_snapshots
  add constraint standings_snapshots_gironi_check
  check (group_name = '' or competition = 'coppa');

comment on constraint standings_snapshots_gironi_check on standings_snapshots is
  'solo la coppa ha i gironi: una riga di campionato con un gruppo vuol dire competizione persa per strada';

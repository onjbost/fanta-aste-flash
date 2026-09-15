-- =====================================================================
-- Quote: quanto pesa il listone contro quello che è successo davvero
-- =====================================================================
-- Fin qui il motore stimava una squadra dalle sole quotazioni della sua rosa,
-- come se non si fosse ancora giocato. Con tre giornate in archivio la media
-- fantapunti andava già da 66 a 80: due gol di differenza sulla scala del
-- fanta, che le quote ignoravano.
--
-- Adesso la stima da listone si fonde con la media delle giornate giocate.
-- Questa colonna dice quante giornate «vale» il listone in quella fusione:
--
--   base usata = (giornate giocate × media sul campo + peso × base listone)
--                ────────────────────────────────────────────────────────────
--                              giornate giocate + peso
--
-- A 4, con quattro giornate in archivio rosa e campo contano uguale; più in
-- alto le quote restano ancorate alle rose, più in basso seguono la forma.
--
-- Il 4 non è a sentimento: sui dati veri della lega la differenza di forza
-- fra le squadre vale circa 2,8 fantapunti di deviazione contro un rumore di
-- giornata di circa 6, e il rapporto fra le due varianze cade poco sopra il 4.
-- Va rivisto quando ci saranno più giornate — ed è una colonna, non una
-- costante nel codice, proprio perché si possa rivedere senza un deploy.
-- =====================================================================

alter table leagues
  add column if not exists tipster_peso_listone numeric(4,1) not null default 4
  check (tipster_peso_listone >= 0 and tipster_peso_listone <= 40);

comment on column leagues.tipster_peso_listone is
  'quante giornate vale la stima da listone quando si fonde con i fantapunti realizzati: 0 = si guarda solo il campo, alto = si resta ancorati alle rose';

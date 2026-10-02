import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseAdmin } from '@/lib/supabase';
import { ultimaGazzetta, ultimaGazzettaDiMercato } from '@/lib/gazzetta/gazzettaServer';
import { indiceFoto } from '@/lib/gazzetta/newsServer';
import { TopBar } from '../../TopBar';
import { Editor, type FotoScelta } from './Editor';
import { AggiornaFoto, Genera, GeneraChiusura, GeneraRumors } from './Genera';
import { scambiPerLaGazzetta } from '@/lib/gazzetta/mercatoChiusoServer';
import { AzioniGruppo } from '../AzioniGruppo';

export const dynamic = 'force-dynamic';

function quando(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('it-IT', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

export default async function GazzettaPage({ searchParams }: {
  searchParams: Promise<{ giornata?: string; tipo?: string; sessione?: string }>;
}) {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const db = supabaseAdmin();
  const { giornata, tipo: tipoGrezzo, sessione } = await searchParams;
  const tipo: 'settimanale' | 'coppa' | 'fantamercato' | 'mercato_chiuso' =
    tipoGrezzo === 'coppa' ? 'coppa'
      : tipoGrezzo === 'fantamercato' ? 'fantamercato'
        : tipoGrezzo === 'mercato_chiuso' ? 'mercato_chiuso'
          : 'settimanale';
  // le due edizioni di mercato si scelgono per sessione d'asta, non per
  // giornata: cambia quando escono, non da dove leggono
  const chiuso = tipo === 'mercato_chiuso';
  const diMercato = tipo === 'fantamercato' || chiuso;

  /*
   * Le sessioni d'asta che hanno già delle chiamate.
   *
   * L'edizione di mercato esce a chiamate chiuse, ma l'elenco non filtra
   * sullo stato: offrirla anche a chiamate aperte serve a provarla, e
   * l'admin vede comunque lo stato accanto al numero. Quello che non si può
   * fare è generarla su una sessione vuota, e quelle infatti non compaiono.
   */
  const { data: sessioni } = diMercato
    ? await db.from('auction_sessions')
      .select('id, number, status, auction_at, lots(id, winner_team_id)')
      .eq('league_id', ctx.team.leagueId).order('number', { ascending: false })
    : { data: null };

  type LottoBreve = { id: string; winner_team_id: string | null };
  const elencoSessioni = (sessioni ?? [])
    .filter((x) => Array.isArray(x.lots) && x.lots.length > 0)
    .map((x) => {
      const lotti = x.lots as unknown as LottoBreve[];
      return {
        id: x.id as string, numero: x.number as number, stato: x.status as string,
        chiamate: lotti.length,
        assegnati: lotti.filter((l) => l.winner_team_id).length,
      };
    })
    // il mercato chiuso ha senso solo dove qualcosa è stato assegnato: una
    // sessione ancora da giocare darebbe un bottone che fallisce
    .filter((x) => !chiuso || x.assegnati > 0);

  const sessioneScelta = elencoSessioni.find((x) => x.id === sessione) ?? elencoSessioni[0] ?? null;

  /*
   * Solo le giornate che hanno un risultato: sulle altre non c'è niente da
   * raccontare, e offrirle vorrebbe dire offrire un bottone che fallisce.
   *
   * Si parte dalle sfide e non dalle giornate con un `inner join` filtrato:
   * la giuntura funzionerebbe, ma dipende da come PostgREST tratta un filtro
   * su una colonna che non è nella select — e una svista lì si manifesterebbe
   * come un elenco silenziosamente vuoto.
   */
  const { data: conRisultato } = await db.from('fixtures')
    .select('matchday_id').eq('league_id', ctx.team.leagueId)
    .eq('competition', tipo === 'coppa' ? 'coppa' : 'campionato')
    .not('home_goals', 'is', null);
  const giocate = new Set((conRisultato ?? []).map((f) => f.matchday_id as string));

  const { data: giornate } = await db.from('matchdays')
    .select('id, fanta, serie_a').eq('league_id', ctx.team.leagueId)
    .not('fanta', 'is', null).order('fanta', { ascending: false });

  const elenco = (giornate ?? [])
    .filter((m) => giocate.has(m.id as string))
    .map((m) => ({ id: m.id as string, fanta: m.fanta as number, serieA: m.serie_a as number }));

  const scelta = elenco.find((m) => m.id === giornata) ?? elenco[0] ?? null;
  const gazzetta = diMercato
    ? await ultimaGazzettaDiMercato(ctx.team.leagueId, chiuso ? 'mercato_chiuso' : 'fantamercato')
    : scelta ? await ultimaGazzetta(scelta.id, tipo as 'settimanale' | 'coppa') : null;

  // gli scambi da spuntare: solo per il mercato chiuso, e solo se c'è una
  // sessione scelta — altrimenti è una lettura inutile a ogni caricamento
  const scambi = chiuso && sessioneScelta
    ? (await scambiPerLaGazzetta(sessioneScelta.id)).map((x) => ({
      id: x.id, quando: x.quando, squadraA: x.squadraA, squadraB: x.squadraB,
      versoA: x.versoA, versoB: x.versoB, dallUltimaAsta: x.dallUltimaAsta,
    }))
    : [];

  // le foto fra cui l'admin può scegliere: le più recenti, con le misure
  // già lette al momento della raccolta — cambiare foto nell'editor
  // ricalcola la disposizione senza toccare la rete
  const foto: FotoScelta[] = gazzetta
    ? (await indiceFoto()).slice(0, 24).map((a) => ({
      src: a.immagine,
      larghezza: a.larghezza, altezza: a.altezza,
      provenienza: a.titolo,
    }))
    : [];

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin active="admin" />

      <p className="eyebrow">La Gazzetta della Mansarda</p>
      <h1>La prima pagina</h1>
      <AzioniGruppo pagina="/admin/gazzetta" />
      <p className="sub">
        Sostituisce il messaggione: stesso tono, impaginato perché si capisca in
        tre secondi. I testi li puoi correggere qui, e il PNG si disegna da
        quello che salvi — non da una copia fatta prima.
      </p>

      <form className="gaz-scelta-giornata">
        <label>
          Edizione
          <select name="tipo" defaultValue={tipo}>
            <option value="settimanale">Campionato</option>
            <option value="coppa">Coppa Mansarda</option>
            <option value="fantamercato">Fantamercato · indiscrezioni</option>
            <option value="mercato_chiuso">Fantamercato · mercato chiuso</option>
          </select>
        </label>
        {diMercato ? (
          <label>
            Sessione
            <select name="sessione" defaultValue={sessioneScelta?.id ?? ''}>
              {elencoSessioni.map((x) => (
                <option key={x.id} value={x.id}>
                  Sessione {x.numero} — {chiuso
                    ? `${x.assegnati} ${x.assegnati === 1 ? 'asta assegnata' : 'aste assegnate'}`
                    : `${x.chiamate} chiamate`} ({x.stato})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Giornata
            <select name="giornata" defaultValue={scelta?.id ?? ''}>
              {elenco.map((m) => (
                <option key={m.id} value={m.id}>
                  Giornata {m.fanta} (Serie A {m.serieA})
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="ghost">Cambia</button>
      </form>

      {!diMercato && !scelta && (
        <p className="vuoto">
          Nessuna giornata di {tipo === 'coppa' ? 'coppa' : 'campionato'} con il
          tabellino: importala prima dalla Redazione.
        </p>
      )}
      {diMercato && !sessioneScelta && (
        <p className="vuoto">
          {chiuso
            ? 'Nessuna sessione d\u2019asta con dei lotti assegnati: il mercato chiuso esce quando la sala ha chiuso.'
            : 'Nessuna sessione d\u2019asta con delle chiamate: le indiscrezioni si scrivono su quelle.'}
        </p>
      )}

      {(diMercato ? sessioneScelta : scelta) && (
        <>
          {chiuso && sessioneScelta
            ? <GeneraChiusura sessionId={sessioneScelta.id} esiste={Boolean(gazzetta)} scambi={scambi} />
            : diMercato && sessioneScelta
              ? <GeneraRumors sessionId={sessioneScelta.id} esiste={Boolean(gazzetta)} />
              : scelta && <Genera matchdayId={scelta.id} esiste={Boolean(gazzetta)} tipo={tipo === 'coppa' ? 'coppa' : 'settimanale'} />}
          <AggiornaFoto />

          {gazzetta && (
            <>
              <p className="gaz-stato">
                Versione {gazzetta.versione}, scritta da {gazzetta.provider}
                {gazzetta.modello ? ` (${gazzetta.modello})` : ''} il {quando(gazzetta.generataIl)}
                {gazzetta.modificataIl ? ` · corretta il ${quando(gazzetta.modificataIl)}` : ''}
                {gazzetta.inviataIl ? ` · mandata il ${quando(gazzetta.inviataIl)}` : ''}
              </p>

              {/*
                * La `key` è l'id della gazzetta, e non è un dettaglio.
                *
                * L'editor tiene i testi in uno stato suo, avviato da
                * `iniziali`; un valore iniziale React lo legge **solo al
                * montaggio**. Senza key, rigenerando la pagina il server
                * mandava la versione nuova ma il componente restava montato
                * con i testi della vecchia: in alto si leggeva «versione 5
                * scritta da gemini» e sotto c'era ancora il testo di ripiego
                * della 4. Una versione nuova è una riga nuova, quindi un id
                * nuovo, quindi un editor nuovo.
                */}
              <Editor
                key={gazzetta.id}
                id={gazzetta.id}
                iniziali={gazzetta.dati}
                foto={foto}
                problemi={gazzetta.verifica?.problemi ?? []}
                modificataIl={gazzetta.modificataIl}
                inviataIl={gazzetta.inviataIl}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

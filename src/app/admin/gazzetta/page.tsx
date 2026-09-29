import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseAdmin } from '@/lib/supabase';
import { ultimaGazzetta, ultimaGazzettaDiMercato } from '@/lib/gazzetta/gazzettaServer';
import { indiceFoto } from '@/lib/gazzetta/newsServer';
import { TopBar } from '../../TopBar';
import { Editor, type FotoScelta } from './Editor';
import { AggiornaFoto, Genera, GeneraRumors } from './Genera';

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
  const tipo: 'settimanale' | 'coppa' | 'fantamercato' =
    tipoGrezzo === 'coppa' ? 'coppa'
      : tipoGrezzo === 'fantamercato' ? 'fantamercato'
        : 'settimanale';
  const diMercato = tipo === 'fantamercato';

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
      .select('id, number, status, auction_at, lots(id)')
      .eq('league_id', ctx.team.leagueId).order('number', { ascending: false })
    : { data: null };

  const elencoSessioni = (sessioni ?? [])
    .filter((x) => Array.isArray(x.lots) && x.lots.length > 0)
    .map((x) => ({
      id: x.id as string, numero: x.number as number, stato: x.status as string,
      chiamate: (x.lots as unknown[]).length,
    }));

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
    ? await ultimaGazzettaDiMercato(ctx.team.leagueId)
    : scelta ? await ultimaGazzetta(scelta.id, tipo) : null;

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
          </select>
        </label>
        {diMercato ? (
          <label>
            Sessione
            <select name="sessione" defaultValue={sessioneScelta?.id ?? ''}>
              {elencoSessioni.map((x) => (
                <option key={x.id} value={x.id}>
                  Sessione {x.numero} — {x.chiamate} chiamate ({x.stato})
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
          Nessuna sessione d&apos;asta con delle chiamate: le indiscrezioni si
          scrivono su quelle.
        </p>
      )}

      {(diMercato ? sessioneScelta : scelta) && (
        <>
          {diMercato && sessioneScelta
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

              <Editor
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

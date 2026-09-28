import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { supabaseAdmin } from '@/lib/supabase';
import { ultimaGazzetta } from '@/lib/gazzetta/gazzettaServer';
import { indiceFoto } from '@/lib/gazzetta/newsServer';
import { TopBar } from '../../TopBar';
import { Editor, type FotoScelta } from './Editor';
import { AggiornaFoto, Genera } from './Genera';

export const dynamic = 'force-dynamic';

function quando(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('it-IT', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

export default async function GazzettaPage({ searchParams }: {
  searchParams: Promise<{ giornata?: string; tipo?: string }>;
}) {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const db = supabaseAdmin();
  const { giornata, tipo: tipoGrezzo } = await searchParams;
  const tipo: 'settimanale' | 'coppa' = tipoGrezzo === 'coppa' ? 'coppa' : 'settimanale';

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
  const gazzetta = scelta ? await ultimaGazzetta(scelta.id, tipo) : null;

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

      {!scelta && (
        <p className="vuoto">
          Nessuna giornata di {tipo === 'coppa' ? 'coppa' : 'campionato'} con il
          tabellino: importala prima dalla Redazione.
        </p>
      )}

      {scelta && (
        <>
          <form className="gaz-scelta-giornata">
            <label>
              Edizione
              <select name="tipo" defaultValue={tipo}>
                <option value="settimanale">Campionato</option>
                <option value="coppa">Coppa Mansarda</option>
              </select>
            </label>
            <label>
              Giornata
              <select name="giornata" defaultValue={scelta.id}>
                {elenco.map((m) => (
                  <option key={m.id} value={m.id}>
                    Giornata {m.fanta} (Serie A {m.serieA})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="ghost">Cambia</button>
          </form>

          <Genera matchdayId={scelta.id} esiste={Boolean(gazzetta)} tipo={tipo} />
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

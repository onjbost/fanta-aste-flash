'use client';

import { useMemo, useState } from 'react';
import { useActionState } from 'react';
import {
  MAX_SOSTITUZIONI, ricostruisci,
  type GiocatoreGrezzo, type PayloadImport, type SquadraGrezza, type TipoCompetizione,
} from '@/lib/redazione/tabellino';
import { correggiImportAction, type ActionState } from '../../actions';

/**
 * La correzione di un import prima di mandarlo all'app.
 *
 * L'estrattore legge la pagina della lega, ma la pagina non sempre dice tutto:
 * un voto non rilevato, un modificatore che non compare, un capitano che manca.
 * Quando i conti di una squadra non tornano, l'import scarta quella sfida — ed
 * è giusto così, un tabellino sbagliato finisce dentro classifiche e notizie.
 *
 * Qui i numeri si sistemano a mano, e il conto si rifà **mentre si scrive**:
 * la stessa funzione che userà il server (`ricostruisci`) gira anche qui, quindi
 * il semaforo verde che vedi è lo stesso giudizio che darà l'import. Quando
 * tutte le squadre quadrano, si manda.
 */

interface Props {
  importId: string;
  payload: PayloadImport;
}

type Patch = Record<string, string>;

const num = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function Correttore({ importId, payload }: Props) {
  const [patch, setPatch] = useState<Patch>({});
  const [tipo, setTipo] = useState<TipoCompetizione>(payload.tipo === 'coppa' ? 'coppa' : 'campionato');
  const [giornata, setGiornata] = useState<string>(payload.giornata == null ? '' : String(payload.giornata));
  const [state, action, pending] = useActionState<ActionState, FormData>(correggiImportAction, null);

  const set = (k: string, v: string) => setPatch((p) => ({ ...p, [k]: v }));

  /** Il payload con sopra le correzioni: è quello che si manda e quello su cui si fanno i conti. */
  const corretto = useMemo<PayloadImport>(() => {
    const clone = JSON.parse(JSON.stringify(payload)) as PayloadImport;
    clone.tipo = tipo;
    const g = num(giornata);
    clone.giornata = g == null ? null : Math.round(g);
    clone.sfide.forEach((sfida, si) => {
      if ('errore' in sfida.dati) return;
      (['casa', 'ospite'] as const).forEach((lato) => {
        const sq = sfida.dati as { casa: SquadraGrezza; ospite: SquadraGrezza };
        const squadra = sq[lato];
        const base = `${si}.${lato}`;

        const campi = ['gol', 'fantapunti', 'soloVoti', 'modificatore', 'bonusCapitano'] as const;
        campi.forEach((c) => {
          const v = patch[`${base}.${c}`];
          if (v === undefined) return;
          const n = num(v);
          if (c === 'gol') squadra.gol = n ?? 0;
          else if (c === 'modificatore') squadra.modificatore = n ?? 0;
          else if (c === 'bonusCapitano') squadra.bonusCapitano = n ?? 0;
          else squadra[c] = n;
        });

        squadra.giocatori.forEach((g, gi) => {
          const v = patch[`${base}.g${gi}.fantavoto`];
          if (v !== undefined) g.fantavoto = num(v);
          const w = patch[`${base}.g${gi}.voto`];
          if (w !== undefined) g.voto = num(w);
          const f = patch[`${base}.g${gi}.fascia`];
          if (f !== undefined) g.fascia = f === '' ? null : (f as 'C' | 'V');
        });
      });
    });
    return clone;
  }, [payload, patch, tipo, giornata]);

  const conti = useMemo(() => corretto.sfide.map((s) => {
    if ('errore' in s.dati) return null;
    return {
      casa: ricostruisci(s.dati.casa, MAX_SOSTITUZIONI),
      ospite: ricostruisci(s.dati.ospite, MAX_SOSTITUZIONI),
    };
  }), [corretto]);

  const tutteQuadrano = conti.every((c, i) => {
    if (!c) return false;
    const s = corretto.sfide[i];
    if ('errore' in s.dati) return false;
    return c.casa.quadra === true && c.ospite.quadra === true;
  });

  const modificati = Object.keys(patch).length;

  return (
    <form action={action}>
      <input type="hidden" name="importId" value={importId} />
      <input type="hidden" name="payload" value={JSON.stringify(corretto)} />

      <div className="panel" style={{ padding: 16, marginBottom: 14 }}>
        <b>Dove va scritta</b>
        <p className="sub" style={{ margin: '4px 0 10px' }}>
          Normalmente lo dice la pagina della lega e non c&apos;è niente da toccare. Serve per i
          grezzi raccolti prima che il preferito imparasse a guardare la competizione, o quando
          l&apos;ha letta male: in coppa il numero è quello del <b>turno del girone</b>, non della
          giornata di fanta.
        </p>
        <div className="riga-admin">
          <label>Competizione</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCompetizione)}
                  style={{ width: 'auto', minWidth: 140 }}>
            <option value="campionato">Campionato</option>
            <option value="coppa">Coppa Mansarda</option>
          </select>
          <label>{tipo === 'coppa' ? 'Turno di coppa' : 'Giornata'}</label>
          <input className="mini" inputMode="numeric" value={giornata}
                 onChange={(e) => setGiornata(e.target.value)} />
        </div>
        {(payload.classifiche?.length ?? 0) > 0 && (
          <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: '10px 0 0' }}>
            Il grezzo porta anche {payload.classifiche!.length}{' '}
            {payload.classifiche!.length === 1 ? 'classifica letta' : 'classifiche lette'} dalla lega:
            {' '}vanno all&apos;app così come sono, non si correggono da qui.
          </p>
        )}
      </div>

      {corretto.sfide.map((sfida, si) => {
        if ('errore' in sfida.dati) {
          return (
            <div className="panel" style={{ padding: 16, marginBottom: 12 }} key={si}>
              <b>Sfida {si + 1}</b>
              <div className="callout crit" style={{ marginTop: 8 }}>
                L&apos;estrattore non ha letto questa sfida: {sfida.dati.errore}.<br />
                Qui non c&apos;è niente da correggere — va ripresa dalla lega.
              </div>
            </div>
          );
        }
        const c = conti[si]!;
        const { casa, ospite } = sfida.dati;

        return (
          <div className="panel" style={{ padding: 16, marginBottom: 14 }} key={si}>
            <div className="sfida-nomi" style={{ marginBottom: 10 }}>
              {casa.nome} <span>–</span> {ospite.nome}
            </div>

            {([['casa', casa, c.casa], ['ospite', ospite, c.ospite]] as const).map(([lato, sq, f]) => {
              const base = `${si}.${lato}`;
              const val = (campo: string, attuale: number | null) =>
                patch[`${base}.${campo}`] ?? (attuale == null ? '' : String(attuale));

              return (
                <details className="squadra" key={lato} open={f.quadra !== true}>
                  <summary>
                    <div className="storico-riga">
                      <b>{sq.nome}</b>
                      <div className="storico-esito">
                        <span className="storico-n">
                          calcolato {f.calcolato.toFixed(2)} · lega{' '}
                          {f.atteso == null ? '—' : f.atteso.toFixed(2)}
                        </span>
                        {f.quadra === true
                          ? <span className="tag ok">quadra</span>
                          : <span className="tag crit">
                              {f.atteso == null ? 'manca il totale' : `scarto ${f.scarto}`}
                            </span>}
                      </div>
                    </div>
                  </summary>

                  <div className="squadra-corpo">
                    <div className="riga-admin">
                      <label>Gol</label>
                      <input className="mini" inputMode="numeric" value={val('gol', sq.gol)}
                             onChange={(e) => set(`${base}.gol`, e.target.value)} />
                      <label>Fantapunti della lega</label>
                      <input className="mini" inputMode="decimal" value={val('fantapunti', sq.fantapunti)}
                             onChange={(e) => set(`${base}.fantapunti`, e.target.value)} />
                      <label>Solo voti</label>
                      <input className="mini" inputMode="decimal" value={val('soloVoti', sq.soloVoti)}
                             onChange={(e) => set(`${base}.soloVoti`, e.target.value)} />
                      <label>Modificatore</label>
                      <input className="mini" inputMode="decimal" value={val('modificatore', sq.modificatore)}
                             onChange={(e) => set(`${base}.modificatore`, e.target.value)} />
                      <label>Bonus capitano</label>
                      <input className="mini" inputMode="decimal" value={val('bonusCapitano', sq.bonusCapitano)}
                             onChange={(e) => set(`${base}.bonusCapitano`, e.target.value)} />
                    </div>

                    <div className="tablewrap" style={{ marginTop: 10 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>R</th><th>Giocatore</th><th>In campo</th>
                            <th className="num">Voto</th><th className="num">Fantavoto</th><th>Fascia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sq.giocatori.map((g: GiocatoreGrezzo, gi) => {
                            const inCampo = f.scesiInCampo.includes(
                              (corretto.sfide[si].dati as { casa: SquadraGrezza; ospite: SquadraGrezza })[lato].giocatori[gi],
                            );
                            const gk = `${base}.g${gi}`;
                            return (
                              <tr key={gi} style={inCampo ? undefined : { opacity: .55 }}>
                                <td><span className="role-badge">{g.ruolo ?? '?'}</span></td>
                                <td>
                                  <b>{g.nome}</b>
                                  {!g.titolare && <span className="tag muted" style={{ marginLeft: 6 }}>panca</span>}
                                </td>
                                <td style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                                  {inCampo ? 'conta' : 'no'}
                                </td>
                                <td className="num">
                                  <input className="mini" inputMode="decimal"
                                         value={patch[`${gk}.voto`] ?? (g.voto == null ? '' : String(g.voto))}
                                         onChange={(e) => set(`${gk}.voto`, e.target.value)} />
                                </td>
                                <td className="num">
                                  <input className="mini" inputMode="decimal"
                                         value={patch[`${gk}.fantavoto`] ?? (g.fantavoto == null ? '' : String(g.fantavoto))}
                                         onChange={(e) => set(`${gk}.fantavoto`, e.target.value)} />
                                </td>
                                <td>
                                  <select value={patch[`${gk}.fascia`] ?? (g.fascia ?? '')}
                                          onChange={(e) => set(`${gk}.fascia`, e.target.value)}
                                          style={{ width: 'auto', minWidth: 64 }}>
                                    <option value="">—</option>
                                    <option value="C">C</option>
                                    <option value="V">V</option>
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {f.inDieci.length > 0 && (
                      <p style={{ fontSize: '.82rem', color: 'var(--warn)', margin: '8px 0 0' }}>
                        Senza voto e senza rimpiazzo: {f.inDieci.map((g) => g.nome).join(', ')} —
                        se in realtà un voto ce l&apos;hanno, scrivilo qui sopra e il conto cambia.
                      </p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        );
      })}

      <div className="barra-schedina">
        <div>
          {modificati === 0
            ? 'Nessuna correzione: manderesti il grezzo com\'è.'
            : <><b>{modificati}</b> {modificati === 1 ? 'valore corretto' : 'valori corretti'}</>}
          {' · '}
          {tutteQuadrano
            ? <span style={{ color: 'var(--ok)' }}>tutte le squadre quadrano</span>
            : <span className="avviso">qualche squadra non quadra ancora</span>}
        </div>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? 'Mando…' : 'Manda all\'app'}
        </button>
      </div>

      {state && (
        <div className={`callout${state.ok ? '' : ' crit'}`} style={{ marginTop: 12 }}>{state.message}</div>
      )}
    </form>
  );
}

/**
 * I pezzi della scheda di un giocatore, uguali dappertutto: l'etichetta di
 * chi è fermo, la nota di fantacalcio.it con la stima di rientro, e i numeri
 * della stagione.
 *
 * Nessuno stato e nessun hook: li usano sia le pagine del server (i lotti
 * dell'asta) sia i componenti nel browser (la rosa, il listone, la chiamata).
 */

import type { Role } from '@/lib/rules';
import type { Indisponibile, Statistiche } from '@/lib/schede';

export const INDISPONIBILE: Record<Indisponibile['categoria'], { testo: string; classe: string }> = {
  infortunato: { testo: 'Infortunato', classe: 'crit' },
  squalificato: { testo: 'Squalificato', classe: 'crit' },
  in_dubbio: { testo: 'In dubbio', classe: 'warn' },
  diffidato: { testo: 'Diffidato', classe: 'muted' },
};

/** «25 novembre»: la stima di rientro detta in breve. */
export function rientro(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

export function TagIndisponibile({ ind }: { ind: Indisponibile | null | undefined }) {
  if (!ind) return null;
  const t = INDISPONIBILE[ind.categoria];
  return <span className={`tag ${t.classe}`}>{t.testo}</span>;
}

/** La nota per esteso: categoria, rientro stimato e didascalia della fonte. */
export function NotaIndisponibile({ ind, compatta = false }: { ind: Indisponibile | null | undefined; compatta?: boolean }) {
  if (!ind) return null;
  const quando = rientro(ind.rientroStimato);
  return (
    <div className={`callout nota-indisponibile${ind.categoria === 'infortunato' || ind.categoria === 'squalificato' ? ' crit' : ''}`}
      style={compatta ? { margin: '8px 0 0', fontSize: '.82rem' } : { margin: '8px 0 12px' }}>
      <b>{INDISPONIBILE[ind.categoria].testo}</b>
      {quando && <> · rientro stimato: {quando}</>}
      {ind.descrizione && (
        <p style={{ margin: '4px 0 0', fontStyle: 'italic' }}>«{ind.descrizione}» — fantacalcio.it</p>
      )}
    </div>
  );
}

function decimale(n: number | null): string {
  if (n == null) return '–';
  return n.toFixed(2).replace(/0$/, '').replace('.', ',');
}

function intero(n: number | null): string {
  return n == null ? '–' : String(n);
}

/** Una riga sola, per le liste: «FM 7,2 · 5 pv · 3 gol · 1 ass». */
export function NumeriBrevi({ st, ruolo }: { st: Statistiche | null | undefined; ruolo: Role }) {
  if (!st || !st.presenze) return null;
  const pezzi = [`FM ${decimale(st.fantamedia)}`, `${st.presenze} pv`];
  if (ruolo === 'P') {
    pezzi.push(`${intero(st.golSubiti)} gs`);
    if (st.rigoriParati) pezzi.push(`${st.rigoriParati} rp`);
  } else {
    if (st.gol) pezzi.push(`${st.gol} gol`);
    if (st.assist) pezzi.push(`${st.assist} ass`);
  }
  return <span className="numeri-brevi">{pezzi.join(' · ')}</span>;
}

/**
 * I numeri della stagione: le medie, i bonus portati e i malus presi. Per i
 * portieri i gol subiti e i rigori parati prendono il posto di gol e rigori.
 */
export function NumeriGiocatore({ st, ruolo }: { st: Statistiche | null | undefined; ruolo: Role }) {
  if (!st) {
    return <p className="foglio-nota">Statistiche di stagione non ancora lette da fantacalcio.it.</p>;
  }
  const bonus: [string, string][] = ruolo === 'P'
    ? [['Rigori parati', intero(st.rigoriParati)], ['Gol', intero(st.gol)], ['Assist', intero(st.assist)]]
    : [
      ['Gol', intero(st.gol)],
      ['Assist', intero(st.assist)],
      ['Rigori', st.rigoriCalciati ? `${st.rigoriSegnati ?? 0}/${st.rigoriCalciati}` : '0'],
    ];
  const sbagliati = st.rigoriCalciati != null && st.rigoriSegnati != null ? st.rigoriCalciati - st.rigoriSegnati : null;
  const malus: [string, string][] = [
    ...(ruolo === 'P' ? [['Gol subiti', intero(st.golSubiti)] as [string, string]] : []),
    ['Ammonizioni', intero(st.ammonizioni)],
    ['Espulsioni', intero(st.espulsioni)],
    ...(st.autogol ? [['Autogol', String(st.autogol)] as [string, string]] : []),
    ...(ruolo !== 'P' && sbagliati ? [['Rigori sbagliati', String(sbagliati)] as [string, string]] : []),
  ];
  return (
    <div className="numeri-giocatore">
      <div className="numeri-medie">
        <div><span>Fantamedia</span><b className="num">{decimale(st.fantamedia)}</b></div>
        <div><span>Media voto</span><b className="num">{decimale(st.mediaVoto)}</b></div>
        <div><span>Partite a voto</span><b className="num">{intero(st.presenze)}</b></div>
      </div>
      <div className="numeri-gruppo">
        <span className="numeri-titolo">Bonus</span>
        {bonus.map(([k, v]) => <div key={k}><span>{k}</span><b className="num">{v}</b></div>)}
      </div>
      <div className="numeri-gruppo">
        <span className="numeri-titolo">Malus</span>
        {malus.map(([k, v]) => <div key={k}><span>{k}</span><b className="num">{v}</b></div>)}
      </div>
      <p className="foglio-nota">
        Stagione in corso, da fantacalcio.it. Gli autogol, che la pagina non riporta, compaiono
        quando li registra un tabellino della lega.
      </p>
    </div>
  );
}

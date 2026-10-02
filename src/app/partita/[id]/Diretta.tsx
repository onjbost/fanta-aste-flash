'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Diretta as DatiDiretta, LatoDiretta } from '@/lib/live/liveServer';
import type { BonusSquadra, RigaLive } from '@/lib/live/calcolo';
import { Stemma } from '../../Stemma';

/**
 * Ogni quanto si rilegge il live. Mentre si gioca, ogni minuto: il sito
 * aggiorna al minuto e i voti cambiano spesso. Fra una partita e l'altra di
 * una giornata lunga (il venerdì sera e la domenica, per dire) basta ogni
 * cinque minuti. A giornata finita, mai.
 */
const IN_CAMPO_MS = 60_000;
const IN_ATTESA_MS = 5 * 60_000;
const IN_CAMPO = new Set(['1° tempo', 'intervallo', '2° tempo', 'sospesa']);

const STATO: Record<RigaLive['stato'], string> = {
  voto: '',
  in_campo: 'in campo',
  da_giocare: 'da giocare',
  fuori: 'non in campo',
  sv: 'senza voto',
};

function fmt(n: number | null): string {
  if (n == null) return '–';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

function Riga({ r, simula }: { r: RigaLive; simula: boolean }) {
  const valore = simula ? r.simulato : r.fantavoto;
  const conta = simula ? r.contaSimulato : r.conta;
  const stimato = simula && r.fantavoto == null && r.simulato != null;
  return (
    <li style={{
      display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center',
      padding: '6px 0', borderBottom: '1px solid var(--surface-3)',
      opacity: conta ? 1 : 0.55,
    }}>
      <span className="role-badge">{r.ruolo}</span>
      <span style={{ minWidth: 0 }}>
        <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.nome}
          {r.fascia && <span className="tag muted" style={{ marginLeft: 6 }} title={r.fascia === 'C' ? 'Capitano' : 'Vicecapitano'}>{r.fascia}</span>}
        </b>
        <small style={{ color: 'var(--muted)' }}>
          {[r.club, r.partita, STATO[r.stato], ...r.eventi].filter(Boolean).join(' · ')}
          {!r.titolare && conta && ' · entra'}
        </small>
      </span>
      <span className="num" style={{ textAlign: 'right' }}>
        <b style={{ fontStyle: stimato ? 'italic' : undefined }}>{fmt(valore)}</b>
        {r.voto != null && r.bonus !== 0 && (
          <small style={{ display: 'block', color: 'var(--muted)' }}>{fmt(r.voto)} {r.bonus > 0 ? '+' : '−'} {fmt(Math.abs(r.bonus))}</small>
        )}
      </span>
    </li>
  );
}

/** Una riga dei bonus di squadra: i punti e da dove vengono. */
function BonusRiga({ nome, b }: { nome: string; b: BonusSquadra }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center',
      padding: '6px 0', borderBottom: '1px solid var(--surface-3)',
    }}>
      <span style={{ minWidth: 0 }}>
        <b style={{ display: 'block' }}>{nome}</b>
        <small style={{ color: 'var(--muted)' }}>{b.spiegazione}</small>
      </span>
      <b className="num">{b.punti > 0 ? `+${fmt(b.punti)}` : fmt(b.punti)}</b>
    </div>
  );
}

function Formazione({ lato, simula }: { lato: LatoDiretta; simula: boolean }) {
  const titolari = lato.live.righe.filter((r) => r.titolare);
  const panchina = lato.live.righe.filter((r) => !r.titolare);
  return (
    <section className="panel" style={{ padding: 12 }}>
      <h2 style={{ margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Stemma nome={lato.nome} url={lato.stemma} size={28} />{lato.nome}
      </h2>
      <p className="sub" style={{ margin: '0 0 8px' }}>
        {lato.fonte === 'lega'
          ? 'Formazione schierata nella lega.'
          : 'Formazione probabile: quella vera non è ancora stata importata dalla lega.'}
        {' '}{lato.live.conVoto}/11 con voto{lato.live.sostituzioni ? ` · ${lato.live.sostituzioni} cambi` : ''}
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {titolari.map((r) => <Riga key={`t${r.ordine}-${r.nome}`} r={r} simula={simula} />)}
      </ul>
      <BonusRiga nome="Modificatore difesa" b={simula ? lato.live.modificatoreSimulato : lato.live.modificatore} />
      <BonusRiga nome="Fattore capitano" b={simula ? lato.live.capitanoSimulato : lato.live.capitano} />
      {panchina.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="sub" style={{ cursor: 'pointer' }}>Panchina ({panchina.length})</summary>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {panchina.map((r) => <Riga key={`p${r.ordine}-${r.nome}`} r={r} simula={simula} />)}
          </ul>
        </details>
      )}
    </section>
  );
}

export function Diretta({ d }: { d: DatiDiretta }) {
  const router = useRouter();
  const [simula, setSimula] = useState(false);

  // si rilegge da sola finché c'è una partita di Serie A ancora da finire
  const inCampo = d.serieAPartite.some((p) => IN_CAMPO.has(p.stato));
  const daGiocare = d.serieAPartite.some((p) => p.stato === 'da giocare');
  const ogni = inCampo ? IN_CAMPO_MS : daGiocare ? IN_ATTESA_MS : null;
  useEffect(() => {
    if (!ogni) return;
    const t = setInterval(() => router.refresh(), ogni);
    // tornando sulla scheda dopo un po', si rilegge subito invece di aspettare il giro
    const torna = () => { if (document.visibilityState === 'visible') router.refresh(); };
    document.addEventListener('visibilitychange', torna);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', torna); };
  }, [ogni, router]);

  const c = d.casa.live;
  const o = d.ospite.live;
  const tot = (l: typeof c) => (simula ? l.totaleSimulato : l.totale);
  const gol = (l: typeof c) => (simula ? l.golSimulati : l.gol);

  return (
    <>
      <div className="banner">
        <div className="banner-testa">
          <span>{simula ? 'Simulata' : 'Adesso'}</span>
          <span>aggiornata alle {new Date(d.aggiornatoIl).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}</span>
        </div>
        <div className="banner-sfida">
          <div className="banner-squadra">
            <Stemma nome={d.casa.nome} url={d.casa.stemma} size={52} />
            <span className="nome">{d.casa.nome}</span>
            <span className="num" style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{fmt(tot(c))}</span>
          </div>
          <span className="banner-vs num" style={{ fontSize: '2rem' }}>{gol(c)}–{gol(o)}</span>
          <div className="banner-squadra">
            <Stemma nome={d.ospite.nome} url={d.ospite.stemma} size={52} />
            <span className="nome">{d.ospite.nome}</span>
            <span className="num" style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{fmt(tot(o))}</span>
          </div>
        </div>
        {d.ufficiale && (
          <div className="banner-nota">Risultato ufficiale: {d.ufficiale.casa}–{d.ufficiale.ospite}</div>
        )}
      </div>

      <div className="segmento" role="tablist" aria-label="Lettura" style={{ marginTop: 12 }}>
        <button type="button" role="tab" aria-selected={!simula} onClick={() => setSimula(false)}>Com&apos;è adesso</button>
        <button type="button" role="tab" aria-selected={simula} onClick={() => setSimula(true)}>Simula partita</button>
      </div>
      <p className="sub" style={{ margin: '8px 0 12px' }}>
        {simula
          ? 'Chi non ha ancora voto prende 6, più i bonus e i malus che ha già fatto. Chi è in panchina in una partita già cominciata non lo prende: entra la riserva. È un\'indicazione di dove sta andando la partita, non un risultato.'
          : 'Contano solo i voti già usciti. Le riserve entrano per chi ha finito la sua partita senza voto, fino a tre cambi.'}
        {' '}Modificatore difesa e fattore capitano usano i voti puri, senza bonus.
      </p>

      {d.fonteVoti === 'tabellino' && (
        <div className="callout">Partita conclusa: voti e fantavoti sono quelli del tabellino della lega.</div>
      )}
      {d.fonteVoti === 'pagelle' && (
        <div className="callout">
          Il live di questa giornata non è più disponibile: voti e fantavoti vengono dalle pagelle
          di Serie A raccolte da fantacalcio.it. Il conto esatto arriva col tabellino della lega.
        </div>
      )}
      {d.errore && d.fonteVoti === 'live' && <div className="callout crit">{d.errore}</div>}
      {d.sconosciuti.length > 0 && (
        <div className="callout">
          Il live contiene eventi che il conto non sa ancora valutare (codici {d.sconosciuti.join(', ')}):
          valgono zero finché non si capisce cosa sono.
        </div>
      )}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Formazione lato={d.casa} simula={simula} />
        <Formazione lato={d.ospite} simula={simula} />
      </div>

      {d.serieAPartite.length > 0 && (
        <details className="panel" style={{ padding: 12, marginTop: 12 }}>
          <summary style={{ cursor: 'pointer' }}><b>Serie A · {d.serieA}ª giornata</b></summary>
          {d.serieAPartite.map((p) => (
            <div key={`${p.casa}-${p.ospite}`} style={{
              display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 8, padding: '4px 0',
            }}>
              <span>{p.casa}</span><b className="num">{p.gol}</b><span>{p.ospite}</span>
              <small style={{ color: 'var(--muted)' }}>{p.stato}</small>
            </div>
          ))}
        </details>
      )}
    </>
  );
}

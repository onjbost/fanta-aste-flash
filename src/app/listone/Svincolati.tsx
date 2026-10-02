'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Foglio } from '../Foglio';
import { NotaIndisponibile, NumeriBrevi, NumeriGiocatore, TagIndisponibile } from '../SchedaGiocatore';
import { ROLE_LABEL, type Role } from '@/lib/rules';
import type { FreeAgent } from '@/lib/queries';

/**
 * Gli svincolati in card: ricerca, ordinamento a più livelli in chip, filtri
 * in un foglio. Un tocco su un giocatore apre il suo foglio, con «Chiama».
 *
 * Tutto succede nel browser. I giocatori liberi sono qualche centinaio, quindi
 * mandarli tutti una volta sola e poi ordinarli e filtrarli qui è più veloce
 * che tornare al server a ogni click — e soprattutto è *istantaneo*, che è
 * quello che serve quando stai cercando chi chiamare all'asta.
 */

import {
  applicaFiltri, applicaOrdine, prossimoOrdine, quantiFiltri,
  FILTRI_VUOTI, type Campo, type Filtri, type Ordine,
} from './ordinamento';

const COLONNE: { campo: Campo; etichetta: string; num?: boolean }[] = [
  { campo: 'ruolo', etichetta: 'Ruolo' },
  { campo: 'nome', etichetta: 'Giocatore' },
  { campo: 'club', etichetta: 'Club' },
  { campo: 'quotazione', etichetta: 'Quotazione', num: true },
  { campo: 'attuale', etichetta: 'Qt. attuale', num: true },
];

/**
 * Le etichette che cambiano cosa si può fare con un giocatore.
 *
 * L'indisponibilità viene dall'ultima raccolta di fantacalcio.it e la vedono
 * tutti: chi chiama all'asta un giocatore fermo deve saperlo prima.
 */
function Note({ p }: { p: FreeAgent }) {
  const ind = p.indisponibile;
  return (
    <>
      <TagIndisponibile ind={ind} />
      {p.status === 'injured_long' && !ind && <span className="tag crit">Infortunato</span>}
      {p.status === 'out_of_serie_a' && <span className="tag warn">Fuori Serie A</span>}
      {p.lockedUntilNumber != null && <span className="tag muted">dall&apos;asta #{p.lockedUntilNumber}</span>}
      {p.signingWindow === 'winter' && <span className="tag muted">gennaio</span>}
    </>
  );
}

export function Svincolati({ players, chiamateAperte }: { players: FreeAgent[]; chiamateAperte: boolean }) {
  const [ordini, setOrdini] = useState<Ordine[]>([]);
  const [filtri, setFiltri] = useState<Filtri>(FILTRI_VUOTI);
  const modale = useRef<HTMLDialogElement>(null);

  const clubDisponibili = useMemo(
    () => [...new Set(players.map((p) => p.club))].sort((a, b) => a.localeCompare(b, 'it')),
    [players],
  );

  /**
   * Un click sull'intestazione, con la regola che hai chiesto:
   * la prima volta la colonna entra in coda (quindi è secondaria se ce n'è già
   * una), la seconda gira il verso, la terza esce e lascia il posto a quelle
   * rimaste. Senza nessuna colonna attiva si torna all'ordine di partenza.
   */
  function click(campo: Campo) {
    setOrdini((prima) => prossimoOrdine(prima, campo));
  }

  const visibili = useMemo(
    () => applicaOrdine(applicaFiltri(players, filtri), ordini),
    [players, filtri, ordini],
  );

  const nFiltri = quantiFiltri(filtri);
  const [quanti, setQuanti] = useState(120);
  const [apertoId, setApertoId] = useState<string | null>(null);
  const aperto = players.find((p) => p.id === apertoId) ?? null;

  return (
    <>
      <div className="cerca-riga">
        <input id="cerca" type="search" aria-label="Cerca" value={filtri.testo} placeholder="Cerca cognome o club"
          onChange={(e) => setFiltri({ ...filtri, testo: e.target.value })} />
        <button type="button" onClick={() => modale.current?.showModal()}>
          Filtri{nFiltri > 0 && <span className="pallino">{nFiltri}</span>}
        </button>
      </div>

      {/*
        * L'ordinamento in chip, con la regola di sempre: il primo tocco mette
        * il campo in coda, il secondo gira il verso, il terzo lo toglie. Il
        * numerino dice la priorità quando ce n'è più d'uno.
        */}
      <div className="chips" role="group" aria-label="Ordina per">
        {COLONNE.map((c) => {
          const i = ordini.findIndex((o) => o.campo === c.campo);
          const o = i < 0 ? null : ordini[i];
          return (
            <button key={c.campo} type="button" className="chip" aria-pressed={!!o} onClick={() => click(c.campo)}>
              {c.etichetta}
              {o && <span aria-label={o.verso === 'asc' ? 'crescente' : 'decrescente'}>{o.verso === 'asc' ? ' ↑' : ' ↓'}</span>}
              {ordini.length > 1 && o && <span className="livello">{i + 1}</span>}
            </button>
          );
        })}
        {(nFiltri > 0 || ordini.length > 0) && (
          <button type="button" className="chip" onClick={() => { setFiltri(FILTRI_VUOTI); setOrdini([]); }}>
            Azzera
          </button>
        )}
      </div>

      <p className="conteggio">{visibili.length} di {players.length} svincolati</p>

      {visibili.length === 0 && (
        <div className="panel"><div className="empty">Nessuno svincolato con questi filtri.</div></div>
      )}
      <ul className="carte">
        {visibili.slice(0, quanti).map((p) => (
          <li key={p.id}>
            <button type="button" className="carta" onClick={() => setApertoId(p.id)}>
              <span className="role-badge" title={ROLE_LABEL[p.role]}>{p.role}</span>
              <span className="chi-col">
                <b>{p.name}</b>
                <small>
                  {p.club}
                  <Note p={p} />
                </small>
                <NumeriBrevi st={p.statistiche} ruolo={p.role} />
              </span>
              <span className="carta-cifre">
                <b className="num">{p.qtAttuale ?? p.quotation}</b>
                <small>{p.qtAttuale != null && p.qtAttuale !== p.quotation
                  ? `${p.qtAttuale > p.quotation ? '▲' : '▼'} da ${p.quotation}` : 'qt'}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {visibili.length > quanti && (
        <button type="button" className="largo" onClick={() => setQuanti((n) => n + 120)}>
          Mostra altri {Math.min(120, visibili.length - quanti)}
        </button>
      )}

      <Foglio aperto={aperto !== null} onChiudi={() => setApertoId(null)} titolo={aperto?.name ?? ''}>
        {aperto && (
          <div>
            <p className="foglio-nota" style={{ marginTop: 2 }}>
              {ROLE_LABEL[aperto.role]} · {aperto.club} <Note p={aperto} />
            </p>
            <NotaIndisponibile ind={aperto.indisponibile} />
            <div className="esiti-due">
              <div><span>Quotazione</span><b className="num">{aperto.quotation}</b>
                {aperto.qtAttuale != null && <small>attuale {aperto.qtAttuale}</small>}</div>
              <div><span>Ruolo</span><b>{aperto.role}</b><small>esce un {ROLE_LABEL[aperto.role].toLowerCase()}</small></div>
            </div>
            <NumeriGiocatore st={aperto.statistiche} ruolo={aperto.role} />
            {chiamateAperte ? (
              <Link href={`/asta?chiama=${aperto.id}`} className="btn primary largo">Chiama all&apos;asta</Link>
            ) : (
              <p className="foglio-nota">Le chiamate per la prossima asta non sono aperte.</p>
            )}
          </div>
        )}
      </Foglio>

      <dialog ref={modale} className="foglio" onClick={(e) => { if (e.target === e.currentTarget) modale.current?.close(); }}>
        <div className="foglio-maniglia" aria-hidden="true" />
        <div className="foglio-testa"><h2>Filtri</h2></div>
        <div style={{ marginTop: 10 }}>
          <div className="field">
            <label>Ruolo</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['P', 'D', 'C', 'A'] as Role[]).map((r) => {
                const on = filtri.ruoli.includes(r);
                return (
                  <button key={r} type="button"
                    className={on ? 'primary' : undefined}
                    onClick={() => setFiltri({
                      ...filtri,
                      ruoli: on ? filtri.ruoli.filter((x) => x !== r) : [...filtri.ruoli, r],
                    })}>
                    {ROLE_LABEL[r]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>Quotazione</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input inputMode="numeric" placeholder="da" value={filtri.qMin}
                onChange={(e) => setFiltri({ ...filtri, qMin: e.target.value })} />
              <span style={{ color: 'var(--muted)' }}>—</span>
              <input inputMode="numeric" placeholder="a" value={filtri.qMax}
                onChange={(e) => setFiltri({ ...filtri, qMax: e.target.value })} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="club">Club {filtri.club.length > 0 && `(${filtri.club.length} scelti)`}</label>
            <div style={{
              maxHeight: 200, overflow: 'auto', border: '1px solid var(--surface-3)',
              borderRadius: 12, padding: 8,
            }}>
              {clubDisponibili.map((c) => (
                <label key={c} style={{
                  display: 'flex', gap: 8, alignItems: 'center', margin: 0,
                  textTransform: 'none', letterSpacing: 0, fontSize: '.86rem',
                  padding: '3px 0', color: 'var(--ink)', fontWeight: 400,
                }}>
                  <input type="checkbox" style={{ width: 'auto' }}
                    checked={filtri.club.includes(c)}
                    onChange={() => setFiltri({
                      ...filtri,
                      club: filtri.club.includes(c)
                        ? filtri.club.filter((x) => x !== c)
                        : [...filtri.club, c],
                    })} />
                  {c}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="foglio-piede">
          <button type="button" onClick={() => setFiltri({ ...FILTRI_VUOTI, testo: filtri.testo })}>
            Svuota
          </button>
          <button type="button" className="primary" onClick={() => modale.current?.close()}>
            Mostra {visibili.length}
          </button>
        </div>
      </dialog>
    </>
  );
}

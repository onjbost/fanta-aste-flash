'use client';

import { useMemo, useRef, useState } from 'react';
import { ROLE_LABEL, type Role } from '@/lib/rules';
import type { FreeAgent } from '@/lib/queries';

/**
 * La tabella degli svincolati: ordinamento a più livelli e filtri in un modale.
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
];

export function Svincolati({ players }: { players: FreeAgent[] }) {
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

  return (
    <>
      <div className="filters" style={{ alignItems: 'center' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="cerca">Cerca</label>
          <input id="cerca" value={filtri.testo} placeholder="Cognome o club"
            onChange={(e) => setFiltri({ ...filtri, testo: e.target.value })} />
        </div>
        <button type="button" onClick={() => modale.current?.showModal()}>
          Filtri{nFiltri > 0 && <span className="pallino">{nFiltri}</span>}
        </button>
        {(nFiltri > 0 || ordini.length > 0) && (
          <button type="button" className="link"
            onClick={() => { setFiltri(FILTRI_VUOTI); setOrdini([]); }}>
            Azzera tutto
          </button>
        )}
      </div>

      {ordini.length > 0 && (
        <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: '0 0 10px' }}>
          Ordinato per {ordini.map((o, i) => (
            <span key={o.campo}>
              {i > 0 && ', poi '}
              <b>{COLONNE.find((c) => c.campo === o.campo)!.etichetta.toLowerCase()}</b>
              {' '}{o.verso === 'asc' ? '↑' : '↓'}
            </span>
          ))}. Clicca una terza volta su una colonna per toglierla.
        </p>
      )}

      <div className="panel">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                {COLONNE.map((c) => {
                  const i = ordini.findIndex((o) => o.campo === c.campo);
                  const o = i < 0 ? null : ordini[i];
                  return (
                    <th key={c.campo} className={c.num ? 'num ordinabile' : 'ordinabile'}
                      aria-sort={o ? (o.verso === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => click(c.campo)}
                        title={o ? 'Clicca per girare il verso, poi per togliere' : 'Ordina per questa colonna'}>
                        {c.etichetta}
                        {o && <span className="segno">{o.verso === 'asc' ? '↑' : '↓'}</span>}
                        {ordini.length > 1 && o && <span className="livello">{i + 1}</span>}
                      </button>
                    </th>
                  );
                })}
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {visibili.map((p) => (
                <tr key={p.id}>
                  <td><span className="role-badge" title={ROLE_LABEL[p.role]}>{p.role}</span></td>
                  <td><b>{p.name}</b></td>
                  <td style={{ color: 'var(--muted)' }}>{p.club}</td>
                  <td className="num">{p.quotation}</td>
                  <td>
                    {p.status === 'injured_long' && <span className="tag crit">Infortunato</span>}
                    {p.status === 'out_of_serie_a' && <span className="tag warn">Fuori Serie A</span>}
                    {p.lockedUntilNumber != null && (
                      <span className="tag muted">Chiamabile dall&apos;asta #{p.lockedUntilNumber}</span>
                    )}
                    {p.signingWindow === 'winter' && <span className="tag muted">Arrivo di gennaio</span>}
                  </td>
                </tr>
              ))}
              {visibili.length === 0 && (
                <tr><td colSpan={5}><div className="empty">Nessuno svincolato con questi filtri.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ fontSize: '.86rem', color: 'var(--muted)', marginTop: 10 }}>
        {visibili.length} di {players.length} svincolati.
      </p>

      <dialog ref={modale}>
        <div className="head">Filtri</div>
        <div className="body">
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
              maxHeight: 200, overflow: 'auto', border: '1px solid var(--border)',
              borderRadius: 2, padding: 8,
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
        <div className="foot">
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

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ROLE_LABEL, ROLE_PLURAL, type Role } from '@/lib/rules';
import { FreeReleaseButton } from '../FreeReleaseButton';
import { Foglio } from '../Foglio';
import {
  INDISPONIBILE, NotaIndisponibile, NumeriBrevi, NumeriGiocatore, TagIndisponibile,
} from '../SchedaGiocatore';
import type { Indisponibile, Statistiche } from '@/lib/schede';

export interface CartaRosa {
  playerId: string; name: string; role: Role; club: string; price: number; refund: number;
  refundFree: boolean;
  stato: { cls: string; label: string } | null;
  pending: boolean; approved: boolean;
  canRequest: boolean; hint: string;
  /** l'ultima raccolta degli indisponibili di fantacalcio.it */
  indisponibile: Indisponibile | null;
  statistiche: Statistiche | null;
}

/**
 * L'etichetta della fonte, se non ripete quella che ha già messo l'admin:
 * «Infortunato» due volte di fila non dice niente di più.
 */
function TagFonte({ c }: { c: CartaRosa }) {
  if (!c.indisponibile || c.stato?.label === INDISPONIBILE[c.indisponibile.categoria].testo) return null;
  return <TagIndisponibile ind={c.indisponibile} />;
}

const RUOLI: Role[] = ['P', 'D', 'C', 'A'];

/**
 * La rosa in card, divisa per ruolo. Un tocco apre il foglio del giocatore:
 * quanto rende, lo svincolo gratuito, e la strada per metterlo sul piatto.
 */
export function RosaCarte({ carte, chiamateAperte }: { carte: CartaRosa[]; chiamateAperte: boolean }) {
  const [ruolo, setRuolo] = useState<Role | null>(null);
  const [apertoId, setApertoId] = useState<string | null>(null);
  const aperto = carte.find((c) => c.playerId === apertoId) ?? null;

  if (!carte.length) {
    return <div className="panel"><div className="empty">Rosa non ancora caricata. L&apos;admin deve importare le rose dopo l&apos;asta.</div></div>;
  }

  return (
    <>
      <div className="chips" role="group" aria-label="Ruolo">
        <button type="button" className="chip" aria-pressed={ruolo === null} onClick={() => setRuolo(null)}>Tutti</button>
        {RUOLI.map((r) => (
          <button key={r} type="button" className="chip" aria-pressed={ruolo === r} onClick={() => setRuolo(r)}>
            {ROLE_PLURAL[r]}
          </button>
        ))}
      </div>

      {RUOLI.filter((r) => !ruolo || r === ruolo).map((r) => {
        const delRuolo = carte.filter((c) => c.role === r);
        if (!delRuolo.length) return null;
        return (
          <section key={r}>
            <h3 className="titoletto-ruolo">{ROLE_PLURAL[r]} <span className="num">{delRuolo.length}</span></h3>
            <ul className="carte">
              {delRuolo.map((c) => (
                <li key={c.playerId}>
                  <button type="button" className="carta" onClick={() => setApertoId(c.playerId)}>
                    <span className="role-badge" title={ROLE_LABEL[c.role]}>{c.role}</span>
                    <span className="chi-col">
                      <b>{c.name}</b>
                      <small>
                        {c.club}
                        {c.stato && <span className={`tag ${c.stato.cls}`}>{c.stato.label}</span>}
                        <TagFonte c={c} />
                        {c.pending && <span className="tag warn">In attesa</span>}
                        {c.approved && <span className="tag ok">Gratuito</span>}
                      </small>
                      <NumeriBrevi st={c.statistiche} ruolo={c.role} />
                    </span>
                    <span className="carta-cifre">
                      <b className="num">{c.price}</b>
                      <small className="num">esce a {c.refund}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <Foglio aperto={aperto !== null} onChiudi={() => setApertoId(null)} titolo={aperto?.name ?? ''}>
        {aperto && (
          <div>
            <p className="foglio-nota" style={{ marginTop: 2 }}>
              {ROLE_LABEL[aperto.role]} · {aperto.club}
              {aperto.stato && <> · <span className={`tag ${aperto.stato.cls}`}>{aperto.stato.label}</span></>}
              {' '}<TagFonte c={aperto} />
            </p>
            <NotaIndisponibile ind={aperto.indisponibile} />
            <div className="esiti-due">
              <div><span>Pagato</span><b className="num">{aperto.price} cr</b></div>
              <div>
                <span>Svincolo</span><b className="num">{aperto.refund} cr</b>
                <small>{aperto.refundFree ? 'al 100%, cambio gratuito' : '75% del prezzo'}</small>
              </div>
            </div>
            <NumeriGiocatore st={aperto.statistiche} ruolo={aperto.role} />

            {chiamateAperte && (
              <Link href="/asta" className="btn primary largo">Chiama qualcuno al suo posto</Link>
            )}

            <FreeReleaseButton
              playerId={aperto.playerId} playerName={aperto.name}
              price={aperto.price} refund={aperto.refund}
              canRequest={aperto.canRequest} pending={aperto.pending} hint={aperto.hint}
            />
          </div>
        )}
      </Foglio>
    </>
  );
}

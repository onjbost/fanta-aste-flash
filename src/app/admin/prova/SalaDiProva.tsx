'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LeagueConfig } from '@/lib/rules';
import { LiveLot, ProgrammaSerata, type LotView } from '@/app/asta/sala/PezziSala';
import {
  IO, apriLotto, apriSala, budget, chiudiLotto, chiudiSerata, lottoLive,
  mossaAvversari, prossimoLotto, rilancia, rimborso, squadra, statoIniziale,
  type LottoProva, type StatoProva,
} from './simulazione';

/**
 * La sala d'asta finta.
 *
 * Guidi «La tua squadra» contro tre avversari automatici, con i pulsanti e il
 * timer veri della sala — sono gli stessi componenti, non una copia somigliante.
 * Gli avversari rispondono dopo un paio di secondi, come farebbe qualcuno che
 * sta guardando il telefono: serve a far vedere la cosa che a parole non si
 * capisce mai, cioè che ogni rilancio riporta il countdown a zero e la serata
 * può allungarsi parecchio.
 */

/** Quanto ci mette un avversario a rispondere: abbastanza per vedere il timer scendere. */
const RITARDO_MIN = 1500;
const RITARDO_MAX = 3200;

function vista(s: StatoProva, l: LottoProva): LotView {
  const chiamante = l.partecipanti.find((p) => p.chiamante);
  const io = l.partecipanti.find((p) => p.squadraId === IO);
  return {
    id: l.id,
    index: l.indice,
    status: l.stato,
    player: { name: l.giocatore.nome, role: l.giocatore.ruolo, club: l.giocatore.club },
    callerTeam: chiamante ? squadra(s, chiamante.squadraId).nome : '—',
    currentPrice: l.prezzo,
    currentLeader: l.leader ? squadra(s, l.leader).nome : null,
    currentLeaderId: l.leader,
    timerEndsAt: l.scadenza != null ? new Date(l.scadenza).toISOString() : null,
    winnerTeam: l.vincitore ? squadra(s, l.vincitore).nome : null,
    finalPrice: l.prezzoFinale,
    participants: l.partecipanti.map((p) => ({
      teamId: p.squadraId,
      teamName: squadra(s, p.squadraId).nome,
      isCaller: p.chiamante,
      releaseName: `${p.svincola.nome} (+${rimborso(p.svincola, s.cfg)})`,
      budget: budget(s, l, p.squadraId),
      liveCredits: squadra(s, p.squadraId).crediti,
    })),
    myBudget: io ? budget(s, l, IO) : null,
    iParticipate: !!io,
  };
}

export function SalaDiProva({ cfg, timerSecondi }: { cfg: LeagueConfig; timerSecondi: number }) {
  const [stato, setStato] = useState<StatoProva>(() => statoIniziale(cfg, timerSecondi));
  const [avviso, setAvviso] = useState<string | null>(null);
  const risposta = useRef<ReturnType<typeof setTimeout> | null>(null);

  const live = lottoLive(stato);
  const prossimo = prossimoLotto(stato);

  /**
   * La situazione del lotto aperto, ridotta a una stringa.
   *
   * Serve come innesco degli avversari: cambia a ogni offerta, quindi
   * l'effetto riparte a ogni rilancio — mio o loro — e si ferma da solo
   * quando nessuno ha più margine, perché in quel caso lo stato non cambia.
   */
  const situazione = live ? `${live.id}|${live.prezzo ?? ''}|${live.leader ?? ''}` : null;

  useEffect(() => {
    if (!situazione) return;
    const lotId = situazione.split('|')[0];
    const attesa = RITARDO_MIN + Math.random() * (RITARDO_MAX - RITARDO_MIN);
    const t = setTimeout(() => {
      setStato((prima) => mossaAvversari(prima, lotId, Date.now()).stato);
    }, attesa);
    risposta.current = t;
    return () => clearTimeout(t);
  }, [situazione]);

  const offri = useCallback((lotId: string, importo: number) => {
    setAvviso(null);
    setStato((prima) => {
      const r = rilancia(prima, lotId, IO, importo, Date.now());
      if (r.errore) queueMicrotask(() => setAvviso(r.errore));
      return r.stato;
    });
  }, []);

  /** Timer a zero: il lotto si chiude. Chiamarla due volte non fa danni. */
  const scaduto = useCallback((lotId: string) => {
    setStato((prima) => {
      const l = prima.lotti.find((x) => x.id === lotId);
      if (!l || l.stato !== 'live') return prima;
      return chiudiLotto(prima, lotId).stato;
    });
  }, []);

  const ricomincia = useCallback(() => {
    if (risposta.current) clearTimeout(risposta.current);
    setAvviso(null);
    setStato(statoIniziale(cfg, timerSecondi));
  }, [cfg, timerSecondi]);

  const righe = useMemo(() => stato.lotti.map((l) => vista(stato, l)), [stato]);
  const lottoAperto = useMemo(() => (live ? vista(stato, live) : null), [stato, live]);

  return (
    <>
      <div className="callout" style={{ borderColor: 'var(--accent)' }}>
        <b>Questa è una simulazione.</b> Squadre, giocatori e crediti sono
        inventati: niente di quello che succede qui tocca le rose vere, i
        crediti veri o i messaggi su Telegram. Le regole invece sono le stesse —
        rilancio minimo, tetto del budget, timer che riparte a ogni offerta,
        rimborso al {Math.round(cfg.refundPct * 100)}% di chi esce.
      </div>

      <div className="panel" style={{ padding: 16, marginBottom: 20, background: 'var(--surface-2)' }}>
        <p className="eyebrow" style={{ margin: '0 0 10px' }}>Regia della prova</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {!stato.salaAperta && (
            <button className="primary" onClick={() => { setAvviso(null); setStato(apriSala(stato)); }}>
              Apri la sala
            </button>
          )}

          {stato.salaAperta && prossimo && !live && (
            <button className="primary" onClick={() => {
              const r = apriLotto(stato, prossimo.id, Date.now());
              setAvviso(r.errore);
              setStato(r.stato);
            }}>
              Apri lotto {prossimo.indice} · {prossimo.giocatore.nome}
            </button>
          )}

          {stato.salaAperta && live && (
            <button style={{ color: 'var(--crit)', borderColor: 'var(--crit)' }}
              onClick={() => setStato(chiudiLotto(stato, live.id).stato)}>
              Chiudi subito il lotto
            </button>
          )}

          {stato.salaAperta && !prossimo && !live && (
            <button className="primary" onClick={() => setStato(chiudiSerata(stato))}>
              Chiudi la serata
            </button>
          )}

          <button style={{ marginLeft: 'auto' }} onClick={ricomincia}>
            Ricomincia da capo
          </button>
        </div>
      </div>

      {!stato.salaAperta ? (
        <div className="panel">
          <div className="empty">
            Tre lotti pronti. Apri la sala: quello con un solo partecipante si
            assegna da sé, sugli altri si va all&apos;asta.
          </div>
        </div>
      ) : lottoAperto ? (
        <LiveLot lot={lottoAperto} myTeamId={IO} onBid={offri} onExpire={scaduto} />
      ) : (
        <div className="panel"><div className="empty">Nessun lotto aperto in questo momento.</div></div>
      )}

      {avviso && <div className="callout crit" role="status">{avviso}</div>}

      <h2 style={{ marginTop: 24 }}>Le squadre</h2>
      <div className="panel">
        <div className="tablewrap">
          <table>
            <thead><tr><th>Squadra</th><th className="num">Crediti</th></tr></thead>
            <tbody>
              {stato.squadre.map((sq) => (
                <tr key={sq.id} style={{ fontWeight: sq.id === IO ? 700 : 400 }}>
                  <td>
                    {sq.nome}
                    {sq.id === IO && <span className="tag muted" style={{ marginLeft: 6 }}>sei tu</span>}
                  </td>
                  <td className="num mono">{sq.crediti}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ProgrammaSerata rows={righe} />

      <h2>Diario della serata</h2>
      <div className="panel" style={{ padding: 16 }}>
        {stato.diario.length === 0
          ? <div className="empty">Non è ancora successo niente.</div>
          : (
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: '.9rem', lineHeight: 1.7 }}>
              {stato.diario.map((r, i) => <li key={i}>{r}</li>)}
            </ol>
          )}
      </div>
    </>
  );
}

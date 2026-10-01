'use client';

import { useEffect, useRef, useState } from 'react';
import { faseDelLotto, presenzeMancanti, siPuoRilanciare, type FaseLotto } from '@/lib/rules';
import { Countdown } from '../Countdown';

/**
 * I pezzi visivi della sala d'asta, staccati da chi li comanda.
 *
 * La sala vera e la sala di prova mostrano le stesse identiche cose: il lotto
 * aperto con il timer e i pulsanti di rilancio, e il programma della serata.
 * L'unica differenza è chi risponde quando si clicca — un'azione sul server
 * in un caso, la simulazione nel browser nell'altro. Tenendo la parte vista
 * qui dentro, la prova non è una riproduzione somigliante: è proprio la sala.
 */

export interface LotView {
  id: string;
  index: number;
  status: string;
  player: { name: string; role: string; club: string };
  callerTeam: string;
  currentPrice: number | null;
  currentLeader: string | null;
  currentLeaderId: string | null;
  timerEndsAt: string | null;
  winnerTeam: string | null;
  finalPrice: number | null;
  participants: {
    teamId: string; teamName: string; isCaller: boolean;
    releaseName: string; budget: number; liveCredits: number;
  }[];
  myBudget: number | null;
  iParticipate: boolean;
  /** chi ha confermato di essere in sala per questo lotto */
  presenze: { teamId: string; quando: string }[];
}

/** I secondi che contano, presi dalla lega. */
export interface TempiSala {
  timerSeconds: number;
  graceSeconds: number;
}

/**
 * L'ora del server, aggiornata quattro volte al secondo finché il lotto è in
 * sala.
 *
 * La fase del lotto non è un campo che arriva dal server: passa da «rilanci»
 * a «grazia» a «congelato» per il solo scorrere del tempo, e senza un tick il
 * pannello resterebbe a mostrare un countdown a zero per sempre.
 *
 * `scarto` è la differenza fra l'orologio del server e quello di qui, e non è
 * un lusso: `timerEndsAt` lo scrive Postgres, e un telefono con l'ora avanti
 * di venti secondi vedrebbe il lotto congelato nell'istante in cui si apre,
 * coi pulsanti di rilancio spenti per tutta l'asta.
 */
function useOra(attivo: boolean, scarto: number): number {
  const [ora, setOra] = useState(() => Date.now() + scarto);
  useEffect(() => {
    if (!attivo) return;
    const id = setInterval(() => setOra(Date.now() + scarto), 250);
    return () => clearInterval(id);
  }, [attivo, scarto]);
  return ora;
}

/**
 * «Conferma presenza»: la finestra che si apre a chi deve giocarsi il lotto.
 *
 * Non si chiude cliccando fuori e non si chiude con Esc: è la porta per
 * entrare nell'asta, non un avviso da scacciare. Finché una delle squadre in
 * corsa non ha confermato, il countdown non parte per nessuno — quindi
 * nessuno sta perdendo secondi mentre questa finestra è aperta.
 */
function ModalePresenza({ lot, mioBudget, onConferma, inCorso, errore, onEsci }: {
  lot: LotView; mioBudget: number; onConferma: () => void; inCorso: boolean;
  errore?: string | null; onEsci: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (!ref.current?.open) ref.current?.showModal(); }, []);

  const mancano = presenzeMancanti(
    lot.participants.map((p) => ({ teamId: p.teamId, squadra: p.teamName })),
    lot.presenze,
  );

  return (
    <dialog ref={ref} onCancel={(e) => e.preventDefault()}>
      <div className="head">Tocca a te: {lot.player.name}</div>
      <div className="body">
        <p style={{ marginTop: 0 }}>
          Il lotto {lot.index} è aperto e tu sei in corsa. Il countdown parte
          quando hanno confermato tutti: da quel momento hai pochi secondi per
          rilanciare, e ogni rilancio lo rimette a zero.
        </p>
        <p className="mono" style={{ color: 'var(--muted)', fontSize: '.9rem' }}>
          {lot.player.role} · {lot.player.club} · il tuo budget su questo lotto: <b>{mioBudget} cr</b>
        </p>
        {mancano.length > 0 && (
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>
            Ancora da confermare: {mancano.join(', ')}.
          </p>
        )}
        {/*
          * Il messaggio del server va letto QUI: con una finestra modale
          * aperta il resto della pagina è inerte, e un avviso stampato sotto
          * sarebbe invisibile proprio quando serve — per esempio se la tua
          * adesione è stata annullata e la conferma viene rifiutata.
          */}
        {errore && <p className="callout crit" style={{ margin: 0 }}>{errore}</p>}
      </div>
      <div className="foot">
        <button type="button" onClick={onEsci}>Guarda e basta</button>
        <button className="primary" disabled={inCorso} onClick={onConferma}>
          {inCorso ? 'Confermo…' : 'Conferma presenza'}
        </button>
      </div>
    </dialog>
  );
}

/** L'attesa, vista da tutti: chi c'è e chi si sta aspettando. */
function Attesa({ lot, mioTurno, onConferma, inCorso }: {
  lot: LotView; mioTurno: boolean; onConferma: () => void; inCorso: boolean;
}) {
  const dentro = new Set(lot.presenze.map((p) => p.teamId));
  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ fontSize: '.72rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        Si aspettano le presenze
      </h3>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {lot.participants.map((p) => (
          <span key={p.teamId} className={dentro.has(p.teamId) ? 'tag' : 'tag muted'}>
            {dentro.has(p.teamId) ? '✓ ' : '· '}{p.teamName}
          </span>
        ))}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '.9rem', marginBottom: mioTurno ? 10 : 0 }}>
        Il countdown parte da sé quando ha confermato almeno un allenatore per
        ogni squadra in corsa.
      </p>
      {/* per chi ha chiuso la finestra: la porta resta aperta */}
      {mioTurno && (
        <button className="primary" disabled={inCorso} onClick={onConferma}>
          {inCorso ? 'Confermo…' : 'Conferma presenza'}
        </button>
      )}
    </div>
  );
}

export function LiveLot({ lot, myTeamId, tempi, scarto = 0, onBid, onConferma, confermando, errore }: {
  lot: LotView; myTeamId: string; tempi: TempiSala;
  /** differenza fra l'orologio del server e quello locale, in millisecondi */
  scarto?: number;
  onBid: (lotId: string, amount: number) => void;
  onConferma: (lotId: string) => void;
  confermando?: boolean;
  errore?: string | null;
}) {
  const ora = useOra(lot.status === 'live', scarto);
  // chi chiude la finestra senza confermare resta a guardare, ma il bottone
  // ricompare nel pannello dell'attesa: non si rimane fuori per sbaglio
  const [finestraChiusa, setFinestraChiusa] = useState(false);
  const fase: FaseLotto = faseDelLotto(
    { status: lot.status, timerEndsAt: lot.timerEndsAt }, new Date(ora), tempi,
  );

  const iLead = lot.currentLeaderId === myTeamId;
  const price = lot.currentPrice ?? 0;
  const next = lot.currentPrice === null ? 1 : price + 1;
  const budget = lot.myBudget ?? 0;
  const apertoAiRilanci = siPuoRilanciare(fase);
  const canBid = lot.iParticipate && !iLead && budget >= next && apertoAiRilanci;

  const steps = [1, 5, 10].map((s) => (lot.currentPrice === null ? s : price + s));

  // il modal tocca solo chi è in corsa e la cui squadra non ha ancora
  // confermato: al secondo allenatore non si chiede due volte
  const mioTurno = fase === 'attesa_presenze' && lot.iParticipate
    && !lot.presenze.some((p) => p.teamId === myTeamId);

  return (
    <div className="panel" style={{ padding: 20, borderColor: 'var(--accent)' }}>
      {mioTurno && !finestraChiusa && (
        <ModalePresenza
          lot={lot} mioBudget={budget} inCorso={Boolean(confermando)}
          errore={errore} onEsci={() => setFinestraChiusa(true)}
          onConferma={() => onConferma(lot.id)}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>
            Lotto {lot.index} · {fase === 'attesa_presenze' ? 'in attesa dei contendenti' : 'all\'asta adesso'}
          </p>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-.02em' }}>
            {lot.player.name}
          </div>
          <div style={{ color: 'var(--muted)' }}>
            {lot.player.role} · {lot.player.club} · chiamato da {lot.callerTeam}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="k" style={{ fontSize: '.68rem', letterSpacing: '.12em', color: 'var(--muted)' }}>
            OFFERTA CORRENTE
          </div>
          <div className="mono" style={{ fontSize: '2.4rem', fontWeight: 600, lineHeight: 1 }}>
            {lot.currentPrice ?? '—'}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '.9rem' }}>
            {lot.currentLeader ? `di ${lot.currentLeader}` : 'nessuna offerta'}
          </div>

          {/*
            * Il countdown si vede solo mentre corre. Nella grazia e a lotto
            * congelato un «0s» fisso sembrerebbe un blocco: meglio dire a
            * parole cosa sta succedendo, perché sono i due momenti in cui
            * tutti guardano lo schermo senza capire di chi si aspetta cosa.
            */}
          {fase === 'rilanci' && lot.timerEndsAt && (
            <div className="mono" style={{ fontSize: '1.3rem', marginTop: 6 }}>
              ⏱ <Countdown to={lot.timerEndsAt} scarto={scarto} />
            </div>
          )}
          {fase === 'grazia' && (
            <div style={{ fontSize: '.9rem', marginTop: 6, color: 'var(--accent)', fontWeight: 700 }}>
              Ultimo istante: un rilancio vale ancora
            </div>
          )}
          {fase === 'congelato' && (
            <div style={{ fontSize: '.9rem', marginTop: 6, fontWeight: 700 }}>
              In attesa del martello
            </div>
          )}
        </div>
      </div>

      {fase === 'attesa_presenze' && (
        <Attesa
          lot={lot} mioTurno={mioTurno} inCorso={Boolean(confermando)}
          onConferma={() => onConferma(lot.id)}
        />
      )}

      {fase !== 'attesa_presenze' && (lot.iParticipate ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {steps.map((amount, i) => (
              <button key={amount} className={i === 0 ? 'primary' : ''}
                      disabled={!canBid || amount > budget}
                      onClick={() => onBid(lot.id, amount)}>
                {amount} cr
              </button>
            ))}
            <span className="mono" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: '.9rem' }}>
              budget {budget} cr
            </span>
          </div>
          {iLead && apertoAiRilanci && (
            <div className="callout" style={{ marginTop: 12 }}>Sei tu il migliore offerente.</div>
          )}
          {fase === 'congelato' && (
            <div className="callout" style={{ marginTop: 12 }}>
              Tempo finito: {lot.currentLeader
                ? `il lotto va a ${lot.currentLeader} per ${price} crediti, appena l'admin aggiudica.`
                : 'nessuno ha rilanciato, decide l\'admin.'}
            </div>
          )}
          {!iLead && apertoAiRilanci && budget < next && (
            <div className="callout crit" style={{ marginTop: 12 }}>
              Il tuo budget non arriva a {next} crediti: su questo lotto sei fuori.
            </div>
          )}
        </div>
      ) : (
        <div className="callout" style={{ marginTop: 18 }}>
          Non partecipi a questo lotto: puoi solo guardare.
        </div>
      ))}

      <h3 style={{ marginTop: 20, fontSize: '.72rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        In gara
      </h3>
      <div className="tablewrap">
        <table>
          <thead>
            <tr><th>Squadra</th><th>Mette sul piatto</th><th className="num">Budget</th></tr>
          </thead>
          <tbody>
            {lot.participants.map((p) => (
              <tr key={p.teamId} style={{ fontWeight: p.teamId === lot.currentLeaderId ? 700 : 400 }}>
                <td>
                  {p.teamName}
                  {p.isCaller && <span className="tag muted" style={{ marginLeft: 6 }}>chiamante</span>}
                  {fase === 'attesa_presenze' && lot.presenze.some((x) => x.teamId === p.teamId)
                    && <span className="tag" style={{ marginLeft: 6 }}>in sala</span>}
                </td>
                <td>{p.releaseName}</td>
                <td className="num">{p.budget}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Il tabellone della serata: cosa è già andato, cosa sta andando, cosa resta. */
export function ProgrammaSerata({ rows }: { rows: LotView[] }) {
  return (
    <>
      <h2>Programma della serata</h2>
      <div className="panel">
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>#</th><th>Giocatore</th><th>Partecipanti</th><th className="num">Esito</th></tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} style={{ opacity: l.status === 'assigned' ? .65 : 1 }}>
                  <td className="num">{l.index}</td>
                  <td>
                    <span className="role-badge">{l.player.role}</span>{' '}
                    <b>{l.player.name}</b>{' '}
                    <span style={{ color: 'var(--muted)' }}>{l.player.club}</span>
                  </td>
                  <td style={{ fontSize: '.85rem' }}>
                    {l.participants.map((p) => (
                      <div key={p.teamId}>
                        {p.teamName} <span style={{ color: 'var(--muted)' }}>
                          — svincola {p.releaseName} · budget {p.budget}
                        </span>
                      </div>
                    ))}
                  </td>
                  <td className="num">
                    {l.status === 'assigned'
                      ? <><b>{l.winnerTeam}</b><br />{l.finalPrice} cr</>
                      : l.status === 'live'
                        ? l.timerEndsAt
                          ? <span className="tag crit">In corso</span>
                          : <span className="tag">Presenze</span>
                      : l.status === 'cancelled' ? <span className="tag muted">Annullato</span>
                      : <span className="tag muted">In attesa</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

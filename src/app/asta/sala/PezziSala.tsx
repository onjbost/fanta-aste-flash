'use client';

import { useEffect, useState } from 'react';
import { faseDelLotto, presenzeMancanti, siPuoRilanciare, type FaseLotto } from '@/lib/rules';
import { cifraDiRilancio, consumoDelTimer, rilancioMinimo, scorciatoie } from '@/lib/asta';
import { Foglio } from '../../Foglio';
import { Stemma } from '../../Stemma';

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
    /** lo stemma della squadra, se l'admin l'ha caricato */
    stemma?: string | null;
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
 * «Conferma presenza»: il foglio che si apre a chi deve giocarsi il lotto.
 *
 * Non si chiude toccando fuori e non si chiude con Esc: è la porta per
 * entrare nell'asta, non un avviso da scacciare. Finché una delle squadre in
 * corsa non ha confermato, il countdown non parte per nessuno — quindi
 * nessuno sta perdendo secondi mentre questo foglio è aperto.
 */
function FoglioPresenza({ lot, mioBudget, onConferma, inCorso, errore, onEsci }: {
  lot: LotView; mioBudget: number; onConferma: () => void; inCorso: boolean;
  errore?: string | null; onEsci: () => void;
}) {
  const mancano = presenzeMancanti(
    lot.participants.map((p) => ({ teamId: p.teamId, squadra: p.teamName })),
    lot.presenze,
  );

  return (
    <Foglio aperto bloccato onChiudi={onEsci} titolo={`Tocca a te: ${lot.player.name}`}>
      <div>
        <p style={{ margin: '4px 0 0', fontSize: '.92rem' }}>
          Il lotto {lot.index} è aperto e tu sei in corsa. Il countdown parte quando hanno
          confermato tutti: da lì hai pochi secondi per rilanciare, e ogni rilancio lo rimette a zero.
        </p>
        <div className="budget-riga">
          <span>{lot.player.role} · {lot.player.club} · il tuo budget</span>
          <b className="num">{mioBudget} cr</b>
        </div>
        {mancano.length > 0 && (
          <p className="foglio-nota">Ancora da confermare: {mancano.join(', ')}.</p>
        )}
        {/*
          * Il messaggio del server va letto QUI: con il foglio aperto il resto
          * della pagina è inerte, e un avviso stampato sotto sarebbe invisibile
          * proprio quando serve — per esempio se la tua adesione è stata
          * annullata e la conferma viene rifiutata.
          */}
        {errore && <p className="callout crit">{errore}</p>}
        <button className="primary largo" disabled={inCorso} onClick={onConferma}>
          {inCorso ? 'Confermo…' : 'Conferma presenza'}
        </button>
        <button type="button" className="largo" style={{ marginTop: 8 }} onClick={onEsci}>
          Guarda e basta
        </button>
      </div>
    </Foglio>
  );
}

/**
 * L'anello del timer intorno all'offerta.
 *
 * Si svuota man mano che il countdown scende, e cambia colore solo alla fine:
 * arancio negli ultimi dieci secondi, rosso negli ultimi tre. Un allarme
 * acceso sempre non è un allarme.
 */
function AnelloOfferta({ lot, fase, ora, secondi }: {
  lot: LotView; fase: FaseLotto; ora: number; secondi: number;
}) {
  const R = 96;
  const giro = 2 * Math.PI * R;
  const consumo = fase === 'rilanci' ? consumoDelTimer(lot.timerEndsAt, ora, secondi)
    : fase === 'attesa_presenze' ? 0 : 1;
  const resta = lot.timerEndsAt ? Math.max(0, Math.ceil((new Date(lot.timerEndsAt).getTime() - ora) / 1000)) : null;
  const tono = fase === 'grazia' ? 'critico'
    : fase === 'congelato' ? 'fermo'
    : fase === 'rilanci' && resta !== null && resta <= 3 ? 'critico'
    : fase === 'rilanci' && resta !== null && resta <= 10 ? 'avviso'
    : fase === 'attesa_presenze' ? 'fermo' : '';

  return (
    <div className={`anello-offerta ${tono}`}>
      <svg viewBox="0 0 220 220" aria-hidden="true">
        <circle className="pista" cx="110" cy="110" r={R} />
        <circle
          className="arco" cx="110" cy="110" r={R}
          strokeDasharray={giro} strokeDashoffset={giro * consumo}
          transform="rotate(-90 110 110)" suppressHydrationWarning
        />
      </svg>
      <div className="anello-centro">
        <span className="k">Offerta</span>
        <span className="prezzo num">{lot.currentPrice ?? '—'}</span>
        <span className="chi-offre">{lot.currentLeader ? lot.currentLeader : 'nessuna offerta'}</span>
        {/*
          * Il tempo si scrive solo mentre corre. Nella grazia e a lotto
          * congelato un «0s» fisso sembrerebbe un blocco: meglio dire a parole
          * cosa sta succedendo, perché sono i due momenti in cui tutti guardano
          * lo schermo senza capire di chi si aspetta cosa.
          */}
        <span className="tempo" role="timer" aria-live="off">
          {fase === 'rilanci' && resta !== null ? <span className="num">{resta}s</span>
            : fase === 'grazia' ? 'Ultimo istante'
            : fase === 'congelato' ? 'Si aspetta il martello'
            : fase === 'attesa_presenze' ? 'Si aspettano le presenze' : ''}
        </span>
      </div>
    </div>
  );
}

/** Chi si gioca il lotto: stemma, pallino di presenza, budget e chi mette sul piatto. */
function Contendenti({ lot, fase, myTeamId }: { lot: LotView; fase: FaseLotto; myTeamId: string }) {
  const dentro = new Set(lot.presenze.map((p) => p.teamId));
  return (
    <ul className="contendenti" aria-label="In gara">
      {lot.participants.map((p) => {
        const presente = dentro.has(p.teamId);
        const inTesta = p.teamId === lot.currentLeaderId;
        return (
          <li key={p.teamId} className={`${inTesta ? 'in-testa' : ''}${p.teamId === myTeamId ? ' io' : ''}`}>
            <span className="avatar">
              <Stemma nome={p.teamName} url={p.stemma ?? null} size={46} />
              {fase === 'attesa_presenze' && (
                <span className={`presenza${presente ? ' si' : ''}`}
                      aria-label={presente ? 'in sala' : 'non ancora in sala'} />
              )}
            </span>
            <b>{p.teamName}</b>
            <span className="num budget">{p.budget} cr</span>
            <small>esce {p.releaseName}</small>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Il pannello di rilancio: tre scorciatoie, lo stepper e un solo bottone che
 * dice la cifra.
 *
 * La cifra scelta vale per il lotto in cui la scegli. Se nel frattempo
 * l'offerta la supera, il bottone si riallinea al minimo valido invece di
 * proporre un rilancio che il server rifiuterebbe.
 */
function PannelloRilancio({ lot, fase, myTeamId, onBid, errore }: {
  lot: LotView; fase: FaseLotto; myTeamId: string;
  onBid: (lotId: string, amount: number) => void;
  errore?: string | null;
}) {
  const [scelta, setScelta] = useState<{ lotto: string; cifra: number } | null>(null);
  const iLead = lot.currentLeaderId === myTeamId;
  const budget = lot.myBudget ?? 0;
  const minimo = rilancioMinimo(lot.currentPrice);
  const cifra = cifraDiRilancio(scelta?.lotto === lot.id ? scelta.cifra : null, minimo);
  const aperto = siPuoRilanciare(fase);
  const puo = !iLead && aperto && budget >= minimo;

  const scegli = (c: number) => setScelta({ lotto: lot.id, cifra: c });

  return (
    <div className="rilancio">
      <div className="rilancio-stato">
        {fase === 'congelato' ? (
          <span>Tempo finito: {lot.currentLeader
            ? `va a ${lot.currentLeader} per ${lot.currentPrice}, appena l'admin aggiudica.`
            : 'nessuno ha rilanciato, decide l\'admin.'}</span>
        ) : iLead ? (
          <span className="ok">Sei in testa a {lot.currentPrice} cr</span>
        ) : budget < minimo ? (
          <span className="crit">Il tuo budget non arriva a {minimo}: su questo lotto sei fuori.</span>
        ) : (
          <span>Minimo {minimo} cr</span>
        )}
        <span className="num budget">budget {budget}</span>
      </div>

      {errore && <p className="rilancio-errore" role="status">{errore}</p>}

      <div className="rilancio-scorciatoie">
        {scorciatoie(lot.currentPrice).map((s) => (
          <button key={s.passo} type="button" aria-pressed={cifra === s.cifra}
                  disabled={!puo || s.cifra > budget} onClick={() => scegli(s.cifra)}>
            {lot.currentPrice === null ? s.cifra : `+${s.passo}`}
          </button>
        ))}
      </div>

      <div className="rilancio-azione">
        <div className="stepper">
          <button type="button" aria-label="Un credito in meno" disabled={!puo || cifra <= minimo}
                  onClick={() => scegli(cifra - 1)}>−</button>
          <span className="num" aria-live="polite">{cifra}</span>
          <button type="button" aria-label="Un credito in più" disabled={!puo || cifra >= budget}
                  onClick={() => scegli(cifra + 1)}>+</button>
        </div>
        <button type="button" className="primary" disabled={!puo || cifra > budget}
                onClick={() => { onBid(lot.id, cifra); setScelta(null); }}>
          Rilancia a {cifra}
        </button>
      </div>
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
  // chi chiude il foglio senza confermare resta a guardare, ma il bottone
  // ricompare sotto l'anello: non si rimane fuori per sbaglio
  const [fuori, setFuori] = useState(false);
  const fase: FaseLotto = faseDelLotto(
    { status: lot.status, timerEndsAt: lot.timerEndsAt }, new Date(ora), tempi,
  );

  // il foglio tocca solo chi è in corsa e la cui squadra non ha ancora
  // confermato: al secondo allenatore non si chiede due volte
  const mioTurno = fase === 'attesa_presenze' && lot.iParticipate
    && !lot.presenze.some((p) => p.teamId === myTeamId);

  return (
    <section className="sala-live" aria-label={`Lotto ${lot.index}`}>
      {mioTurno && !fuori && (
        <FoglioPresenza
          lot={lot} mioBudget={lot.myBudget ?? 0} inCorso={Boolean(confermando)}
          errore={errore} onEsci={() => setFuori(true)}
          onConferma={() => onConferma(lot.id)}
        />
      )}

      <div className="sala-giocatore">
        <span className="role-badge">{lot.player.role}</span>
        <div className="chi-col">
          <b>{lot.player.name}</b>
          <small>{lot.player.club} · lotto {lot.index} · chiamato da {lot.callerTeam}</small>
        </div>
      </div>

      <AnelloOfferta lot={lot} fase={fase} ora={ora} secondi={tempi.timerSeconds} />

      <Contendenti lot={lot} fase={fase} myTeamId={myTeamId} />

      {fase === 'attesa_presenze' && (
        <div className="sala-attesa">
          <p>Il countdown parte da sé quando ha confermato almeno un allenatore per ogni squadra in corsa.</p>
          {mioTurno && (
            <button className="primary largo" disabled={confermando} onClick={() => onConferma(lot.id)}>
              {confermando ? 'Confermo…' : 'Conferma presenza'}
            </button>
          )}
        </div>
      )}

      {fase !== 'attesa_presenze' && (lot.iParticipate
        ? <PannelloRilancio lot={lot} fase={fase} myTeamId={myTeamId} onBid={onBid} errore={errore} />
        : <p className="sala-guarda">Non partecipi a questo lotto: puoi solo guardare.</p>)}
    </section>
  );
}

/** Lo stato di un lotto in una parola, per la chip e per il foglio. */
function statoDelLotto(l: LotView): { testo: string; classe: string } {
  if (l.status === 'assigned') return { testo: `${l.winnerTeam} · ${l.finalPrice}`, classe: 'fatto' };
  if (l.status === 'live') return { testo: l.timerEndsAt ? 'all\'asta' : 'presenze', classe: 'live' };
  if (l.status === 'cancelled') return { testo: 'annullato', classe: 'fatto' };
  return { testo: 'in attesa', classe: '' };
}

/**
 * I lotti della serata in chip: cosa è andato, cosa sta andando, cosa resta.
 * Un tocco apre il foglio del lotto, con chi è in corsa e chi mette sul piatto.
 */
export function ProgrammaSerata({ rows }: { rows: LotView[] }) {
  const [apertoId, setApertoId] = useState<string | null>(null);
  const aperto = rows.find((l) => l.id === apertoId) ?? null;

  if (!rows.length) return null;

  return (
    <>
      <div className="chips lotti-serata" aria-label="Lotti della serata">
        {rows.map((l) => {
          const st = statoDelLotto(l);
          return (
            <button key={l.id} type="button" className={`chip-lotto ${st.classe}`} onClick={() => setApertoId(l.id)}>
              <span className="num">{l.index}</span>
              <span className="nome">{l.player.name}</span>
              {l.status === 'assigned' && <span className="num esito">{l.finalPrice}</span>}
            </button>
          );
        })}
      </div>

      <Foglio
        aperto={aperto !== null} onChiudi={() => setApertoId(null)}
        titolo={aperto ? `Lotto ${aperto.index} · ${aperto.player.name}` : ''}
      >
        {aperto && (
          <div>
            <p className="foglio-nota" style={{ marginTop: 2 }}>
              {aperto.player.role} · {aperto.player.club} · chiamato da {aperto.callerTeam} ·{' '}
              <b style={{ color: 'var(--ink)' }}>{statoDelLotto(aperto).testo}</b>
            </p>
            <ul className="elenco-scelta" style={{ marginTop: 10 }}>
              {aperto.participants.map((p) => (
                <li key={p.teamId}>
                  <div className="scelto" style={{ background: 'none', margin: 0, padding: '10px 2px' }}>
                    <Stemma nome={p.teamName} url={p.stemma ?? null} size={32} />
                    <span className="chi-col">
                      <b>{p.teamName}{p.isCaller ? ' · chiamante' : ''}</b>
                      <small>esce {p.releaseName}</small>
                    </span>
                    <span className="num qt">{p.budget} cr</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Foglio>
    </>
  );
}

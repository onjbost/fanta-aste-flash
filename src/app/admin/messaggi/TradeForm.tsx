'use client';

import { useActionState, useState } from 'react';
import { confermaScambio, disfaScambio, scriviScambio, type MsgState } from './actions';
import { firmaScelta, MAX_NOTE } from '@/lib/mercato/scambio';
import type { Ruolo } from '@/lib/redazione/tabellino';
import { Chiudi, Scambio, Spunta } from '../../Icone';

/**
 * Del giocatore, qui serve solo quello che si vede: nome, ruolo, club e
 * quanto l'aveva pagato. Fantamedie e presenze restano al server, dove
 * servono al prompt: mandarle al browser vorrebbe dire spedire mezzo
 * database per disegnare una tendina.
 */
export interface GiocatoreCliente {
  playerId: string; nome: string; ruolo: Ruolo; club: string; prezzo: number;
}

/** Un lato dello scambio: la squadra e la sua rosa intera, da cui si pesca. */
export interface LatoCliente {
  teamId: string; nome: string; crediti: number; rosa: GiocatoreCliente[];
}

interface Saved {
  id: string; body: string; createdAt: string;
  appliedAt: string | null; revertedAt: string | null;
  settlement: number; settlementPayer: 'from' | 'to' | null;
  /**
   * I fatti congelati alla scrittura. Arriva da una colonna `jsonb`, quindi la
   * forma non è garantita da niente: si legge con `leggiSpunti`, che davanti a
   * qualcosa di inatteso preferisce dire «non lo so» piuttosto che indovinare.
   */
  spunti: unknown;
}

/** Del giocatore congelato serve meno che del vivo: nome e ruolo bastano al conto. */
interface GiocatoreCongelato { playerId: string; nome: string; ruolo: Ruolo }

/**
 * Un lato come era al momento della scrittura. `cede` qui sono **solo** i
 * giocatori scambiati (`costruisciRichiesta` filtra la rosa), e la rosa intera
 * c'è solo come conteggio per ruolo: è tutto quello che l'anteprima mostra,
 * quindi basta.
 */
interface LatoCongelato {
  teamId: string; nome: string; crediti: number;
  rosaPerRuolo: Record<Ruolo, number>; cede: GiocatoreCongelato[];
}

const RUOLI: Ruolo[] = ['P', 'D', 'C', 'A'];

function Aggiungi({ id, rosa, scelti, bloccati, onAggiungi }: {
  id: string; rosa: GiocatoreCliente[]; scelti: string[]; bloccati: string[];
  onAggiungi: (playerId: string) => void;
}) {
  return (
    <select
      id={id}
      className="scambio-aggiungi"
      aria-label="Aggiungi un giocatore allo scambio"
      value=""
      onChange={(e) => { if (e.target.value) onAggiungi(e.target.value); }}
    >
      <option value="">aggiungi giocatore…</option>
      {rosa
        .filter((g) => !scelti.includes(g.playerId))
        .map((g) => (
          <option key={g.playerId} value={g.playerId} disabled={bloccati.includes(g.playerId)}>
            {g.nome} ({g.ruolo}, {g.club}) · pagato {g.prezzo}
            {bloccati.includes(g.playerId) ? ' — impegnato altrove' : ''}
          </option>
        ))}
    </select>
  );
}

/** Come resta la rosa di un lato: fuori chi cede, dentro chi riceve. */
function rosaDopo(mio: LatoCliente, suo: LatoCliente, scelti: string[], suoi: string[]) {
  const restano = mio.rosa.filter((g) => !scelti.includes(g.playerId));
  const arrivano = suo.rosa.filter((g) => suoi.includes(g.playerId));
  const perRuolo = (l: typeof restano) =>
    (['P', 'D', 'C', 'A'] as const)
      .map((r) => `${l.filter((g) => g.ruolo === r).length} ${r}`).join(' · ');
  return {
    conteggio: perRuolo([...restano, ...arrivano]),
    fuori: mio.rosa.filter((g) => scelti.includes(g.playerId)).map((g) => g.nome),
    dentro: arrivano.map((g) => g.nome),
  };
}

/**
 * I ruoli il cui conteggio non torna come prima.
 *
 * È la stessa informazione dell'avviso di `validaScambio` («i ruoli non si
 * compensano»), ma vista dalla parte della rosa: lì si guarda lo scambio, qui
 * la squadra che resta — ed è quella che poi non riesce a schierare.
 */
function ruoliCambiati(
  mio: LatoCliente, suo: LatoCliente, scelti: string[], suoi: string[],
): Ruolo[] {
  const conta = (l: GiocatoreCliente[], r: Ruolo) => l.filter((g) => g.ruolo === r).length;
  const restano = mio.rosa.filter((g) => !scelti.includes(g.playerId));
  const arrivano = suo.rosa.filter((g) => suoi.includes(g.playerId));
  return RUOLI.filter((r) => conta(mio.rosa, r) !== conta(restano, r) + conta(arrivano, r));
}

/**
 * Un lato degli `spunti`, se ha la forma che ci aspettiamo.
 *
 * Difensivo fino in fondo: è JSON scritto da una versione dell'app che non è
 * detto sia questa. Al primo campo che non torna restituisce null, e chi
 * chiama trasforma quel null in «non posso mostrarti l'effetto, ricomponilo» —
 * che è la risposta giusta, perché confermare alla cieca è peggio.
 */
function latoCongelato(grezzo: unknown): LatoCongelato | null {
  if (!grezzo || typeof grezzo !== 'object') return null;
  const o = grezzo as Record<string, unknown>;
  if (typeof o.teamId !== 'string' || typeof o.nome !== 'string') return null;
  if (typeof o.crediti !== 'number' || !Number.isFinite(o.crediti)) return null;

  if (!o.rosaPerRuolo || typeof o.rosaPerRuolo !== 'object') return null;
  const conteggi = o.rosaPerRuolo as Record<string, unknown>;
  const rosaPerRuolo = { P: 0, D: 0, C: 0, A: 0 } as Record<Ruolo, number>;
  for (const r of RUOLI) {
    const n = conteggi[r];
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    rosaPerRuolo[r] = n;
  }

  if (!Array.isArray(o.cede) || o.cede.length === 0) return null;
  const cede: GiocatoreCongelato[] = [];
  for (const g of o.cede) {
    if (!g || typeof g !== 'object') return null;
    const x = g as Record<string, unknown>;
    if (typeof x.playerId !== 'string' || typeof x.nome !== 'string') return null;
    if (!RUOLI.includes(x.ruolo as Ruolo)) return null;
    cede.push({ playerId: x.playerId, nome: x.nome, ruolo: x.ruolo as Ruolo });
  }

  return { teamId: o.teamId, nome: o.nome, crediti: o.crediti, rosaPerRuolo, cede };
}

function leggiSpunti(grezzo: unknown): { casa: LatoCongelato; ospite: LatoCongelato } | null {
  if (!grezzo || typeof grezzo !== 'object') return null;
  const o = grezzo as Record<string, unknown>;
  const casa = latoCongelato(o.casa);
  const ospite = latoCongelato(o.ospite);
  return casa && ospite ? { casa, ospite } : null;
}

/**
 * L'effetto su una rosa, nella forma in cui si disegna.
 *
 * Esiste perché ci sono due strade per arrivarci — la selezione viva e i fatti
 * congelati nel `trade` — e devono finire nello stesso posto: una sola cosa da
 * disegnare, nessun rischio che le due anteprime si somiglino solo un po'.
 */
interface Effetto {
  nome: string; totale: number; conteggio: string; cambiati: Ruolo[];
  fuori: string[]; dentro: string[]; crediti: number; creditiDopo: number;
}

/** Dalla selezione a schermo. */
function effettoDalVivo(
  mio: LatoCliente, suo: LatoCliente, scelti: string[], suoi: string[], delta: number,
): Effetto {
  const d = rosaDopo(mio, suo, scelti, suoi);
  return {
    nome: mio.nome,
    totale: mio.rosa.length - scelti.length + suoi.length,
    conteggio: d.conteggio,
    cambiati: ruoliCambiati(mio, suo, scelti, suoi),
    fuori: d.fuori,
    dentro: d.dentro,
    crediti: mio.crediti,
    creditiDopo: mio.crediti + delta,
  };
}

/**
 * Dai fatti congelati, per uno scambio ripreso dopo un ricarico.
 *
 * È il percorso più normale che esista — scrivi, chiudi il telefono, torni
 * dopo — e senza questo l'anteprima mancava proprio lì. Gli `spunti` non
 * portano la rosa intera, ma non serve: i conteggi per ruolo di allora, meno
 * chi cede, più chi arriva, sono esattamente ciò che si mostra.
 */
function effettoDagliSpunti(mio: LatoCongelato, suo: LatoCongelato, delta: number): Effetto {
  const conta = (l: GiocatoreCongelato[], r: Ruolo) => l.filter((g) => g.ruolo === r).length;
  const dopo = { P: 0, D: 0, C: 0, A: 0 } as Record<Ruolo, number>;
  for (const r of RUOLI) dopo[r] = mio.rosaPerRuolo[r] - conta(mio.cede, r) + conta(suo.cede, r);

  return {
    nome: mio.nome,
    totale: RUOLI.reduce((a, r) => a + dopo[r], 0),
    conteggio: RUOLI.map((r) => `${dopo[r]} ${r}`).join(' · '),
    cambiati: RUOLI.filter((r) => dopo[r] !== mio.rosaPerRuolo[r]),
    fuori: mio.cede.map((g) => g.nome),
    dentro: suo.cede.map((g) => g.nome),
    crediti: mio.crediti,
    creditiDopo: mio.crediti + delta,
  };
}

/**
 * La rosa come resterà, per un lato.
 *
 * Si calcola dal client, senza interrogare il server: i dati ci sono già
 * tutti. Ed è il motivo per cui i due tempi esistono — confermare senza aver
 * visto l'effetto è esattamente ciò che si voleva evitare.
 */
function ComeResta({ e }: { e: Effetto }) {
  return (
    <div className="scambio-dopo">
      <p className="scambio-parte">{e.nome}</p>
      <p className="scambio-conteggio num">
        {e.totale} giocatori ·{' '}
        <span className={e.cambiati.length ? 'scambio-marcato' : undefined}>{e.conteggio}</span>
      </p>
      {e.cambiati.length > 0 && (
        <p className="scambio-riga scambio-marcato">
          cambia il numero di {e.cambiati.join(', ')}
        </p>
      )}
      {e.fuori.length > 0 && <p className="scambio-riga">esce {e.fuori.join(', ')}</p>}
      {e.dentro.length > 0 && <p className="scambio-riga">entra {e.dentro.join(', ')}</p>}
      {e.creditiDopo !== e.crediti && (
        <p className="scambio-riga num">crediti {e.crediti} → {e.creditiDopo}</p>
      )}
    </div>
  );
}

/** Le due rose, una coppia sola: su schermo stretto vanno in colonna. */
function Anteprima({ titolo, nota, casa, ospite }: {
  titolo: string; nota?: string; casa: Effetto; ospite: Effetto;
}) {
  return (
    <div className="scambio-anteprima">
      <p className="scambio-parte">{titolo}</p>
      {nota && <p className="scambio-riga scambio-nota-anteprima">{nota}</p>}
      <div className="scambio-coppia">
        <ComeResta e={casa} />
        <ComeResta e={ospite} />
      </div>
    </div>
  );
}

/** Chi cede quel lato: una voce per giocatore, con il campo che il server legge. */
function Scelti({ campo, rosa, scelti, onTogli }: {
  campo: 'fromPlayers' | 'toPlayers'; rosa: GiocatoreCliente[];
  scelti: string[]; onTogli: (playerId: string) => void;
}) {
  if (!scelti.length) return <p className="scambio-vuota">Nessun giocatore scelto.</p>;

  return (
    <ul className="scambio-lista">
      {scelti.map((id) => {
        const g = rosa.find((x) => x.playerId === id);
        if (!g) return null;
        return (
          <li key={id} className="scambio-voce">
            {/* è questo che `form.getAll('fromPlayers')` legge dall'altra parte */}
            <input type="hidden" name={campo} value={id} />
            <span className="scambio-chi">
              <b>{g.nome}</b>
              <span className="scambio-riga">{g.ruolo}, {g.club} · pagato {g.prezzo}</span>
            </span>
            <button type="button" className="scambio-togli" onClick={() => onTogli(id)}
              aria-label={`Togli ${g.nome} dallo scambio`}>
              <Chiudi />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function TradeForm({ rose, bloccati, saved }: {
  rose: LatoCliente[]; bloccati: string[]; saved: Saved[];
}) {
  const [statoScrivi, scrivi, scrivendo] = useActionState<MsgState, FormData>(scriviScambio, null);
  const [statoConferma, conferma, confermando] =
    useActionState<MsgState, FormData>(confermaScambio, null);
  const [statoDisfa, disfa, disfando] = useActionState<MsgState, FormData>(disfaScambio, null);
  const [copiato, setCopiato] = useState(false);

  const [daId, setDaId] = useState(rose[0]?.teamId ?? '');
  const [aId, setAId] = useState(rose[1]?.teamId ?? '');
  const [dati, setDati] = useState<string[]>([]);
  const [presi, setPresi] = useState<string[]>([]);
  // Il conguaglio è facoltativo: finché è vuoto o zero, chiedere «chi paga»
  // sarebbe una domanda senza oggetto, e la si tiene fuori dal form.
  const [conguaglio, setConguaglio] = useState('');
  const [chiPaga, setChiPaga] = useState<'from' | 'to'>('from');
  const [note, setNote] = useState('');

  const casa = rose.find((l) => l.teamId === daId) ?? null;
  const ospite = rose.find((l) => l.teamId === aId) ?? null;
  const conguaglioAttivo = Number(conguaglio) > 0;

  // Lo scambio che abbiamo in mano: quello appena scritto, o l'ultimo del
  // registro. Se è già registrato o già annullato lo dicono `applied_at` e
  // `reverted_at`, e si leggono sempre dalla riga del database: ogni azione
  // fa `revalidatePath`, quindi la riga è aggiornata, mentre uno stato di
  // `useActionState` resta quello dell'ultima volta che quell'azione è girata.
  const idInMano = (statoScrivi?.ok ? statoScrivi.tradeId : undefined) ?? saved[0]?.id ?? null;
  const riga = saved.find((s) => s.id === idInMano) ?? null;
  const applicato = riga?.appliedAt != null;
  const annullato = riga?.revertedAt != null;
  const testo = (statoScrivi?.ok ? statoScrivi.body : undefined) ?? riga?.body ?? '';
  const avvisi = (statoScrivi?.ok ? statoScrivi.rilievi : undefined) ?? [];
  // scritto in questa sessione: solo allora la selezione a schermo è davvero
  // quella con cui il pezzo è stato scritto
  const scrittoOra = statoScrivi?.ok === true;
  const congelato = riga ? leggiSpunti(riga.spunti) : null;

  async function copia() {
    try {
      await navigator.clipboard.writeText(testo);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 1800);
    } catch {
      setCopiato(false);
    }
  }

  if (!casa || !ospite) {
    return (
      <div className="msgcard">
        <div className="msgcard-head"><span>Fantacalciomercato · scambio</span></div>
        <div className="empty" style={{ padding: '20px 16px' }}>
          Servono almeno due squadre con una rosa.
        </div>
      </div>
    );
  }

  // il conguaglio lo versa uno dei due: a chi paga esce, all'altro entra
  const versato = conguaglioAttivo ? Number(conguaglio) : 0;
  const deltaCasa = chiPaga === 'from' ? -versato : versato;
  // a mani vuote non c'è nessun effetto da far vedere
  const conUnaScelta = dati.length > 0 || presi.length > 0;

  /*
   * La regola che tiene in piedi i due tempi: il bottone registra uno scambio,
   * e a schermo deve esserci l'effetto di QUELLO scambio.
   *
   * L'anteprima segue la selezione viva — è giusto, è il modo in cui si compone
   * uno scambio — ma il testo e il `tradeId` restano quelli dell'ultima
   * scrittura. Appena i due si separano, quello che si guarda non è più quello
   * che si registrerebbe: «Conferma» si spegne e la riga qui sotto dice perché.
   *
   * Due casi, perché la scelta di riferimento cambia:
   * - scritto adesso: la firma arriva dalla server action, cioè dalla scelta
   *   che è finita davvero nel registro, e si confronta con quella a schermo;
   * - scambio ripreso dopo un ricarico: a schermo non c'è nessuna scelta, la
   *   verità sono i fatti congelati. Toccare le liste vuol dire comporre
   *   un altro scambio, e allora il vecchio non si conferma più a occhi chiusi.
   */
  const firmaViva = firmaScelta({
    fromTeamId: daId, toTeamId: aId,
    fromPlayerIds: dati, toPlayerIds: presi,
    conguaglio: versato, chiPaga,
  });
  const firmaScritta = (scrittoOra ? statoScrivi?.firma : undefined)
    ?? (congelato && riga
      ? firmaScelta({
        fromTeamId: congelato.casa.teamId, toTeamId: congelato.ospite.teamId,
        fromPlayerIds: congelato.casa.cede.map((g) => g.playerId),
        toPlayerIds: congelato.ospite.cede.map((g) => g.playerId),
        conguaglio: riga.settlement, chiPaga: riga.settlementPayer ?? 'from',
      })
      : null);

  const divergente = scrittoOra
    ? firmaScritta != null && firmaScritta !== firmaViva
    : conUnaScelta;
  // di uno scambio ripreso senza spunti leggibili non sappiamo mostrare niente
  const alBuio = !scrittoOra && congelato == null;
  const confermabile = idInMano != null && !applicato && !divergente && !alBuio;

  // l'effetto congelato si mostra dove la selezione viva non può dire niente
  const effettoCongelato = !scrittoOra && !applicato && congelato && riga
    ? {
      casa: effettoDagliSpunti(congelato.casa, congelato.ospite,
        riga.settlementPayer === 'to' ? riga.settlement : -riga.settlement),
      ospite: effettoDagliSpunti(congelato.ospite, congelato.casa,
        riga.settlementPayer === 'to' ? -riga.settlement : riga.settlement),
    }
    : null;

  return (
    <div className="msgcard">
      <div className="msgcard-head">
        <span>Fantacalciomercato · scambio</span>
        {saved.length > 0 && <span className="tag muted">{saved.length} in archivio</span>}
      </div>

      <form action={scrivi} className="scambio-form">
        <div className="scambio">
          <div className="scambio-lato">
            <p className="scambio-parte">Chi propone</p>
            <div className="field">
              <label htmlFor="fromTeam">Squadra richiedente</label>
              {/* cambiare squadra svuota la sua lista: quei giocatori non sono
                  più selezionabili, e lasciarli lì sarebbe uno scambio finto */}
              <select id="fromTeam" name="fromTeam" value={daId}
                onChange={(e) => { setDaId(e.target.value); setDati([]); }}>
                {rose.map((l) => <option key={l.teamId} value={l.teamId}>{l.nome}</option>)}
              </select>
            </div>
            <Scelti campo="fromPlayers" rosa={casa.rosa} scelti={dati}
              onTogli={(id) => setDati((s) => s.filter((x) => x !== id))} />
            <Aggiungi id="aggiungiDa" rosa={casa.rosa} scelti={dati} bloccati={bloccati}
              onAggiungi={(id) => setDati((s) => [...s, id])} />
          </div>

          <span className="scambio-verso"><Scambio className="" /></span>

          <div className="scambio-lato">
            <p className="scambio-parte">Chi accetta</p>
            <div className="field">
              <label htmlFor="toTeam">Squadra accettante</label>
              <select id="toTeam" name="toTeam" value={aId}
                onChange={(e) => { setAId(e.target.value); setPresi([]); }}>
                {rose.map((l) => <option key={l.teamId} value={l.teamId}>{l.nome}</option>)}
              </select>
            </div>
            <Scelti campo="toPlayers" rosa={ospite.rosa} scelti={presi}
              onTogli={(id) => setPresi((s) => s.filter((x) => x !== id))} />
            <Aggiungi id="aggiungiA" rosa={ospite.rosa} scelti={presi} bloccati={bloccati}
              onAggiungi={(id) => setPresi((s) => [...s, id])} />
          </div>
        </div>

        <div className="field scambio-note">
          <label htmlFor="note">Note per il giudizio</label>
          <textarea id="note" name="note" rows={3} maxLength={MAX_NOTE}
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="es. è fuori da gennaio, lo sanno tutti tranne chi l'ha preso" />
          <p className="scambio-contatore">
            Servono al giudizio, non finiscono nel testo.{' '}
            <span className="num">{MAX_NOTE - note.length}</span> caratteri liberi.
          </p>
        </div>

        {conUnaScelta && (
          <Anteprima
            titolo="Come resteranno le rose"
            casa={effettoDalVivo(casa, ospite, dati, presi, deltaCasa)}
            ospite={effettoDalVivo(ospite, casa, presi, dati, -deltaCasa)}
          />
        )}

        <div className="conguaglio">
          <div className="conguaglio-gruppo">
            <div className="field">
              <label htmlFor="settlement">Conguaglio crediti</label>
              <input id="settlement" name="settlement" inputMode="numeric" min="0" step="1"
                type="number" autoComplete="off" placeholder="—"
                value={conguaglio} onChange={(e) => setConguaglio(e.target.value)} />
            </div>

            {conguaglioAttivo ? (
              <div className="field">
                <label htmlFor="settlementPayer">Chi li versa</label>
                <select id="settlementPayer" name="settlementPayer" value={chiPaga}
                  onChange={(e) => setChiPaga(e.target.value === 'to' ? 'to' : 'from')}>
                  <option value="from">{casa.nome}</option>
                  <option value="to">{ospite.nome}</option>
                </select>
              </div>
            ) : (
              <p className="conguaglio-nota">Vuoto = scambio alla pari.</p>
            )}
          </div>

          <button type="submit" className="primary" disabled={scrivendo}>
            {scrivendo ? 'Scrivo…' : 'Scrivi l\'annuncio'}
          </button>
        </div>

        {statoScrivi && (
          <div className={statoScrivi.ok ? 'callout' : 'callout crit'} role="status">
            {statoScrivi.message}
          </div>
        )}
      </form>

      {testo ? (
        <>
          <pre className="msgcard-body">{testo}</pre>

          <div className="scambio-esiti">
            {avvisi.length > 0 && (
              <div className="callout" role="status">
                Da guardare prima di mandarlo: {avvisi.join(' ')}
              </div>
            )}
            {statoConferma && (
              <div className={statoConferma.ok ? 'callout' : 'callout crit'} role="status">
                {statoConferma.message}
              </div>
            )}
            {statoDisfa && (
              <div className={statoDisfa.ok ? 'callout' : 'callout crit'} role="status">
                {statoDisfa.message}
              </div>
            )}
            {idInMano && !applicato && divergente && (
              <div className="callout crit" role="status">
                {scrittoOra
                  ? 'Hai cambiato la selezione: riscrivi l\'annuncio prima di registrare. '
                    + 'L\'anteprima qui sopra segue la tua scelta, ma il testo e lo scambio '
                    + 'da registrare sono ancora quelli di prima.'
                  : 'Stai componendo un altro scambio: l\'annuncio qui sopra è quello di '
                    + 'prima. Scrivi il nuovo annuncio, oppure svuota le due liste per '
                    + 'registrare quello vecchio.'}
              </div>
            )}
            {idInMano && !applicato && alBuio && (
              <div className="callout crit" role="status">
                Di questo scambio non riesco a rileggere i fatti salvati, quindi non posso
                mostrarti come resterebbero le rose. Ricomponilo qui sopra e riscrivi
                l&apos;annuncio: confermare alla cieca è peggio.
              </div>
            )}
          </div>

          {effettoCongelato && !divergente && (
            <div className="scambio-esiti">
              <Anteprima
                titolo="Come resteranno le rose"
                nota="dai fatti salvati con l'annuncio, non dalla selezione qui sopra"
                casa={effettoCongelato.casa}
                ospite={effettoCongelato.ospite}
              />
            </div>
          )}

          <div className="msgcard-foot">
            <button type="button" className="primary" onClick={copia}>
              {copiato ? <><Spunta />Copiato</> : 'Copia per WhatsApp'}
            </button>

            {idInMano && !applicato && (
              <form action={conferma}>
                <input type="hidden" name="tradeId" value={idInMano} />
                <button type="submit" disabled={confermando || !confermabile}>
                  {confermando ? 'Registro…' : 'Conferma lo scambio'}
                </button>
              </form>
            )}

            {idInMano && applicato && !annullato && (
              <form action={disfa}>
                <input type="hidden" name="tradeId" value={idInMano} />
                <button type="submit" className="scambio-disfa" disabled={disfando}>
                  {disfando ? 'Annullo…' : 'Annulla scambio'}
                </button>
              </form>
            )}

            {applicato && !annullato && <span className="tag">registrato</span>}
            {annullato && <span className="tag muted">annullato</span>}
          </div>
        </>
      ) : (
        <div className="empty" style={{ padding: '4px 16px 20px' }}>
          Compila lo scambio e l&apos;annuncio compare qui.
        </div>
      )}
    </div>
  );
}

'use client';

import { useActionState, useState } from 'react';
import {
  inviaPezzoAction, rifaiImportAction, salvaFlavourAction, salvaImpostazioniAction,
  scartaImportAction, scriviPezzoAction, type ActionState,
} from './actions';

function Messaggio({ state }: { state: ActionState }) {
  if (!state) return null;
  return <div className={`callout${state.ok ? '' : ' crit'}`} style={{ marginTop: 10 }}>{state.message}</div>;
}

function quando(iso: string) {
  return new Date(iso).toLocaleString('it-IT', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
  });
}

// =====================================================================
// Quello che la pagina passa qui dentro
// =====================================================================

export interface SfidaVista {
  id: string; casa: string; ospite: string;
  golCasa: number | null; golOspite: number | null;
  fpCasa: number | null; fpOspite: number | null;
  moduloCasa: string | null; moduloOspite: string | null;
  giocatori: number; agganciati: number; subentri: number; inDieci: number;
}

export interface ImportVista {
  id: string; stato: string; contiOk: number | null; contiTotali: number | null;
  errore: string | null; ricevutoIl: string;
}

export interface ArticoloVista {
  id: string; versione: number; provider: string; model: string | null; tono: number;
  testo: string; generatoIl: string; inviatoIl: string | null; problemi: string[];
}

export interface GiornataVista {
  matchdayId: string;
  fanta: number | null;
  serieA: number;
  dataPartita: string;
  sfide: SfidaVista[];
  imports: ImportVista[];
  /** dalla più recente alla più vecchia */
  articoli: ArticoloVista[];
  /** calcolato solo per la giornata aperta di default: costa una passata sul database */
  spunti: number | null;
  erroreSpunti: string | null;
}

const STATO: Record<string, { testo: string; critico: boolean }> = {
  ricevuto: { testo: 'ricevuto, non scritto', critico: true },
  importato: { testo: 'importato', critico: false },
  scartato: { testo: 'messo da parte', critico: true },
};

// =====================================================================
// La giornata, con i suoi tre tab
// =====================================================================

type Tab = 'import' | 'pezzo' | 'versioni';

/**
 * Una giornata è chiusa finché non serve. Aperta, mostra tre tab: da dove
 * vengono i dati, il pezzo di adesso, e tutto quello che è stato scritto
 * prima. Con trentasette giornate in stagione, tenere tutto disteso sulla
 * pagina la renderebbe illeggibile entro ottobre.
 */
export function Giornata({ g, tonoBase, apertaDiDefault }: {
  g: GiornataVista; tonoBase: number; apertaDiDefault: boolean;
}) {
  const [aperta, setAperta] = useState(apertaDiDefault);
  const [tab, setTab] = useState<Tab>(g.sfide.length ? 'pezzo' : 'import');

  const ultimo = g.articoli[0] ?? null;
  const daGuardare = ultimo?.problemi.length ?? 0;
  const mandato = g.articoli.some((a) => a.inviatoIl);
  const inDieci = g.sfide.reduce((s, x) => s + x.inDieci, 0);

  const bottone = (chiave: Tab, etichetta: string, pallino?: number | string) => (
    <button type="button" className={tab === chiave ? 'on' : undefined}
      onClick={() => setTab(chiave)} aria-pressed={tab === chiave}>
      {etichetta}
      {pallino != null && pallino !== 0 && <span className="pallino">{pallino}</span>}
    </button>
  );

  return (
    <details className="panel giornata" open={aperta}
      onToggle={(e) => setAperta(e.currentTarget.open)}>
      <summary>
        <div className="giornata-riga">
          <span className="giornata-n">Giornata {g.fanta ?? '—'}</span>
          <span style={{ color: 'var(--muted)', fontSize: '.86rem' }}>
            Serie A {g.serieA} · {new Date(g.dataPartita).toLocaleDateString('it-IT', {
              day: 'numeric', month: 'long',
            })}
          </span>
          <span className="giornata-meta">
            {g.sfide.length ? `${g.sfide.length} sfide` : 'nessun tabellino'}
            {g.articoli.length > 0 && ` · ${g.articoli.length} version${g.articoli.length === 1 ? 'e' : 'i'}`}
            {mandato && ' · mandata'}
            {daGuardare > 0 && <span style={{ color: 'var(--crit)' }}> · da guardare</span>}
          </span>
        </div>
      </summary>

      <div className="giornata-corpo">
        <nav className="tabs" aria-label={`Giornata ${g.fanta ?? ''}`}>
          {bottone('import', 'Import', g.sfide.length || g.imports.length)}
          {bottone('pezzo', 'Pezzo', daGuardare ? '!' : undefined)}
          {bottone('versioni', 'Versioni', g.articoli.length)}
        </nav>

        {tab === 'import' && <TabImport g={g} inDieci={inDieci} />}
        {tab === 'pezzo' && <TabPezzo g={g} tonoBase={tonoBase} ultimo={ultimo} />}
        {tab === 'versioni' && <TabVersioni g={g} />}
      </div>
    </details>
  );
}

// ------------------------------------------------------------- tab import

function TabImport({ g, inDieci }: { g: GiornataVista; inDieci: number }) {
  if (!g.sfide.length && !g.imports.length) {
    return <div className="empty">Niente per questa giornata.</div>;
  }

  return (
    <>
      {g.sfide.length > 0 && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Sfida</th>
                <th className="num">Ris.</th>
                <th className="num">Fantapunti</th>
                <th>Moduli</th>
                <th>Tabellino</th>
              </tr>
            </thead>
            <tbody>
              {g.sfide.map((s) => (
                <tr key={s.id}>
                  <td>{s.casa} – {s.ospite}</td>
                  <td className="num">{s.golCasa}-{s.golOspite}</td>
                  <td className="num">{s.fpCasa} · {s.fpOspite}</td>
                  <td className="mono" style={{ fontSize: '.8rem' }}>
                    {s.moduloCasa ?? '—'} · {s.moduloOspite ?? '—'}
                  </td>
                  <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                    {s.giocatori} giocatori · {s.agganciati} agganciati
                    {s.subentri > 0 && <> · {s.subentri} subentri</>}
                    {s.inDieci > 0 && <span style={{ color: 'var(--crit)' }}> · in dieci</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inDieci > 0 && (
        <p style={{ fontSize: '.84rem', color: 'var(--muted)', margin: '10px 0 0' }}>
          {inDieci} {inDieci === 1 ? 'squadra ha' : 'squadre hanno'} giocato in dieci: in panchina
          non c&apos;era un pari ruolo che avesse preso voto.
        </p>
      )}

      {g.imports.length > 0 && (
        <>
          <h3 style={{
            fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.1em',
            color: 'var(--muted)', margin: '18px 0 4px', fontWeight: 600,
          }}>
            Invii ricevuti
          </h3>
          {g.imports.map((i) => {
            const s = STATO[i.stato] ?? { testo: i.stato, critico: true };
            return (
              <div key={i.id} style={{
                display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                padding: '10px 0', borderTop: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '.86rem', whiteSpace: 'nowrap' }}>{quando(i.ricevutoIl)}</span>
                <span style={{ fontSize: '.86rem', color: s.critico ? 'var(--crit)' : undefined }}>
                  {s.testo}
                </span>
                <span className="mono" style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                  {i.contiTotali == null ? '—' : `${i.contiOk ?? 0}/${i.contiTotali}`}
                </span>
                {i.errore && (
                  <span style={{ fontSize: '.8rem', color: 'var(--muted)', flex: 1, minWidth: 160 }}>
                    {i.errore}
                  </span>
                )}
                <div style={{ marginLeft: 'auto' }}>
                  <AzioniImport importId={i.id} stato={i.stato} />
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

// -------------------------------------------------------------- tab pezzo

function TabPezzo({ g, tonoBase, ultimo }: {
  g: GiornataVista; tonoBase: number; ultimo: ArticoloVista | null;
}) {
  if (!g.sfide.length) {
    return (
      <div className="empty">
        Senza tabellino non c&apos;è niente da raccontare: importa prima la giornata.
      </div>
    );
  }
  return (
    <>
      {g.erroreSpunti
        ? <div className="callout crit">Non riesco a preparare il materiale: {g.erroreSpunti}</div>
        : <Scrittura matchdayId={g.matchdayId} tonoBase={tonoBase} spunti={g.spunti} />}

      {ultimo
        ? <div style={{ marginTop: 14 }}><Articolo articolo={ultimo} /></div>
        : (
          <p style={{ fontSize: '.86rem', color: 'var(--muted)', marginTop: 12 }}>
            Nessuna versione ancora scritta per questa giornata.
          </p>
        )}
    </>
  );
}

// ----------------------------------------------------------- tab versioni

function TabVersioni({ g }: { g: GiornataVista }) {
  if (!g.articoli.length) {
    return <div className="empty">Nessuna versione. Scrivi il pezzo dal tab accanto.</div>;
  }
  return (
    <>
      {g.articoli.map((a) => <Articolo key={a.id} articolo={a} compatto />)}
      <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: '2px 0 0' }}>
        Le versioni non si sovrascrivono: se la seconda esce peggio, mandi la prima.
      </p>
    </>
  );
}

// =====================================================================
// Il preferito
// =====================================================================

/**
 * È un caricatore, non il programma: la logica sta in
 * /redazione-bookmarklet.js, così quando la miglioriamo il preferito non si
 * rifà. Dentro ci sono solo l'indirizzo dell'app e la parola d'ordine.
 */
export function Preferito({ sito, segreto }: { sito: string; segreto: string | null }) {
  const [copiato, setCopiato] = useState(false);

  if (!segreto) {
    return (
      <div className="callout crit">
        <b>REDAZIONE_IMPORT_SECRET non è configurata.</b> Scegli una frase lunga a caso,
        mettila fra le variabili d&apos;ambiente su Vercel e ridistribuisci: senza,
        l&apos;endpoint rifiuta ogni import — ed è giusto così, altrimenti chiunque
        conosca l&apos;indirizzo potrebbe scriverti in casa.
      </div>
    );
  }

  const codice = `javascript:(function(){window.__FANTA_REDAZIONE={app:'${sito}',secret:'${segreto}'};`
    + `var s=document.createElement('script');s.src='${sito}/redazione-bookmarklet.js?v='+Date.now();`
    + `document.body.appendChild(s);})()`;

  return (
    <div style={{ padding: '4px 2px 2px' }}>
      <p style={{ margin: '0 0 10px', fontSize: '.9rem' }}>
        Trascina questo link nella barra dei preferiti, oppure crea un preferito
        nuovo e incolla il codice come indirizzo.
      </p>

      {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
      <a href={codice} className="btn" onClick={(e) => e.preventDefault()}
        style={{ display: 'inline-block', marginBottom: 12 }}>
        📥 Importa giornata
      </a>

      <textarea readOnly value={codice} rows={3}
        onFocus={(e) => e.currentTarget.select()}
        style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: '.74rem' }} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
        <button type="button" onClick={() => {
          navigator.clipboard.writeText(codice).then(() => {
            setCopiato(true);
            setTimeout(() => setCopiato(false), 2500);
          });
        }}>
          {copiato ? 'Copiato' : 'Copia il codice'}
        </button>
        <span style={{ color: 'var(--muted)', fontSize: '.84rem' }}>
          Contiene la parola d&apos;ordine: tienilo per te.
        </span>
      </div>

      <ol style={{ fontSize: '.86rem', color: 'var(--muted)', margin: '14px 0 0', paddingLeft: 20 }}>
        <li>Apri su Leghe Fantacalcio la giornata conclusa che vuoi importare.</li>
        <li>Clicca il preferito: legge le sfide e ti mostra cosa ha trovato.</li>
        <li>Controlla che i conti tornino, poi premi <b>Invia all&apos;app</b>.</li>
      </ol>
    </div>
  );
}

// =====================================================================
// Pezzi riusabili
// =====================================================================

export function AzioniImport({ importId, stato }: { importId: string; stato: string }) {
  const [sRif, aRif, pRif] = useActionState<ActionState, FormData>(rifaiImportAction, null);
  const [sSca, aSca, pSca] = useActionState<ActionState, FormData>(scartaImportAction, null);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <form action={aRif}>
          <input type="hidden" name="importId" value={importId} />
          <button type="submit" disabled={pRif} title="Ripassa il grezzo con il codice di adesso">
            {pRif ? 'Rifaccio…' : 'Rifai'}
          </button>
        </form>
        {stato !== 'scartato' && (
          <form action={aSca}>
            <input type="hidden" name="importId" value={importId} />
            <button className="link" type="submit" disabled={pSca}>
              {pSca ? '…' : 'Metti da parte'}
            </button>
          </form>
        )}
      </div>
      <Messaggio state={sRif} />
      <Messaggio state={sSca} />
    </div>
  );
}

export function Scrittura({ matchdayId, tonoBase, spunti }: {
  matchdayId: string; tonoBase: number; spunti: number | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(scriviPezzoAction, null);

  const pulsante = (etichetta: string, tono: number | '', primario = false) => (
    <form action={action}>
      <input type="hidden" name="matchdayId" value={matchdayId} />
      <input type="hidden" name="tono" value={tono} />
      <button className={primario ? 'primary' : undefined} type="submit" disabled={pending}>
        {pending ? 'Scrivo…' : etichetta}
      </button>
    </form>
  );

  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 14,
    }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {pulsante('Scrivi il pezzo', '', true)}
        {pulsante('Più cattivo', Math.min(5, tonoBase + 1))}
        {pulsante('Più morbido', Math.max(1, tonoBase - 1))}
        <span style={{ color: 'var(--muted)', fontSize: '.86rem' }}>
          {spunti != null && `${spunti} spunti · `}tono di base {tonoBase}/5
        </span>
      </div>
      <Messaggio state={state} />
    </div>
  );
}

export function Articolo({ articolo, compatto = false }: {
  articolo: ArticoloVista; compatto?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviaPezzoAction, null);
  const [aperto, setAperto] = useState(false);

  const chi = articolo.provider === 'gemini' ? (articolo.model ?? 'gemini') : 'template di riserva';

  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 10, padding: compatto ? 12 : 14, marginBottom: 10,
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <b>Versione {articolo.versione}</b>
        <span style={{ color: 'var(--muted)', fontSize: '.82rem' }}>
          tono {articolo.tono}/5 · {chi} · {quando(articolo.generatoIl)}
          {articolo.inviatoIl && ' · già mandata'}
        </span>
      </div>

      {articolo.problemi.length > 0 && (
        <div className="callout crit" style={{ marginTop: 10 }}>
          <b>La verifica ha trovato qualcosa:</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {articolo.problemi.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      <button type="button" className="link" onClick={() => setAperto(!aperto)}
        style={{ padding: 0, marginTop: 8 }}>
        {aperto ? 'nascondi il testo' : 'leggi il testo'}
      </button>

      {aperto && (
        <pre style={{
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginTop: 8,
          fontSize: '.86rem', maxHeight: 460, overflow: 'auto', fontFamily: 'inherit',
        }}>{articolo.testo}</pre>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <form action={action}>
          <input type="hidden" name="articoloId" value={articolo.id} />
          <button className="primary" type="submit" disabled={pending}>
            {pending ? 'Mando…' : articolo.inviatoIl ? 'Rimanda su Telegram' : 'Manda su Telegram'}
          </button>
        </form>
        <button type="button" onClick={() => navigator.clipboard.writeText(articolo.testo)}>
          Copia il testo
        </button>
      </div>
      <Messaggio state={state} />
    </div>
  );
}

// =====================================================================
// Impostazioni e soprannomi
// =====================================================================

export function Impostazioni({ tono, minParole, vietate }: {
  tono: number; minParole: number; vietate: string[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(salvaImpostazioniAction, null);

  return (
    <div style={{ padding: '4px 2px 2px' }}>
      <form action={action} style={{ display: 'grid', gap: 12 }}>
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="tono">Tono di base</label>
          <select id="tono" name="tono" defaultValue={String(tono)}>
            <option value="1">1 — affettuoso</option>
            <option value="2">2 — ironico ma bonario</option>
            <option value="3">3 — sfottò da gruppo WhatsApp</option>
            <option value="4">4 — cronaca velenosa</option>
            <option value="5">5 — nessuna pietà</option>
          </select>
        </div>
        <div className="field" style={{ maxWidth: 220 }}>
          <label htmlFor="minParole">Parole minime per sfida</label>
          <input id="minParole" name="minParole" type="number" min={40} max={600}
            defaultValue={String(minParole)} />
        </div>
        <div className="field">
          <label htmlFor="vietate">Parole vietate, separate da virgola</label>
          <input id="vietate" name="vietate" defaultValue={vietate.join(', ')} />
        </div>
        <div><button type="submit" disabled={pending}>{pending ? 'Salvo…' : 'Salva'}</button></div>
      </form>
      <p style={{ fontSize: '.84rem', color: 'var(--muted)', margin: '10px 0 0' }}>
        Dove una sfida non ha spunti di peso, il tono scende da solo di un gradino:
        chiedere cattiveria dove non è successo niente la fa inventare.
      </p>
      <Messaggio state={state} />
    </div>
  );
}

export function SchedaFlavour({ squadra }: {
  squadra: {
    teamId: string; nome: string; allenatore: string | null;
    soprannomi: string[]; tormentoni: string | null;
    puntiDeboli: string | null; intoccabile: string | null;
  };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(salvaFlavourAction, null);
  const compilata = squadra.soprannomi.length > 0 || !!squadra.tormentoni || !!squadra.puntiDeboli;

  return (
    <details className="panel squadra" style={{ marginBottom: 8 }}>
      <summary>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
          <b>{squadra.nome}</b>
          {squadra.allenatore && (
            <span style={{ color: 'var(--muted)', fontSize: '.84rem' }}>{squadra.allenatore}</span>
          )}
          <span style={{
            marginLeft: 'auto', fontSize: '.82rem',
            color: compilata ? 'var(--muted)' : 'var(--crit)',
          }}>
            {compilata ? (squadra.soprannomi.join(', ') || 'compilata') : 'da compilare'}
          </span>
        </div>
      </summary>
      <div style={{ padding: '10px 12px 14px' }}>
        <form action={action} style={{ display: 'grid', gap: 10 }}>
          <input type="hidden" name="teamId" value={squadra.teamId} />
          <div className="field">
            <label htmlFor={`sn-${squadra.teamId}`}>Soprannomi, separati da virgola</label>
            <input id={`sn-${squadra.teamId}`} name="soprannomi"
              defaultValue={squadra.soprannomi.join(', ')} placeholder="i Rossi, quelli del catenaccio" />
          </div>
          <div className="field">
            <label htmlFor={`tm-${squadra.teamId}`}>Tormentoni</label>
            <input id={`tm-${squadra.teamId}`} name="tormentoni" defaultValue={squadra.tormentoni ?? ''}
              placeholder="promette il colpo di mercato dal 2024" />
          </div>
          <div className="field">
            <label htmlFor={`pd-${squadra.teamId}`}>Da rinfacciare</label>
            <input id={`pd-${squadra.teamId}`} name="puntiDeboli" defaultValue={squadra.puntiDeboli ?? ''}
              placeholder="l'asta fatta col telefono in autostrada" />
          </div>
          <div className="field">
            <label htmlFor={`in-${squadra.teamId}`}>Da NON toccare</label>
            <input id={`in-${squadra.teamId}`} name="intoccabile" defaultValue={squadra.intoccabile ?? ''}
              placeholder="finisce nel prompt come divieto esplicito" />
          </div>
          <div><button type="submit" disabled={pending}>{pending ? 'Salvo…' : 'Salva'}</button></div>
        </form>
        <Messaggio state={state} />
      </div>
    </details>
  );
}

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
    <div className="panel" style={{ padding: 16 }}>
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
        <li>Clicca il preferito: legge le quattro sfide e ti mostra cosa ha trovato.</li>
        <li>Controlla che i conti tornino, poi premi <b>Invia all&apos;app</b>.</li>
      </ol>
    </div>
  );
}

// =====================================================================
// Import
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

// =====================================================================
// Il pezzo
// =====================================================================

export function Scrittura({ matchdayId, tonoBase, spunti }: {
  matchdayId: string; tonoBase: number; spunti: number;
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
    <div className="panel" style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {pulsante('Scrivi il pezzo', '', true)}
        {pulsante('Più cattivo', Math.min(5, tonoBase + 1))}
        {pulsante('Più morbido', Math.max(1, tonoBase - 1))}
        <span style={{ color: 'var(--muted)', fontSize: '.86rem' }}>
          {spunti} spunti trovati · tono di base {tonoBase}/5
        </span>
      </div>
      <p style={{ fontSize: '.84rem', color: 'var(--muted)', margin: '10px 0 0' }}>
        Ogni pressione è una versione nuova: quella di prima resta, e puoi sempre
        tornare a mandare quella.
      </p>
      <Messaggio state={state} />
    </div>
  );
}

export function Articolo({ articolo }: {
  articolo: {
    id: string; versione: number; provider: string; model: string | null; tono: number;
    testo: string; generatoIl: string; inviatoIl: string | null;
    problemi: string[];
  };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviaPezzoAction, null);
  const [aperto, setAperto] = useState(false);

  const chi = articolo.provider === 'gemini' ? (articolo.model ?? 'gemini') : 'template di riserva';

  return (
    <div className="panel" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <b>Versione {articolo.versione}</b>
        <span style={{ color: 'var(--muted)', fontSize: '.84rem' }}>
          tono {articolo.tono}/5 · {chi} · {new Date(articolo.generatoIl).toLocaleString('it-IT')}
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
        style={{ padding: 0, marginTop: 10 }}>
        {aperto ? 'nascondi il testo' : 'leggi il testo'}
      </button>

      {aperto && (
        <pre style={{
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface-2)',
          border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginTop: 8,
          fontSize: '.86rem', maxHeight: 460, overflow: 'auto', fontFamily: 'inherit',
        }}>{articolo.testo}</pre>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
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
    <div className="panel" style={{ padding: 16 }}>
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

  return (
    <div className="panel" style={{ padding: 14, marginBottom: 10 }}>
      <form action={action} style={{ display: 'grid', gap: 10 }}>
        <input type="hidden" name="teamId" value={squadra.teamId} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <b>{squadra.nome}</b>
          {squadra.allenatore && (
            <span style={{ color: 'var(--muted)', fontSize: '.84rem' }}>{squadra.allenatore}</span>
          )}
        </div>
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
  );
}

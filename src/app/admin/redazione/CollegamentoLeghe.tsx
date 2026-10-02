'use client';

import { useActionState, useState } from 'react';
import {
  importaDaLegheAction, reimportaGiornataAction, salvaTokenLegheAction, type ActionState,
} from './actions';

/**
 * Il comando da incollare nella console del browser, su leghe.fantacalcio.it
 * da collegati: legge il token della lega aperta da dove lo tiene il sito e
 * lo copia negli appunti. Non manda niente a nessuno.
 */
const COMANDO = `(()=>{const b=JSON.parse(localStorage.getItem('LEAGUES2024_LOCAL'));`
  + `const u=b['current-user-'+b['current-user']];`
  + `const l=u.leagues.find(x=>x.alias&&location.pathname.includes(x.alias))||u.leagues[0];`
  + `copy(l.token);alert('Token di «'+l.name+'» copiato: incollalo nell\\'app')})()`;

export interface StatoLeghe {
  legaId: number | null;
  scadeIl: string | null;
  aggiornatoIl: string | null;
  daEnv: boolean;
}

function giorni(iso: string | null): number | null {
  return iso ? Math.floor((Date.parse(iso) - Date.now()) / 86_400_000) : null;
}

export function CollegamentoLeghe({ stato }: { stato: StatoLeghe | null }) {
  const [sTok, aTok, pTok] = useActionState<ActionState, FormData>(salvaTokenLegheAction, null);
  const [sImp, aImp, pImp] = useActionState<ActionState, FormData>(async () => importaDaLegheAction(), null);
  const [sRe, aRe, pRe] = useActionState<ActionState, FormData>(reimportaGiornataAction, null);
  const [copiato, setCopiato] = useState(false);
  const restano = giorni(stato?.scadeIl ?? null);

  return (
    <div>
      <p className="sub" style={{ marginTop: 0 }}>
        Con il collegamento l&apos;app legge da sola, senza preferito: le <b>formazioni</b> della
        giornata in corso (quando si apre una partita in diretta), la <b>giornata conclusa</b> e
        le <b>classifiche</b> il mattino del <b>giorno dopo l&apos;ultima partita di Serie A</b> della
        giornata, col calendario aggiornato (anticipi, posticipi, rinvii). Se la lega a quel punto
        non ha ancora calcolato, <b>calcola lei la giornata</b> su Leghe Fantacalcio — solo se il live
        dice che le partite sono tutte finite — e te lo dice su Telegram. Passa dagli stessi
        controlli del preferito: se i conti non tornano, non scrive niente e te lo dice.
      </p>

      {stato ? (
        <div className={`callout${restano != null && restano < 3 ? ' crit' : ''}`}>
          Collegata{stato.legaId ? ` alla lega ${stato.legaId}` : ''}
          {stato.daEnv ? ' (token dalla variabile LEGHE_TOKEN)' : ''}.
          {stato.scadeIl && (
            <> Il token scade il <b>{new Date(stato.scadeIl).toLocaleDateString('it-IT')}</b>
              {restano != null && ` (fra ${Math.max(0, restano)} giorni)`}: prima di allora incollane uno nuovo.</>
          )}
        </div>
      ) : (
        <div className="callout crit">Non ancora collegata: si usa il preferito.</div>
      )}

      <ol className="sub" style={{ paddingLeft: 18 }}>
        <li>Apri <b>leghe.fantacalcio.it</b>, entra e vai nella lega.</li>
        <li>Apri la console del browser (F12 → Console; su Safari va prima attivato il menu Sviluppo).</li>
        <li>
          Incolla questo comando e premi Invio: copia il token negli appunti.
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '.72rem', margin: '6px 0' }}>{COMANDO}</pre>
          <button type="button" onClick={() => { void navigator.clipboard.writeText(COMANDO); setCopiato(true); }}>
            {copiato ? 'Comando copiato' : 'Copia il comando'}
          </button>
        </li>
        <li>Incollalo qui sotto. L&apos;app lo prova con una lettura vera prima di salvarlo.</li>
      </ol>

      <form action={aTok}>
        <div className="field">
          <label htmlFor="token-leghe">Token</label>
          <textarea id="token-leghe" name="token" rows={3} autoComplete="off" spellCheck={false}
            placeholder="eyJhbGciOi…" style={{ width: '100%', fontFamily: 'monospace', fontSize: '.75rem' }} />
        </div>
        <button type="submit" className="primary" disabled={pTok}>{pTok ? 'Provo…' : 'Salva e prova'}</button>
        {sTok && <div className={`callout${sTok.ok ? '' : ' crit'}`} style={{ marginTop: 10 }}>{sTok.message}</div>}
      </form>

      {stato && (
        <>
          <form action={aImp} style={{ marginTop: 14 }}>
            <p className="sub" style={{ margin: '0 0 6px' }}>
              Legge subito le giornate calcolate che mancano, senza aspettare domattina.
            </p>
            <button type="submit" disabled={pImp}>{pImp ? 'Leggo dalla lega…' : 'Importa adesso'}</button>
            {sImp && <div className={`callout${sImp.ok ? '' : ' crit'}`} style={{ marginTop: 10 }}>{sImp.message}</div>}
          </form>

          <form action={aRe} style={{ marginTop: 18 }}>
            <p className="sub" style={{ margin: '0 0 6px' }}>
              <b>Reimporta una giornata</b>: se la lega l&apos;ha ricalcolata dopo, o l&apos;hai calcolata
              tardi. Riscrive tabellino, risultati e classifiche e richiude le schedine coi punti nuovi.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="re-tipo">Competizione</label>
                <select id="re-tipo" name="tipo" defaultValue="campionato">
                  <option value="campionato">Campionato</option>
                  <option value="coppa">Coppa</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="re-giornata">Giornata</label>
                <input id="re-giornata" name="giornata" inputMode="numeric" style={{ width: 90 }} placeholder="es. 4" />
              </div>
              <button type="submit" disabled={pRe}>{pRe ? 'Rileggo…' : 'Reimporta'}</button>
            </div>
            <label style={{
              display: 'flex', gap: 8, alignItems: 'center', marginTop: 8,
              textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontSize: '.86rem',
            }}>
              <input type="checkbox" name="ricalcola" style={{ width: 'auto' }} />
              Prima premi «Calcola giornata» su Leghe Fantacalcio (solo se le partite sono tutte finite)
            </label>
            {sRe && <div className={`callout${sRe.ok ? '' : ' crit'}`} style={{ marginTop: 10 }}>{sRe.message}</div>}
          </form>
        </>
      )}

      <p className="sub">
        Il token è la tua sessione su Leghe Fantacalcio: resta sul server, nessuno lo legge dall&apos;app.
        Esci e rientra dal sito per invalidarlo, se serve.
      </p>
    </div>
  );
}

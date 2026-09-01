'use client';

import { useActionState } from 'react';
import {
  generaQuoteAction, pubblicaQuote, salvaRisultato, chiudiGiornataAction,
  cambiaOrario, segnaRinvio, accoppiaCoppa, type ActionState,
} from './actions';

function Messaggio({ state }: { state: ActionState }) {
  if (!state) return null;
  return <div className={`callout${state.ok ? '' : ' crit'}`} style={{ marginTop: 10 }}>{state.message}</div>;
}

/** I due pulsanti che governano la giornata: genera e pubblica. */
export function Quote({ matchdayId, pubblicate, esiti }: {
  matchdayId: string; pubblicate: boolean; esiti: number;
}) {
  const [sGen, aGen, pGen] = useActionState<ActionState, FormData>(generaQuoteAction, null);
  const [sPub, aPub, pPub] = useActionState<ActionState, FormData>(pubblicaQuote, null);

  return (
    <div className="panel" style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <form action={aGen}>
          <input type="hidden" name="matchdayId" value={matchdayId} />
          <button type="submit" disabled={pGen}>{pGen ? 'Calcolo…' : 'Genera quote'}</button>
        </form>
        <form action={aPub}>
          <input type="hidden" name="matchdayId" value={matchdayId} />
          <button className="primary" type="submit" disabled={pPub || esiti === 0}>
            {pPub ? 'Pubblico…' : pubblicate ? 'Ripubblica' : 'Pubblica'}
          </button>
        </form>
        <span style={{ color: 'var(--muted)', fontSize: '.86rem' }}>
          {esiti === 0 ? 'nessuna quota in lavagna'
            : `${esiti} esiti quotati · ${pubblicate ? 'pubblicati' : 'ancora nascosti alla lega'}`}
        </span>
      </div>
      <p style={{ fontSize: '.84rem', color: 'var(--muted)', margin: '10px 0 0' }}>
        Le quote si calcolano sulle rose di adesso: dopo un'asta o un import nuovo, rigenerale.
        Chi ha già giocato tiene la quota che aveva.
      </p>
      <Messaggio state={sGen} />
      <Messaggio state={sPub} />
    </div>
  );
}

export function Orario({ matchdayId, valore }: { matchdayId: string; valore: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(cambiaOrario, null);
  return (
    <form action={action} className="riga-admin">
      <input type="hidden" name="matchdayId" value={matchdayId} />
      <label htmlFor="k">Prima partita del turno</label>
      <input id="k" type="datetime-local" name="firstKickoffAt" defaultValue={valore} />
      <button type="submit" disabled={pending}>Salva</button>
      <Messaggio state={state} />
    </form>
  );
}

export function Rinvio({ id, casa, ospite, stato, policy }: {
  id: string; casa: string; ospite: string; stato: string; policy: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(segnaRinvio, null);
  return (
    <form action={action} className="riga-admin">
      <input type="hidden" name="serieAFixtureId" value={id} />
      <span style={{ minWidth: 190 }}>{casa} – {ospite}</span>
      <select name="stato" defaultValue={stato}>
        <option value="scheduled">in programma</option>
        <option value="postponed">rinviata</option>
      </select>
      <select name="policy" defaultValue={policy ?? ''}>
        <option value="">—</option>
        <option value="six">6 politico</option>
        <option value="wait">aspetta il recupero</option>
      </select>
      <button type="submit" disabled={pending}>Salva</button>
      <Messaggio state={state} />
    </form>
  );
}

export function Risultato({ fixtureId, casa, ospite, golCasa, golOspite, fpCasa, fpOspite }: {
  fixtureId: string; casa: string; ospite: string;
  golCasa: number | null; golOspite: number | null;
  fpCasa: number | null; fpOspite: number | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(salvaRisultato, null);
  return (
    <form action={action} className="riga-admin">
      <input type="hidden" name="fixtureId" value={fixtureId} />
      <span style={{ minWidth: 210 }}>{casa} – {ospite}</span>
      <input name="golCasa" className="mini" inputMode="numeric" placeholder="gol" defaultValue={golCasa ?? ''} />
      <input name="golOspite" className="mini" inputMode="numeric" placeholder="gol" defaultValue={golOspite ?? ''} />
      <input name="fpCasa" className="mini" inputMode="decimal" placeholder="fp" defaultValue={fpCasa ?? ''} />
      <input name="fpOspite" className="mini" inputMode="decimal" placeholder="fp" defaultValue={fpOspite ?? ''} />
      <button type="submit" disabled={pending}>Salva</button>
      <Messaggio state={state} />
    </form>
  );
}

export function Chiusura({ matchdayId }: { matchdayId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(chiudiGiornataAction, null);
  return (
    <form action={action} style={{ marginTop: 12 }}>
      <input type="hidden" name="matchdayId" value={matchdayId} />
      <button className="primary" type="submit" disabled={pending}>
        {pending ? 'Calcolo i punti…' : 'Chiudi la giornata e assegna i punti'}
      </button>
      <Messaggio state={state} />
    </form>
  );
}

export function Accoppiamento({ fixtureId, etichetta, squadre, casa, ospite }: {
  fixtureId: string; etichetta: string;
  squadre: { id: string; name: string }[];
  casa: string | null; ospite: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(accoppiaCoppa, null);
  return (
    <form action={action} className="riga-admin">
      <input type="hidden" name="fixtureId" value={fixtureId} />
      <span style={{ minWidth: 150 }}>{etichetta}</span>
      <select name="casa" defaultValue={casa ?? ''}>
        <option value="">— casa —</option>
        {squadre.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select name="ospite" defaultValue={ospite ?? ''}>
        <option value="">— ospite —</option>
        {squadre.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <button type="submit" disabled={pending}>Salva</button>
      <Messaggio state={state} />
    </form>
  );
}

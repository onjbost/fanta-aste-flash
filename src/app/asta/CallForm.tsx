'use client';

import { useActionState, useMemo, useState } from 'react';
import { callPlayer, type ActionState } from './actions';
import { ROLE_LABEL, type Role } from '@/lib/rules';
import { chiamatoDa, daMostrare, esitoDellaScelta, type Chiamata } from '@/lib/chiamate';
import { Foglio } from '../Foglio';
import { SceltaSvincolo, type Svincolabile } from './SceltaSvincolo';

interface FreeAgent { id: string; name: string; role: Role; club: string; quotation: number }
type RosterOption = Svincolabile & { committed: boolean };

interface Props {
  sessionId: string;
  freeAgents: FreeAgent[];
  roster: RosterOption[];
  credits: number;
  changes: { role: Role; left: number }[];
  chiamate?: Chiamata[];
  /** arrivando da Svincolati con «Chiama», il giocatore già scelto */
  preselezionato?: string;
}

/**
 * Il foglio della chiamata, in due passi: prima chi chiami, poi chi esce.
 *
 * Due tendine una sopra l'altra funzionavano al computer; sul telefono la
 * prima apriva un elenco di seicento nomi in un rullo. Qui si cerca, si tocca
 * una riga, e il secondo passo mostra solo i giocatori del ruolo giusto.
 */
function ModuloChiamata({ sessionId, freeAgents, roster, credits, changes, chiamate = [], preselezionato }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(callPlayer, null);
  const [targetId, setTargetId] = useState(
    preselezionato && freeAgents.some((p) => p.id === preselezionato) ? preselezionato : '',
  );
  const [releaseId, setReleaseId] = useState('');
  const [q, setQ] = useState('');

  const target = freeAgents.find((p) => p.id === targetId);
  const eligible = useMemo(
    () => roster.filter((r) => !target || r.role === target.role).filter((r) => !r.committed),
    [roster, target],
  );
  const release = eligible.find((r) => r.id === releaseId);
  const budget = release ? credits + release.refund : null;
  const changesLeft = target ? changes.find((c) => c.role === target.role)?.left ?? 0 : null;

  // il giocatore scelto può essere già in un lotto: in quel caso la richiesta
  // non è una chiamata ma un'adesione, e va detto prima di confermare
  const esito = esitoDellaScelta(target, chiamate);

  const filtered = useMemo(() => {
    const t = q.trim().toUpperCase();
    const scelta = daMostrare(freeAgents, chiamate);
    return scelta.filter((p) => !t || p.name.includes(t) || p.club.toUpperCase().includes(t)).slice(0, 40);
  }, [freeAgents, chiamate, q]);

  if (!target) {
    return (
      <div>
        <div className="field" style={{ marginTop: 4 }}>
          <label htmlFor="q">Cerca tra gli svincolati</label>
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cognome o squadra"
                 autoComplete="off" enterKeyHint="search" />
        </div>
        {filtered.length === 0 && <div className="empty">Nessuno svincolato con questo nome.</div>}
        <ul className="elenco-scelta">
          {filtered.map((p) => {
            const gia = chiamatoDa(p.id, chiamate);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => { setTargetId(p.id); setReleaseId(''); }}>
                  <span className="role-badge">{p.role}</span>
                  <span className="chi-col">
                    <b>{p.name}</b>
                    <small>{p.club}{gia ? ` · già chiamato da ${gia}` : ''}</small>
                  </span>
                  <span className="num qt">{p.quotation}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="targetId" value={targetId} />

      <div className="scelto">
        <span className="role-badge">{target.role}</span>
        <span className="chi-col"><b>{target.name}</b><small>{target.club} · qt {target.quotation}</small></span>
        <button type="button" className="piccolo" onClick={() => { setTargetId(''); setReleaseId(''); }}>
          Cambia
        </button>
      </div>

      {esito.tipo === 'adesione' && (
        <div className="callout crit" role="status">
          <b>{esito.avviso}</b>
          <div style={{ marginTop: 6, fontSize: '.86rem' }}>
            Non stai aprendo un lotto nuovo: entri in quello di {esito.squadra}, e al rilancio
            ci sarete in due. Lo svincolando che scegli qui resta impegnato su questo lotto.
          </div>
        </div>
      )}
      {esito.tipo === 'dentro' && <div className="callout crit" role="status">{esito.avviso}</div>}

      <p className="foglio-k">Il tuo {ROLE_LABEL[target.role].toLowerCase()} da svincolare</p>
      <SceltaSvincolo opzioni={eligible} valore={releaseId} onScegli={setReleaseId} ruolo={target.role} />

      {budget != null && (
        <div className="budget-riga">
          <span>Budget su questo lotto</span>
          <b className="num">{budget} cr</b>
          <small className="num">
            {credits} + {release!.refund}{changesLeft != null && ` · cambi ${target.role} ${changesLeft}`}
          </small>
        </div>
      )}

      {state && (
        <div className={state.ok ? 'callout' : 'callout crit'} role="status">
          {state.message}
          {state.warnings?.map((w) => <div key={w} style={{ marginTop: 6, fontSize: '.86rem' }}>⚠ {w}</div>)}
        </div>
      )}

      <button type="submit" className="primary largo"
              disabled={pending || !releaseId || esito.tipo === 'dentro'}>
        {pending
          ? 'Registro…'
          : esito.tipo === 'adesione' ? 'Conferma: aderisci all\'asta' : `Chiama ${target.name}`}
      </button>
    </form>
  );
}

/** «Chiama uno svincolato»: il bottone d'oro della fase delle chiamate. */
export function CallForm(props: Props) {
  const [aperto, setAperto] = useState(
    Boolean(props.preselezionato && props.freeAgents.some((p) => p.id === props.preselezionato)),
  );
  return (
    <>
      <button type="button" className="primary largo" onClick={() => setAperto(true)}>
        Chiama uno svincolato
      </button>
      <Foglio aperto={aperto} onChiudi={() => setAperto(false)} titolo="Chiama uno svincolato">
        <ModuloChiamata {...props} />
      </Foglio>
    </>
  );
}

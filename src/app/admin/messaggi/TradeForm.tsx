'use client';

import { useActionState, useState } from 'react';
import { generateTrade, type MsgState } from './actions';
import { Scambio, Spunta } from '../../Icone';

interface Saved { id: string; body: string; createdAt: string }

export function TradeForm({ teams, saved }: { teams: string[]; saved: Saved[] }) {
  const [state, generate, generating] = useActionState<MsgState, FormData>(generateTrade, null);
  const [copied, setCopied] = useState(false);

  // Il conguaglio è facoltativo: finché è vuoto o zero, chiedere «chi paga»
  // sarebbe una domanda senza oggetto, e la si tiene fuori dal form.
  const [conguaglio, setConguaglio] = useState('');
  const [richiedente, setRichiedente] = useState(teams[0] ?? '');
  const [accettante, setAccettante] = useState(teams[1] ?? '');
  const conguaglioAttivo = Number(conguaglio) > 0;

  const body = state?.ok ? state.body ?? '' : saved[0]?.body ?? '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="msgcard">
      <div className="msgcard-head">
        <span>Fantacalciomercato · scambio</span>
        {saved.length > 0 && (
          <span className="tag muted">{saved.length} in archivio</span>
        )}
      </div>

      <form action={generate} className="scambio-form">
        <div className="scambio">
          <div className="scambio-lato">
            <p className="scambio-parte">Chi propone</p>
            <div className="field">
              <label htmlFor="fromTeam">Squadra richiedente</label>
              <select id="fromTeam" name="fromTeam" value={richiedente}
                onChange={(e) => setRichiedente(e.target.value)}>
                {teams.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="fromPlayer">Giocatore dato</label>
              <input id="fromPlayer" name="fromPlayer" required
                autoComplete="off" placeholder="es. KOLASINAC" />
            </div>
          </div>

          <span className="scambio-verso"><Scambio className="" /></span>

          <div className="scambio-lato">
            <p className="scambio-parte">Chi accetta</p>
            <div className="field">
              <label htmlFor="toTeam">Squadra accettante</label>
              <select id="toTeam" name="toTeam" value={accettante}
                onChange={(e) => setAccettante(e.target.value)}>
                {teams.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="toPlayer">Giocatore dato</label>
              <input id="toPlayer" name="toPlayer" required
                autoComplete="off" placeholder="es. BIRAGHI" />
            </div>
          </div>
        </div>

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
                <select id="settlementPayer" name="settlementPayer" defaultValue="from">
                  <option value="from">{richiedente || 'La richiedente'}</option>
                  <option value="to">{accettante || "L'accettante"}</option>
                </select>
              </div>
            ) : (
              <p className="conguaglio-nota">Vuoto = scambio alla pari.</p>
            )}
          </div>

          <button type="submit" className="primary" disabled={generating}>
            {generating ? 'Scrivo…' : 'Scrivi l\'annuncio'}
          </button>
        </div>

        {state && !state.ok && (
          <div className="callout crit" role="alert">{state.message}</div>
        )}
      </form>

      {body ? (
        <>
          <pre className="msgcard-body">{body}</pre>
          <div className="msgcard-foot">
            <button type="button" className="primary" onClick={copy}>
              {copied ? <><Spunta />Copiato</> : 'Copia per WhatsApp'}
            </button>
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

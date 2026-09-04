'use client';

import { useActionState } from 'react';
import { impostaCrediti, type EditState } from './actions';

/**
 * Una riga per squadra: quanti crediti risultano all'app e quanti dovrebbero
 * essere. Si scrive il numero giusto — quello dell'app ufficiale — e l'app
 * registra la differenza come movimento, con il motivo.
 */
function Riga({ teamId, nome, crediti }: { teamId: string; nome: string; crediti: number }) {
  const [state, action, pending] = useActionState<EditState, FormData>(impostaCrediti, null);

  return (
    <form action={action} className="riga-admin">
      <input type="hidden" name="teamId" value={teamId} />
      <span style={{ minWidth: 190, fontWeight: 600 }}>{nome}</span>
      <span className="num" style={{ minWidth: 54, color: 'var(--muted)' }}>{crediti}</span>
      <span style={{ color: 'var(--muted)' }}>→</span>
      <input name="crediti" className="mini" inputMode="numeric" defaultValue={crediti}
             aria-label={`Crediti corretti di ${nome}`} />
      <input name="note" placeholder="motivo (facoltativo)" style={{ minWidth: 190, flex: 1 }} />
      <button type="submit" disabled={pending}>{pending ? 'Salvo…' : 'Allinea'}</button>
      {state && (
        <span style={{ fontSize: '.78rem', color: state.ok ? 'var(--ok)' : 'var(--crit)' }}>
          {state.message}
        </span>
      )}
    </form>
  );
}

export function CreditiEditor({ squadre }: {
  squadre: { id: string; name: string; credits: number }[];
}) {
  const totale = squadre.reduce((s, t) => s + t.credits, 0);

  return (
    <div className="panel" style={{ padding: 16 }}>
      <p style={{ fontSize: '.84rem', color: 'var(--muted)', marginTop: 0 }}>
        A sinistra i crediti che risultano all'app, a destra quelli veri. L'app non scrive un
        saldo: registra la differenza come movimento con il suo motivo, così i crediti restano
        la somma dei movimenti e la correzione resta visibile nel registro.
        {' '}Totale in lega adesso: <b>{totale}</b> crediti.
      </p>
      {squadre.map((t) => (
        <Riga key={t.id} teamId={t.id} nome={t.name} crediti={t.credits} />
      ))}
    </div>
  );
}

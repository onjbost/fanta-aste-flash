import { storicoSchedine, type GiocataStorico } from '@/lib/tipsterServer';

const MERCATO: Record<string, string> = {
  '1x2': 'Esito', ou: 'Gol', gg: 'Entrambe', exact: 'Esatto',
};
const SELEZIONE: Record<string, string> = {
  '1': '1', X: 'X', '2': '2',
  'over_1.5': 'Over 1.5', 'under_1.5': 'Under 1.5',
  'over_2.5': 'Over 2.5', 'under_2.5': 'Under 2.5',
  'over_3.5': 'Over 3.5', 'under_3.5': 'Under 3.5',
  gg: 'Goal', ng: 'NoGoal', altro: 'Altro',
};

function Giocata({ g }: { g: GiocataStorico }) {
  const stato = g.outcome === 'won' ? 'presa' : g.outcome === 'lost' ? 'persa' : 'aperta';
  return (
    <div className={`gio ${stato}`}>
      <span className="gio-sfida">
        {g.competizione === 'coppa' && <span className="tag warn" style={{ marginRight: 6 }}>coppa</span>}
        {g.sfida}
        {g.risultato && <b className="gio-ris">{g.risultato}</b>}
      </span>
      <span className="gio-scelta">
        <span className="gio-mk">{MERCATO[g.market] ?? g.market}</span>
        {SELEZIONE[g.selection] ?? g.selection}
      </span>
      <span className="num gio-q">{g.price.toFixed(2)}</span>
      <span className="num gio-pt">
        {g.outcome === 'won' ? `+${(g.points ?? 0).toFixed(1)}` : g.outcome === 'lost' ? '0' : '—'}
      </span>
    </div>
  );
}

export async function Storico({ teamId }: { teamId: string }) {
  const schedine = await storicoSchedine(teamId);

  if (!schedine.length) {
    return (
      <div className="panel">
        <div className="empty">
          Non hai ancora giocato nessuna schedina. La prima si fa dalla tab «Gioca».
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="sub" style={{ marginBottom: 12 }}>
        {schedine.length} {schedine.length === 1 ? 'schedina giocata' : 'schedine giocate'}.
        Tocca una riga per vedere cosa avevi giocato.
      </p>

      {schedine.map((s) => {
        const prese = s.giocate.filter((g) => g.outcome === 'won').length;
        return (
          <details className="panel storico" key={s.slipId}>
            <summary>
              <div className="storico-riga">
                <div>
                  <b>Giornata {s.giornata ?? '—'}</b>
                  <span className="storico-data">
                    {' · '}
                    {new Date(s.inviataIl).toLocaleDateString('it-IT', {
                      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="storico-esito">
                  <span className="storico-n">
                    {s.giocate.length} {s.giocate.length === 1 ? 'giocata' : 'giocate'}
                  </span>
                  {s.conclusa ? (
                    <>
                      <span className="tag ok">{prese} prese</span>
                      <b className="num">{(s.punti ?? 0).toFixed(1)} pt</b>
                    </>
                  ) : (
                    <span className="tag muted">in corso</span>
                  )}
                </div>
              </div>
            </summary>

            <div className="storico-corpo">
              {s.giocate.length === 0
                ? <div className="empty">Schedina vuota.</div>
                : s.giocate.map((g, i) => <Giocata key={i} g={g} />)}
            </div>
          </details>
        );
      })}
    </>
  );
}

import { requireTeamContext } from '@/lib/queries';
import { supabaseServer } from '@/lib/supabase';
import { schedeGiocatori } from '@/lib/schedeServer';
import { expectedStatus, freeReleaseEligibility, type Role } from '@/lib/rules';
import { RosaCarte } from './RosaCarte';
import { TopBar } from '../TopBar';
import type { NavKey } from '../BottomNav';

const STATUS_TAG: Record<string, { cls: string; label: string } | null> = {
  active: null,
  injured_long: { cls: 'crit', label: 'Infortunato' },
  banned: { cls: 'crit', label: 'Squalificato' },
  out_of_serie_a: { cls: 'warn', label: 'Fuori Serie A' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
  });
}

/** La rosa, con crediti e cambi rimasti, e i giocatori in card. */
export async function RosaVista({ active }: { active: NavKey }) {
  const ctx = await requireTeamContext();

  const { team, credits, roster, changes, nextSession } = ctx;
  const byRole = (r: Role) => roster.filter((p) => p.role === r);
  const rosterValue = roster.reduce((s, p) => s + p.price, 0);
  // chi è fermo secondo fantacalcio.it e i numeri della stagione: se la
  // lettura fallisce, la rosa si mostra lo stesso senza
  const schede = await schedeGiocatori(await supabaseServer(), {
    leagueId: team.leagueId, ids: roster.map((p) => p.playerId),
  }).catch(() => new Map());

  return (
    <div className="shell">
      <TopBar teamName={team.name} isAdmin={team.isAdmin} active={active} />

      <p className="eyebrow">La mia squadra</p>
      <h1>{team.name}</h1>
      <p className="sub">
        {nextSession
          ? <>Prossima asta flash · <b>#{nextSession.number}</b> · {formatDate(nextSession.auctionAt)}</>
          : 'Nessuna asta flash in calendario.'}
      </p>

      <div className="stats">
        <div className="stat">
          <div className="k">Crediti residui</div>
          <div className="v">{credits}</div>
          <div className="note">spesi {rosterValue} sulla rosa</div>
        </div>
        <div className="stat">
          <div className="k">Rosa</div>
          <div className="v">{roster.length}<small>/25</small></div>
          <div className="note">
            {(['P', 'D', 'C', 'A'] as Role[]).map((r) => `${byRole(r).length}${r}`).join(' · ')}
          </div>
        </div>
        <div className="stat">
          <div className="k">Valore di svincolo totale</div>
          <div className="v">{roster.reduce((s, p) => s + p.refund, 0)}</div>
          <div className="note">se svincolassi tutti oggi</div>
        </div>
      </div>

      <h2>Cambi rimasti</h2>
      <div className="changes">
        {changes.map((c) => (
          <div key={c.role} className={`chg ${c.left === 0 ? 'zero' : c.left === 1 ? 'one' : ''}`}>
            <div className="role">{c.role}</div>
            <div className="left">{c.left}<span className="of">/{c.allowance}</span></div>
            <div className="role" style={{ fontWeight: 400, letterSpacing: 0 }}>
              {c.bonusPending > 0 ? `+${c.bonusPending} a febbraio` : 'ritorno incluso'}
            </div>
          </div>
        ))}
      </div>

      <h2>La mia rosa</h2>
      <RosaCarte
        chiamateAperte={nextSession ? expectedStatus(nextSession, new Date(), ctx.cfg) === 'calls_open' : false}
        carte={roster.map((p) => {
          const el = freeReleaseEligibility(p);
          return {
            playerId: p.playerId, name: p.name, role: p.role, club: p.club,
            price: p.price, refund: p.refund, refundFree: p.refundFree,
            stato: STATUS_TAG[p.status] ?? null,
            pending: !!p.freeReleasePending, approved: !!p.freeReleaseApproved,
            canRequest: el.canRequest && !p.refundFree,
            hint: p.refundFree ? 'Già al 100%' : el.reason,
            indisponibile: schede.get(p.playerId)?.indisponibile ?? null,
            statistiche: schede.get(p.playerId)?.statistiche ?? null,
          };
        })}
      />

      <p className="nota-piede">
        Il valore di svincolo è il 75% del prezzo pagato, arrotondato per difetto e mai sotto 1
        credito. Diventa il 100% — e non consuma un cambio — per chi ha lasciato la Serie A, è
        squalificato dalla Lega o ha un infortunio oltre 60 giorni approvato dall&apos;admin.
      </p>
    </div>
  );
}

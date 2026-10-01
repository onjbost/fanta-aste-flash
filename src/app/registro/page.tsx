import Link from 'next/link';
import { requireTeamContext } from '@/lib/queries';
import { supabaseServer } from '@/lib/supabase';
import {
  AZIONI, ETICHETTA_AZIONE, quandoLeggibile, rigaDelRegistro, type Azione,
} from '@/lib/registro';
import {
  allenatoriDellaLega, giocatoriNelRegistro, pagineDelRegistro, PER_PAGINA,
} from '@/lib/registroLettura';
import { asteChiuse, astaDellArchivio } from '@/lib/asteArchivio';
import { TopBar } from '../TopBar';
import { NomeNelRegistro } from './NomeNelRegistro';

export const dynamic = 'force-dynamic';

type Parametri = {
  vista?: string; azione?: string; da?: string; a?: string;
  giocatore?: string; allenatore?: string; pagina?: string; asta?: string;
};

/** I filtri attivi, per riportarli nei link di pagina e nel contatore. */
function queryDeiFiltri(sp: Parametri): string {
  const q = new URLSearchParams();
  for (const k of ['azione', 'da', 'a', 'giocatore', 'allenatore'] as const) {
    if (sp[k]) q.set(k, String(sp[k]));
  }
  return q.toString();
}

function dataIta(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome',
  });
}

export default async function RegistroPage({ searchParams }: {
  searchParams: Promise<Parametri>;
}) {
  const ctx = await requireTeamContext();
  const sp = await searchParams;
  const vista = sp.vista === 'aste' ? 'aste' : 'azioni';

  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  const { data: mio } = auth.user
    ? await db.from('team_members').select('username, email').eq('user_id', auth.user.id).maybeSingle()
    : { data: null };

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="registro" />

      <p className="eyebrow">Fanta Mansarda</p>
      <h1>Il registro</h1>
      <NomeNelRegistro
        attuale={(mio?.username as string | null) ?? null}
        email={(mio?.email as string | null) ?? null}
      />

      <div className="tabs">
        <Link href="/registro" className={vista === 'azioni' ? 'on' : ''}>Azioni</Link>
        <Link href="/registro?vista=aste" className={vista === 'aste' ? 'on' : ''}>Aste passate</Link>
      </div>

      {vista === 'azioni'
        ? <Azioni ctx={ctx} sp={sp} />
        : <Aste leagueId={ctx.team.leagueId} sceltaId={sp.asta} />}
    </div>
  );
}

// ------------------------------------------------------------- le azioni

async function Azioni({ ctx, sp }: {
  ctx: Awaited<ReturnType<typeof requireTeamContext>>; sp: Parametri;
}) {
  const pagina = Math.max(1, Number(sp.pagina ?? 1) || 1);
  const [{ voci, altre }, allenatori, giocatori] = await Promise.all([
    pagineDelRegistro(ctx.team.leagueId, {
      azione: (sp.azione as Azione | 'tutte') || 'tutte',
      da: sp.da, a: sp.a, playerId: sp.giocatore, allenatore: sp.allenatore, pagina,
    }),
    allenatoriDellaLega(ctx.team.leagueId),
    giocatoriNelRegistro(ctx.team.leagueId),
  ]);

  const filtri = queryDeiFiltri(sp);
  const quanti = filtri ? new URLSearchParams(filtri).size : 0;

  return (
    <>
      <form className="filters">
        <div className="field">
          <label htmlFor="azione">Azione</label>
          <select id="azione" name="azione" defaultValue={sp.azione ?? ''}>
            <option value="">Tutte</option>
            {AZIONI.map((a) => (
              <option key={a} value={a}>{ETICHETTA_AZIONE[a]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="allenatore">Allenatore</label>
          <select id="allenatore" name="allenatore" defaultValue={sp.allenatore ?? ''}>
            <option value="">Tutti</option>
            {allenatori.map((a) => (
              <option key={a.userId} value={`${a.userId}:${a.teamId ?? ''}`}>{a.etichetta}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="giocatore">Giocatore</label>
          <select id="giocatore" name="giocatore" defaultValue={sp.giocatore ?? ''}>
            <option value="">Tutti</option>
            {giocatori.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="da">Dal</label>
          <input id="da" name="da" type="date" defaultValue={sp.da ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="a">Al</label>
          <input id="a" name="a" type="date" defaultValue={sp.a ?? ''} />
        </div>
        <button className="primary">Filtra{quanti > 0 && <span className="pallino">{quanti}</span>}</button>
        {quanti > 0 && <Link href="/registro" className="btn">Pulisci</Link>}
      </form>

      {voci.length === 0 ? (
        <div className="panel">
          <div className="empty">
            {quanti > 0
              ? 'Nessuna azione con questi filtri.'
              : 'Il registro è ancora vuoto.'}
          </div>
        </div>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          <ol className="reg">
            {voci.map((v) => (
              <li key={v.id}>
                <span className="reg-quando">{quandoLeggibile(v.avvenutoIl)}</span>
                <span className="reg-riga">
                  {rigaDelRegistro(v)}
                  {v.daAdmin && <span className="tag muted" style={{ marginLeft: 8 }}>regia</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(pagina > 1 || altre) && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 14 }}>
          {pagina > 1
            ? <Link className="btn" href={`/registro?${filtri}${filtri ? '&' : ''}pagina=${pagina - 1}`}>← Più recenti</Link>
            : <span />}
          <span style={{ color: 'var(--muted)', fontSize: '.85rem', alignSelf: 'center' }}>
            {(pagina - 1) * PER_PAGINA + 1}–{(pagina - 1) * PER_PAGINA + voci.length}
          </span>
          {altre
            ? <Link className="btn" href={`/registro?${filtri}${filtri ? '&' : ''}pagina=${pagina + 1}`}>Più vecchie →</Link>
            : <span />}
        </div>
      )}
    </>
  );
}

// -------------------------------------------------------- le aste passate

async function Aste({ leagueId, sceltaId }: { leagueId: string; sceltaId?: string }) {
  const elenco = await asteChiuse(leagueId);
  if (elenco.length === 0) {
    return (
      <div className="panel">
        <div className="empty">
          Nessuna asta chiusa, per ora. Una serata entra qui quando l&apos;admin
          la chiude.
        </div>
      </div>
    );
  }

  const asta = await astaDellArchivio(sceltaId ?? elenco[0].id);

  return (
    <>
      <form className="gaz-scelta-giornata">
        <input type="hidden" name="vista" value="aste" />
        <label>
          Asta
          <select name="asta" defaultValue={asta?.id ?? ''}>
            {elenco.map((a) => (
              <option key={a.id} value={a.id}>
                Asta {a.numero} · {dataIta(a.quando)} · {a.assegnati} assegnati
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="ghost">Guarda</button>
      </form>

      {asta && (
        <>
          <p className="sub">
            {dataIta(asta.quando)} · <b>{asta.assegnati}</b> lotti assegnati per{' '}
            <b>{asta.speso}</b> crediti in tutto
            {asta.annullati > 0 && <> · {asta.annullati} annullati</>}.
          </p>

          <div className="panel" style={{ padding: 0 }}>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Giocatore</th>
                    <th>Chiamato da</th>
                    <th>Se lo contendevano</th>
                    <th>Come è finita</th>
                  </tr>
                </thead>
                <tbody>
                  {asta.lotti.map((l) => (
                    <tr key={l.id} style={{ opacity: l.annullato ? .6 : 1 }}>
                      <td className="num">{l.indice}</td>
                      <td>
                        <span className="role-badge">{l.giocatore.ruolo}</span>{' '}
                        <b>{l.giocatore.nome}</b>{' '}
                        <span style={{ color: 'var(--muted)' }}>{l.giocatore.club}</span>
                      </td>
                      <td>{l.chiamante}</td>
                      <td style={{ fontSize: '.85rem' }}>
                        {l.contendenti.length === 0
                          ? <span style={{ color: 'var(--muted)' }}>nessuno</span>
                          : l.contendenti.map((c) => (
                            <div key={c.squadra}>
                              {c.squadra}
                              {c.svincolando && (
                                <span style={{ color: 'var(--muted)' }}> — metteva {c.svincolando}</span>
                              )}
                            </div>
                          ))}
                      </td>
                      <td>
                        {l.annullato ? (
                          <span className="tag muted">annullato</span>
                        ) : l.vincitore ? (
                          <>
                            <b>{l.vincitore}</b> per {l.prezzo} cr
                            {l.uscito && (
                              <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
                                esce {l.uscito.nome}
                                {l.uscito.rimborso != null && ` (+${l.uscito.rimborso})`}
                              </div>
                            )}
                            {l.senzaContendenti && (
                              <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
                                nessuno se lo contendeva
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="tag muted">non assegnato</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

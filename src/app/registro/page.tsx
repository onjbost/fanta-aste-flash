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
import { BottoneFoglio } from '../BottoneFoglio';

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

      <nav className="tabs" aria-label="Viste del registro">
        <Link href="/registro" className={vista === 'azioni' ? 'on' : ''}
              aria-current={vista === 'azioni' ? 'page' : undefined}>Azioni</Link>
        <Link href="/registro?vista=aste" className={vista === 'aste' ? 'on' : ''}
              aria-current={vista === 'aste' ? 'page' : undefined}>Aste passate</Link>
      </nav>

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

  // il tipo d'azione sta nelle chip; gli altri filtri nel foglio
  const altriFiltri = (['da', 'a', 'giocatore', 'allenatore'] as const).filter((k) => sp[k]).length;
  const conAzione = (azione: string) => {
    const q = new URLSearchParams(filtri);
    q.delete('azione');
    if (azione) q.set('azione', azione);
    const t = q.toString();
    return `/registro${t ? `?${t}` : ''}`;
  };

  return (
    <>
      <div className="chips" role="group" aria-label="Tipo di azione">
        <Link href={conAzione('')} className="chip" aria-current={!sp.azione ? 'page' : undefined}>Tutte</Link>
        {AZIONI.map((a) => (
          <Link key={a} href={conAzione(a)} className="chip" aria-current={sp.azione === a ? 'page' : undefined}>
            {ETICHETTA_AZIONE[a]}
          </Link>
        ))}
      </div>
      <div className="chips" style={{ marginTop: -4 }}>
        <BottoneFoglio etichetta="Altri filtri" titolo="Filtra il registro" conteggio={altriFiltri}>
          <form>
            {sp.azione && <input type="hidden" name="azione" value={sp.azione} />}
            <div className="field" style={{ marginTop: 8 }}>
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
            <div className="esiti-due" style={{ marginTop: 0 }}>
              <div className="field" style={{ background: 'none', padding: 0 }}>
                <label htmlFor="da">Dal</label>
                <input id="da" name="da" type="date" defaultValue={sp.da ?? ''} />
              </div>
              <div className="field" style={{ background: 'none', padding: 0 }}>
                <label htmlFor="a">Al</label>
                <input id="a" name="a" type="date" defaultValue={sp.a ?? ''} />
              </div>
            </div>
            <div className="foglio-piede">
              <Link href={sp.azione ? `/registro?azione=${sp.azione}` : '/registro'} className="btn">Pulisci</Link>
              <button className="primary">Filtra</button>
            </div>
          </form>
        </BottoneFoglio>
        {quanti > 0 && <Link href="/registro" className="chip">Azzera</Link>}
      </div>

      {voci.length === 0 ? (
        <div className="panel">
          <div className="empty">
            {quanti > 0
              ? 'Nessuna azione con questi filtri.'
              : 'Il registro è ancora vuoto.'}
          </div>
        </div>
      ) : (
        <div>
          <ol className="reg timeline">
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

  // la lega si passa sempre: l'id dell'asta arriva dall'indirizzo, e
  // `astaDellArchivio` serve solo serate chiuse di questa lega
  const asta = await astaDellArchivio(sceltaId ?? elenco[0].id, leagueId);

  return (
    <>
      <div className="chips" role="group" aria-label="Asta">
        {elenco.map((a) => (
          <Link key={a.id} href={`/registro?vista=aste&asta=${a.id}`} className="chip"
                aria-current={asta?.id === a.id ? 'page' : undefined}>
            Asta {a.numero}
          </Link>
        ))}
      </div>

      {asta && (
        <>
          <p className="sub" style={{ marginTop: 6 }}>
            {dataIta(asta.quando)} · <b>{asta.assegnati}</b> lotti assegnati per{' '}
            <b>{asta.speso}</b> crediti in tutto
            {asta.annullati > 0 && <> · {asta.annullati} annullati</>}.
          </p>

          <ol className="reg timeline">
            {asta.lotti.map((l) => (
              <li key={l.id} className={l.annullato || !l.vincitore ? 'spento' : 'fatto'}>
                <span className="reg-quando">Lotto {l.indice}</span>
                <span className="reg-riga">
                  <span className="role-badge">{l.giocatore.ruolo}</span>{' '}
                  <b>{l.giocatore.nome}</b> <span className="tenue">{l.giocatore.club}</span>
                  {' · '}
                  {l.annullato ? 'annullato'
                    : l.vincitore ? <>a <b>{l.vincitore}</b> per <b className="num">{l.prezzo}</b> cr</>
                    : 'non assegnato'}
                  <span className="reg-dettaglio">
                    chiamato da {l.chiamante}
                    {l.contendenti.length > 0 && ` · in corsa ${l.contendenti.map((c) =>
                      c.svincolando ? `${c.squadra} (metteva ${c.svincolando})` : c.squadra).join(', ')}`}
                    {l.uscito && ` · esce ${l.uscito.nome}${l.uscito.rimborso != null ? ` (+${l.uscito.rimborso})` : ''}`}
                    {l.senzaContendenti && ' · nessuno se lo contendeva'}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

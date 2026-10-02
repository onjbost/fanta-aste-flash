import { requireTeamContext } from '@/lib/queries';
import { supabaseServer } from '@/lib/supabase';
import { callsCloseAt, joinsCloseAt, ROLE_LABEL, type Role, type SessionInfo } from '@/lib/rules';
import { longDate, shortDeadline } from '@/lib/messages';
import Link from 'next/link';
import { TopBar } from '../TopBar';
import type { LeagueConfig } from '@/lib/rules';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

const STATO: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'In programma', cls: 'muted' },
  calls_open: { label: 'Chiamate aperte', cls: 'ok' },
  calls_closed: { label: 'Adesioni aperte', cls: 'ok' },
  joins_closed: { label: 'Tutto chiuso', cls: 'warn' },
  live: { label: 'In corso', cls: 'crit' },
  closed: { label: 'Conclusa', cls: 'muted' },
};

type Sezione = 'come' | 'regole' | 'calendario';

const SEZIONI: { key: Sezione; label: string }[] = [
  { key: 'come', label: 'Come funziona' },
  { key: 'regole', label: 'Le regole' },
  { key: 'calendario', label: 'Calendario' },
];

/** Le cinque tappe di un'asta flash, in ordine. */
function passi(): ReactNode[] {
  return [
    <><b>Chiami un giocatore</b> entro cinque giorni dall&apos;asta, indicando anche
          il tuo giocatore da svincolare. La chiamata diventa subito pubblica — serve
          perché gli altri possano aderire — mentre il tuo svincolando resta segreto.</>,
    <><b>Chi vuole contendertelo aderisce</b> entro il giorno prima, dichiarando a
          sua volta un giocatore da mettere sul piatto. Può lasciare un&apos;offerta
          massima, che il sistema userà al posto suo se non riesce a collegarsi.</>,
    <><b>Il giorno dell&apos;asta si apre la sala.</b> Svincolandi e budget vengono
          svelati tutti insieme. I lotti senza contendenti sono già assegnati al
          chiamante, al 75% del valore del suo svincolando: un&apos;operazione a saldo
          neutro, quello che rientra è esattamente quello che esce.</>,
    <><b>I lotti contesi vanno all&apos;asta uno alla volta</b>, in ordine di
          chiamata. Base un credito, rilancio minimo un credito, e ogni offerta
          riporta il timer a dieci secondi.</>,
    <><b>Chi vince</b> svincola il giocatore dichiarato, incassa il rimborso, paga
          il prezzo e consuma un cambio nel ruolo. <b>Chi perde non subisce nulla</b>:
          il suo giocatore resta in rosa al prezzo d&apos;acquisto originario.</>,
  ];
}

/** Le regole in numeri, ognuna con l'articolo da cui viene. */
function regole(cfg: LeagueConfig): { titolo: ReactNode; testo: ReactNode; fonte: string }[] {
  const ctx = { cfg };
  return [
    { titolo: <>Rimborso ordinario</>, testo: <>75% del prezzo pagato, arrotondato per difetto, <b>ma mai meno di
                1 credito</b>: uno svincolo non può rendere zero. Consuma un cambio
                nel ruolo.</>, fonte: 'art. 8.4' },
    { titolo: <>Rimborso pieno</>, testo: <>100% e nessun cambio consumato per chi ha lasciato la Serie A, per chi è
                squalificato dalla Lega e per gli infortuni oltre 60 giorni approvati
                dall&apos;admin. Si chiede con il pulsante in rosa; finché l&apos;admin non
                decide, l&apos;operazione resta congelata.</>, fonte: 'art. 8.3 · 11.2' },
    { titolo: <>Cambi a disposizione</>, testo: <>Girone di andata: {ctx.cfg.changes.P} POR · {ctx.cfg.changes.D} DIF ·{' '}
                {ctx.cfg.changes.C} CEN · {ctx.cfg.changes.A} ATT.
                Dal 1° febbraio si aggiunge {ctx.cfg.returnBonus} cambio per ruolo, che si
                somma a quelli non usati.</>, fonte: 'art. 10.2' },
    { titolo: <>Budget d&apos;asta</>, testo: <>Crediti residui più il rimborso del giocatore che metti sul piatto.
                Dopo ogni aggiudicazione i crediti si aggiornano: il lotto successivo
                parte dal saldo nuovo.</>, fonte: 'art. 10.2' },
    { titolo: <>Stesso ruolo</>, testo: <>Chi entra e chi esce sono dello stesso ruolo: la rosa resta 3-8-8-6.</>, fonte: 'integrativa' },
    { titolo: <>Uno svincolando per operazione</>, testo: <>Puoi chiamare più giocatori nella stessa asta, ma ogni chiamata e ogni
                adesione vuole un giocatore diverso sul piatto.</>, fonte: 'integrativa' },
    { titolo: <>Tetto di partecipazioni</>, testo: <>Non puoi partecipare a più lotti di un ruolo di quanti cambi ti restano
                in quel ruolo.</>, fonte: 'integrativa' },
    { titolo: <>Ritiro</>, testo: <>Chiamate e adesioni si modificano o si ritirano fino alla chiusura delle chiamate.</>, fonte: 'integrativa' },
    { titolo: <>Giocatori svincolati</>, testo: <>Chi esce da una rosa in asta torna chiamabile solo dall&apos;asta successiva.</>, fonte: 'art. 10.2' },
  ];
}

/** Una scheda regola: il numero in grande, il titolo, il testo, la fonte. */
function Scheda({ n, titolo, fonte, children }: {
  n: number; titolo?: ReactNode; fonte?: string; children: ReactNode;
}) {
  return (
    <li className="scheda-regola">
      <span className="scheda-n num" aria-hidden="true">{n}</span>
      <div>
        {titolo && <h3>{titolo}</h3>}
        <div className="scheda-testo">{children}</div>
        {fonte && <span className="tag muted">{fonte}</span>}
      </div>
    </li>
  );
}

export default async function RegolamentoPage({
  searchParams,
}: { searchParams: Promise<{ s?: string }> }) {
  const ctx = await requireTeamContext();
  const { s: sp } = await searchParams;
  const sezione: Sezione = sp === 'regole' || sp === 'calendario' ? sp : 'come';

  const db = await supabaseServer();
  const { data: sessions } = await db.from('auction_sessions')
    .select('id, number, auction_at, status, excludes_new_signings')
    .eq('league_id', ctx.team.leagueId).order('number');

  const now = new Date();
  const rows = (sessions ?? []).map((s) => ({
    ...s,
    info: {
      id: s.id, number: s.number, auctionAt: s.auction_at,
      status: s.status, excludesNewSignings: s.excludes_new_signings,
    } as SessionInfo,
  }));
  const prossima = rows.find((r) => new Date(r.auction_at) >= now);

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="regolamento" />

      <p className="eyebrow">Lega Fanta Mansarda · 2ª edizione</p>
      <h1>Regolamento aste flash</h1>

      <nav className="chips" aria-label="Sezioni del regolamento">
        {SEZIONI.map((x) => (
          <Link key={x.key} href={x.key === 'come' ? '/regolamento' : `/regolamento?s=${x.key}`} className="chip"
                aria-current={sezione === x.key ? 'page' : undefined}>
            {x.label}
          </Link>
        ))}
      </nav>

      {sezione === 'come' && (
        <ol className="schede-regola">
          {passi().map((p, i) => <Scheda key={i} n={i + 1}>{p}</Scheda>)}
        </ol>
      )}

      {sezione === 'regole' && (
        <>
          <ol className="schede-regola">
            {regole(ctx.cfg).map((r, i) => (
              <Scheda key={i} n={i + 1} titolo={r.titolo} fonte={r.fonte}>{r.testo}</Scheda>
            ))}
          </ol>
          <p className="nota-piede">
            <b>Quello che l&apos;app non fa:</b> l&apos;asta di riparazione di febbraio resta
            fuori, si continua a fare come sempre.
            {' '}Ruoli: {(['P', 'D', 'C', 'A'] as Role[]).map((r) => `${r} = ${ROLE_LABEL[r]}`).join(' · ')}.
          </p>
        </>
      )}

      {sezione === 'calendario' && (
        <>
          <ol className="calendario">
            {rows.map((r) => {
              const stato = STATO[r.status] ?? STATO.scheduled;
              return (
                <li key={r.id} className={`${r.status === 'closed' ? 'passata' : ''}${prossima?.id === r.id ? ' prossima' : ''}`}>
                  <span className="scheda-n num">{r.number}</span>
                  <div className="chi-col">
                    <b>{longDate(r.auction_at)}</b>
                    <small>
                      chiamate entro {shortDeadline(callsCloseAt(r.info, ctx.cfg).toISOString())} ·
                      adesioni entro {shortDeadline(joinsCloseAt(r.info, ctx.cfg).toISOString())}
                    </small>
                    {r.excludes_new_signings && <small className="avviso">nuovi acquisti esclusi</small>}
                  </div>
                  <span className={`tag ${prossima?.id === r.id ? 'ok' : stato.cls}`}>
                    {prossima?.id === r.id && r.status !== 'live' ? 'Prossima' : stato.label}
                  </span>
                </li>
              );
            })}
            {rows.length === 0 && <li><div className="empty">Calendario non ancora caricato.</div></li>}
          </ol>
          <p className="nota-piede">
            Le aste di gennaio sono le uniche in cui non si possono chiamare i giocatori
            arrivati in Serie A nel mercato invernale (art. 11.2). A febbraio non ci sono
            aste flash: c&apos;è l&apos;asta di riparazione, che si fa fuori dall&apos;app.
          </p>
        </>
      )}
    </div>
  );
}

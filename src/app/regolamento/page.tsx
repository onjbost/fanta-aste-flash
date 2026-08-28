import { requireTeamContext } from '@/lib/queries';
import { supabaseServer } from '@/lib/supabase';
import { callsCloseAt, joinsCloseAt, ROLE_LABEL, type Role, type SessionInfo } from '@/lib/rules';
import { longDate, shortDeadline } from '@/lib/messages';
import { TopBar } from '../TopBar';

export const dynamic = 'force-dynamic';

const STATO: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'In programma', cls: 'muted' },
  calls_open: { label: 'Chiamate aperte', cls: 'ok' },
  calls_closed: { label: 'Adesioni aperte', cls: 'ok' },
  joins_closed: { label: 'Tutto chiuso', cls: 'warn' },
  live: { label: 'In corso', cls: 'crit' },
  closed: { label: 'Conclusa', cls: 'muted' },
};

export default async function RegolamentoPage() {
  const ctx = await requireTeamContext();

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
      <p className="sub">
        Le regole del mercato svincolati, quelle che l&apos;app applica da sola, e il
        calendario delle quindici aste della stagione.
      </p>

      {/* ------------------------------------------------------ calendario */}
      <h2>Calendario</h2>
      <div className="panel">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Asta</th>
                <th>Chiamate entro</th><th>Adesioni entro</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const passata = new Date(r.auction_at) < now;
                const stato = STATO[r.status] ?? STATO.scheduled;
                return (
                  <tr key={r.id} style={{
                    opacity: passata && r.status === 'closed' ? .55 : 1,
                    fontWeight: prossima?.id === r.id ? 700 : 400,
                  }}>
                    <td className="num">{r.number}</td>
                    <td>
                      {longDate(r.auction_at)}
                      {r.excludes_new_signings && (
                        <span className="tag warn" style={{ marginLeft: 8 }}>Nuovi acquisti esclusi</span>
                      )}
                      {prossima?.id === r.id && (
                        <span className="tag ok" style={{ marginLeft: 8 }}>Prossima</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
                      {shortDeadline(callsCloseAt(r.info, ctx.cfg).toISOString())}
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
                      {shortDeadline(joinsCloseAt(r.info, ctx.cfg).toISOString())}
                    </td>
                    <td><span className={`tag ${stato.cls}`}>{stato.label}</span></td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={5}><div className="empty">Calendario non ancora caricato.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
        Le aste di gennaio sono le uniche in cui non si possono chiamare i giocatori
        arrivati in Serie A nel mercato invernale (art. 11.2). A febbraio non ci sono
        aste flash: c&apos;è l&apos;asta di riparazione, che si fa fuori dall&apos;app.
      </p>

      {/* ------------------------------------------------------ come funziona */}
      <h2>Come funziona un&apos;asta flash</h2>
      <ol className="rules">
        <li>
          <b>Chiami un giocatore</b> entro cinque giorni dall&apos;asta, indicando anche
          il tuo giocatore da svincolare. La chiamata diventa subito pubblica — serve
          perché gli altri possano aderire — mentre il tuo svincolando resta segreto.
        </li>
        <li>
          <b>Chi vuole contendertelo aderisce</b> entro il giorno prima, dichiarando a
          sua volta un giocatore da mettere sul piatto. Può lasciare un&apos;offerta
          massima, che il sistema userà al posto suo se non riesce a collegarsi.
        </li>
        <li>
          <b>Il giorno dell&apos;asta si apre la sala.</b> Svincolandi e budget vengono
          svelati tutti insieme. I lotti senza contendenti sono già assegnati al
          chiamante, al 75% del valore del suo svincolando: un&apos;operazione a saldo
          neutro, quello che rientra è esattamente quello che esce.
        </li>
        <li>
          <b>I lotti contesi vanno all&apos;asta uno alla volta</b>, in ordine di
          chiamata. Base un credito, rilancio minimo un credito, e ogni offerta
          riporta il timer a dieci secondi.
        </li>
        <li>
          <b>Chi vince</b> svincola il giocatore dichiarato, incassa il rimborso, paga
          il prezzo e consuma un cambio nel ruolo. <b>Chi perde non subisce nulla</b>:
          il suo giocatore resta in rosa al prezzo d&apos;acquisto originario.
        </li>
      </ol>

      {/* ------------------------------------------------------ le regole */}
      <h2>Le regole in numeri</h2>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Regola</th><th>Come funziona</th><th>Fonte</th></tr></thead>
          <tbody>
            <tr>
              <td><b>Rimborso ordinario</b></td>
              <td>
                75% del prezzo pagato, arrotondato per difetto, <b>ma mai meno di
                1 credito</b>: uno svincolo non può rendere zero. Consuma un cambio
                nel ruolo.
              </td>
              <td className="num">art. 8.4</td>
            </tr>
            <tr>
              <td><b>Rimborso pieno</b></td>
              <td>
                100% e nessun cambio consumato per chi ha lasciato la Serie A, per chi è
                squalificato dalla Lega e per gli infortuni oltre 60 giorni approvati
                dall&apos;admin. Si chiede con il pulsante in rosa; finché l&apos;admin non
                decide, l&apos;operazione resta congelata.
              </td>
              <td className="num">art. 8.3 · 11.2</td>
            </tr>
            <tr>
              <td><b>Cambi a disposizione</b></td>
              <td>
                Girone di andata: {ctx.cfg.changes.P} POR · {ctx.cfg.changes.D} DIF ·{' '}
                {ctx.cfg.changes.C} CEN · {ctx.cfg.changes.A} ATT.
                Dal 1° febbraio si aggiunge {ctx.cfg.returnBonus} cambio per ruolo, che si
                somma a quelli non usati.
              </td>
              <td className="num">art. 10.2</td>
            </tr>
            <tr>
              <td><b>Budget d&apos;asta</b></td>
              <td>
                Crediti residui più il rimborso del giocatore che metti sul piatto.
                Dopo ogni aggiudicazione i crediti si aggiornano: il lotto successivo
                parte dal saldo nuovo.
              </td>
              <td className="num">art. 10.2</td>
            </tr>
            <tr>
              <td><b>Stesso ruolo</b></td>
              <td>Chi entra e chi esce sono dello stesso ruolo: la rosa resta 3-8-8-6.</td>
              <td className="num">integrativa</td>
            </tr>
            <tr>
              <td><b>Uno svincolando per operazione</b></td>
              <td>
                Puoi chiamare più giocatori nella stessa asta, ma ogni chiamata e ogni
                adesione vuole un giocatore diverso sul piatto.
              </td>
              <td className="num">integrativa</td>
            </tr>
            <tr>
              <td><b>Tetto di partecipazioni</b></td>
              <td>
                Non puoi partecipare a più lotti di un ruolo di quanti cambi ti restano
                in quel ruolo.
              </td>
              <td className="num">integrativa</td>
            </tr>
            <tr>
              <td><b>Ritiro</b></td>
              <td>Chiamate e adesioni si modificano o si ritirano fino alla chiusura delle chiamate.</td>
              <td className="num">integrativa</td>
            </tr>
            <tr>
              <td><b>Giocatori svincolati</b></td>
              <td>Chi esce da una rosa in asta torna chiamabile solo dall&apos;asta successiva.</td>
              <td className="num">art. 10.2</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="callout">
        <b>Quello che l&apos;app non fa:</b> scambi diretti tra squadre e asta di
        riparazione di febbraio restano fuori, si continuano a fare come sempre.
        Qui c&apos;è solo il mercato degli svincolati.
      </div>

      <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
        Ruoli: {(['P', 'D', 'C', 'A'] as Role[]).map((r) => `${r} = ${ROLE_LABEL[r]}`).join(' · ')}
      </p>
    </div>
  );
}

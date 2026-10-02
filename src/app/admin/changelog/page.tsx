import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { redirect } from 'next/navigation';
import { requireTeamContext } from '@/lib/queries';
import { inBlocchi, type Blocco, type Pezzo } from '@/lib/changelog';
import { TopBar } from '../../TopBar';
import { AzioniGruppo } from '../AzioniGruppo';

export const dynamic = 'force-dynamic';

/**
 * Il changelog dell'app, dal CHANGELOG.md del progetto.
 *
 * Si legge il file e non una tabella: è lo stesso che sta nel repo, quindi
 * dice sempre la verità su quello che è in produzione, e non c'è niente da
 * ricopiare a mano dopo un aggiornamento. Il file deve stare fra quelli che
 * Next porta con sé nel pacchetto — `outputFileTracingIncludes` in
 * `next.config.mjs` — perché il tracciatore segue gli import, e questo è un
 * percorso costruito a runtime.
 */
async function testoDelChangelog(): Promise<string | null> {
  for (const dove of [
    path.join(process.cwd(), 'CHANGELOG.md'),
    // in produzione la radice del pacchetto non sempre è la cartella corrente
    path.join(process.cwd(), '..', 'CHANGELOG.md'),
  ]) {
    try {
      return await readFile(dove, 'utf8');
    } catch {
      // si prova il prossimo
    }
  }
  return null;
}

function Linea({ pezzi }: { pezzi: Pezzo[] }) {
  return (
    <>
      {pezzi.map((p, i) => {
        if (p.tipo === 'forte') return <b key={i}>{p.testo}</b>;
        if (p.tipo === 'codice') return <code key={i} className="mono">{p.testo}</code>;
        return <span key={i}>{p.testo}</span>;
      })}
    </>
  );
}

function Blocchi({ blocchi }: { blocchi: Blocco[] }) {
  return (
    <>
      {blocchi.map((b, i) => {
        if (b.tipo === 'titolo') {
          if (b.livello === 1) return null;   // il titolo del file è già l'h1 della pagina
          if (b.livello === 2) {
            return (
              <h2 key={i} style={{ marginTop: i === 0 ? 0 : 28 }}>
                <Linea pezzi={b.pezzi} />
              </h2>
            );
          }
          return (
            <h3 key={i} style={{
              marginTop: 20, fontSize: '.72rem', letterSpacing: '.12em',
              textTransform: 'uppercase', color: 'var(--muted)',
            }}>
              <Linea pezzi={b.pezzi} />
            </h3>
          );
        }
        if (b.tipo === 'elenco') {
          return (
            <ul key={i} style={{ margin: '8px 0 14px', paddingLeft: 20, lineHeight: 1.6 }}>
              {b.voci.map((v, j) => <li key={j}><Linea pezzi={v} /></li>)}
            </ul>
          );
        }
        return (
          <p key={i} style={{ lineHeight: 1.6 }}>
            <Linea pezzi={b.pezzi} />
          </p>
        );
      })}
    </>
  );
}

export default async function ChangelogPage() {
  const ctx = await requireTeamContext();
  if (!ctx.team.isAdmin) redirect('/');

  const md = await testoDelChangelog();
  const blocchi = md ? inBlocchi(md) : [];

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="admin" />

      <p className="eyebrow">Solo admin</p>
      <h1>Cos&apos;è cambiato nell&apos;app</h1>
      <AzioniGruppo pagina="/admin/changelog" />
      <p className="sub">
        Il registro degli aggiornamenti, versione per versione. Lo scrive chi
        tocca il codice, e arriva qui con il codice: se una cosa è scritta sotto
        una versione, in produzione c&apos;è.
      </p>

      <div className="panel" style={{ padding: 20 }}>
        {blocchi.length === 0
          ? <div className="empty">Il file degli aggiornamenti non è arrivato nel pacchetto.</div>
          : <Blocchi blocchi={blocchi} />}
      </div>
    </div>
  );
}

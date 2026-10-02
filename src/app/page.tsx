import { requireTeamContext } from '@/lib/queries';
import {
  esitoPer, formaUltime, precedenti, prossimaPartita, scadenzeDellaHome, titoloPartita,
  type Competizione, type Partita,
} from '@/lib/home';
import {
  giornatePerScadenze, sfideDellaLega, squadreDellaLega, ultimeClassifiche,
  type Classifiche, type Squadra,
} from '@/lib/homeServer';
import { TopBar } from './TopBar';
import { BannerPartite, type SlidePartita } from './home/BannerPartite';
import { Scadenze, type TesseraScadenza } from './home/Scadenze';

export const dynamic = 'force-dynamic';

/** «dom 11 ott · 15:00», sempre in ora di Roma: la lega gioca lì. */
const dataBreve = (iso: string) => {
  const d = new Date(iso);
  const giorno = d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Rome' });
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
  return `${giorno} · ${ora}`;
};

/** La posizione in classifica di una squadra, nella competizione della partita. */
function posizione(cl: Classifiche, p: Partita, teamId: string): number | null {
  if (p.competition === 'campionato') {
    return cl.campionato.righe.find((r) => r.teamId === teamId)?.posizione ?? null;
  }
  for (const righe of Object.values(cl.coppa.gironi)) {
    const r = righe.find((x) => x.teamId === teamId);
    if (r) return r.posizione;
  }
  return null;
}

function slide(
  comp: Competizione, etichetta: string, mia: string,
  sfide: Partita[], squadre: Map<string, Squadra>, cl: Classifiche,
): SlidePartita {
  const p = prossimaPartita(sfide, mia, comp);
  if (!p || !p.homeId || !p.awayId) return { comp, etichetta, partita: null };

  const sq = (id: string) => squadre.get(id) ?? { id, nome: '?', stemma: null };
  const casa = sq(p.homeId);
  const ospite = sq(p.awayId);
  const pc = posizione(cl, p, p.homeId);
  const po = posizione(cl, p, p.awayId);
  const dove = p.competition === 'campionato' ? 'in classifica' : 'nel girone';
  const nota = pc && po && p.phase !== 'semifinale' && p.phase !== 'finale'
    ? `${pc}° contro ${po}° ${dove}` : null;

  return {
    comp, etichetta,
    partita: {
      titolo: titoloPartita(p),
      quando: dataBreve(p.kickoff),
      casa: { nome: casa.nome, stemma: casa.stemma, posizione: pc ? `${pc}°` : null, forma: formaUltime(sfide, p.homeId) },
      ospite: { nome: ospite.nome, stemma: ospite.stemma, posizione: po ? `${po}°` : null, forma: formaUltime(sfide, p.awayId) },
      nota,
      precedenti: precedenti(sfide, p.homeId, p.awayId).map((x) => ({
        id: x.id,
        quando: x.competition === 'coppa' ? `Coppa · ${titoloPartita(x)}` : titoloPartita(x),
        risultato: `${sq(x.homeId!).nome} ${x.homeGoals}–${x.awayGoals} ${sq(x.awayId!).nome}`,
        esito: esitoPer(x, mia),
      })),
    },
  };
}

/**
 * La Home: la prossima partita della squadra (campionato e Coppa Mansarda),
 * i quattro tasti, e le scadenze della settimana.
 */
export default async function Home() {
  const ctx = await requireTeamContext();
  const lega = ctx.team.leagueId;
  const [sfide, squadre, giornate, cl] = await Promise.all([
    sfideDellaLega(lega), squadreDellaLega(lega), giornatePerScadenze(lega), ultimeClassifiche(lega),
  ]);

  const slides = [
    slide('campionato', 'Campionato', ctx.team.id, sfide, squadre, cl),
    slide('coppa', 'Coppa Mansarda', ctx.team.id, sfide, squadre, cl),
  ];

  const s = ctx.nextSession;
  const scadenze = scadenzeDellaHome({
    ora: new Date(),
    asta: s ? { number: s.number, auctionAt: s.auctionAt, status: s.status } : null,
    giornate,
    giorniChiamate: ctx.cfg.callDeadlineDays,
    giorniAdesioni: ctx.cfg.joinDeadlineDays,
  });
  const vuota: Record<string, string> = {
    chiamate: s ? 'già chiuse' : 'nessuna asta in calendario',
    adesioni: s ? 'già chiuse' : 'nessuna asta in calendario',
    formazione: 'nessuna giornata in vista',
    schedine: 'nessuna giornata in vista',
  };
  const tessere: TesseraScadenza[] = scadenze.map((x) => ({
    chiave: x.chiave, titolo: x.titolo, quando: x.quando, prossima: x.prossima,
    data: x.quando ? dataBreve(x.quando) : null, vuota: vuota[x.chiave],
  }));

  return (
    <div className="shell">
      <TopBar teamName={ctx.team.name} isAdmin={ctx.team.isAdmin} active="home" />
      <h1 className="sr-only">Home · {ctx.team.name}</h1>

      <BannerPartite slides={slides} />

      <h2 className="titoletto">Prossime scadenze</h2>
      <Scadenze tessere={tessere} />
    </div>
  );
}

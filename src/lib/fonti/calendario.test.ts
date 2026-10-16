import { describe, expect, it } from 'vitest';
import { DURATA_PARTITA_MS, istanteRoma, leggiCalendario, riassumi } from './calendario';

// La forma di una partita è quella della pagina vera
// (fantacalcio.it/serie-a/calendario/8, ottobre 2026), stemmi a parte.
function partita(g: number, casa: string, ospite: string, data: string, ora: string, stato = 0): string {
  const c = casa.toLowerCase(); const o = ospite.toLowerCase();
  return `
<li class="match time-on-left">
<div
    itemscope itemtype="http://schema.org/SportsEvent"
    class="match-pill theme-light size-large match-status-${stato}" data-match-status="${stato}">
    <div class="matchweek">
        ${g}
    </div>
     <label itemprop="homeTeam" itemscope itemtype="http://schema.org/SportsTeam" for="team-18" class="team-home ">
        <a class="team-name team-link " href="https://www.fantacalcio.it/serie-a/squadre/${c}" target="_self">
        <meta itemprop="name" content="${casa}" />
        <meta itemprop="url" content="https://www.fantacalcio.it/serie-a/squadre/${c}" />
        ${casa}
    </a>
<img class="team-badge" itemprop="logo" src="https://content.fantacalcio.it/web/img/team/ico/${c}.png" alt="Stemma ${casa}" />
    </label>
     <label itemprop="awayTeam" itemscope itemtype="http://schema.org/SportsTeam" for="team-143" class="team-away ">
        <a class="team-name team-link " href="https://www.fantacalcio.it/serie-a/squadre/${o}" target="_self">
        <meta itemprop="name" content="${ospite}" />
        <meta itemprop="url" content="https://www.fantacalcio.it/serie-a/squadre/${o}" />
        ${ospite}
    </a>
    </label>
        <a class="match-score unstyled" href="https://www.fantacalcio.it/serie-a/calendario/${g}/2026-27/${c}-${o}/18033" target="_self">
            <span class="score-home">0</span>
            <span class="score-divider">-</span>
            <span class="score-away">0</span>
        </a>
    <div class="match-date">
        <meta itemprop="startDate" content="${data}"/>
        <span class="day">${data.slice(8, 10)}/${data.slice(5, 7)}</span>
        <span class="hours">${ora}</span>
    </div>
    <div class="match-location">
        <span class="stadium" itemprop="location">Olimpico</span>
    </div>
    <meta itemprop="name" content="Serie A 2026-27 - ${g}&#xB0; giornata - ${c}-${o}" />
    <meta itemprop="sport" content="Soccer" />
</div>
</li>`;
}

describe('istanteRoma', () => {
  it('converte l\'ora di Roma, con e senza ora legale', () => {
    // il 25 ottobre 2026 si torna all'ora solare
    expect(new Date(istanteRoma('2026-10-24', '20:45')!).toISOString()).toBe('2026-10-24T18:45:00.000Z');
    expect(new Date(istanteRoma('2026-10-26', '20:45')!).toISOString()).toBe('2026-10-26T19:45:00.000Z');
    expect(new Date(istanteRoma('2027-01-06', '12:30')!).toISOString()).toBe('2027-01-06T11:30:00.000Z');
  });

  it('non inventa un orario che non c\'è', () => {
    expect(istanteRoma('2026-10-24', '')).toBeNull();
    expect(istanteRoma('2026-10-24', '-')).toBeNull();
    expect(istanteRoma('', '20:45')).toBeNull();
  });
});

describe('leggiCalendario', () => {
  const pagina = [
    partita(8, 'Torino', 'Monza', '2026-10-23', '20:45'),
    partita(8, 'Atalanta', 'Frosinone', '2026-10-24', '15:00'),
    partita(8, 'Napoli', 'Roma', '2026-10-26', '20:45'),
    partita(8, 'Inter', 'Fiorentina', '2026-10-25', '18:00', 6),
    // il riquadro della giornata in corso, che la pagina mostra sotto
    partita(7, 'Parma', 'Torino', '2026-10-19', '20:45'),
    // la stessa partita ripetuta non conta due volte
    partita(8, 'Torino', 'Monza', '2026-10-23', '20:45'),
  ].join('\n');

  it('tiene solo la giornata chiesta, una volta per partita', () => {
    const p = leggiCalendario(pagina, 8);
    expect(p.map((x) => `${x.teamHome}-${x.teamAway}`)).toEqual(['Torino-Monza', 'Atalanta-Frosinone', 'Napoli-Roma', 'Inter-Fiorentina']);
    expect(p[0]).toEqual({ teamHome: 'Torino', teamAway: 'Monza', status: 0, matchDate: Date.parse('2026-10-23T18:45:00Z') });
    expect(p[3].status).toBe(6);
    expect(leggiCalendario(pagina, 7)).toHaveLength(1);
    expect(leggiCalendario(pagina, 9)).toEqual([]);
  });

  it('prima e ultima partita, senza le rinviate', () => {
    const r = riassumi(leggiCalendario(pagina, 8));
    expect(r.prima).toEqual({ nome: 'Torino–Monza', kickoff: Date.parse('2026-10-23T18:45:00Z') });
    expect(r.ultima?.nome).toBe('Napoli–Roma');
    expect(r.ultima?.fine).toBe(Date.parse('2026-10-26T19:45:00Z') + DURATA_PARTITA_MS);
    expect(r.rinviate).toEqual(['Inter–Fiorentina']);
    expect(r.senzaOrario).toEqual([]);
  });

  it('una partita senza orario si segnala e non sposta prima e ultima', () => {
    const r = riassumi(leggiCalendario(pagina + partita(8, 'Lecce', 'Juventus', '2026-10-27', ''), 8));
    expect(r.senzaOrario).toEqual(['Lecce–Juventus']);
    expect(r.ultima?.nome).toBe('Napoli–Roma');
  });
});

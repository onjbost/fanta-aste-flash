import { describe, expect, it } from 'vitest';
import { agganciatore, leggiQuotazioni, leggiVoti, stessoClub } from './pagine';

// La forma delle righe delle quotazioni è quella della pagina vera
// (fantacalcio.it/quotazioni-fantacalcio, agosto 2026): classi delle celle e
// `data-col-key` sono quelli che usa la pagina per i suoi filtri.
const QUOTAZIONI = `
<table class="pills-table sticky-header-col serie-a">
<thead><tr><th>R.</th><th>Calciatore</th><th>Sq.</th><th>Qt.I</th><th>Qt.A</th><th>FVM</th></tr></thead>
<tbody>
  <tr class="player-row" data-index="0" data-filter-role-classic="a">
    <th class="player-championship"></th>
    <th class="player-role player-role-classic"><span class="role" data-value="a"></span></th>
    <th class="player-role player-role-mantra">
      <div class="pill role-pill theme-dark"><span class="role role-mantra" data-value="pc" title="Punta centrale"></span></div>
    </th>
    <th class="player-name">
      <a class="player-name player-link" href="https://www.fantacalcio.it/serie-a/squadre/inter/martinez-l/2764" target="_self"><span>Martinez L.</span></a>
    </th>
    <td class="player-team" data-col-key="sq">INT</td>
    <td class="player-classic-initial-price" data-col-key="c_qi">35</td>
    <td class="player-classic-current-price" data-col-key="c_qa">38</td>
    <td class="player-classic-fvm" data-col-key="c_fvm">370</td>
    <td class="tail"></td>
  </tr>
  <tr class="player-row" data-index="1" data-filter-role-classic="p">
    <th class="player-role player-role-classic"><span class="role" data-value="p"></span></th>
    <th class="player-role player-role-mantra"><span class="role role-mantra" data-value="por"></span></th>
    <th class="player-name">
      <a class="player-name player-link" href="https://www.fantacalcio.it/serie-a/squadre/hellas-verona/montip&agrave;/9999"><span>Montip&agrave;</span></a>
    </th>
    <td class="player-team" data-col-key="sq">VER</td>
    <td class="player-classic-initial-price" data-col-key="c_qi">5</td>
    <td class="player-classic-current-price" data-col-key="c_qa">4</td>
    <td class="player-classic-fvm" data-col-key="c_fvm">2</td>
  </tr>
  <tr class="player-row ad"><td colspan="6">pubblicità</td></tr>
</tbody>
</table>`;

describe('leggiQuotazioni', () => {
  const righe = leggiQuotazioni(QUOTAZIONI);

  it('legge tutte le righe vere e salta le altre', () => {
    expect(righe.map((r) => r.nome)).toEqual(['Martinez L.', 'Montipà']);
  });

  it('distingue quotazione attuale, iniziale e FVM', () => {
    expect(righe[0]).toMatchObject({ qtIniziale: 35, qtAttuale: 38, fvm: 370 });
  });

  it('prende il ruolo Classic e non quello Mantra', () => {
    expect(righe.map((r) => r.ruolo)).toEqual(['A', 'P']);
  });

  it("tiene l'id di fantacalcio.it e il club dell'indirizzo", () => {
    expect(righe[0]).toMatchObject({ extId: '2764', club: 'INT', clubSlug: 'inter' });
    expect(righe[1].clubSlug).toBe('hellas-verona');
  });

  it('una pagina cambiata non produce righe, non righe sbagliate', () => {
    expect(leggiQuotazioni('<table><tr><td>38</td></tr></table>')).toEqual([]);
  });
});

const VOTI = `
<html><head><title>Voti Fantacalcio Serie A 6ª giornata stagione 2026/27</title></head><body>
<ul>
<li class="team-table">
  <div class="team-info"><a class="team-name" href="/serie-a/squadre/inter">Inter</a></div>
  <table class="grades-table"><tbody>
    <tr>
      <td><span class="role" data-value="a"></span>
        <a class="player-name player-link" href="https://www.fantacalcio.it/serie-a/squadre/inter/martinez-l/2764"><span>Martinez L.</span></a></td>
      <td><div class="group">
        <div class="pill"><span class="player-grade" data-value="7,5">7,5</span><span class="player-fanta-grade" data-value="10,5">10,5</span></div>
        <div class="pill"><span class="player-grade" data-value="7">7</span><span class="player-fanta-grade" data-value="10">10</span></div>
      </div></td>
    </tr>
    <tr>
      <td><span class="role" data-value="c"></span>
        <a class="player-name" href="https://www.fantacalcio.it/serie-a/squadre/inter/barella/2500"><span>Barella</span></a></td>
      <td><div class="group"><div class="pill"><span class="player-grade" data-value="55">sv</span><span class="player-fanta-grade" data-value="56">sv</span></div></div></td>
    </tr>
  </tbody></table>
</li>
<li class="team-table">
  <div class="team-info"><span class="team-name">Milan</span></div>
  <table class="grades-table"><tbody>
    <tr>
      <td><span class="role" data-value="p"></span>
        <a class="player-name" href="https://www.fantacalcio.it/serie-a/squadre/milan/maignan/4312"><span>Maignan</span></a></td>
      <td><div class="group"><div class="pill"><span class="player-grade" data-value="5">5</span><span class="player-fanta-grade" data-value="2">2</span></div></div></td>
    </tr>
  </tbody></table>
</li>
</ul></body></html>`;

describe('leggiVoti', () => {
  const p = leggiVoti(VOTI);

  it('capisce giornata e stagione dal titolo', () => {
    expect(p).toMatchObject({ giornata: 6, stagione: '2026/27' });
  });

  it('attacca ogni giocatore al suo club', () => {
    expect(p.righe.map((r) => [r.nome, r.club])).toEqual([
      ['Martinez L.', 'Inter'], ['Barella', 'Inter'], ['Maignan', 'Milan'],
    ]);
  });

  it('prende il voto della prima fonte, quella di fantacalcio.it', () => {
    expect(p.righe[0]).toMatchObject({ voto: 7.5, fantavoto: 10.5, ruolo: 'A' });
  });

  it('un «55» non è un voto: diventa senza voto', () => {
    expect(p.righe[1]).toMatchObject({ voto: null, fantavoto: null });
  });

  it("senza titolo prova con l'indirizzo canonico", () => {
    const x = leggiVoti('<link rel="canonical" href="https://www.fantacalcio.it/voti-fantacalcio-serie-a/2026-27/4">');
    expect(x).toMatchObject({ giornata: 4, stagione: '2026/27' });
  });
});

describe('aggancio', () => {
  const nostri = [
    { id: 'u1', extId: '2764', name: 'MARTINEZ L.', club: 'Inter' },
    { id: 'u2', extId: 'n-x', name: 'MONTIPO', club: 'Verona' },
    { id: 'u3', extId: 'n-y', name: 'MARTINEZ J.', club: 'Inter' },
    { id: 'u4', extId: 'n-z', name: 'ROSSI', club: 'Lazio' },
    { id: 'u5', extId: 'n-w', name: 'ROSSI', club: 'Lazio' },
  ];
  const aggancia = agganciatore(nostri);

  it("prima l'id del listone", () => {
    expect(aggancia({ extId: '2764', nome: 'Chiunque', club: 'X', clubSlug: 'x' })).toBe('u1');
  });

  it('poi il nome, senza accenti e col club che combacia', () => {
    expect(aggancia({ extId: '1', nome: 'Montipò', club: 'VER', clubSlug: 'hellas-verona' })).toBe('u2');
  });

  it('nel dubbio non aggancia nessuno', () => {
    expect(aggancia({ extId: '2', nome: 'Rossi', club: 'LAZ', clubSlug: 'lazio' })).toBeNull();
    expect(aggancia({ extId: '3', nome: 'Montipò', club: 'NAP', clubSlug: 'napoli' })).toBeNull();
  });

  it('sigla e nome per esteso sono lo stesso club', () => {
    expect(stessoClub('Inter', 'INT')).toBe(true);
    expect(stessoClub('Verona', 'VER', 'hellas-verona')).toBe(true);
    expect(stessoClub('Lazio', 'NAP', 'napoli')).toBe(false);
  });
});

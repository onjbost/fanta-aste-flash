/**
 * Un'asta flash riportata su Leghe Fantacalcio — le richieste, senza rete.
 *
 * Il pannello admin della lega fa svincoli e acquisti con due chiamate, una
 * per squadra, ognuna con una lista di giocatori:
 *  - `PUT /market/v1/admin/action/free/{divisione}/{squadra}` — svincolo,
 *    `[{ id: "6646", cost: 3 }]`: l'id del giocatore (come stringa) e i
 *    crediti che tornano alla squadra;
 *  - `POST /market/v1/admin/action/purchase/{divisione}/{squadra}` —
 *    acquisto, `[{ id: 6646, cost: 3 }]`: l'id (come numero) e il prezzo.
 * Prima gli svincoli, poi gli acquisti: lo svincolo libera i crediti che
 * l'acquisto spende.
 *
 * Qui si decide *cosa* chiedere, guardando anche lo stato della lega: uno
 * svincolo di un giocatore che nella lega non è più in quella rosa, o un
 * acquisto di uno che c'è già, sono già fatti (da un giro precedente, o a
 * mano) e non si ripetono.
 */

export interface MovimentoAsta {
  extId: string;
  nome: string;
  teamName: string;
  /** crediti: il rimborso per uno svincolo, il prezzo per un acquisto */
  crediti: number;
}

export interface Richiesta {
  metodo: 'PUT' | 'POST';
  percorso: string;
  corpo: { id: string | number; cost: number }[];
  squadra: string;
  giocatori: string[];
}

export interface Piano {
  richieste: Richiesta[];
  /** già a posto nella lega: niente da chiedere */
  giaFatti: string[];
  problemi: string[];
}

export function pianoAsta(
  svincoli: MovimentoAsta[],
  acquisti: MovimentoAsta[],
  /** le squadre della lega, col nostro nome: id, divisione e rosa attuale */
  squadre: Map<string, { id: number; divisione: string; rosa: Set<string> }>,
): Piano {
  const piano: Piano = { richieste: [], giaFatti: [], problemi: [] };
  const inRosa = new Map<string, string>();
  for (const [nome, s] of squadre) for (const id of s.rosa) inRosa.set(id, nome);

  const perSquadra = (lista: MovimentoAsta[]) => {
    const m = new Map<string, MovimentoAsta[]>();
    for (const x of lista) m.set(x.teamName, [...(m.get(x.teamName) ?? []), x]);
    return m;
  };

  for (const [teamName, lista] of perSquadra(svincoli)) {
    const s = squadre.get(teamName);
    if (!s) { piano.problemi.push(`${teamName}: squadra non trovata nella lega`); continue; }
    const daFare = lista.filter((x) => {
      if (s.rosa.has(x.extId)) return true;
      piano.giaFatti.push(`${x.nome} non è già più in ${teamName}`);
      return false;
    });
    if (daFare.length) {
      piano.richieste.push({
        metodo: 'PUT', percorso: `/market/v1/admin/action/free/${s.divisione}/${s.id}`,
        corpo: daFare.map((x) => ({ id: String(x.extId), cost: x.crediti })),
        squadra: teamName, giocatori: daFare.map((x) => `${x.nome} (svincolo, ${x.crediti} cr)`),
      });
    }
  }

  // chi viene svincolato in questo giro libera il posto per l'acquisto
  const liberati = new Set(svincoli.map((x) => x.extId));
  for (const [teamName, lista] of perSquadra(acquisti)) {
    const s = squadre.get(teamName);
    if (!s) { piano.problemi.push(`${teamName}: squadra non trovata nella lega`); continue; }
    const daFare = lista.filter((x) => {
      const dove = liberati.has(x.extId) ? undefined : inRosa.get(x.extId);
      if (!dove) return true;
      if (dove === teamName) piano.giaFatti.push(`${x.nome} è già in ${teamName}`);
      else piano.problemi.push(`${x.nome} nella lega è in ${dove}, non lo compro per ${teamName}`);
      return false;
    });
    if (daFare.length) {
      piano.richieste.push({
        metodo: 'POST', percorso: `/market/v1/admin/action/purchase/${s.divisione}/${s.id}`,
        corpo: daFare.map((x) => ({ id: Number(x.extId), cost: x.crediti })),
        squadra: teamName, giocatori: daFare.map((x) => `${x.nome} (acquisto, ${x.crediti} cr)`),
      });
    }
  }
  return piano;
}

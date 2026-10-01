/**
 * Il registro della lega: i fatti diventano frasi qui.
 *
 * Funzioni pure, nessuna query. Nel database una riga del registro è un
 * fatto — azione, chi, quando, gli agganci — e la frase che lo racconta si
 * compone in lettura. Serve a due cose: correggere una formulazione sistema
 * tutto il registro, comprese le righe di mesi prima, senza migrazioni; e il
 * modo in cui la lega racconta sé stessa resta in un posto solo, come già per
 * i messaggi del gruppo (`messages.ts`) e per la coda operativa (`coda.ts`).
 *
 * Una regola che non si vede ma pesa: **nelle chiamate e nelle adesioni lo
 * svincolando non compare**. Il registro è pubblico in lega e fino
 * all'apertura della sala chi mette sul piatto cosa è segreto — è il cuore
 * della segretezza dell'asta. Nell'acquisto invece si dice tutto, perché a
 * quel punto è pubblico.
 */

export type Azione =
  // gli allenatori
  | 'chiamata'
  | 'adesione'
  | 'acquisto_asta'
  | 'svincolo_richiesto'
  | 'schedina'
  // l'admin
  | 'svincolo_approvato'
  | 'svincolo_respinto'
  | 'scambio'
  | 'scambio_disfatto'
  | 'sala_aperta'
  | 'lotto_assegnato_a_mano'
  | 'lotto_annullato'
  | 'rosa_prezzo'
  | 'rosa_aggiunto'
  | 'rosa_tolto'
  | 'rose_importate'
  | 'crediti_impostati';

export const AZIONI: Azione[] = [
  'chiamata', 'adesione', 'acquisto_asta', 'svincolo_richiesto', 'schedina',
  'svincolo_approvato', 'svincolo_respinto', 'scambio', 'scambio_disfatto',
  'sala_aperta', 'lotto_assegnato_a_mano', 'lotto_annullato',
  'rosa_prezzo', 'rosa_aggiunto', 'rosa_tolto', 'rose_importate', 'crediti_impostati',
];

/** Come si chiama l'azione nel menù dei filtri. */
export const ETICHETTA_AZIONE: Record<Azione, string> = {
  chiamata: 'Chiamate all\'asta',
  adesione: 'Adesioni',
  acquisto_asta: 'Giocatori presi all\'asta',
  svincolo_richiesto: 'Svincoli gratuiti chiesti',
  schedina: 'Schedine giocate',
  svincolo_approvato: 'Svincoli gratuiti approvati',
  svincolo_respinto: 'Svincoli gratuiti respinti',
  scambio: 'Scambi',
  scambio_disfatto: 'Scambi disfatti',
  sala_aperta: 'Aperture della sala',
  lotto_assegnato_a_mano: 'Lotti assegnati a mano',
  lotto_annullato: 'Aggiudicazioni annullate',
  rosa_prezzo: 'Prezzi corretti in rosa',
  rosa_aggiunto: 'Giocatori aggiunti a una rosa',
  rosa_tolto: 'Giocatori tolti da una rosa',
  rose_importate: 'Import delle rose',
  crediti_impostati: 'Crediti modificati',
};

/** Le azioni dell'admin: nel registro si distinguono a vista. */
export const AZIONI_ADMIN: Azione[] = [
  'svincolo_approvato', 'svincolo_respinto', 'scambio', 'scambio_disfatto',
  'sala_aperta', 'lotto_assegnato_a_mano', 'lotto_annullato',
  'rosa_prezzo', 'rosa_aggiunto', 'rosa_tolto', 'rose_importate', 'crediti_impostati',
];

export interface VoceDelRegistro {
  id?: number;
  avvenutoIl: string;
  azione: Azione;
  attore: { nome: string; squadra: string | null };
  daAdmin: boolean;
  giocatore?: string | null;
  dati?: Record<string, unknown>;
}

// ------------------------------------------------------------------ chi

/**
 * Il nome con cui una persona compare nel registro: l'username se se l'è
 * messo, altrimenti l'email — come si era deciso.
 *
 * `nomeSalvato` è la fotografia presa quando l'azione è avvenuta, e serve per
 * due casi: le righe travasate dallo storico, dove il database sa quale
 * squadra ha agito ma non quale dei due allenatori, e chi non è più collegato
 * alla lega. Il nome vivo vince sempre sulla fotografia, così chi cambia
 * username lo vede cambiato in tutto il registro.
 */
export function nomeAttore(m: {
  username?: string | null;
  email?: string | null;
  nomeSalvato?: string | null;
}): string {
  const pulito = (s?: string | null) => (s && s.trim() ? s.trim() : null);
  return pulito(m.username) ?? pulito(m.nomeSalvato) ?? pulito(m.email) ?? 'Qualcuno';
}

/**
 * «Mattia (FC Joga Benito)». La squadra sta fra parentesi perché è quella che
 * si ricorda; se il nome è già quello della squadra non lo ripete due volte.
 */
export function chiFirma(nome: string, squadra: string | null): string {
  if (!squadra || squadra === nome) return nome;
  return `${nome} (${squadra})`;
}

// ---------------------------------------------------------------- quando

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/**
 * «1 ottobre, 09:22», nell'ora di Roma.
 *
 * Il fuso si prende da `Intl` e non sommando ore: d'estate l'Italia è due ore
 * avanti su UTC, d'inverno una, e un'ora sbagliata su una riga del registro
 * fa litigare la gente su chi ha chiamato prima.
 */
export function quandoLeggibile(iso: string): string {
  const parti = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const p = (tipo: string) => parti.find((x) => x.type === tipo)?.value ?? '';
  const mese = MESI[Number(p('month')) - 1] ?? '';
  return `${Number(p('day'))} ${mese}, ${p('hour')}:${p('minute')}`;
}

// ----------------------------------------------------------------- frasi

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const elenco = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

/** Quanti pronostici, al singolare o al plurale. */
function pronostici(quanti: number): string {
  return `${quanti} ${quanti === 1 ? 'pronostico' : 'pronostici'}`;
}

/**
 * «1 credito», «14 crediti».
 *
 * Alla prima asta metà dei lotti sono andati a un credito, e «per 1 crediti»
 * su metà delle righe del registro è il genere di dettaglio che fa sembrare
 * l'app scritta male.
 */
function crediti(quanti: number): string {
  return `${quanti} ${quanti === 1 ? 'credito' : 'crediti'}`;
}

/**
 * La riga del registro, in italiano, una frase per un'azione avvenuta.
 *
 * La data non è qui dentro: la mette la pagina accanto alla riga, perché in
 * un elenco lungo una colonna sola di date si legge molto meglio di una data
 * ripetuta in fondo a ogni frase.
 */
export function rigaDelRegistro(v: VoceDelRegistro): string {
  const chi = chiFirma(v.attore.nome, v.attore.squadra);
  const d = v.dati ?? {};
  const giocatore = v.giocatore ?? 'un giocatore';
  const squadra = t(d.squadra) ?? 'una squadra';
  const nota = t(d.nota);
  const coda = nota ? ` · ${nota}` : '';

  switch (v.azione) {
    case 'chiamata':
      // niente svincolando: è segreto fino all'apertura della sala
      return `${chi} ha chiamato ${giocatore} all'asta`;

    case 'adesione':
      return `${chi} ha aderito all'asta per ${giocatore}`;

    case 'acquisto_asta': {
      const prezzo = n(d.prezzo) ?? 0;
      const uscito = t(d.uscito);
      const rimborso = n(d.rimborso);
      const svincolo = uscito
        ? `, svincolando ${uscito}${rimborso != null ? ` (+${rimborso})` : ''}`
        : '';
      const ufficio = d.senzaContendenti ? ' · nessuno se lo contendeva' : '';
      return `${chi} si è preso ${giocatore} per ${crediti(prezzo)}${svincolo}${ufficio}`;
    }

    case 'svincolo_richiesto':
      return `${chi} ha chiesto lo svincolo gratuito di ${giocatore}`;

    case 'svincolo_approvato':
      return `${chi} ha approvato lo svincolo gratuito di ${giocatore} chiesto da ${squadra}${coda}`;

    case 'svincolo_respinto':
      return `${chi} ha respinto lo svincolo gratuito di ${giocatore} chiesto da ${squadra}${coda}`;

    case 'schedina': {
      const giornata = n(d.giornata);
      const quante = n(d.giocate);
      const dove = giornata != null ? ` della giornata ${giornata}` : '';
      const quanti = quante != null ? `, con ${pronostici(quante)}` : '';
      return `${chi} ha giocato la schedina${dove}${quanti}`;
    }

    case 'scambio': {
      // il fatto è delle due squadre, non di chi ha premuto il bottone
      const a = t(d.squadraA) ?? 'una squadra';
      const b = t(d.squadraB) ?? 'un\'altra';
      const verso = elenco(d.da);
      const indietro = elenco(d.a);
      const pezzi = [
        verso.length ? `${verso.join(', ')} a ${b}` : null,
        indietro.length ? `${indietro.join(', ')} a ${a}` : null,
      ].filter(Boolean).join(', ');
      const soldi = n(d.conguaglio);
      const paga = t(d.paga);
      const conguaglio = soldi && soldi > 0
        ? ` · conguaglio ${crediti(soldi)}${paga ? ` da ${paga}` : ''}`
        : '';
      return `Scambio fra ${a} e ${b}${pezzi ? `: ${pezzi}` : ''}${conguaglio}${coda}`;
    }

    case 'scambio_disfatto': {
      const a = t(d.squadraA) ?? 'una squadra';
      const b = t(d.squadraB) ?? 'un\'altra';
      return `${chi} ha disfatto lo scambio fra ${a} e ${b}${coda}`;
    }

    case 'sala_aperta': {
      const asta = n(d.asta);
      const dufficio = n(d.assegnatiSenzaAsta) ?? 0;
      const quali = dufficio > 0
        ? ` · ${dufficio} ${dufficio === 1 ? 'lotto assegnato' : 'lotti assegnati'} senza contendenti`
        : '';
      return `${chi} ha aperto la sala dell'asta${asta != null ? ` ${asta}` : ''}${quali}`;
    }

    case 'lotto_assegnato_a_mano': {
      const prezzo = n(d.prezzo) ?? 0;
      return `${chi} ha assegnato ${giocatore} a ${squadra} per ${crediti(prezzo)}, senza battere l'asta${coda}`;
    }

    case 'lotto_annullato':
      return `${chi} ha annullato l'aggiudicazione di ${giocatore} a ${squadra}${coda}`;

    case 'rosa_prezzo': {
      const prima = n(d.prima);
      const dopo = n(d.dopo);
      const da = prima != null && dopo != null ? `: da ${prima} a ${crediti(dopo)}` : '';
      return `${chi} ha corretto il prezzo di ${giocatore} nella rosa ${squadra}${da}${coda}`;
    }

    case 'rosa_aggiunto': {
      const prezzo = n(d.prezzo);
      return `${chi} ha aggiunto ${giocatore} alla rosa ${squadra}`
        + `${prezzo != null ? ` per ${crediti(prezzo)}` : ''}${coda}`;
    }

    case 'rosa_tolto': {
      const rimborso = n(d.rimborso);
      return `${chi} ha tolto ${giocatore} dalla rosa ${squadra}`
        + `${rimborso != null ? `, restituendo ${crediti(rimborso)}` : ''}${coda}`;
    }

    case 'rose_importate': {
      const giocatori = n(d.giocatori);
      const squadre = n(d.squadre);
      const conti = [
        squadre != null ? `${squadre} ${squadre === 1 ? 'squadra' : 'squadre'}` : null,
        giocatori != null ? `${giocatori} giocatori` : null,
      ].filter(Boolean).join(', ');
      return `${chi} ha importato le rose dal file della lega${conti ? `: ${conti}` : ''}${coda}`;
    }

    case 'crediti_impostati': {
      const prima = n(d.prima);
      const dopo = n(d.dopo);
      if (prima != null && dopo != null) {
        return `${chi} ha portato i crediti di ${squadra} da ${prima} a ${dopo}${coda}`;
      }
      return `${chi} ha modificato i crediti di ${squadra}${coda}`;
    }
  }
}

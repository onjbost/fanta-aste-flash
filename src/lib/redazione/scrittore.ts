/**
 * La Redazione — chi scrive materialmente il pezzo.
 *
 * Due implementazioni dietro la stessa interfaccia: il modello, e i template.
 * Il modello scrive meglio; i template non falliscono mai. Il primo si prova,
 * e se non risponde — chiave scaduta, quota finita, rete che non va di
 * domenica sera — parte il secondo e il messaggio arriva lo stesso, più
 * asciutto ma corretto.
 *
 * Il fornitore sta in una variabile d'ambiente e il nome del modello pure:
 * il giorno che Google deprecherà `gemini-flash-latest` si cambia una riga su
 * Vercel senza toccare il repo.
 */

import { ModelloGemini, leggiJson, tono, type Modello } from './modello';
import type { GironeCoppa, RigaClassifica, Spunto, TipsterGiornata } from './spunti';

export interface SfidaDaRaccontare {
  fixtureId: string;
  casa: string;
  ospite: string;
  golCasa: number;
  golOspite: number;
  fpCasa: number;
  fpOspite: number;
  moduloCasa: string | null;
  moduloOspite: string | null;
  competizione: 'campionato' | 'coppa';
}

export interface SchedaSquadra {
  nome: string;
  allenatore: string | null;
  soprannomi: string[];
  tormentoni: string | null;
  puntiDeboli: string | null;
  intoccabile: string | null;
}

export interface RichiestaPezzo {
  giornata: number;
  serieA: number;
  tono: number;
  minParole: number;
  paroleVietate: string[];
  squadre: SchedaSquadra[];
  sfide: SfidaDaRaccontare[];
  spunti: Spunto[];
  /** la classifica dopo la giornata */
  classifica: RigaClassifica[];
  /** com'era prima: serve al modello per dire chi è salito e chi è sceso */
  classificaPrima?: RigaClassifica[];
  /** vera quando è quella letta dalla lega e non quella calcolata da noi */
  classificaUfficiale?: boolean;
  /** i gironi di coppa, quando la giornata ne ha */
  gironiCoppa?: GironeCoppa[];
  tipster: TipsterGiornata[];
  /** cosa non andava nel tentativo precedente: si rigenera dicendoglielo */
  correzioni?: string[];
}

export interface Pezzo {
  apertura: string;
  sfide: { fixtureId: string; testo: string }[];
  classifica: string;
  tipster: string;
}

export interface Scrittore {
  nome: 'gemini' | 'template';
  modello: string | null;
  scrivi(r: RichiestaPezzo): Promise<Pezzo>;
}

// =====================================================================
// Il prompt
// =====================================================================

/**
 * Il tono non è uguale per tutte le sfide.
 *
 * Se una partita non ha spunti grossi, chiedere cattiveria produce cattiveria
 * inventata: il modello se la prende con la squadra a caso perché non ha
 * fatti su cui appoggiarsi. Dove non è successo niente si scende di un
 * gradino, e il pezzo resta onesto.
 */
export function tonoDellaSfida(tonoBase: number, spuntiDellaSfida: Spunto[]): number {
  const grosso = spuntiDellaSfida.some((s) => s.peso >= 60);
  return grosso ? tonoBase : Math.max(1, tonoBase - 1);
}

export function costruisciPrompt(r: RichiestaPezzo): string {
  const perSfida = (id: string) => r.spunti.filter((s) => s.fixtureId === id);
  const diGiornata = r.spunti.filter((s) => s.fixtureId === null);

  const schede = r.squadre.map((s) => {
    const pezzi = [`- ${s.nome}${s.allenatore ? ` (allenatore: ${s.allenatore})` : ''}`];
    if (s.soprannomi.length) pezzi.push(`  soprannomi: ${s.soprannomi.join(', ')}`);
    if (s.tormentoni) pezzi.push(`  tormentoni: ${s.tormentoni}`);
    if (s.puntiDeboli) pezzi.push(`  da rinfacciare: ${s.puntiDeboli}`);
    if (s.intoccabile) pezzi.push(`  NON scherzare su: ${s.intoccabile}`);
    return pezzi.join('\n');
  }).join('\n');

  const sfide = r.sfide.map((s) => {
    const spunti = perSfida(s.fixtureId);
    const tono = tonoDellaSfida(r.tono, spunti);
    const righe = [
      `### ${s.casa} ${s.golCasa}-${s.golOspite} ${s.ospite}  (${s.competizione})`,
      `fixtureId: ${s.fixtureId}`,
      `fantapunti: ${s.casa} ${s.fpCasa} · ${s.ospite} ${s.fpOspite}`,
      `moduli: ${s.moduloCasa ?? '—'} contro ${s.moduloOspite ?? '—'}`,
      `tono per questa sfida: ${tono}/5`,
      spunti.length ? 'spunti:' : 'spunti: nessuno di rilievo — racconta i fatti senza forzare la battuta',
      ...spunti.map((x) => `- [peso ${x.peso}] ${x.codice}: ${x.frase} · dati: ${JSON.stringify(x.dati)}`),
    ];
    return righe.join('\n');
  }).join('\n\n');

  /*
   * La classifica col movimento già calcolato.
   *
   * Se gli si dà solo la fotografia di adesso, il modello per dire «è salito»
   * deve ricordarsi la giornata scorsa — e non ce l'ha. Allora se la inventa.
   * Qui la freccia è già un fatto, e i numeri delle posizioni sono fra quelli
   * leciti: può dirlo senza rischiare.
   */
  const posizionePrima = new Map((r.classificaPrima ?? []).map((c) => [c.teamId, c.posizione]));
  const classifica = r.classifica.map((c) => {
    const era = posizionePrima.get(c.teamId);
    if (era == null || era === c.posizione) return `${c.posizione}. ${c.nome} — ${c.punti}`;
    const verso = era > c.posizione ? 'sale' : 'scende';
    return `${c.posizione}. ${c.nome} — ${c.punti} (${verso}, era ${era}°)`;
  }).join('\n');

  const gironi = (r.gironiCoppa ?? []).map((g) => [
    g.gruppo ? `Gruppo ${g.gruppo}` : 'Coppa',
    ...g.righe.map((c) => `${c.posizione}. ${c.nome} — ${c.punti}`),
  ].join('\n')).join('\n\n');

  const tipster = r.tipster
    .map((t) => `- ${t.nome}: ${t.punti} punti, ${t.azzeccate}/${t.giocate} azzeccate`
      + (t.esatti ? `, ${t.esatti} risultati esatti` : ''))
    .join('\n');

  return `Sei il cronista della lega di fantacalcio "Fanta Mansarda". Scrivi il pezzo della giornata ${r.giornata} (Serie A ${r.serieA}) per il gruppo WhatsApp della lega.

## Tono
${r.tono}/5 — ${tono(r.tono)}.
Si sfotte la SQUADRA e il suo allenatore in quanto fantallenatore, mai la persona.
Ogni sfida ha il suo tono indicato sotto: dove non è successo niente, non forzare.

## Regole assolute
1. Ogni sfida deve avere almeno ${r.minParole} parole. Contale.
2. Non scrivere MAI un numero che non ti ho dato. Nessuna media, nessuna percentuale, nessuna statistica calcolata da te. Se un numero non è qui sotto, non esiste.
3. Non inventare episodi, gol, parate o dichiarazioni: hai solo i voti e gli spunti.
4. Italiano parlato, vivo, niente burocratese sportivo. Niente elenchi puntati dentro i pezzi.
5. Usa i soprannomi delle squadre quando ci stanno.
6. Non mettere mai a confronto due giocatori di ruolo diverso come se uno potesse prendere il posto dell'altro: al fantacalcio si sostituisce solo fra pari ruolo. Un portiere non toglie il posto a un difensore. Dove uno spunto ti dà un ruolo, resta dentro quel ruolo.
7. Dentro il racconto di ogni sfida cita la classifica almeno una volta: che posto occupano adesso, chi ha scavalcato chi, cosa valeva quella partita. Usa SOLO le posizioni scritte qui sotto — nella classifica e negli spunti — e per le sfide di coppa usa il girone, non la classifica di campionato. Se per una sfida non trovi nessuna posizione qui sotto, non parlare di classifica in quel pezzo.
${r.paroleVietate.length ? `8. Parole vietate, non usarle mai: ${r.paroleVietate.join(', ')}.\n` : ''}
## Le squadre
${schede}

## Le sfide
${sfide}

## Classifica dopo la giornata${r.classificaUfficiale ? ' (quella ufficiale della lega)' : ''}
${classifica}
${gironi ? `\n## Coppa Mansarda — la fase a gruppi dopo la giornata\n${gironi}\n` : ''}
## Torneo dei Tipster
${tipster || 'nessuna schedina giocata'}

## Spunti di giornata (non legati a una sfida sola)
${diGiornata.length ? diGiornata.map((x) => `- [peso ${x.peso}] ${x.codice}: ${x.frase} · dati: ${JSON.stringify(x.dati)}`).join('\n') : 'nessuno'}

## Cosa devi restituire
Solo JSON, senza testo intorno e senza blocchi di codice, in questa forma:

{
  "apertura": "3-4 righe che danno il titolo alla giornata",
  "sfide": [{ "fixtureId": "<esattamente quello indicato sopra>", "testo": "almeno ${r.minParole} parole" }],
  "classifica": "il riepilogo della classifica: chi comanda e con quanti punti, chi insegue, chi si è mosso in questa giornata e chi sta in fondo${r.gironiCoppa?.length ? ", e poi due righe sui gironi di coppa" : ''}. Nomi e numeri solo quelli dati sopra",
  "tipster": "un paragrafo sul Torneo dei Tipster"
}

L'array "sfide" deve contenere tutte e ${r.sfide.length} le sfide, con i fixtureId esatti.${
  r.correzioni?.length
    ? `\n\n## Il tentativo precedente è stato respinto\n${r.correzioni.map((c) => `- ${c}`).join('\n')}\nRiscrivi tutto correggendo questi punti.`
    : ''
}`;
}

// =====================================================================
// Gemini
// =====================================================================

export class ScrittoreGemini implements Scrittore {
  readonly nome = 'gemini' as const;
  private readonly tramite: Modello;

  constructor(readonly modello: string, chiave: string) {
    this.tramite = new ModelloGemini(modello, chiave);
  }

  async scrivi(r: RichiestaPezzo): Promise<Pezzo> {
    return daJson(await this.tramite.chiedi(costruisciPrompt(r)));
  }
}

/**
 * Il modello dovrebbe restituire JSON puro, ma ogni tanto lo incarta in un
 * blocco di codice o ci mette una riga davanti. Si ripesca la graffa.
 */
export function leggiPezzo(testo: string): Pezzo {
  return daJson(leggiJson(testo));
}

/** Dal JSON già ripescato al pezzo, con i campi messi in forma. */
function daJson(grezzo: unknown): Pezzo {
  const p = (grezzo ?? {}) as Partial<Pezzo>;
  if (!Array.isArray(p.sfide)) throw new Error('la risposta non contiene l\'elenco delle sfide');

  return {
    apertura: String(p.apertura ?? '').trim(),
    sfide: p.sfide.map((s) => ({
      fixtureId: String((s as { fixtureId?: unknown }).fixtureId ?? ''),
      testo: String((s as { testo?: unknown }).testo ?? '').trim(),
    })),
    classifica: String(p.classifica ?? '').trim(),
    tipster: String(p.tipster ?? '').trim(),
  };
}

// =====================================================================
// I template
// =====================================================================

/**
 * La rete di sicurezza. Monta le frasi già scritte dentro gli spunti,
 * ordinate per peso. Non è brillante e non ci prova: deve essere corretto e
 * arrivare sempre.
 */
export class ScrittoreTemplate implements Scrittore {
  readonly nome = 'template' as const;
  readonly modello = null;

  async scrivi(r: RichiestaPezzo): Promise<Pezzo> {
    const perSfida = (id: string) => r.spunti.filter((s) => s.fixtureId === id);

    return {
      apertura: `Giornata ${r.giornata}: ${r.sfide.length} sfide, `
        + `${r.sfide.map((s) => `${s.casa} ${s.golCasa}-${s.golOspite} ${s.ospite}`).join(', ')}.`,

      sfide: r.sfide.map((s) => {
        const spunti = perSfida(s.fixtureId);
        const vince = s.golCasa > s.golOspite ? s.casa : s.golOspite > s.golCasa ? s.ospite : null;
        const testa = vince
          ? `${vince} vince ${s.golCasa}-${s.golOspite}: ${s.fpCasa} fantapunti contro ${s.fpOspite}.`
          : `Finisce ${s.golCasa}-${s.golOspite}, con ${s.fpCasa} fantapunti contro ${s.fpOspite}.`;
        return {
          fixtureId: s.fixtureId,
          testo: [testa, ...spunti.map((x) => x.frase)].join(' '),
        };
      }),

      // il ripiego non deve essere brillante, deve essere completo: la
      // classifica per intero, che è l'informazione che tutti cercano
      classifica: r.classifica.length
        ? [
          `In testa ${r.classifica[0].nome} con ${r.classifica[0].punti} punti; `
            + `chiude ${r.classifica[r.classifica.length - 1].nome} a ${r.classifica[r.classifica.length - 1].punti}.`,
          r.classifica.map((c) => `${c.posizione}. ${c.nome} ${c.punti}`).join(' · '),
          ...(r.gironiCoppa ?? []).map((g) =>
            (g.gruppo ? `Coppa, gruppo ${g.gruppo}: ` : 'Coppa: ')
            + g.righe.map((c) => `${c.posizione}. ${c.nome} ${c.punti}`).join(' · ')),
        ].join('\n')
        : '',

      tipster: r.tipster.length
        ? r.tipster
          .slice()
          .sort((a, b) => b.punti - a.punti)
          .map((t) => `${t.nome} ${t.punti}`)
          .join(' · ')
        : '',
    };
  }
}

// =====================================================================
// Chi scrive, oggi
// =====================================================================

export function scegliScrittore(): Scrittore {
  const chiave = process.env.GEMINI_API_KEY;
  const modello = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  return chiave ? new ScrittoreGemini(modello, chiave) : new ScrittoreTemplate();
}

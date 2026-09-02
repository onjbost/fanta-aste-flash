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

import type { RigaClassifica, Spunto, TipsterGiornata } from './spunti';

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
  classifica: RigaClassifica[];
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

const TONI: Record<number, string> = {
  1: 'affettuoso, nessuna presa in giro',
  2: 'ironico ma bonario: battute leggere, nessuno si sente attaccato',
  3: 'sfottò da gruppo WhatsApp: chi perde viene punzecchiato, chi vince ridimensionato',
  4: 'cronaca sportiva velenosa: sarcasmo marcato, il perdente viene smontato pezzo per pezzo',
  5: 'nessuna pietà: insulto sportivo pieno',
};

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

  const classifica = r.classifica
    .map((c) => `${c.posizione}. ${c.nome} — ${c.punti}`).join('\n');

  const tipster = r.tipster
    .map((t) => `- ${t.nome}: ${t.punti} punti, ${t.azzeccate}/${t.giocate} azzeccate`
      + (t.esatti ? `, ${t.esatti} risultati esatti` : ''))
    .join('\n');

  return `Sei il cronista della lega di fantacalcio "Fanta Mansarda". Scrivi il pezzo della giornata ${r.giornata} (Serie A ${r.serieA}) per il gruppo WhatsApp della lega.

## Tono
${r.tono}/5 — ${TONI[r.tono] ?? TONI[3]}.
Si sfotte la SQUADRA e il suo allenatore in quanto fantallenatore, mai la persona.
Ogni sfida ha il suo tono indicato sotto: dove non è successo niente, non forzare.

## Regole assolute
1. Ogni sfida deve avere almeno ${r.minParole} parole. Contale.
2. Non scrivere MAI un numero che non ti ho dato. Nessuna media, nessuna percentuale, nessuna statistica calcolata da te. Se un numero non è qui sotto, non esiste.
3. Non inventare episodi, gol, parate o dichiarazioni: hai solo i voti e gli spunti.
4. Italiano parlato, vivo, niente burocratese sportivo. Niente elenchi puntati dentro i pezzi.
5. Usa i soprannomi delle squadre quando ci stanno.
6. Non mettere mai a confronto due giocatori di ruolo diverso come se uno potesse prendere il posto dell'altro: al fantacalcio si sostituisce solo fra pari ruolo. Un portiere non toglie il posto a un difensore. Dove uno spunto ti dà un ruolo, resta dentro quel ruolo.
${r.paroleVietate.length ? `7. Parole vietate, non usarle mai: ${r.paroleVietate.join(', ')}.\n` : ''}
## Le squadre
${schede}

## Le sfide
${sfide}

## Classifica dopo la giornata
${classifica}

## Torneo dei Tipster
${tipster || 'nessuna schedina giocata'}

## Spunti di giornata (non legati a una sfida sola)
${diGiornata.length ? diGiornata.map((x) => `- [peso ${x.peso}] ${x.codice}: ${x.frase} · dati: ${JSON.stringify(x.dati)}`).join('\n') : 'nessuno'}

## Cosa devi restituire
Solo JSON, senza testo intorno e senza blocchi di codice, in questa forma:

{
  "apertura": "3-4 righe che danno il titolo alla giornata",
  "sfide": [{ "fixtureId": "<esattamente quello indicato sopra>", "testo": "almeno ${r.minParole} parole" }],
  "classifica": "un paragrafo su com'è messa la classifica",
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

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class ScrittoreGemini implements Scrittore {
  readonly nome = 'gemini' as const;
  constructor(readonly modello: string, private readonly chiave: string) {}

  async scrivi(r: RichiestaPezzo): Promise<Pezzo> {
    const res = await fetch(`${ENDPOINT}/${this.modello}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.chiave },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: costruisciPrompt(r) }] }],
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
      // domenica sera nessuno aspetta due minuti: oltre, si va di template
      signal: AbortSignal.timeout(90_000),
    });

    if (!res.ok) {
      const corpo = await res.text().catch(() => '');
      throw new Error(`Gemini ha risposto ${res.status}: ${corpo.slice(0, 200)}`);
    }

    const dati = await res.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const testo = dati.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!testo.trim()) throw new Error('Gemini ha risposto senza testo');
    return leggiPezzo(testo);
  }
}

/**
 * Il modello dovrebbe restituire JSON puro, ma ogni tanto lo incarta in un
 * blocco di codice o ci mette una riga davanti. Si ripesca la graffa.
 */
export function leggiPezzo(testo: string): Pezzo {
  let grezzo = testo.trim();
  const blocco = grezzo.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (blocco) grezzo = blocco[1].trim();
  const apre = grezzo.indexOf('{');
  const chiude = grezzo.lastIndexOf('}');
  if (apre < 0 || chiude <= apre) throw new Error('nella risposta non c\'è JSON');

  const p = JSON.parse(grezzo.slice(apre, chiude + 1)) as Partial<Pezzo>;
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

      classifica: r.classifica.length
        ? `In testa ${r.classifica[0].nome} con ${r.classifica[0].punti} punti; `
          + `chiude ${r.classifica[r.classifica.length - 1].nome} a ${r.classifica[r.classifica.length - 1].punti}.`
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

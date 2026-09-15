/**
 * La Redazione — il trasporto verso il modello.
 *
 * Qui non c'è niente che sappia di fantacalcio: entra un prompt, esce il
 * JSON che il modello ha risposto. Sopra ci stanno i due generatori — il
 * pezzo di fine giornata e l'anteprima di quella che comincia — e nessuno
 * dei due deve ripetere la gestione del timeout, degli errori HTTP e delle
 * graffe da ripescare.
 *
 * Il fornitore e il nome del modello stanno in due variabili d'ambiente: il
 * giorno che Google deprecherà `gemini-flash-latest` si cambia una riga su
 * Vercel senza toccare il repo.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** I toni di lega, condivisi dai due generatori: la voce è la stessa. */
export const TONI: Record<number, string> = {
  1: 'affettuoso, nessuna presa in giro',
  2: 'ironico ma bonario: battute leggere, nessuno si sente attaccato',
  3: 'sfottò da gruppo WhatsApp: chi perde viene punzecchiato, chi vince ridimensionato',
  4: 'cronaca sportiva velenosa: sarcasmo marcato, il perdente viene smontato pezzo per pezzo',
  5: 'nessuna pietà: insulto sportivo pieno',
};

export function tono(n: number): string {
  return TONI[n] ?? TONI[3];
}

/**
 * Il modello dovrebbe restituire JSON puro, ma ogni tanto lo incarta in un
 * blocco di codice o ci mette una riga davanti. Si ripesca la graffa.
 */
export function leggiJson(testo: string): unknown {
  let grezzo = testo.trim();
  const blocco = grezzo.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (blocco) grezzo = blocco[1].trim();
  const apre = grezzo.indexOf('{');
  const chiude = grezzo.lastIndexOf('}');
  if (apre < 0 || chiude <= apre) throw new Error('nella risposta non c\'è JSON');
  return JSON.parse(grezzo.slice(apre, chiude + 1));
}

export interface Modello {
  nome: 'gemini';
  modello: string;
  chiedi(prompt: string): Promise<unknown>;
}

export class ModelloGemini implements Modello {
  readonly nome = 'gemini' as const;
  constructor(readonly modello: string, private readonly chiave: string) {}

  async chiedi(prompt: string): Promise<unknown> {
    const res = await fetch(`${ENDPOINT}/${this.modello}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.chiave },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
    return leggiJson(testo);
  }
}

/** Il modello configurato adesso, o null se la chiave non c'è: si va di template. */
export function scegliModello(): Modello | null {
  const chiave = process.env.GEMINI_API_KEY;
  if (!chiave) return null;
  return new ModelloGemini(process.env.GEMINI_MODEL || 'gemini-flash-latest', chiave);
}

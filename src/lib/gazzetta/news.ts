/**
 * La Gazzetta — le foto dal campo, prese dalle news di fantacalcio.it.
 *
 * Le «card» dei giocatori (`/web/campioncini/…`) sono ritagli su fondo
 * trasparente: vanno bene per una lista, non per una prima pagina. Le foto
 * degli articoli invece sono scatti veri dal campo, ed è quello che serve.
 *
 * Non esiste un endpoint di ricerca documentato, né un feed: cercare
 * l'articolo giusto al momento in cui serve vorrebbe dire appoggiarsi a un
 * indirizzo non documentato che possono cambiare quando vogliono — e si
 * romperebbe proprio mentre l'admin sta pubblicando. Quindi l'indice si
 * costruisce una volta a settimana, insieme agli indisponibili, e al momento
 * di comporre la pagina si pesca da quello: nessuna attesa di rete
 * nell'editor, e un guasto si scopre il mercoledì da un messaggio Telegram
 * invece che il sabato sera.
 *
 * Funzioni pure: la rete sta in `newsServer.ts`.
 */

export interface ArticoloNews {
  url: string;
  titolo: string;
  /** l'immagine grande dell'articolo (og:image) */
  immagine: string;
  /** ISO, dalla data nell'indirizzo dell'articolo */
  data: string;
}

/**
 * Gli indirizzi degli articoli dentro la pagina indice.
 *
 * Si cerca la **forma dell'indirizzo**, non la struttura HTML intorno:
 * `/news/<categoria>/<gg_mm_aaaa>/<titolo-a-trattini>-<numero>`. È l'unica
 * cosa di quella pagina che non cambia quando la reimpaginano.
 */
export function articoliDaIndice(html: string, base = 'https://www.fantacalcio.it'): string[] {
  const re = /\/news\/[a-z0-9-]+\/\d{2}_\d{2}_\d{4}\/[a-z0-9-]+-\d+/gi;
  const trovati = html.match(re) ?? [];
  return [...new Set(trovati)].map((p) => `${base}${p}`);
}

/** La data dell'articolo, che sta nel suo stesso indirizzo. */
export function dataDaUrl(url: string): string | null {
  const m = url.match(/\/(\d{2})_(\d{2})_(\d{4})\//);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** L'immagine grande e il titolo, dalle meta dell'articolo. */
export function datiDaArticolo(html: string): { immagine: string | null; titolo: string | null } {
  const meta = (prop: string) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i');
    const alt = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
    return html.match(re)?.[1] ?? html.match(alt)?.[1] ?? null;
  };
  return { immagine: meta('og:image'), titolo: meta('og:title') };
}

/** Normalizza per il confronto: niente accenti, niente maiuscole, niente punteggiatura. */
function chiave(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Una parola intera dentro un testo — non un pezzo di un'altra parola. */
function contiene(testo: string, parola: string): boolean {
  if (parola.length < 3) return false;
  return new RegExp(`(^| )${parola}( |$)`).test(testo);
}

export type EsitoFoto =
  | { trovata: true; immagine: string; perche: 'giocatore' | 'squadra'; articolo: ArticoloNews }
  | { trovata: false };

/**
 * La foto per un giocatore: prima una sua, poi una della sua squadra.
 *
 * L'ordine è quello chiesto dall'admin, e la ragione è giornalistica prima
 * che tecnica: la prima pagina parla di lui, e se una sua foto non c'è, una
 * della squadra per cui gioca resta pertinente. Una foto a caso no.
 *
 * Il ripiego sulla squadra ha un limite che va detto: l'articolo più recente
 * del club può essere su un altro giocatore, e allora la foto ritrae lui. Per
 * questo l'esito porta con sé l'articolo da cui viene — l'editor mostra il
 * titolo accanto all'immagine, così l'admin vede subito se la faccia è quella
 * sbagliata e la cambia. Indovinare meglio richiederebbe di riconoscere chi
 * c'è nella foto, che è un problema di un altro ordine.
 *
 * Il cognome si cerca nel **titolo** dell'articolo e nel **nome del file**
 * dell'immagine: fantacalcio.it chiama le immagini col cognome
 * (`muric-<uuid>.jpg`), quindi quando il titolo non lo nomina il file spesso
 * sì. A parità, vince l'articolo più recente.
 */
export function scegliFoto(
  articoli: ArticoloNews[], chi: { cognome: string; club: string },
): EsitoFoto {
  const cognome = chiave(chi.cognome);
  const club = chiave(chi.club);
  const recenti = [...articoli].sort((a, b) => b.data.localeCompare(a.data));

  const suoi = recenti.filter((a) =>
    contiene(chiave(a.titolo), cognome)
    || contiene(chiave(decodeURIComponent(a.immagine).split('/').pop() ?? ''), cognome));
  if (suoi.length) {
    return { trovata: true, immagine: suoi[0].immagine, perche: 'giocatore', articolo: suoi[0] };
  }

  const dellaSquadra = recenti.filter((a) => contiene(chiave(a.titolo), club));
  if (dellaSquadra.length) {
    return {
      trovata: true, immagine: dellaSquadra[0].immagine,
      perche: 'squadra', articolo: dellaSquadra[0],
    };
  }

  return { trovata: false };
}

/**
 * Solo il cognome, da come il listone scrive i nomi.
 *
 * Il listone usa «Sulemana K.» e «Idrissi R.»: il cognome è la prima parola,
 * e l'iniziale puntata è il nome. Va tolta, perché negli articoli non c'è.
 */
export function cognomeDaListone(nome: string): string {
  return nome.replace(/\b[A-Z]{1,2}\.\s*$/i, '').trim().split(/\s+/)[0] ?? nome;
}

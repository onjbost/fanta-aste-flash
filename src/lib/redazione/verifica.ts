/**
 * La Redazione — il controllo prima dell'invio.
 *
 * Il pezzo lo scrive un modello, e un modello ogni tanto sbaglia un numero
 * con la faccia di chi non sbaglia mai. In un gruppo di fantacalcio quello è
 * l'unico errore che qualcuno noterà davvero: «ma io non ho fatto 68».
 *
 * Quindi prima di mandare si controlla che ogni numero scritto esista fra
 * quelli che gli abbiamo dato, che ci siano tutte le sfide, che nessuna sia
 * più corta del dovuto, e che non compaia una parola vietata.
 */

import type { Pezzo, RichiestaPezzo } from './scrittore';

export interface EsitoVerifica {
  ok: boolean;
  problemi: string[];
  /** i numeri che il pezzo cita e che nessuno gli aveva dato */
  inventati: number[];
  parole: Record<string, number>;
}

/**
 * Quali numeri si controllano.
 *
 * Solo i decimali e gli interi da 12 in su. Gli interi piccoli nel parlato
 * italiano sono quasi sempre legittimi — «i tre punti», «il primo posto»,
 * «giocare in dieci», «un 6 in pagella» — e trattarli come sospetti
 * produrrebbe falsi allarmi a ogni pezzo. I numeri che fanno male sono i
 * fantapunti, i fantavoti e i prezzi d'asta: decimali, oppure grandi.
 */
export function numeriDelTesto(testo: string): number[] {
  // via i moduli (4-3-3) e le date, che non sono statistiche
  const pulito = testo
    .replace(/\b[1-9]-[0-9]-[0-9]\b/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ');

  // il numero dev'essere una parola a sé: le cifre attaccate a una lettera
  // fanno parte di un nome (Under21, Milinkovic-Savic V.), non sono statistiche
  const trovati = pulito.match(/(?<![\p{L}\d.,])\d+(?:[.,]\d+)?(?![\p{L}\d])/gu) ?? [];
  return trovati
    .map((t) => Number(t.replace(',', '.')))
    .filter((n) => Number.isFinite(n))
    .filter((n) => !Number.isInteger(n) || n >= 12);
}

/** Il risultato "2-1" cita due numeri leciti: vanno riconosciuti come tali. */
function numeriDeiRisultati(r: RichiestaPezzo): number[] {
  return r.sfide.flatMap((s) => [s.golCasa, s.golOspite, s.fpCasa, s.fpOspite]);
}

export function contaParole(testo: string): number {
  return testo.trim().split(/\s+/).filter(Boolean).length;
}

export function verificaPezzo(
  pezzo: Pezzo, r: RichiestaPezzo, leciti: Set<number>,
): EsitoVerifica {
  const problemi: string[] = [];
  const parole: Record<string, number> = {};

  const ammessi = new Set<number>(leciti);
  for (const n of numeriDeiRisultati(r)) ammessi.add(n);
  ammessi.add(r.giornata);
  ammessi.add(r.serieA);

  // ---- tutte le sfide, con l'identificativo giusto
  const attesi = new Set(r.sfide.map((s) => s.fixtureId));
  const arrivati = new Set(pezzo.sfide.map((s) => s.fixtureId));
  for (const id of attesi) {
    if (!arrivati.has(id)) {
      const s = r.sfide.find((x) => x.fixtureId === id)!;
      problemi.push(`manca il pezzo su ${s.casa} – ${s.ospite}`);
    }
  }
  for (const id of arrivati) {
    if (!attesi.has(id)) problemi.push(`c'è un pezzo su una sfida che non esiste (${id})`);
  }

  // ---- lunghezza
  for (const s of pezzo.sfide) {
    const nome = r.sfide.find((x) => x.fixtureId === s.fixtureId);
    const n = contaParole(s.testo);
    parole[s.fixtureId] = n;
    if (n < r.minParole) {
      problemi.push(
        `${nome ? `${nome.casa} – ${nome.ospite}` : s.fixtureId}: ${n} parole invece di ${r.minParole}`,
      );
    }
  }

  // ---- numeri inventati
  const tutto = [pezzo.apertura, ...pezzo.sfide.map((s) => s.testo), pezzo.classifica, pezzo.tipster]
    .join('\n');
  const inventati = [...new Set(numeriDelTesto(tutto))].filter((n) => !ammessi.has(n));
  if (inventati.length) {
    problemi.push(`numeri che non ti ho dato: ${inventati.join(', ')}`);
  }

  // ---- parole vietate
  const minuscolo = tutto.toLowerCase();
  const vietate = r.paroleVietate.filter((p) => p && minuscolo.includes(p.toLowerCase()));
  if (vietate.length) problemi.push(`parole vietate usate: ${vietate.join(', ')}`);

  // ---- il minimo sindacale
  if (!pezzo.apertura.trim()) problemi.push('manca l\'apertura');

  return { ok: problemi.length === 0, problemi, inventati, parole };
}

/** Il messaggio finito, montato nell'ordine in cui si legge. */
export function montaMessaggio(pezzo: Pezzo, r: RichiestaPezzo): string {
  const righe: string[] = [
    `🏆 FANTA MANSARDA · GIORNATA ${r.giornata}`,
    '─'.repeat(28),
    '',
    pezzo.apertura,
  ];

  for (const s of r.sfide) {
    const testo = pezzo.sfide.find((x) => x.fixtureId === s.fixtureId)?.testo;
    if (!testo) continue;
    righe.push(
      '',
      `⚽ ${s.casa} ${s.golCasa}-${s.golOspite} ${s.ospite}`
      + (s.competizione === 'coppa' ? '  (Coppa Mansarda)' : ''),
      `   ${s.fpCasa} · ${s.fpOspite} fantapunti`,
      '',
      testo,
    );
  }

  if (pezzo.classifica) righe.push('', '📊 LA CLASSIFICA', '', pezzo.classifica);
  if (pezzo.tipster) righe.push('', '🎯 TORNEO DEI TIPSTER', '', pezzo.tipster);

  return righe.join('\n');
}

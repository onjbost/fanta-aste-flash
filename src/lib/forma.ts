/**
 * La forma di un giocatore — dai voti delle ultime giornate.
 *
 * Funzioni pure. L'idea è quella detta a parole: chi è in forma prende voti
 * migliori, e chi prende voti migliori di solito è anche quello che segna e
 * porta bonus. La quotazione dice quanto vale un giocatore sulla stagione;
 * le ultime giornate dicono come sta adesso.
 *
 * I voti arrivano da due fonti, che qui sono già fuse da chi chiama:
 *  - le pagelle di Serie A di fantacalcio.it, per tutti i giocatori;
 *  - i tabellini della nostra lega, solo per chi è stato schierato, ma con il
 *    fantavoto calcolato con le **nostre** regole di bonus: quando ci sono
 *    tutti e due, vince questo.
 */

export interface VotoGiornata {
  /** giornata di Serie A */
  giornata: number;
  /** null = senza voto: in campo troppo poco, o non entrato */
  voto: number | null;
  fantavoto: number | null;
}

/** Quante giornate guardare all'indietro. */
export const FINESTRA_FORMA = 5;
/** Quanto pesa una giornata in meno per ogni giornata di distanza. */
export const DECADIMENTO_FORMA = 0.8;

export interface Forma {
  /** fantamedia pesata delle giornate con voto, null se non ne ha */
  fantamedia: number | null;
  /** la somma dei pesi delle giornate con voto: quanto «vale» la forma */
  peso: number;
  /** giornate con voto dentro la finestra */
  presenze: number;
  /** giornate della finestra di cui abbiamo i voti */
  giornate: number;
  /**
   * La quota di giornate in cui ha preso voto: un'approssimazione della
   * titolarità. Null quando le giornate coperte sono troppo poche per dirlo.
   */
  titolarita: number | null;
  /** i fantavoti della finestra, dal più vecchio al più recente (null = s.v.) */
  ultimi: (number | null)[];
}

/**
 * La forma alla vigilia di `prossima`: entrano solo le giornate precedenti.
 *
 * `coperte` sono le giornate di cui abbiamo i voti di **tutta** la Serie A:
 * servono a distinguere chi non ha preso voto da chi semplicemente non
 * sappiamo. Un giocatore senza voto in una giornata coperta era in
 * panchina; in una giornata non coperta, non si sa.
 */
export function formaGiocatore(
  voti: VotoGiornata[],
  prossima: number,
  coperte: number[],
  finestra = FINESTRA_FORMA,
  decadimento = DECADIMENTO_FORMA,
): Forma {
  const da = prossima - finestra;
  const perGiornata = new Map(voti.map((v) => [v.giornata, v]));
  const dentro = (g: number) => g >= da && g < prossima;

  // le giornate da considerare: quelle coperte più quelle in cui risulta un
  // voto anche senza copertura (i tabellini della lega)
  const giornate = [...new Set([
    ...coperte.filter(dentro),
    ...voti.map((v) => v.giornata).filter(dentro),
  ])].sort((a, b) => a - b);

  let peso = 0;
  let somma = 0;
  let presenze = 0;
  const ultimi: (number | null)[] = [];
  for (const g of giornate) {
    const v = perGiornata.get(g);
    const fv = v?.fantavoto ?? null;
    ultimi.push(fv);
    if (fv == null) continue;
    presenze++;
    const w = Math.pow(decadimento, prossima - 1 - g);
    peso += w;
    somma += w * fv;
  }

  const copertiDentro = coperte.filter(dentro).length;
  return {
    fantamedia: peso ? Math.round((somma / peso) * 100) / 100 : null,
    peso: Math.round(peso * 1000) / 1000,
    presenze,
    giornate: giornate.length,
    titolarita: copertiDentro >= 3
      ? Math.round((presenze / Math.max(copertiDentro, presenze)) * 100) / 100
      : null,
    ultimi,
  };
}

/**
 * Quante giornate «vale» la stima da quotazione quando la si fonde con la
 * forma. Con tre, cinque buone giornate di fila spostano la stima di più di
 * metà della distanza; una giornata sola ne sposta un quarto. Un 18 isolato
 * con una tripletta non deve far credere a un nuovo fenomeno.
 */
export const PESO_PRIOR_FORMA = 3;

/** Il fantavoto atteso: la stima da quotazione corretta dalla forma. */
export function fantavotoConForma(
  prior: number, forma: Pick<Forma, 'fantamedia' | 'peso'> | null | undefined,
  pesoPrior = PESO_PRIOR_FORMA,
): number {
  if (!forma || forma.fantamedia == null || forma.peso <= 0) return prior;
  return (forma.peso * forma.fantamedia + pesoPrior * prior) / (forma.peso + pesoPrior);
}

/**
 * Fonde i voti delle due fonti: per ogni giornata, il fantavoto della lega
 * se c'è, altrimenti quello delle pagelle.
 */
export function fondiVoti(serieA: VotoGiornata[], lega: VotoGiornata[]): VotoGiornata[] {
  const per = new Map(serieA.map((v) => [v.giornata, v]));
  for (const v of lega) {
    const c = per.get(v.giornata);
    if (v.fantavoto != null || !c) per.set(v.giornata, v);
  }
  return [...per.values()].sort((a, b) => a.giornata - b.giornata);
}

/** «in forma», «fuori forma» o niente: la stessa misura per tutte le viste. */
export function giudizioForma(
  forma: Pick<Forma, 'fantamedia' | 'presenze'>, prior: number,
): 'su' | 'giu' | null {
  if (forma.fantamedia == null || forma.presenze < 2) return null;
  const scarto = forma.fantamedia - prior;
  if (scarto >= 0.75) return 'su';
  if (scarto <= -0.75) return 'giu';
  return null;
}

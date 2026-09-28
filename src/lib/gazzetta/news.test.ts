import { describe, expect, it } from 'vitest';
import {
  articoliDaIndice, cognomeDaListone, dataDaUrl, datiDaArticolo, scegliFoto,
  type ArticoloNews,
} from './news';

// Indirizzi e forma delle meta copiati dalla pagina vera di fantacalcio.it.
const INDICE = `
<div class="news-list">
  <a class="card" href="/news/calcio-italia/27_09_2026/ufficiale-parma-addio-a-cuesta-498466">…</a>
  <a href="/news/calcio-italia/27_09_2026/sassuolo-infortunio-per-muric-in-nazionale-498476"><img data-src="…"></a>
  <a href="/news/serie-a/26_09_2026/juventus-yildiz-torna-in-gruppo-498401">…</a>
  <a href="/news/calcio-italia/27_09_2026/sassuolo-infortunio-per-muric-in-nazionale-498476">doppione</a>
  <a href="/quotazioni-fantacalcio">non è una news</a>
  <a href="/serie-a/squadre/juventus/yildiz/6434">nemmeno questa</a>
</div>`;

const ARTICOLO = `<html><head>
<meta property="og:title" content="Sassuolo, infortunio per Muric in Nazionale">
<meta content="https://content.fantacalcio.it/web/img/large/muric-57c49ec8.jpg" property="og:image">
</head></html>`;

const art = (titolo: string, immagine: string, data: string): ArticoloNews =>
  ({ url: 'x', titolo, immagine, data });

describe('articoliDaIndice', () => {
  it('prende solo le news, non le altre pagine', () => {
    const a = articoliDaIndice(INDICE);
    expect(a).toHaveLength(3);
    expect(a.every((u) => u.includes('/news/'))).toBe(true);
  });
  it('non ripete lo stesso articolo linkato due volte', () => {
    expect(articoliDaIndice(INDICE).filter((u) => u.includes('muric'))).toHaveLength(1);
  });
  it('restituisce indirizzi assoluti, pronti da chiamare', () => {
    expect(articoliDaIndice(INDICE)[0]).toMatch(/^https:\/\/www\.fantacalcio\.it\/news\//);
  });
});

describe('datiDaArticolo', () => {
  it('legge immagine e titolo anche con gli attributi in ordine invertito', () => {
    // l'og:image di quella pagina ha content PRIMA di property
    const d = datiDaArticolo(ARTICOLO);
    expect(d.immagine).toBe('https://content.fantacalcio.it/web/img/large/muric-57c49ec8.jpg');
    expect(d.titolo).toBe('Sassuolo, infortunio per Muric in Nazionale');
  });
  it('torna a mani vuote invece di inventare, se le meta non ci sono', () => {
    expect(datiDaArticolo('<html><head></head></html>'))
      .toEqual({ immagine: null, titolo: null });
  });
});

describe('dataDaUrl', () => {
  it('legge la data dall\'indirizzo', () => {
    expect(dataDaUrl('/news/calcio-italia/27_09_2026/x-1')).toBe('2026-09-27');
  });
  it('torna null se non c\'è', () => {
    expect(dataDaUrl('/news/x')).toBeNull();
  });
});

describe('cognomeDaListone', () => {
  it('toglie l\'iniziale puntata del nome', () => {
    expect(cognomeDaListone('Sulemana K.')).toBe('Sulemana');
    expect(cognomeDaListone('Idrissi R.')).toBe('Idrissi');
    expect(cognomeDaListone('TOURE E.')).toBe('TOURE');
  });
  it('lascia in pace un cognome semplice', () => {
    expect(cognomeDaListone('KOSSOUNOU')).toBe('KOSSOUNOU');
  });
});

describe('scegliFoto', () => {
  const articoli = [
    art('Sassuolo, infortunio per Muric in Nazionale', '…/large/muric-abc.jpg', '2026-09-27'),
    art('Juventus, Yildiz torna in gruppo', '…/large/yildiz-def.jpg', '2026-09-26'),
    art('Juventus, Tudor prepara la sfida', '…/large/tudor-ghi.jpg', '2026-09-25'),
    art('Verso Inter-Roma: le probabili', '…/large/inzaghi-jkl.jpg', '2026-09-24'),
  ];

  it('preferisce una foto del giocatore', () => {
    const e = scegliFoto(articoli, { cognome: 'Yildiz', club: 'Juventus' });
    expect(e.trovata && e.perche).toBe('giocatore');
    expect(e.trovata && e.immagine).toContain('yildiz');
  });

  it('ripiega sulla squadra quando del giocatore non c\'è niente', () => {
    const e = scegliFoto(articoli, { cognome: 'Locatelli', club: 'Juventus' });
    expect(e.trovata && e.perche).toBe('squadra');
    expect(e.trovata && e.immagine).toContain('yildiz');  // il più recente sulla Juve
  });

  it('nel ripiego può tornare la foto di un ALTRO giocatore, e lo dichiara', () => {
    // Cercando Locatelli si ottiene l'articolo su Yildiz, perché è il più
    // recente della Juventus: la foto ritrae un altro. È il limite accettato
    // del ripiego, ed è il motivo per cui l'esito porta con sé l'articolo —
    // l'editor lo mostra e l'admin cambia immagine se non gli torna.
    const e = scegliFoto(articoli, { cognome: 'Locatelli', club: 'Juventus' });
    expect(e.trovata && e.perche).toBe('squadra');
    expect(e.trovata && e.articolo.titolo).toBe('Juventus, Yildiz torna in gruppo');
  });

  it('riconosce il giocatore dal nome del file quando il titolo non lo nomina', () => {
    const soloFile = [art('Le probabili formazioni della 4ª', '…/large/mastantuono-xyz.jpg', '2026-09-27')];
    const e = scegliFoto(soloFile, { cognome: 'Mastantuono', club: 'Fiorentina' });
    expect(e.trovata && e.perche).toBe('giocatore');
  });

  it('a parità vince l\'articolo più recente', () => {
    const due = [art('Juventus, il punto', '…/a.jpg', '2026-09-20'),
                 art('Juventus, la rifinitura', '…/b.jpg', '2026-09-27')];
    const e = scegliFoto(due, { cognome: 'Nessuno', club: 'Juventus' });
    expect(e.trovata && e.immagine).toContain('b.jpg');
  });

  it('dice che non ha trovato niente invece di dare una foto a caso', () => {
    expect(scegliFoto(articoli, { cognome: 'Bove', club: 'Fiorentina' }))
      .toEqual({ trovata: false });
  });

  it('non scambia un pezzo di parola per un cognome', () => {
    // «Roma» non deve far scattare il cognome «Rom», né «Inter» il club «Int»
    const e = scegliFoto([art('Verso Inter-Roma', '…/x.jpg', '2026-09-27')],
      { cognome: 'Rom', club: 'Int' });
    expect(e.trovata).toBe(false);
  });

  it('ignora accenti e maiuscole nel confronto', () => {
    const e = scegliFoto([art('Bologna, ORSOLINI ancora decisivo', '…/orsolini.jpg', '2026-09-27')],
      { cognome: 'Orsolini', club: 'Bologna' });
    expect(e.trovata && e.perche).toBe('giocatore');
  });
});

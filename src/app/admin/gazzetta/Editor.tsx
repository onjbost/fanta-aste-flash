'use client';

import { useActionState, useMemo, useState } from 'react';
import { Prima, ALTEZZA, LARGHEZZA } from '@/lib/gazzetta/Prima';
import { italianizza } from '@/lib/gazzetta/glifi';
import {
  ZOOM_MASSIMO, ZOOM_MINIMO, allaColonna, alRiquadro, colonnaLibera, disposizioneFoto,
  riquadroDellaFoto, spazioDiManovra, spostaVoce, zoomPerSpostarsi, zoomValido,
  type DatiPrima, type FotoPrima,
} from '@/lib/gazzetta/prima';
import { limitiTitolo } from '@/lib/gazzetta/testi';
import { salvaPrima, segnaMandata, type GazState } from './actions';

/**
 * L'editor della prima pagina.
 *
 * L'anteprima non è un'immagine dell'anteprima: è **lo stesso componente**
 * che Satori renderizza per il PNG, rimpicciolito con una trasformazione.
 * Quindi quello che si vede qui è quello che esce di là, e una modifica si
 * vede battendo, non dopo un giro sul server.
 *
 * Il PNG però si scarica **dopo** aver salvato, e non dallo stato di questa
 * pagina: la cosa che finisce nel gruppo deve venire da quello che sta nel
 * database, altrimenti basta una modifica non salvata perché l'immagine e
 * l'app raccontino due cose diverse.
 */

export interface FotoScelta {
  src: string;
  larghezza: number;
  altezza: number;
  provenienza: string;
}

function Campo({ etichetta, valore, onChange, righe = 1, limite }: {
  etichetta: string; valore: string; onChange: (v: string) => void;
  righe?: number; limite?: number;
}) {
  const { sostituiti } = italianizza(valore);
  const lungo = limite != null && valore.length > limite;

  return (
    <label className="gaz-campo">
      <span className="gaz-etichetta">
        {etichetta}
        {limite != null && (
          <em className={lungo ? 'fuori' : undefined}>{valore.length}/{limite}</em>
        )}
      </span>
      {righe > 1
        ? <textarea rows={righe} value={valore} onChange={(e) => onChange(e.target.value)} />
        : <input type="text" value={valore} onChange={(e) => onChange(e.target.value)} />}
      {sostituiti.length > 0 && (
        <small className="gaz-nota">
          Nell&apos;immagine diventa: {sostituiti.join(', ')} — quei caratteri i font non li hanno.
        </small>
      )}
    </label>
  );
}

/** La larghezza massima a cui si rimpicciolisce una foto caricata a mano. */
const LARGHEZZA_MASSIMA = 1600;

/**
 * Misura un'immagine, e se serve la rimpicciolisce.
 *
 * Le misure servono sempre: la disposizione in pagina e il ritaglio si
 * calcolano da quelle, e senza, una foto verticale finirebbe stirata. Il
 * rimpicciolimento serve solo per i file caricati: una foto da telefono è
 * dieci megapixel, finirebbe in base64 dentro la riga del database e non
 * servirebbe a niente — la pagina è larga 842 punti.
 */
function misuraImmagineNelBrowser(
  sorgente: string, rimpicciolisci: boolean,
): Promise<FotoScelta | null> {
  return new Promise((risolvi) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => risolvi(null);
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) { risolvi(null); return; }
      if (!rimpicciolisci || w <= LARGHEZZA_MASSIMA) {
        risolvi({ src: sorgente, larghezza: w, altezza: h, provenienza: 'caricata a mano' });
        return;
      }
      const scala = LARGHEZZA_MASSIMA / w;
      const tela = document.createElement('canvas');
      tela.width = Math.round(w * scala);
      tela.height = Math.round(h * scala);
      const ctx = tela.getContext('2d');
      if (!ctx) { risolvi({ src: sorgente, larghezza: w, altezza: h, provenienza: 'caricata a mano' }); return; }
      ctx.drawImage(img, 0, 0, tela.width, tela.height);
      risolvi({
        src: tela.toDataURL('image/jpeg', 0.85),
        larghezza: tela.width, altezza: tela.height,
        provenienza: 'caricata a mano',
      });
    };
    img.src = sorgente;
  });
}

/**
 * Un paragrafo del riquadro: titolo, testo, e i comandi per spostarlo.
 *
 * La `key` di chi lo monta è la posizione e non il titolo: col titolo
 * modificabile, una chiave presa dal titolo cambierebbe a ogni lettera
 * battuta, React rimonterebbe il campo e il cursore uscirebbe dalla casella
 * a metà parola.
 */
function Paragrafo({
  titolo, testo, limite, righe, primo, ultimo, suGiu, sposta, spostaEtichetta,
  onTitolo, onTesto,
}: {
  titolo: string; testo: string; limite: number; righe: number;
  primo: boolean; ultimo: boolean;
  suGiu: (verso: -1 | 1) => void;
  sposta: (() => void) | null;
  spostaEtichetta: string;
  onTitolo: (v: string) => void;
  onTesto: (v: string) => void;
}) {
  return (
    <div className="gaz-paragrafo">
      <div className="gaz-paragrafo-cima">
        <input
          className="gaz-titoletto" value={titolo} aria-label="Titolo del paragrafo"
          onChange={(e) => onTitolo(e.target.value)}
        />
        <button type="button" className="ghost" disabled={primo}
          onClick={() => suGiu(-1)} aria-label="Sposta su">↑</button>
        <button type="button" className="ghost" disabled={ultimo}
          onClick={() => suGiu(1)} aria-label="Sposta giù">↓</button>
      </div>
      <Campo etichetta="" valore={testo} righe={righe} limite={limite} onChange={onTesto} />
      {sposta && (
        <button type="button" className="ghost gaz-sposta" onClick={sposta}>
          {spostaEtichetta}
        </button>
      )}
    </div>
  );
}

export function Editor({ id, iniziali, foto, problemi, modificataIl, inviataIl }: {
  id: string;
  iniziali: DatiPrima;
  /** le foto raccolte dalle news, fra cui scegliere */
  foto: FotoScelta[];
  problemi: string[];
  modificataIl: string | null;
  inviataIl: string | null;
}) {
  const [dati, setDati] = useState<DatiPrima>(iniziali);
  const [statoSalva, salva, salvando] = useActionState<GazState, FormData>(salvaPrima, null);
  const [statoManda, manda, mandando] = useActionState<GazState, FormData>(segnaMandata, null);
  const [scaricando, setScaricando] = useState(false);
  const [indirizzo, setIndirizzo] = useState('');
  const [guaioFoto, setGuaioFoto] = useState<string | null>(null);

  const tocca = (p: Partial<DatiPrima>) => setDati((d) => ({ ...d, ...p }));
  const toccaFoto = (p: Partial<FotoPrima>) => setDati((d) =>
    (d.foto ? { ...d, foto: { ...d.foto, ...p } } : d));

  const disposizione = useMemo(() => disposizioneFoto(dati.foto), [dati.foto]);
  // i limiti dipendono da dove finisce la foto: una colonna stretta tiene
  // meno caratteri, e il contatore deve dire la verità su questa pagina
  const limiti = useMemo(() => limitiTitolo(disposizione), [disposizione]);

  // il riquadro in cui la foto finisce davvero, e quanto avanza per lato:
  // una manopola che non ha scarto da percorrere non sposta niente, e
  // l'editor lo deve dire invece di far trascinare un cursore muto
  const riquadro = useMemo(() => riquadroDellaFoto(disposizione), [disposizione]);
  const spazio = useMemo(
    () => (dati.foto ? spazioDiManovra(dati.foto, riquadro) : null),
    [dati.foto, riquadro],
  );

  // l'anteprima sta in 380 punti di larghezza: su un telefono è tutta la
  // pagina, e serve vedere l'insieme, non leggere il corpo del testo
  const scala = 380 / LARGHEZZA;

  async function salvaEScarica() {
    setScaricando(true);
    try {
      const form = new FormData();
      form.set('id', id);
      form.set('dati', JSON.stringify(dati));
      const esito = await salvaPrima(null, form);
      if (!esito?.ok) { alert(esito?.message ?? 'Non sono riuscito a salvare.'); return; }
      window.location.href = `/api/gazzetta/${id}/png`;
    } finally {
      setScaricando(false);
    }
  }

  return (
    <div className="gaz-editor">
      {/*
        * I nomi sono quelli che `Prima.tsx` scrive in `fontFamily`, gli
        * stessi che si danno a Satori: un secondo nome per l'anteprima
        * sarebbe una seconda cosa da tenere allineata, e il giorno che
        * divergesse il PNG uscirebbe con un carattere diverso da quello
        * visto qui.
        */}
      <style>{`
        @font-face { font-family: 'Titolo'; src: url('/api/gazzetta/font/titolo'); font-display: block }
        @font-face { font-family: 'Testo';  src: url('/api/gazzetta/font/testo');  font-display: block }
        @font-face { font-family: 'Forte';  src: url('/api/gazzetta/font/forte');  font-display: block }
      `}</style>

      <div className="gaz-anteprima">
        <div
          className="gaz-foglio"
          style={{ width: LARGHEZZA * scala, height: ALTEZZA * scala }}
        >
          <div style={{ transform: `scale(${scala})`, transformOrigin: 'top left' }}>
            <Prima d={dati} />
          </div>
        </div>
        <p className="gaz-didascalia">
          {disposizione === 'senzaFoto'
            ? 'Senza foto: la pagina esce di sola tipografia.'
            : `Foto ${disposizione === 'sfondo' ? 'a tutta pagina' : disposizione === 'affianco' ? 'affiancata' : 'in un riquadro'} — la decide la forma dell'immagine.`}
        </p>
      </div>

      <div className="gaz-moduli">
        {problemi.length > 0 && (
          <div className="gaz-avvisi">
            <strong>Da controllare{modificataIl ? ' (era così prima delle tue correzioni)' : ''}:</strong>
            <ul>{problemi.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}

        <p className="gaz-nota">
          Gli a capo che scrivi nelle caselle finiscono nella pagina: servono a
          spezzare un titolo dove vuoi tu invece che dove capita. Gli spazi a
          inizio riga diventano un rientro.
        </p>
        <Campo etichetta="Titolo" valore={dati.titolo} limite={limiti.titolo} righe={2}
          onChange={(v) => tocca({ titolo: v })} />
        <Campo etichetta="Gancio (la riga gialla)" valore={dati.gancio} limite={limiti.gancio} righe={2}
          onChange={(v) => tocca({ gancio: v })} />
        <Campo etichetta="Occhiello" valore={dati.occhiello}
          onChange={(v) => tocca({ occhiello: v })} />
        <Campo etichetta="Sottotestata (la riga sotto la testata)" valore={dati.sottotestata}
          onChange={(v) => tocca({ sottotestata: v })} />
        <Campo etichetta="Numero dell'edizione" valore={dati.numero}
          onChange={(v) => tocca({ numero: v })} />
        <Campo etichetta="Data" valore={dati.data}
          onChange={(v) => tocca({ data: v })} />
        <Campo etichetta="Sottotitolo" valore={dati.sottotitolo} righe={2}
          onChange={(v) => tocca({ sottotitolo: v })} />
        <Campo etichetta="Cappello" valore={dati.cappello} righe={4}
          onChange={(v) => tocca({ cappello: v })} />

        {/*
          * I paragrafi: titolo modificabile, ordine modificabile, e si
          * spostano da una colonna all'altra.
          *
          * I titoletti li scrive il generatore perché sono fatti — il nome
          * del club, il giocatore col suo club — ma l'ultima parola è di chi
          * impagina: a volte «Chi se lo contende» sta meglio scritto
          * altrimenti, e due paragrafi che nel riquadro largo finiscono
          * separati stanno meglio uno sotto l'altro nella colonna.
          */}
        <Campo etichetta="Titolo del riquadro" valore={dati.titoloAltre ?? 'Le altre partite'}
          onChange={(v) => tocca({ titoloAltre: v })} />
        {dati.altre.map((a, i) => (
          <Paragrafo
            key={`altre-${i}`}
            titolo={a.titolo}
            testo={a.testo}
            limite={190}
            righe={3}
            suGiu={(verso) => tocca({ altre: spostaVoce(dati.altre, i, verso) })}
            primo={i === 0}
            ultimo={i === dati.altre.length - 1}
            sposta={colonnaLibera(dati) ? () => setDati((d) => allaColonna(d, i)) : null}
            spostaEtichetta="Porta nella colonna di destra →"
            onTitolo={(v) => tocca({
              altre: dati.altre.map((x, j) => (j === i ? { ...x, titolo: v } : x)),
            })}
            onTesto={(v) => tocca({
              altre: dati.altre.map((x, j) => (j === i ? { ...x, testo: v } : x)),
            })}
          />
        ))}
        {!colonnaLibera(dati) && (
          <p className="gaz-nota">
            In questa edizione la colonna di destra è occupata dalla classifica e dai
            prossimi incontri, quindi i paragrafi si possono riordinare ma non spostare
            di là: prenderebbero il posto della classifica.
          </p>
        )}

        {/*
          * La colonna di destra libera — nel mercato chiuso sono gli scambi.
          * Si corregge come tutto il resto: una pagina dove metà dei testi
          * si possono sistemare e metà no è peggio di una tutta bloccata,
          * perché il limite lo si scopre solo quando serve.
          */}
        {dati.colonna && (
          <>
            <Campo etichetta="Titolo della colonna di destra" valore={dati.colonna.titolo}
              onChange={(v) => tocca({ colonna: { ...dati.colonna!, titolo: v } })} />
            {dati.colonna.voci.map((v, i) => (
              <Paragrafo
                key={`colonna-${i}`}
                titolo={v.titolo}
                testo={v.testo}
                limite={170}
                righe={2}
                primo={i === 0}
                ultimo={i === dati.colonna!.voci.length - 1}
                suGiu={(verso) => tocca({
                  colonna: { ...dati.colonna!, voci: spostaVoce(dati.colonna!.voci, i, verso) },
                })}
                sposta={() => setDati((d) => alRiquadro(d, i))}
                spostaEtichetta="← Riporta nel riquadro di sinistra"
                onTitolo={(t) => tocca({
                  colonna: {
                    ...dati.colonna!,
                    voci: dati.colonna!.voci.map((x, j) => (j === i ? { ...x, titolo: t } : x)),
                  },
                })}
                onTesto={(t) => tocca({
                  colonna: {
                    ...dati.colonna!,
                    voci: dati.colonna!.voci.map((x, j) => (j === i ? { ...x, testo: t } : x)),
                  },
                })}
              />
            ))}
          </>
        )}

        <h3>Il numerone</h3>
        {dati.spalla ? (
          <>
            <Campo etichetta="Numero" valore={dati.spalla.numero}
              onChange={(v) => tocca({ spalla: { ...dati.spalla!, numero: v } })} />
            <Campo etichetta="Didascalia" valore={dati.spalla.didascalia} righe={2} limite={130}
              onChange={(v) => tocca({ spalla: { ...dati.spalla!, didascalia: v } })} />
            <button type="button" className="ghost" onClick={() => tocca({ spalla: null })}>
              Togli il riquadro
            </button>
          </>
        ) : (
          <button type="button" className="ghost"
            onClick={() => tocca({ spalla: { numero: '', didascalia: '' } })}>
            Aggiungi il riquadro col numerone
          </button>
        )}

        <h3>La foto</h3>
        {dati.foto && (
          <>
            <p className="gaz-nota">
              Da: {dati.foto.provenienza} · {dati.foto.larghezza}×{dati.foto.altezza}
              {' '}nel riquadro {riquadro.larghezza}×{riquadro.altezza}
            </p>
            <label className="gaz-campo">
              <span className="gaz-etichetta">
                Taglio verticale <em>{dati.foto.fuoco}</em>
              </span>
              <input
                type="range" min={0} max={100} value={dati.foto.fuoco}
                disabled={!spazio || spazio.y < 2}
                onChange={(e) => toccaFoto({ fuoco: Number(e.target.value) })}
              />
            </label>
            {spazio && spazio.y < 2 && (
              <p className="gaz-nota">
                In verticale non c&apos;è niente da spostare: ingrandita quanto basta a coprire
                il riquadro, questa foto è alta esattamente quanto lui. Ingrandiscila e il
                cursore riprende a funzionare.
                <button type="button" className="ghost" style={{ marginTop: 6 }}
                  onClick={() => toccaFoto({
                    zoom: zoomPerSpostarsi(dati.foto!, riquadro, 'y'),
                  })}>
                  Ingrandisci al {zoomPerSpostarsi(dati.foto, riquadro, 'y')}%
                </button>
              </p>
            )}
            {/*
              * Orizzontale come verticale: si sposta di una frazione dello
              * scarto fra immagine e riquadro, mai di pixel. Agli estremi il
              * bordo della foto tocca il bordo del riquadro, quindi un bordo
              * vuoto non può comparire e non c'è niente da ritagliare dopo.
              */}
            <label className="gaz-campo">
              <span className="gaz-etichetta">
                Taglio orizzontale <em>{dati.foto.fuocoX ?? 50}</em>
              </span>
              <input
                type="range" min={0} max={100} value={dati.foto.fuocoX ?? 50}
                disabled={!spazio || spazio.x < 2}
                onChange={(e) => toccaFoto({ fuocoX: Number(e.target.value) })}
              />
            </label>
            {/*
              * L'ingrandimento parte da 100 = «copri il riquadro e basta»:
              * sotto non si può andare, quindi un bordo vuoto non può
              * comparire per costruzione, qualunque cosa si faccia con le
              * altre due manopole.
              */}
            <label className="gaz-campo">
              <span className="gaz-etichetta">
                Ingrandimento <em>{zoomValido(dati.foto.zoom)}%</em>
              </span>
              <input
                type="range" min={ZOOM_MINIMO} max={ZOOM_MASSIMO} step={5}
                value={zoomValido(dati.foto.zoom)}
                onChange={(e) => toccaFoto({ zoom: Number(e.target.value) })}
              />
            </label>
            <p className="gaz-nota">
              Margine di spostamento: {spazio?.x ?? 0} px in orizzontale,
              {' '}{spazio?.y ?? 0} px in verticale.
            </p>
            <button type="button" className="ghost" onClick={() => tocca({ foto: null })}>
              Togli la foto
            </button>
          </>
        )}

        <div className="gaz-foto-a-mano">
          <label className="gaz-campo">
            <span className="gaz-etichetta">Indirizzo di un&apos;immagine</span>
            <input
              type="url" placeholder="https://…" value={indirizzo}
              onChange={(e) => setIndirizzo(e.target.value)}
            />
          </label>
          <button type="button" className="ghost" disabled={!indirizzo.trim()}
            onClick={async () => {
              setGuaioFoto(null);
              // senza rimpicciolire: di un indirizzo si tiene l'indirizzo,
              // così la riga del database non si porta dietro la foto
              const f = await misuraImmagineNelBrowser(indirizzo.trim(), false);
              if (!f) {
                setGuaioFoto('Non sono riuscito a leggere quell\'immagine. '
                  + 'Alcuni siti non lasciano che una pagina esterna le misuri: '
                  + 'in quel caso scaricala e caricala col bottone qui sotto.');
                return;
              }
              tocca({ foto: { ...f, provenienza: indirizzo.trim(), fuoco: dati.foto?.fuoco ?? 35 } });
            }}>
            Usa questo indirizzo
          </button>

          <label className="gaz-campo">
            <span className="gaz-etichetta">…oppure carica un file</span>
            <input
              type="file" accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setGuaioFoto(null);
                const dataUri = await new Promise<string>((ok) => {
                  const lettore = new FileReader();
                  lettore.onload = () => ok(String(lettore.result ?? ''));
                  lettore.readAsDataURL(file);
                });
                const f = await misuraImmagineNelBrowser(dataUri, true);
                if (!f) { setGuaioFoto('Questo file non sembra un\'immagine.'); return; }
                tocca({ foto: { ...f, provenienza: file.name, fuoco: dati.foto?.fuoco ?? 35 } });
              }}
            />
          </label>
          {guaioFoto && <p className="ko gaz-nota">{guaioFoto}</p>}
        </div>

        {foto.length === 0 && (
          <p className="gaz-nota">
            Nessuna foto dalle news: l&apos;indice si riempie con il cron del mercoledì.
            Nel frattempo puoi incollare un indirizzo o caricare un file qui sopra.
          </p>
        )}

        <div className="gaz-scelta-foto">
          {foto.map((f) => (
            <button
              key={f.src} type="button"
              className={dati.foto?.src === f.src ? 'scelta' : undefined}
              title={f.provenienza}
              onClick={() => tocca({ foto: { ...f, fuoco: dati.foto?.fuoco ?? 35 } })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.src} alt={f.provenienza} loading="lazy" />
            </button>
          ))}
        </div>

        <div className="gaz-azioni">
          <form action={salva}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="dati" value={JSON.stringify(dati)} />
            <button type="submit" disabled={salvando}>
              {salvando ? 'Salvo…' : 'Salva'}
            </button>
          </form>

          <button type="button" onClick={salvaEScarica} disabled={scaricando}>
            {scaricando ? 'Preparo…' : 'Salva e scarica il PNG'}
          </button>

          <form action={manda}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" className="ghost" disabled={mandando || Boolean(inviataIl)}>
              {inviataIl ? 'Già mandata' : 'Segna come mandata'}
            </button>
          </form>
        </div>

        {statoSalva && <p className={statoSalva.ok ? 'ok' : 'ko'}>{statoSalva.message}</p>}
        {statoManda && <p className={statoManda.ok ? 'ok' : 'ko'}>{statoManda.message}</p>}
      </div>
    </div>
  );
}

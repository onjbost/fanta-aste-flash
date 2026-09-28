/**
 * La Gazzetta della Mansarda — il disegno della prima pagina.
 *
 * **Un componente solo** per l'anteprima nell'editor e per il PNG: Satori
 * renderizza questo stesso albero. Se fossero due, dopo tre modifiche
 * mostrerebbero cose diverse e l'admin manderebbe nel gruppo qualcosa che non
 * ha visto.
 *
 * Da qui discende un vincolo che vale per ogni riga di stile qui sotto:
 * Satori conosce **solo flexbox**. Niente grid, niente float, niente
 * `display: block` implicito — ogni contenitore con più di un figlio dichiara
 * `display: 'flex'`. Scriverlo diversamente funzionerebbe nel browser e si
 * romperebbe nel PNG, cioè nell'unica versione che poi va nel gruppo.
 *
 * Tutti i testi passano da `soloTesto`: quello che arriva qui può contenere
 * caratteri che i font non hanno, e in un'immagine un carattere mancante non
 * è un ripiego, è un quadratino.
 */

import { soloTesto } from './glifi';
import {
  COLORI, ETICHETTA_EDIZIONE, coperturaFoto, disposizioneFoto,
  type DatiPrima, type Disposizione, type FotoPrima,
} from './prima';

export const LARGHEZZA = 842;
export const ALTEZZA = 1190;

/** Il margine laterale della pagina, e quindi la larghezza utile. */
const MARGINE = 30;
const LARGO_UTILE = LARGHEZZA - MARGINE * 2;

const TITOLO = 'Titolo';   // Heading Now / Fjalla
const TESTO = 'Testo';     // Aileron
const FORTE = 'Forte';     // Aileron SemiBold

const T = soloTesto;

function Etichetta({ children, colore = COLORI.inchiostro }: {
  children: string; colore?: string;
}) {
  return (
    <div style={{
      display: 'flex', fontFamily: TESTO, fontSize: 10, letterSpacing: 2.4,
      color: colore, textTransform: 'uppercase',
    }}>{T(children)}</div>
  );
}

function Linea({ spessore = 3, colore = COLORI.inchiostro, sopra = 0 }: {
  spessore?: number; colore?: string; sopra?: number;
}) {
  return <div style={{ display: 'flex', height: spessore, width: '100%', background: colore, marginTop: sopra }} />;
}

function Testata({ d }: { d: DatiPrima }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Etichetta>{ETICHETTA_EDIZIONE[d.tipo]}</Etichetta>
        <Etichetta>{d.numero}</Etichetta>
        <Etichetta>{d.data}</Etichetta>
      </div>
      <Linea sopra={9} />
      <div style={{
        display: 'flex', justifyContent: 'center', marginTop: 7,
        fontFamily: TITOLO, fontSize: 60, lineHeight: 0.95, color: COLORI.inchiostro,
      }}>LA GAZZETTA DELLA MANSARDA</div>
      <div style={{
        display: 'flex', justifyContent: 'center', marginTop: 9,
        fontFamily: FORTE, fontSize: 12, letterSpacing: 2.4, color: COLORI.inchiostro,
      }}>{T(d.sottotestata)}</div>
      <Linea sopra={9} />
    </div>
  );
}

/** Il testo dell'apertura, uguale in tutte e tre le disposizioni. */
function TestoApertura({ d, largo }: { d: DatiPrima; largo: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: largo }}>
      <Etichetta colore={COLORI.giallo}>{d.occhiello}</Etichetta>
      <div style={{
        display: 'flex', fontFamily: TITOLO, fontSize: 64, lineHeight: 0.92,
        color: COLORI.carta, marginTop: 10,
      }}>{T(d.titolo)}</div>
      <div style={{
        display: 'flex', fontFamily: TITOLO, fontSize: 44, lineHeight: 0.98,
        color: COLORI.giallo, marginTop: 2,
      }}>{T(d.gancio)}</div>
      <div style={{
        display: 'flex', fontFamily: FORTE, fontSize: 15, letterSpacing: 0.6,
        color: COLORI.carta, marginTop: 14,
      }}>{T(d.sottotitolo)}</div>
      <div style={{ display: 'flex', width: 70, height: 2, background: COLORI.giallo, marginTop: 12 }} />
      <div style={{
        display: 'flex', fontFamily: TESTO, fontSize: 15, lineHeight: 1.45,
        color: COLORI.carta, marginTop: 12,
      }}>{T(d.cappello)}</div>
    </div>
  );
}

const VELATURA = `linear-gradient(to bottom, rgba(52,48,46,0) 20%, `
  + `rgba(52,48,46,0.74) 50%, rgba(52,48,46,0.95) 100%)`;

/**
 * Lo sfondo fotografico di un riquadro di misura nota.
 *
 * Niente `backgroundSize: 'cover'`: nel browser funziona, in Satori la foto
 * esce a mosaico. Il ritaglio si calcola (`coperturaFoto`) e si scrive in
 * pixel, così i due motori disegnano la stessa cosa.
 */
function sfondoFoto(foto: FotoPrima, larghezza: number, altezza: number) {
  const c = coperturaFoto(foto, { larghezza, altezza });
  return {
    backgroundImage: `url(${foto.src})`,
    backgroundSize: c.dimensione,
    backgroundPosition: c.posizione,
    backgroundRepeat: 'no-repeat',
  } as const;
}

function Apertura({ d, disposizione }: { d: DatiPrima; disposizione: Disposizione }) {
  // L'apertura non si restringe mai (`flexShrink: 0` qui sotto): se la pagina
  // è piena, a cedere devono essere le spaziature in fondo, non la foto.
  // Per questo l'altezza è 436 e non 452 — con 8 squadre in classifica e 4
  // partite in «Si gioca» la colonna chiede 501px, e 452 li portava a 1202
  // su 1190: il browser restringeva tutto e la velatura finiva per coprire i
  // titoli «Le altre» e «Classifica».
  const altezza = 436;
  const foto = d.foto as FotoPrima | null;

  // orizzontale: la foto è lo sfondo e il testo ci sta sopra, con la
  // velatura che lo rende leggibile — il testo bianco su un'erba chiara non
  // si legge, e in un'immagine non c'è modo di accorgersene dopo
  if (disposizione === 'sfondo' && foto) {
    return (
      <div style={{
        display: 'flex', marginTop: 16, height: altezza, width: '100%', flexShrink: 0,
        ...sfondoFoto(foto, LARGO_UTILE, altezza),
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          width: '100%', height: '100%', boxSizing: 'border-box',
          padding: '26px 28px', backgroundImage: VELATURA,
        }}>
          <TestoApertura d={d} largo={600} />
        </div>
      </div>
    );
  }

  // verticale: la foto sta a destra a tutta altezza, il testo scorre a sinistra
  if (disposizione === 'affianco' && foto) {
    return (
      <div style={{
        display: 'flex', marginTop: 16, height: altezza, width: '100%', flexShrink: 0,
        background: COLORI.inchiostro,
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          flex: 1, boxSizing: 'border-box', padding: '26px 28px',
        }}>
          <TestoApertura d={d} largo={470} />
        </div>
        <div style={{
          display: 'flex', width: 290, height: '100%',
          ...sfondoFoto(foto, 290, altezza),
        }} />
      </div>
    );
  }

  // quadrata: riquadro in alto a destra; senza foto: solo tipografia, che su
  // una prima pagina sportiva regge benissimo
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      marginTop: 16, height: altezza, width: '100%', flexShrink: 0,
      // `relative` perché il riquadro qui sotto è `absolute`: senza, si
      // ancorerebbe alla pagina e finirebbe in cima, sopra la testata
      position: 'relative', boxSizing: 'border-box',
      background: COLORI.inchiostro, padding: '26px 28px',
    }}>
      {disposizione === 'riquadro' && foto ? (
        <div style={{
          display: 'flex', position: 'absolute', top: 0, right: 0, width: 300, height: 300,
          ...sfondoFoto(foto, 300, 300),
        }} />
      ) : null}
      <TestoApertura d={d} largo={disposizione === 'riquadro' ? 470 : 700} />
    </div>
  );
}

function Colonna({ d }: { d: DatiPrima }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingLeft: 22 }}>
      <div style={{ display: 'flex', fontFamily: TITOLO, fontSize: 30, color: COLORI.inchiostro }}>Classifica</div>
      <Linea spessore={2} sopra={7} />
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 5 }}>
        {d.classifica.map((r, i) => (
          <div key={r.nome} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '5px 8px', background: i === 0 ? COLORI.carta : 'transparent',
          }}>
            <div style={{
              display: 'flex', fontFamily: i === 0 ? FORTE : TESTO, fontSize: 13,
              color: COLORI.inchiostro,
            }}>{T(`${i + 1}. ${r.nome}`)}</div>
            <div style={{ display: 'flex', fontFamily: FORTE, fontSize: 13, color: COLORI.inchiostro }}>{r.punti}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', fontFamily: TITOLO, fontSize: 30, color: COLORI.inchiostro, marginTop: 14 }}>Si gioca</div>
      <Linea spessore={2} sopra={7} />
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
        {d.prossimi.map((p) => (
          <div key={`${p.casa}-${p.ospite}`} style={{ display: 'flex', flexDirection: 'column', padding: '5px 0' }}>
            <div style={{ display: 'flex', fontFamily: FORTE, fontSize: 12.5, color: COLORI.inchiostro }}>{T(p.casa)}</div>
            <div style={{ display: 'flex', fontFamily: TESTO, fontSize: 12.5, color: COLORI.inchiostro, opacity: 0.75 }}>{T(p.ospite)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Il riquadro col numerone, in fondo a sinistra. */
function Spalla({ d }: { d: DatiPrima }) {
  if (!d.spalla) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', marginTop: 22, padding: '14px 18px',
      boxSizing: 'border-box', width: 520, background: COLORI.inchiostro,
    }}>
      <div style={{
        display: 'flex', fontFamily: TITOLO, fontSize: 56, lineHeight: 1,
        color: COLORI.giallo, marginRight: 18,
      }}>{T(d.spalla.numero)}</div>
      <div style={{
        display: 'flex', fontFamily: TESTO, fontSize: 14, lineHeight: 1.35,
        color: COLORI.carta, flex: 1,
      }}>{T(d.spalla.didascalia)}</div>
    </div>
  );
}

function Altre({ d }: { d: DatiPrima }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 520 }}>
      <div style={{ display: 'flex', fontFamily: TITOLO, fontSize: 30, color: COLORI.inchiostro }}>Le altre</div>
      <Linea spessore={2} sopra={7} />
      {d.altre.map((a) => (
        <div key={a.titolo} style={{ display: 'flex', flexDirection: 'column', marginTop: 13 }}>
          <div style={{ display: 'flex', fontFamily: FORTE, fontSize: 17, lineHeight: 1.2, color: COLORI.inchiostro }}>{T(a.titolo)}</div>
          <div style={{ display: 'flex', fontFamily: TESTO, fontSize: 14, lineHeight: 1.5, color: COLORI.inchiostro, marginTop: 5, width: 495 }}>{T(a.testo)}</div>
        </div>
      ))}
      <Spalla d={d} />
    </div>
  );
}

export function Prima({ d }: { d: DatiPrima }) {
  const disposizione = disposizioneFoto(d.foto);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: LARGHEZZA, height: ALTEZZA, background: COLORI.rosa,
      // senza questo la pagina misura 902×1246: gli stili in linea non hanno
      // box-sizing, e i 30 di margine interno si sommano alla larghezza
      boxSizing: 'border-box',
      padding: `28px ${MARGINE}px`, color: COLORI.inchiostro,
    }}>
      <Testata d={d} />
      <Apertura d={d} disposizione={disposizione} />

      <div style={{ display: 'flex', marginTop: 18, flex: 1, minHeight: 0 }}>
        <Altre d={d} />
        <Colonna d={d} />
      </div>

      <Linea spessore={2} sopra={14} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9 }}>
        <Etichetta>{d.piedeSinistra}</Etichetta>
        <Etichetta>{d.piedeDestra}</Etichetta>
      </div>
    </div>
  );
}

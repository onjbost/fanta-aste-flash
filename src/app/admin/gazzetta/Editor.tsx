'use client';

import { useActionState, useMemo, useState } from 'react';
import { Prima, ALTEZZA, LARGHEZZA } from '@/lib/gazzetta/Prima';
import { italianizza } from '@/lib/gazzetta/glifi';
import { disposizioneFoto, type DatiPrima, type FotoPrima } from '@/lib/gazzetta/prima';
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

  const tocca = (p: Partial<DatiPrima>) => setDati((d) => ({ ...d, ...p }));
  const toccaFoto = (p: Partial<FotoPrima>) => setDati((d) =>
    (d.foto ? { ...d, foto: { ...d.foto, ...p } } : d));

  const disposizione = useMemo(() => disposizioneFoto(dati.foto), [dati.foto]);
  // i limiti dipendono da dove finisce la foto: una colonna stretta tiene
  // meno caratteri, e il contatore deve dire la verità su questa pagina
  const limiti = useMemo(() => limitiTitolo(disposizione), [disposizione]);

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

        <Campo etichetta="Titolo" valore={dati.titolo} limite={limiti.titolo}
          onChange={(v) => tocca({ titolo: v })} />
        <Campo etichetta="Gancio (la riga gialla)" valore={dati.gancio} limite={limiti.gancio}
          onChange={(v) => tocca({ gancio: v })} />
        <Campo etichetta="Occhiello" valore={dati.occhiello}
          onChange={(v) => tocca({ occhiello: v })} />
        <Campo etichetta="Sottotitolo" valore={dati.sottotitolo}
          onChange={(v) => tocca({ sottotitolo: v })} />
        <Campo etichetta="Cappello" valore={dati.cappello} righe={4}
          onChange={(v) => tocca({ cappello: v })} />

        <h3>Le altre partite</h3>
        {dati.altre.map((a, i) => (
          <Campo
            key={a.titolo}
            etichetta={a.titolo}
            valore={a.testo}
            righe={3}
            limite={190}
            onChange={(v) => tocca({
              altre: dati.altre.map((x, j) => (j === i ? { ...x, testo: v } : x)),
            })}
          />
        ))}

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
            <p className="gaz-nota">Da: {dati.foto.provenienza}</p>
            <label className="gaz-campo">
              <span className="gaz-etichetta">
                Taglio verticale <em>{dati.foto.fuoco}</em>
              </span>
              <input
                type="range" min={0} max={100} value={dati.foto.fuoco}
                onChange={(e) => toccaFoto({ fuoco: Number(e.target.value) })}
              />
            </label>
            <button type="button" className="ghost" onClick={() => tocca({ foto: null })}>
              Togli la foto
            </button>
          </>
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

'use client';

import { useState } from 'react';
import {
  conteggi, frasePulita, gruppiDellaCoda, soloSelezionate, type Vista, type VoceCoda,
} from '@/lib/codaAdmin';
import { segnaCoda } from '../actions';
import type { ActionState } from '../actions';

/**
 * La coda operativa, in due viste.
 *
 * Le righe stanno in `admin_tasks`: cosa riportare a mano su Leghe
 * Fantacalcio, una frase per movimento, scritta nel momento in cui il
 * movimento è avvenuto. La colonna `done` c'era dal primo giorno, ma niente
 * nell'app la scriveva: la coda non si svuotava e teneva in cima richieste
 * decise un mese prima. Da qui si spunta.
 *
 * Raggruppate per squadra perché il lavoro si fa una rosa per volta. Per lo
 * stesso motivo ogni gruppo ha il suo «tutte»: fatti i tre movimenti del
 * Joga Benito, si spuntano quei tre e basta.
 *
 * Dopo ogni spunta l'elenco non si aggiusta qui: ci pensa il
 * `revalidatePath` dentro `segnaCoda`, che rimanda i dati del server. Così
 * quello che si vede è sempre quello che c'è nel database — anche se nel
 * frattempo ha spuntato qualcosa l'altra finestra aperta sul telefono — e
 * non serve un secondo giro: dentro la sala quel giro in più ricalcolava i
 * prop dei lotti nel mezzo di un countdown.
 */
export function Coda({ voci, avviso }: { voci: VoceCoda[]; avviso: string | null }) {
  const [vista, setVista] = useState<Vista>('daFare');
  const [selezionate, setSelezionate] = useState<string[]>([]);
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<ActionState>(null);

  const quante = conteggi(voci);
  const diQuestaVista = voci.filter((v) => (vista === 'fatte' ? v.fatto : !v.fatto));
  const gruppi = gruppiDellaCoda(diQuestaVista, vista);
  const scelte = soloSelezionate(selezionate, diQuestaVista);

  function cambiaVista(nuova: Vista) {
    setVista(nuova);
    // la selezione non attraversa le viste: le righe sono altre
    setSelezionate([]);
    setEsito(null);
  }

  function spunta(id: string) {
    setSelezionate((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function spuntaGruppo(ids: string[], tutte: boolean) {
    setSelezionate((s) => (tutte
      ? s.filter((x) => !ids.includes(x))
      : [...s.filter((x) => !ids.includes(x)), ...ids]));
  }

  async function segna(ids: string[], fatto: boolean) {
    if (!ids.length || inCorso) return;
    setInCorso(true);
    try {
      const modulo = new FormData();
      modulo.set('ids', ids.join(','));
      modulo.set('fatto', fatto ? 'si' : 'no');
      const r = await segnaCoda(null, modulo);
      setEsito(r);
      /*
       * Si levano dalla selezione solo le righe appena mandate, non tutte.
       * Il bottone «Fatto» di una riga chiama questa stessa funzione: con un
       * azzeramento secco, spuntare a parte una riga buttava via le cinque
       * selezioni che stavi preparando per l'azione in blocco, senza dirlo.
       */
      if (r?.ok) setSelezionate((sel) => sel.filter((x) => !ids.includes(x)));
    } catch {
      setEsito({ ok: false, message: 'Non ho potuto segnarla: riprova fra un attimo.' });
    } finally {
      setInCorso(false);
    }
  }

  const fatto = vista === 'daFare';

  return (
    <>
      <h2>Coda operativa</h2>

      {avviso && <div className="panel coda-avviso">{avviso}</div>}

      <div className="tabs">
        <button type="button" className={vista === 'daFare' ? 'on' : ''}
                onClick={() => cambiaVista('daFare')}>
          Da fare <span className="pallino">{quante.daFare}</span>
        </button>
        <button type="button" className={vista === 'fatte' ? 'on' : ''}
                onClick={() => cambiaVista('fatte')}>
          Fatte <span className="pallino">{quante.fatte}</span>
        </button>
      </div>

      <div className="panel coda-pannello">
        <div className="coda-testa">
          <p className="sub" style={{ margin: 0 }}>
            {fatto
              ? 'Quello che resta da riportare su Leghe Fantacalcio.'
              : 'Quello che hai già riportato. Da qui si può rimettere indietro.'}
          </p>
          <button type="button" className="ghost" disabled={!scelte.length || inCorso}
                  onClick={() => segna(scelte, fatto)}>
            {inCorso
              ? 'Un attimo…'
              : `${fatto ? 'Segna come fatte' : 'Segna come da fare'}${scelte.length ? ` · ${scelte.length}` : ''}`}
          </button>
        </div>

        {esito && (
          <p className={`coda-esito ${esito.ok ? 'ok' : 'no'}`} role="status" aria-live="polite">
            {esito.message}
          </p>
        )}

        {/*
          * L'elenco vuoto si dichiara solo se è vuoto per davvero. Quando la
          * lettura è fallita le voci sono zero perché non si è potuto
          * leggere, e dire «la coda è vuota» sotto il banner dell'errore
          * sarebbe la frase che manda l'admin a dormire tranquillo.
          */}
        {gruppi.length === 0 && !avviso && (
          <div className="empty">
            {fatto ? 'Niente da fare: la coda è vuota.' : 'Niente di fatto, per ora.'}
          </div>
        )}

        {gruppi.map((g) => {
          const ids = g.voci.map((v) => v.id);
          const tutte = ids.every((id) => scelte.includes(id));
          return (
            <section key={g.squadraId ?? 'senza'} className="coda-gruppo">
              <header>
                <h3>{g.etichetta} <span className="coda-quante">{g.voci.length}</span></h3>
                <button type="button" className="coda-tutte" onClick={() => spuntaGruppo(ids, tutte)}>
                  {tutte ? 'nessuna' : 'tutte'}
                </button>
              </header>
              <ul className="coda-righe">
                {g.voci.map((v) => (
                  <li key={v.id}>
                    <label>
                      <input type="checkbox" checked={scelte.includes(v.id)}
                             onChange={() => spunta(v.id)} />
                      <span>{frasePulita(v)}</span>
                    </label>
                    <button type="button" className="coda-segna" disabled={inCorso}
                            onClick={() => segna([v.id], fatto)}>
                      {fatto ? 'Fatto' : 'Da fare'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Esito } from '@/lib/home';
import { ICONE } from '../BottomNav';
import { Stemma } from '../Stemma';

export interface SquadraBanner { nome: string; stemma: string | null; posizione: string | null; forma: Esito[] }

export interface SlidePartita {
  comp: 'campionato' | 'coppa';
  etichetta: string;
  /** null: nessuna partita in programma in questa competizione */
  partita: {
    id: string;
    /** la giornata è cominciata: la card apre la diretta */
    live: boolean;
    titolo: string;
    quando: string;
    casa: SquadraBanner;
    ospite: SquadraBanner;
    /** «3° contro 5° in classifica», già scritto dal server */
    nota: string | null;
    precedenti: { id: string; quando: string; risultato: string; esito: Esito | null }[];
  } | null;
  /** tutte le partite giocate della competizione, per giornata, dalla più recente */
  storico: {
    chiave: string;
    titolo: string;
    partite: { id: string; casa: string; ospite: string; golCasa: number; golOspite: number; mia: boolean }[];
  }[];
}

/** Una riga dello storico: chi vince è in grassetto, la propria squadra è evidenziata. */
function RigaStorico({ x }: { x: SlidePartita['storico'][number]['partite'][number] }) {
  const vince = x.golCasa > x.golOspite ? 'casa' : x.golCasa < x.golOspite ? 'ospite' : null;
  return (
    <Link href={`/partita/${x.id}`} className={`storico-riga${x.mia ? ' mia' : ''}`} style={{ color: 'inherit', textDecoration: 'none' }}>
      <span className={vince === 'casa' ? 'vince' : undefined}>{x.casa}</span>
      <span className="ris num">{x.golCasa}–{x.golOspite}</span>
      <span className={vince === 'ospite' ? 'vince' : undefined}>{x.ospite}</span>
    </Link>
  );
}

/**
 * La card della partita apre la diretta: prima del calcio d'inizio come
 * anteprima (formazioni probabili, tutti «da giocare»), poi dal vivo.
 */
function CardPartita({ id, children }: { id: string; live: boolean; children: React.ReactNode }) {
  return (
    <Link href={`/partita/${id}`} className="banner" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
      {children}
    </Link>
  );
}

const NOME_ESITO: Record<Esito, string> = { V: 'vinta', N: 'pareggiata', P: 'persa' };

function Forma({ esiti }: { esiti: Esito[] }) {
  if (!esiti.length) return <span className="sub" style={{ margin: 0 }}>nessuna partita</span>;
  return (
    <span className="forma" aria-label={esiti.map((e) => NOME_ESITO[e]).join(', ')}>
      {esiti.map((e, i) => <i key={i} className={e} />)}
    </span>
  );
}

/**
 * La prossima partita della squadra, in campionato e in Coppa Mansarda, in un
 * banner che scorre. I quattro tasti sotto seguono la slide: «Classifica»
 * apre quella della competizione che stai guardando.
 */
export function BannerPartite({ slides }: { slides: SlidePartita[] }) {
  const [indice, setIndice] = useState(0);
  const traccia = useRef<HTMLDivElement>(null);
  const foglio = useRef<HTMLDialogElement>(null);

  // la slide corrente la dice lo scorrimento, qualunque cosa l'abbia mosso:
  // il dito, il selettore o i pallini
  useEffect(() => {
    const el = traccia.current;
    if (!el) return;
    const suScorri = () => setIndice(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', suScorri, { passive: true });
    return () => el.removeEventListener('scroll', suScorri);
  }, []);

  function vaiA(i: number) {
    const el = traccia.current;
    if (!el) return;
    const ridotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: ridotto ? 'auto' : 'smooth' });
    setIndice(i);
  }

  const attuale = slides[indice] ?? slides[0];
  const p = attuale?.partita;

  return (
    <section aria-label="Prossime partite">
      <div className="segmento" role="tablist" aria-label="Competizione">
        {slides.map((s, i) => (
          <button key={s.comp} type="button" role="tab" aria-selected={i === indice} onClick={() => vaiA(i)}>
            {s.etichetta}
          </button>
        ))}
      </div>

      <div className="carosello" ref={traccia}>
        {slides.map((s) => (
          <div key={s.comp} role="tabpanel" aria-label={s.etichetta}>
            {s.partita ? (
              <CardPartita id={s.partita.id} live={s.partita.live}>
                <div className="banner-testa"><span>{s.partita.titolo}</span><span>{s.partita.quando}</span></div>
                <div className="banner-sfida">
                  <div className="banner-squadra">
                    <Stemma nome={s.partita.casa.nome} url={s.partita.casa.stemma} size={52} />
                    <span className="nome">{s.partita.casa.nome}</span>
                  </div>
                  <span className="banner-vs">VS</span>
                  <div className="banner-squadra">
                    <Stemma nome={s.partita.ospite.nome} url={s.partita.ospite.stemma} size={52} />
                    <span className="nome">{s.partita.ospite.nome}</span>
                  </div>
                </div>
                {s.partita.nota && <div className="banner-nota">{s.partita.nota}</div>}
                <div className="banner-nota">
                  <b>{s.partita.live ? 'In diretta · tocca per seguirla ›' : 'Anteprima della diretta ›'}</b>
                </div>
              </CardPartita>
            ) : (
              <div className="banner vuoto">
                {s.comp === 'coppa'
                  ? 'Nessuna partita di coppa in programma: o il girone è finito, o la fase finale aspetta le qualificate.'
                  : 'Nessuna partita di campionato in programma.'}
              </div>
            )}
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="pallini" aria-hidden="true">
          {slides.map((s, i) => <span key={s.comp} className={i === indice ? 'on' : ''} />)}
        </div>
      )}

      <nav className="azioni" aria-label="Azioni rapide">
        <Link className="azione" href={`/classifica?c=${attuale?.comp ?? 'campionato'}`}>
          {ICONE.classifica}Classifica
        </Link>
        <button type="button" className="azione" disabled={!p && !attuale?.storico.length} onClick={() => foglio.current?.showModal()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></svg>
          Ultimi incontri
        </button>
        <Link className="azione" href="/schedine">{ICONE.schedine}Schedina</Link>
        <Link className="azione" href="/asta">{ICONE.asta}Asta</Link>
      </nav>

      <dialog
        ref={foglio} className="foglio" aria-labelledby="ultimi-titolo"
        // il tocco sul velo chiude: il velo è il dialog stesso, fuori dal contenuto
        onClick={(e) => { if (e.target === e.currentTarget) foglio.current?.close(); }}
      >
        <div className="foglio-maniglia" aria-hidden="true" />
        <div className="foglio-testa">
          <h2 id="ultimi-titolo">Ultimi incontri · {attuale?.etichetta}</h2>
          <button type="button" className="icon-btn" aria-label="Chiudi" onClick={() => foglio.current?.close()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
          </button>
        </div>
        {p && (
          <>
            <p className="titoletto" style={{ marginTop: 14 }}>Forma · ultime cinque in {attuale?.etichetta.toLowerCase()}</p>
            {[p.casa, p.ospite].map((sq) => (
              <div className="forma-riga" key={sq.nome}>
                <span className="chi"><Stemma nome={sq.nome} url={sq.stemma} size={30} />{sq.nome}</span>
                <Forma esiti={sq.forma} />
              </div>
            ))}

            <p className="titoletto">Precedenti</p>
            {p.precedenti.length === 0
              ? <p className="sub">Nessun precedente: è il primo incontro fra le due squadre.</p>
              : p.precedenti.map((x) => (
                <div className="precedente" key={x.id}>
                  <span className="quando">{x.quando}</span>
                  <span>{x.risultato}</span>
                  {x.esito ? <span className="forma"><i className={x.esito} aria-label={NOME_ESITO[x.esito]} /></span> : <span />}
                </div>
              ))}
          </>
        )}

        <p className="titoletto">Storico · {attuale?.etichetta}</p>
        {!attuale?.storico.length
          ? <p className="sub">Nessuna partita ancora giocata in questa competizione.</p>
          : attuale.storico.map((g, i) => (
            // una sezione per giornata: a fine stagione sono trentotto, e
            // aperte tutte il foglio diventerebbe una pergamena
            <details key={g.chiave} className="storico-giornata" open={i === 0}>
              <summary>{g.titolo}<span className="sub">{g.partite.length} partite</span></summary>
              {g.partite.map((x) => <RigaStorico key={x.id} x={x} />)}
            </details>
          ))}
      </dialog>
    </section>
  );
}

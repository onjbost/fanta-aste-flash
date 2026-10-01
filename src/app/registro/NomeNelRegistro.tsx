'use client';

import { useActionState, useRef } from 'react';
import { salvaUsername, type UsernameState } from './actions';

/**
 * «Nel registro ti chiami …».
 *
 * Sta in cima al registro e non in una pagina di impostazioni perché è lì che
 * uno si accorge di comparire come `mario.rossi@gmail.com` e gli viene voglia
 * di cambiarlo.
 */
export function NomeNelRegistro({ attuale, email }: { attuale: string | null; email: string | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [stato, salva, inCorso] = useActionState<UsernameState, FormData>(salvaUsername, null);

  return (
    <>
      <p className="sub" style={{ marginTop: 0 }}>
        Nel registro compari come <b>{attuale ?? email ?? 'qualcuno'}</b>.{' '}
        <button type="button" className="link" onClick={() => ref.current?.showModal()}>
          {attuale ? 'Cambia nome' : 'Scegli un nome'}
        </button>
      </p>

      <dialog ref={ref}>
        <form action={salva}>
          <div className="head">Come ti chiami nel registro</div>
          <div className="body">
            <p style={{ marginTop: 0 }}>
              È il nome che gli altri leggono accanto alle tue azioni. Se lo
              lasci vuoto compare la tua email ({email ?? 'quella con cui entri'}).
            </p>
            <div className="field">
              <label htmlFor="username">Nome</label>
              <input
                id="username" name="username" defaultValue={attuale ?? ''}
                maxLength={20} placeholder="Mattia" autoComplete="off"
              />
            </div>
            {stato && (
              <p className={stato.ok ? 'callout' : 'callout crit'} style={{ margin: 0 }}>
                {stato.message}
              </p>
            )}
          </div>
          <div className="foot">
            <button type="button" onClick={() => ref.current?.close()}>Chiudi</button>
            <button className="primary" disabled={inCorso}>
              {inCorso ? 'Salvo…' : 'Salva'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

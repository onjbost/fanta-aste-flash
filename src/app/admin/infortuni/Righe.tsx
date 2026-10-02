import type { IndisponibileNostro } from '@/lib/infortuni/infortuniServer';

/**
 * Un indisponibile su due righe: sopra i dati, sotto la didascalia della
 * fonte, intera.
 *
 * La stima di rientro è dedotta da una frase in italiano e può sbagliare:
 * per controllarla serve leggere quello che ha scritto fantacalcio.it, e
 * deve stare qui, accanto al numero, invece che a un clic su un altro sito.
 */
export function RigheIndisponibile({
  r, etichetta, seconda, secondaNum, ruolo,
}: {
  r: IndisponibileNostro;
  etichetta: string;
  /** la seconda colonna: la squadra della lega, o la quotazione per gli svincolati */
  seconda: string;
  secondaNum?: boolean;
  ruolo?: string;
}) {
  return (
    <>
      <tr style={{ borderBottom: r.descrizione ? 'none' : undefined }}>
        <td>
          {ruolo && <span className="role-badge" style={{ marginRight: 6 }}>{ruolo}</span>}
          {r.nome}<br /><span className="sub">{r.club}</span>
        </td>
        <td className={secondaNum ? 'num' : undefined}>{seconda}</td>
        <td>{etichetta}</td>
        <td>
          {r.rientroStimato
            ? <>
              <span className="sub">Stima app</span><br />
              {r.rientroStimato}<br /><span className="sub">~{r.giorniDiStop} giorni</span>
            </>
            : <span className="sub">non deducibile</span>}
        </td>
      </tr>
      {r.descrizione && (
        <tr>
          <td colSpan={4} style={{ paddingTop: 0 }}>
            <p className="sub" style={{ margin: 0, fontStyle: 'italic' }}>
              <b style={{ fontStyle: 'normal' }}>fantacalcio.it:</b> «{r.descrizione}»
              {r.rientroTesto && (
                <> — la stima viene da <b style={{ fontStyle: 'normal' }}>«{r.rientroTesto}»</b></>
              )}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

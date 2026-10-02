import type { PassoGiro } from '@/lib/leghe/legheServer';

/** Il segno di un esito: lo stesso nel registro e sotto i pulsanti. */
export const SEGNO = { ok: '✅', ko: '❌', info: 'ℹ️' } as const;

/** I passi di un giro sulla giornata, in fila. Va bene sia sul server sia nel browser. */
export function Passi({ passi }: { passi: PassoGiro[] }) {
  return (
    <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
      {passi.map((p, i) => (
        <li key={i} style={{ margin: '4px 0' }}>
          <b>{SEGNO[p.esito]} {p.nome}</b>
          <div className="sub" style={{ margin: '1px 0 0' }}>{p.dettaglio}</div>
        </li>
      ))}
    </ol>
  );
}

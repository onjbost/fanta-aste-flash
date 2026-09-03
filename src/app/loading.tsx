/**
 * Cosa si vede mentre la pagina arriva.
 *
 * Senza questo file il browser resta fermo sulla pagina precedente finché il
 * server non ha finito: sembra che il tocco non abbia funzionato, e si tocca
 * di nuovo. Con lo scheletro la navigazione è immediata a schermo — il tempo
 * di attesa è lo stesso, ma è visibile e ha una forma già familiare.
 *
 * Serve anche a Next: con un `loading` da mostrare, i link nella barra si
 * preparano da soli mentre scorri, e il passaggio diventa istantaneo.
 */
import { Caricamento } from './Caricamento';

export default function Loading() {
  return (
    <div className="shell" aria-busy="true" aria-live="polite">
      <div className="topbar">
        <div className="brand">Aste Flash <span>·</span> Fanta Mansarda</div>
        <div className="topbar-right"><span className="sk sk-riga" style={{ width: 90 }} /></div>
      </div>

      <span className="sk sk-riga" style={{ width: 120, height: 10 }} />
      <div className="sk sk-riga" style={{ width: '55%', height: 28, margin: '10px 0 18px' }} />

      <div className="stats">
        {[0, 1, 2].map((i) => (
          <div className="stat" key={i}>
            <span className="sk sk-riga" style={{ width: 80, height: 9 }} />
            <div className="sk sk-riga" style={{ width: 64, height: 26, margin: '8px 0 6px' }} />
            <span className="sk sk-riga" style={{ width: 110, height: 9 }} />
          </div>
        ))}
      </div>

      <div className="panel" style={{ padding: 16, marginTop: 18 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 0' }}>
            <span className="sk sk-quadro" />
            <span className="sk sk-riga" style={{ flex: 1, maxWidth: 220 }} />
            <span className="sk sk-riga" style={{ width: 52 }} />
          </div>
        ))}
      </div>

      <Caricamento />
    </div>
  );
}

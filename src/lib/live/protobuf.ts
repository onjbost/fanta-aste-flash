/**
 * Il messaggio live di fantacalcio.it — decodifica del protobuf.
 *
 * Il sito manda i voti live come un messaggio protobuf (`LiveMessage`).
 * Lo schema è piccolo e fisso, quindi invece di portarsi dietro una
 * libreria intera lo si legge a mano: varint, double, stringhe e messaggi
 * annidati, nient'altro. Lo schema è quello che il sito pubblica, offuscato,
 * in `/js/proto/live.txt` — ricostruito da andregri/fantacalcio-voti-live-js
 * (Apache 2.0) e verificato sul messaggio vero in `fixtures/`.
 *
 * Funzioni pure, nessuna rete.
 */

export interface GiocatoreLive {
  /** id di fantacalcio.it: è il nostro `players.ext_id` */
  id: number;
  name: string;
  /** P, D, C, A — oppure ALL per l'allenatore */
  position: string;
  /** null finché non c'è; 55/56 sono il «senza voto» della fonte e diventano null */
  vote: number | null;
  events: number[];
  eventsMinutes: number[];
}

export interface PartitaLive {
  matchId: number;
  teamHome: string;
  teamAway: string;
  goalHome: number;
  goalAway: number;
  /** 0 da giocare, 1 primo tempo, 2 intervallo, 3 secondo tempo, 4 finita, 5 sospesa, 6 rinviata */
  status: number;
  /** inizio del primo e del secondo tempo, in millisecondi; 0 se non ancora */
  fhDate: number;
  shDate: number;
  matchDate: number;
  playersHome: GiocatoreLive[];
  playersAway: GiocatoreLive[];
}

class Lettore {
  pos = 0;
  constructor(private buf: Uint8Array, private fine = buf.length) {}

  finito() { return this.pos >= this.fine; }

  varint(): bigint {
    let r = 0n;
    let shift = 0n;
    for (;;) {
      if (this.pos >= this.fine) throw new Error('varint troncato');
      const b = this.buf[this.pos++];
      r |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return r;
      shift += 7n;
    }
  }

  /** int32 con segno: i negativi arrivano come varint a 64 bit */
  int32(): number { return Number(BigInt.asIntN(32, this.varint())); }
  uint(): number { return Number(this.varint()); }

  double(): number {
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8).getFloat64(0, true);
    this.pos += 8;
    return v;
  }

  bytes(): Uint8Array {
    const n = this.uint();
    const b = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }

  string(): string { return new TextDecoder().decode(this.bytes()); }

  /** salta un campo che non conosciamo, invece di fallire */
  salta(tipo: number) {
    if (tipo === 0) this.varint();
    else if (tipo === 1) this.pos += 8;
    else if (tipo === 2) {
      // la lunghezza va letta prima: `pos += uint()` sommerebbe al pos vecchio
      const n = this.uint();
      this.pos += n;
    }
    else if (tipo === 5) this.pos += 4;
    else throw new Error(`tipo di campo protobuf ${tipo} non gestito`);
  }

  /** un `repeated int32`, impacchettato o no */
  int32Ripetuti(tipo: number, dove: number[]) {
    if (tipo === 2) {
      const sotto = new Lettore(this.bytes());
      while (!sotto.finito()) dove.push(sotto.int32());
    } else dove.push(this.int32());
  }
}

/** Un voto vero o null: «55», «56» e lo zero sono il senza voto della fonte. */
export function votoPulito(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v <= 0 || v > 10) return null;
  return v;
}

function giocatore(buf: Uint8Array): GiocatoreLive {
  const l = new Lettore(buf);
  const g: GiocatoreLive = { id: 0, name: '', position: '', vote: null, events: [], eventsMinutes: [] };
  while (!l.finito()) {
    const chiave = l.uint();
    const campo = chiave >>> 3;
    const tipo = chiave & 7;
    switch (campo) {
      case 1: g.id = l.uint(); break;
      case 2: g.name = l.string(); break;
      case 3: g.position = l.string(); break;
      case 4: g.vote = tipo === 1 ? votoPulito(l.double()) : (l.salta(tipo), null); break;
      case 5: l.int32Ripetuti(tipo, g.events); break;
      case 6: l.int32Ripetuti(tipo, g.eventsMinutes); break;
      default: l.salta(tipo);
    }
  }
  return g;
}

function partita(buf: Uint8Array): PartitaLive {
  const l = new Lettore(buf);
  const p: PartitaLive = {
    matchId: 0, teamHome: '', teamAway: '', goalHome: 0, goalAway: 0, status: 0,
    fhDate: 0, shDate: 0, matchDate: 0, playersHome: [], playersAway: [],
  };
  while (!l.finito()) {
    const chiave = l.uint();
    const campo = chiave >>> 3;
    const tipo = chiave & 7;
    switch (campo) {
      case 1: p.matchId = l.uint(); break;
      case 5: p.goalHome = l.uint(); break;
      case 6: p.goalAway = l.uint(); break;
      case 7: p.fhDate = l.uint(); break;
      case 8: p.shDate = l.uint(); break;
      case 9: p.matchDate = l.uint(); break;
      case 10: p.status = l.uint(); break;
      case 13: p.teamHome = l.string(); break;
      case 14: p.teamAway = l.string(); break;
      case 15: p.playersHome.push(giocatore(l.bytes())); break;
      case 16: p.playersAway.push(giocatore(l.bytes())); break;
      default: l.salta(tipo);
    }
  }
  return p;
}

/** Dal messaggio binario alle partite della giornata. */
export function decodificaLive(buf: Uint8Array): PartitaLive[] {
  const l = new Lettore(buf);
  const esito: PartitaLive[] = [];
  while (!l.finito()) {
    const chiave = l.uint();
    if (chiave >>> 3 === 1 && (chiave & 7) === 2) esito.push(partita(l.bytes()));
    else l.salta(chiave & 7);
  }
  return esito;
}

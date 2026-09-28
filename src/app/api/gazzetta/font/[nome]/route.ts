import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

/**
 * I font della Gazzetta, per l'anteprima nel browser.
 *
 * Gli stessi file che usa Satori per il PNG, serviti da qui invece che
 * copiati in `public/`: due copie sarebbero due cose da tenere allineate, e
 * il giorno che una delle due cambiasse l'anteprima e l'immagine
 * mostrerebbero caratteri diversi — cioè esattamente il guasto che tutto il
 * resto di questa funzionalità è costruito per evitare.
 */

const CARTELLA = path.join(process.cwd(), 'src', 'lib', 'gazzetta', 'font');

// Elenco chiuso, non un `join` col nome che arriva: un nome di file che
// arriva da fuori e finisce in un percorso è il modo classico di farsi
// leggere mezzo disco.
const FILE: Record<string, { file: string; tipo: string }> = {
  titolo: { file: 'titolo.ttf', tipo: 'font/ttf' },
  testo: { file: 'testo.ttf', tipo: 'font/ttf' },
  forte: { file: 'forte.otf', tipo: 'font/otf' },
};

export async function GET(
  _req: Request, { params }: { params: Promise<{ nome: string }> },
) {
  const { nome } = await params;
  const scelto = FILE[nome];
  if (!scelto) return NextResponse.json({ error: 'non esiste' }, { status: 404 });

  const dati = await readFile(path.join(CARTELLA, scelto.file));
  return new NextResponse(new Uint8Array(dati), {
    headers: {
      'content-type': scelto.tipo,
      // i file non cambiano mai: si cambia il nome, non il contenuto
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}

// Le icone dell'app: il martello del banditore, a contorno, nei colori
// dell'app (fondo oro dell'accento, tratto verde notte del fondo).
// Si rigenerano con `node scripts/icone.mjs` se cambia il marchio.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const ORO = '#F2C14E';
const NOTTE = '#0C1410';

/**
 * Il disegno in un riquadro 100×100. Il martello si disegna dritto, col
 * manico verso destra e la testa centrata nell'origine, poi si gira di 45°.
 * Le forme sono piene d'oro, così quelle sopra coprono il tratto di quelle
 * sotto: il manico entra nella testa senza vedersi.
 */
function martello(tratto) {
  const t = `stroke="${NOTTE}" stroke-width="${tratto}" stroke-linejoin="round" fill="${ORO}"`;
  const testa = '<g transform="translate(40 33) rotate(45)">'
    + `<rect x="0" y="-4.5" width="64" height="9" rx="4.5" ${t}/>`
    + `<rect x="-8" y="-15" width="16" height="30" ${t}/>`
    + `<rect x="-11" y="-27" width="22" height="12" rx="3.5" ${t}/>`
    + `<rect x="-11" y="15" width="22" height="12" rx="3.5" ${t}/>`
    + '</g>';
  const base = `<rect x="21" y="67" width="26" height="8" rx="4" ${t}/>`
    + `<path d="M10 89 C10 81 16 75 25 75 H43 C52 75 58 81 58 89 Z" ${t}/>`;
  return base + testa;
}

/**
 * lato: pixel; zoom: quanto del riquadro prende il disegno (1 = tutto);
 * raggio: angoli arrotondati in centesimi (0 = pieno, per iOS e le icone
 * «maskable», che arrotonda il sistema); tratto: spessore in centesimi
 */
function svg(lato, { zoom = 1, raggio = 0, tratto = 3.4 } = {}) {
  const k = (1 - zoom) * 50;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${lato}" height="${lato}">`
    + `<rect width="100" height="100" rx="${raggio}" fill="${ORO}"/>`
    + `<g transform="translate(${k} ${k}) scale(${zoom})">${martello(tratto / zoom)}</g></svg>`;
}

const png = (s, file) => sharp(Buffer.from(s)).png().toFile(file);

// favicon: angoli arrotondati e tratto più spesso, che a 16 pixel si veda
writeFileSync('src/app/icon.svg', svg(64, { raggio: 22, tratto: 5 }));
await png(svg(32, { raggio: 22, tratto: 6 }), 'scripts/.favicon-32.png');
await png(svg(16, { raggio: 22, tratto: 7.5 }), 'scripts/.favicon-16.png');
// iOS: pieno, gli angoli li taglia il telefono
await png(svg(180, { zoom: 0.92 }), 'src/app/apple-icon.png');
// Android e manifest
await png(svg(192, { zoom: 0.92 }), 'public/icon-192.png');
await png(svg(512, { zoom: 0.92 }), 'public/icon-512.png');
// maskable: il disegno resta nel cerchio sicuro dell'80%
await png(svg(512, { zoom: 0.74 }), 'public/icon-maskable-512.png');

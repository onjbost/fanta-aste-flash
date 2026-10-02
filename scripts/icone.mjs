// Le icone dell'app dal martelletto del login: oro dell'accento, tratto scuro.
// Si rigenerano con `node scripts/icone.mjs` se cambia il marchio.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const ORO = '#F2C14E';
const INCHIOSTRO = '#2A1F04';
const MARTELLO = '<path d="m14 4 6 6"/><path d="m17 7-8.5 8.5"/><path d="m11.5 4.5 4 4"/>'
  + '<path d="m9 12 3 3"/><path d="M3 21h9"/><path d="m5.5 18.5 5-5"/>';

/**
 * lato: pixel; quota: quanto del lato prende il martelletto; raggio: angoli
 * arrotondati (0 = pieno, per iOS e le icone «maskable» che arrotonda il sistema)
 */
function svg(lato, quota, raggio) {
  const s = (lato * quota) / 24;
  // il martelletto occupa 3..20 × 4..21 del suo riquadro: si ricentra
  const off = (lato - 24 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lato} ${lato}" width="${lato}" height="${lato}">`
    + `<rect width="${lato}" height="${lato}" rx="${raggio}" fill="${ORO}"/>`
    + `<g transform="translate(${off + s * 0.5} ${off - s * 0.5}) scale(${s})" fill="none" stroke="${INCHIOSTRO}" `
    + `stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${MARTELLO}</g></svg>`;
}

const png = (s, file) => sharp(Buffer.from(s)).png().toFile(file);

// favicon: lo stesso quadratino arrotondato del login
writeFileSync('src/app/icon.svg', svg(64, 0.62, 18));
await png(svg(32, 0.62, 9), 'scripts/.favicon-32.png');
await png(svg(16, 0.66, 4), 'scripts/.favicon-16.png');
// iOS: pieno, gli angoli li taglia il telefono
await png(svg(180, 0.58, 0), 'src/app/apple-icon.png');
// Android e manifest
await png(svg(192, 0.58, 0), 'public/icon-192.png');
await png(svg(512, 0.58, 0), 'public/icon-512.png');
// maskable: il disegno resta nel cerchio sicuro dell'80%
await png(svg(512, 0.46, 0), 'public/icon-maskable-512.png');

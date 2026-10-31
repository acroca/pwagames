// Generates the PWA icons in public/ from a 10x10 nonogram picture.
// Run with `npm run icons`. No dependencies: writes PNGs with node:zlib.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const PICTURE = [
  '..........',
  '.##....##.',
  '####..####',
  '##########',
  '##########',
  '.########.',
  '..######..',
  '...####...',
  '....##....',
  '..........',
];

const BG = [0x0f, 0x17, 0x2a];
const EMPTY = [0x1e, 0x29, 0x3b];
const FILLED = [0xe2, 0xe8, 0xf0];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 3 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      raw.set([r, g, b], rowStart + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** `padding` is the fraction of the icon left as margin on each side. */
function icon(size, padding) {
  const pad = size * padding;
  const cell = (size - 2 * pad) / 10;
  const gap = Math.max(1, cell * 0.08);
  return png(size, (x, y) => {
    const gx = (x + 0.5 - pad) / cell;
    const gy = (y + 0.5 - pad) / cell;
    if (gx < 0 || gy < 0 || gx >= 10 || gy >= 10) return BG;
    const c = Math.floor(gx);
    const r = Math.floor(gy);
    const fx = (gx - c) * cell;
    const fy = (gy - r) * cell;
    if (fx < gap / 2 || fx > cell - gap / 2 || fy < gap / 2 || fy > cell - gap / 2) return BG;
    return PICTURE[r][c] === '#' ? FILLED : EMPTY;
  });
}

function svg() {
  const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
  const rects = PICTURE.flatMap((line, r) =>
    [...line].map(
      (ch, c) =>
        `<rect x="${1 + c * 3}" y="${1 + r * 3}" width="2.7" height="2.7" fill="${hex(ch === '#' ? FILLED : EMPTY)}"/>`,
    ),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="5" fill="${hex(BG)}"/>${rects.join('')}</svg>\n`;
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('pwa-192x192.png', out), icon(192, 0.1));
writeFileSync(new URL('pwa-512x512.png', out), icon(512, 0.1));
writeFileSync(new URL('maskable-512x512.png', out), icon(512, 0.2));
writeFileSync(new URL('apple-touch-icon.png', out), icon(180, 0.12));
writeFileSync(new URL('favicon.svg', out), svg());
console.log('Icons written to public/');

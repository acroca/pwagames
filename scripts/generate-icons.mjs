// Generates the PWA icons in public/: four board cells, one for each kind of mark the games
// use (a digit, a filled cell, a cross and a piece).
// Run with `npm run icons`. No dependencies: rasterizes the shapes itself and writes PNGs
// with node:zlib.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x0f, 0x17, 0x2a];
const EMPTY = [0x1e, 0x29, 0x3b];
const WHITE = [0xff, 0xff, 0xff];
const BLUE = [0x3b, 0x82, 0xf6];
const RED = [0xf8, 0x71, 0x71];

// The design is drawn in its own units: a 2x2 block of TILE-sized cells, GAP apart.
const TILE = 35;
const GAP = 4;
const SPAN = 2 * TILE + GAP;
const RADIUS = 8;
const STROKE = 5;
const DOT = 9.5;
/** Strokes inside a tile, as polylines in tile coordinates. */
const SEVEN = [[[11, 10.5], [24, 10.5], [15.5, 25.5]]];
const CROSS = [[[10, 10], [25, 25]], [[25, 10], [10, 25]]];
/** Tiles in reading order: background, then the mark drawn on it. */
const TILES = [
  { fill: WHITE, lines: SEVEN, ink: BLUE },
  { fill: BLUE },
  { fill: EMPTY, lines: CROSS, ink: RED },
  { fill: WHITE, dot: BG },
];

function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Colour of the design at (u, v), in design units from its top-left corner. */
function colorAt(u, v) {
  const col = Math.floor(u / (TILE + GAP));
  const row = Math.floor(v / (TILE + GAP));
  if (col < 0 || col > 1 || row < 0 || row > 1) return BG;
  const x = u - col * (TILE + GAP);
  const y = v - row * (TILE + GAP);
  // Rounded square: distance from the centre, past the straight part of each side.
  const half = TILE / 2 - RADIUS;
  const ox = Math.max(Math.abs(x - TILE / 2) - half, 0);
  const oy = Math.max(Math.abs(y - TILE / 2) - half, 0);
  if (Math.hypot(ox, oy) > RADIUS) return BG;
  const tile = TILES[row * 2 + col];
  if (tile.dot && Math.hypot(x - TILE / 2, y - TILE / 2) <= DOT) return tile.dot;
  for (const line of tile.lines ?? []) {
    for (let i = 1; i < line.length; i++) {
      if (segmentDistance(x, y, line[i - 1], line[i]) <= STROKE / 2) return tile.ink;
    }
  }
  return tile.fill;
}

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
  const scale = SPAN / (size * (1 - 2 * padding));
  const SUB = 4; // samples per pixel side, for smooth edges
  return png(size, (x, y) => {
    const sum = [0, 0, 0];
    for (let sy = 0; sy < SUB; sy++) {
      for (let sx = 0; sx < SUB; sx++) {
        const u = (x + (sx + 0.5) / SUB - size * padding) * scale;
        const v = (y + (sy + 0.5) / SUB - size * padding) * scale;
        colorAt(u, v).forEach((c, i) => (sum[i] += c));
      }
    }
    return sum.map((c) => Math.round(c / (SUB * SUB)));
  });
}

function svg() {
  const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
  const margin = 13;
  const box = SPAN + 2 * margin;
  const tiles = TILES.map((tile, i) => {
    const x = margin + (i % 2) * (TILE + GAP);
    const y = margin + Math.floor(i / 2) * (TILE + GAP);
    let out = `<rect x="${x}" y="${y}" width="${TILE}" height="${TILE}" rx="${RADIUS}" fill="${hex(tile.fill)}"/>`;
    if (tile.dot) out += `<circle cx="${x + TILE / 2}" cy="${y + TILE / 2}" r="${DOT}" fill="${hex(tile.dot)}"/>`;
    if (tile.lines) {
      const d = tile.lines.map((line) => 'M' + line.map(([px, py]) => `${x + px} ${y + py}`).join('L')).join('');
      out += `<path d="${d}" fill="none" stroke="${hex(tile.ink)}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return out;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}"><rect width="${box}" height="${box}" rx="${box * 0.16}" fill="${hex(BG)}"/>${tiles.join('')}</svg>\n`;
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('pwa-192x192.png', out), icon(192, 0.13));
writeFileSync(new URL('pwa-512x512.png', out), icon(512, 0.13));
writeFileSync(new URL('maskable-512x512.png', out), icon(512, 0.22));
writeFileSync(new URL('apple-touch-icon.png', out), icon(180, 0.14));
writeFileSync(new URL('favicon.svg', out), svg());
console.log('Icons written to public/');

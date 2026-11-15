/** Soft tint hues for region colouring (degrees of hue). */
export const REGION_HUES = [210, 30, 130, 320, 55, 270];

/**
 * Greedy colouring of the regions of a square grid so neighbouring regions get different tints. Returns, per cell,
 * an index into `REGION_HUES`.
 */
export function tintRegions(n: number, regions: number[]): number[] {
  const count = Math.max(...regions) + 1;
  const touch: Set<number>[] = Array.from({ length: count }, () => new Set());
  for (let i = 0; i < n * n; i++) {
    for (const j of [i % n < n - 1 ? i + 1 : -1, i + n < n * n ? i + n : -1]) {
      if (j >= 0 && regions[j] !== regions[i]) {
        touch[regions[i]].add(regions[j]);
        touch[regions[j]].add(regions[i]);
      }
    }
  }
  const colour = new Array<number>(count).fill(-1);
  for (let g = 0; g < count; g++) {
    const used = new Set([...touch[g]].map((h) => colour[h]));
    let c = 0;
    while (used.has(c)) c++;
    colour[g] = c;
  }
  return regions.map((g) => colour[g] % REGION_HUES.length);
}

/**
 * Overlay drawing the walls between the regions of a square grid as one stroked path, so corners and junctions
 * join cleanly (per-cell borders leave notches where a wall turns). Append it to a `.grid-board` after the cells.
 */
export function regionWalls(n: number, regions: ArrayLike<number>): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  let d = '';
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    if (c < n - 1 && regions[i + 1] !== regions[i]) d += `M${c + 1} ${r}v1`;
    if (r < n - 1 && regions[i + n] !== regions[i]) d += `M${c} ${r + 1}h1`;
  }
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'walls');
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

// Dark pages. PDF.js draws each page as usual, then every pixel is recoloured:
// lightness is turned around (white paper becomes a soft dark, black ink a
// soft light) while hue is kept, so a red line in a chart stays red. Strong
// colours keep most of their own lightness, so they still stand out on the
// dark page. Photos keep their colours, only a little dimmed. Pictures that
// are mostly white, such as charts saved as images and scanned line art, are
// treated like the rest of the page.
//
// The work is done in OKLab, where lightness matches what the eye sees. A
// lookup table makes it fast enough to run on every page as it is drawn.

/** The dark page for each background tone: the paper and the ink, as sRGB. */
export const DARK_PAGES: Record<string, { paper: string; ink: string }> = {
  linen: { paper: '#2a2824', ink: '#e4dfd5' },
  paper: { paper: '#28282a', ink: '#e2e2e0' },
  sepia: { paper: '#2e2922', ink: '#e6dac4' },
  mist: { paper: '#262a30', ink: '#dfe3e8' },
  sage: { paper: '#272b26', ink: '#dde3da' },
};

export function darkPageColors(tone: string): { paper: string; ink: string } {
  return DARK_PAGES[tone] ?? DARK_PAGES.paper;
}

/** How much photos are dimmed so they don't glare on a dark page. */
export const PHOTO_DIM = 0.88;

type Lab = [number, number, number];

function toLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function fromLinear(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

export function rgbToOklab(r: number, g: number, b: number): Lab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab to linear sRGB; values outside 0–1 are out of gamut. */
function oklabToLinear([L, a, b]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLab to sRGB bytes, lowering chroma (never lightness or hue) until the colour fits. */
export function oklabToRgb(lab: Lab): [number, number, number] {
  let rgb = oklabToLinear(lab);
  if (!inGamut(rgb)) {
    const [L, a, b] = lab;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
      const k = (lo + hi) / 2;
      if (inGamut(oklabToLinear([L, a * k, b * k]))) lo = k;
      else hi = k;
    }
    rgb = oklabToLinear([L, a * lo, b * lo]);
  }
  return rgb.map((v) => Math.round(255 * fromLinear(Math.min(1, Math.max(0, v))))) as [number, number, number];
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** One colour on a light page, recoloured for the dark page. */
export function darkColor(r: number, g: number, b: number, paper: Lab, ink: Lab): [number, number, number] {
  const [L, a, bb] = rgbToOklab(r, g, b);
  const t = Math.min(1, Math.max(0, L));
  // Black ink becomes the light ink, white paper the dark paper, and greys in between.
  const baseL = ink[0] + (paper[0] - ink[0]) * t;
  // Strong colours keep most of their own lightness, so yellow stays bright,
  // but never get so dark that they sink into the paper.
  const chroma = Math.hypot(a, bb);
  const strength = smoothstep(0.03, 0.16, chroma);
  const L2 = Math.max(baseL + (L - baseL) * 0.75 * strength, paper[0] + 0.36 * strength);
  // The tone's tint, strongest on the paper, and the colour itself, a touch calmer.
  const tintA = ink[1] + (paper[1] - ink[1]) * t;
  const tintB = ink[2] + (paper[2] - ink[2]) * t;
  return oklabToRgb([L2, a * 0.92 + tintA, bb * 0.92 + tintB]);
}

/** Colours are looked up by their top 6 bits per channel; greys exactly. */
const BITS = 6;
const LEVELS = 1 << BITS;
const SHIFT = 8 - BITS;

export interface DarkLut {
  gray: Uint8Array;
  color: Uint8Array;
}

const luts = new Map<string, DarkLut>();

/** The lookup table for a tone's dark page, built once and kept. */
export function darkLut(tone: string): DarkLut {
  const colors = darkPageColors(tone);
  const key = colors.paper + colors.ink;
  let lut = luts.get(key);
  if (!lut) {
    lut = buildDarkLut(colors);
    luts.set(key, lut);
  }
  return lut;
}

export function buildDarkLut({ paper, ink }: { paper: string; ink: string }): DarkLut {
  const p = rgbToOklab(...hexToRgb(paper));
  const k = rgbToOklab(...hexToRgb(ink));
  const gray = new Uint8Array(256 * 3);
  for (let v = 0; v < 256; v++) gray.set(darkColor(v, v, v, p, k), v * 3);
  const color = new Uint8Array(LEVELS ** 3 * 3);
  const level = (i: number) => Math.round((i * 255) / (LEVELS - 1));
  let o = 0;
  for (let r = 0; r < LEVELS; r++) {
    for (let g = 0; g < LEVELS; g++) {
      for (let b = 0; b < LEVELS; b++) {
        color.set(darkColor(level(r), level(g), level(b), p, k), o);
        o += 3;
      }
    }
  }
  return { gray, color };
}

/** A box on the canvas, in pixels: [left, top, right, bottom], right and bottom exclusive. */
export type PixelBox = [number, number, number, number];

/**
 * Whether the picture in a box is a photo (kept, slightly dimmed) rather than
 * a chart or drawing on a white background (recoloured with the page).
 */
export function isPhoto(data: Uint8ClampedArray, width: number, [x0, y0, x1, y1]: PixelBox): boolean {
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 2 || h < 2) return false;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 6000)));
  let total = 0;
  let white = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      total++;
      if (r >= 232 && g >= 232 && b >= 232 && Math.max(r, g, b) - Math.min(r, g, b) <= 24) white++;
    }
  }
  return white / total < 0.45;
}

/**
 * Recolours a drawn page for the dark page, in place. Photos in `photos` keep
 * their colours and are only dimmed.
 */
export function darkenPixels(data: Uint8ClampedArray, width: number, height: number, lut: DarkLut, photos: PixelBox[] = []): void {
  const { gray, color } = lut;
  const recolor = (from: number, to: number) => {
    for (let i = from; i < to; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const j = r === g && g === b ? r * 3 : (((r >> SHIFT) << (2 * BITS)) | ((g >> SHIFT) << BITS) | (b >> SHIFT)) * 3;
      const table = r === g && g === b ? gray : color;
      data[i] = table[j];
      data[i + 1] = table[j + 1];
      data[i + 2] = table[j + 2];
    }
  };
  const dim = (from: number, to: number) => {
    for (let i = from; i < to; i += 4) {
      data[i] *= PHOTO_DIM;
      data[i + 1] *= PHOTO_DIM;
      data[i + 2] *= PHOTO_DIM;
    }
  };
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    // The photos crossing this row, left to right, merged where they overlap.
    const spans: [number, number][] = [];
    for (const [x0, y0, x1, y1] of photos) if (y >= y0 && y < y1) spans.push([x0, x1]);
    spans.sort((p, q) => p[0] - q[0]);
    let x = 0;
    for (const [s0, s1] of spans) {
      if (s1 <= x) continue;
      const start = Math.max(x, s0);
      recolor(row + x * 4, row + start * 4);
      dim(row + start * 4, row + s1 * 4);
      x = s1;
    }
    recolor(row + x * 4, row + width * 4);
  }
}

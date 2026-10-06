import { describe, expect, it } from 'vitest';
import {
  DARK_PAGES,
  buildDarkLut,
  darkPageColors,
  darkenPixels,
  hexToRgb,
  isPhoto,
  rgbToOklab,
  type PixelBox,
} from '../src/shared/pageColors';

const lut = buildDarkLut(darkPageColors('paper'));

function darken(...colors: [number, number, number][]): [number, number, number][] {
  const data = new Uint8ClampedArray(colors.flatMap(([r, g, b]) => [r, g, b, 255]));
  darkenPixels(data, colors.length, 1, lut);
  return colors.map((_, i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
}

const lightness = (c: [number, number, number]) => rgbToOklab(...c)[0];
const hue = (c: [number, number, number]) => {
  const [, a, b] = rgbToOklab(...c);
  return (Math.atan2(b, a) * 180) / Math.PI;
};
const hueGap = (x: number, y: number) => Math.abs(((x - y + 540) % 360) - 180);

/** WCAG contrast ratio. */
function contrast(x: [number, number, number], y: [number, number, number]): number {
  const lum = (c: [number, number, number]) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

describe('dark pages', () => {
  it('turns white paper into the dark paper and black ink into the light ink', () => {
    const [paper, ink] = darken([255, 255, 255], [0, 0, 0]);
    expect(paper).toEqual(hexToRgb(DARK_PAGES.paper.paper));
    expect(ink).toEqual(hexToRgb(DARK_PAGES.paper.ink));
  });

  it('never uses pure black or pure white', () => {
    for (const c of darken([255, 255, 255], [0, 0, 0], [128, 128, 128])) {
      expect(Math.max(...c)).toBeLessThan(250);
      expect(Math.max(...c)).toBeGreaterThan(20);
    }
  });

  it('keeps text easy to read in every tone', () => {
    for (const tone of Object.keys(DARK_PAGES)) {
      const t = buildDarkLut(darkPageColors(tone));
      const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
      darkenPixels(data, 2, 1, t);
      expect(contrast([data[0], data[1], data[2]], [data[4], data[5], data[6]])).toBeGreaterThan(9);
    }
  });

  it('keeps the hue of coloured lines and lets them stand out from the paper', () => {
    const colors: [number, number, number][] = [
      [214, 39, 40], // red
      [31, 119, 180], // blue
      [44, 160, 44], // green
      [255, 127, 14], // orange
      [148, 103, 189], // purple
      [230, 200, 0], // yellow
    ];
    const paper = hexToRgb(DARK_PAGES.paper.paper);
    darken(...colors).forEach((out, i) => {
      expect(hueGap(hue(out), hue(colors[i]))).toBeLessThan(12);
      expect(contrast(out, paper)).toBeGreaterThan(3);
    });
  });

  it('turns lightness around, so light fills go dark and dark greys go light', () => {
    const [light, mid, dark] = darken([230, 230, 230], [128, 128, 128], [50, 50, 50]);
    expect(lightness(light)).toBeLessThan(lightness(mid));
    expect(lightness(mid)).toBeLessThan(lightness(dark));
  });

  it('keeps photos, only a little dimmed', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 200, 100, 50, 255, 255, 255, 255, 255]);
    darkenPixels(data, 3, 1, lut, [[1, 0, 2, 1]]);
    expect([data[4], data[5], data[6]]).toEqual([176, 88, 44]);
    expect([data[0], data[1], data[2]]).toEqual(hexToRgb(DARK_PAGES.paper.paper));
    expect([data[8], data[9], data[10]]).toEqual(hexToRgb(DARK_PAGES.paper.paper));
  });
});

describe('isPhoto', () => {
  const picture = (fill: (x: number, y: number) => [number, number, number]) => {
    const data = new Uint8ClampedArray(100 * 100 * 4);
    for (let y = 0; y < 100; y++)
      for (let x = 0; x < 100; x++) data.set([...fill(x, y), 255], (y * 100 + x) * 4);
    return data;
  };
  const all: PixelBox = [0, 0, 100, 100];

  it('treats a picture with a white background as a chart', () => {
    const chart = picture((x, y) => (Math.abs(x - y) < 3 ? [31, 119, 180] : [255, 255, 255]));
    expect(isPhoto(chart, 100, all)).toBe(false);
  });

  it('treats a picture full of colour as a photo', () => {
    const photo = picture((x, y) => [100 + x, 80 + y, 60]);
    expect(isPhoto(photo, 100, all)).toBe(true);
  });
});

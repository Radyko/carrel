import { darkLut, darkenPixels, isPhoto, type PixelBox } from '../../shared/pageColors';

/** What PDF.js passes with each drawn page: the page itself, or a sharper close-up of part of it. */
interface DrawnView {
  canvas?: HTMLCanvasElement | null;
  /** Where the pictures are, as corners in fractions of the page: [x1, y1, x2, y2, x3, y3] each. */
  imageCoordinates?: ArrayLike<number> | null;
  pageView?: { imageCoordinates?: ArrayLike<number> | null };
}

/** Marks a canvas that already shows the dark page, so the CSS can show it. */
export const DARK_CLASS = 'carrel-dark';

/** Which pictures on a page are photos, decided once on the whole page so close-ups agree. */
const photoChoices = new WeakMap<object, boolean[]>();

/** Recolours a page PDF.js has just drawn for the dark page. */
export function darkenDrawnPage(view: DrawnView, tone: string): void {
  const canvas = view.canvas;
  if (!canvas || !canvas.width || !canvas.height || canvas.classList.contains(DARK_CLASS)) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);

  // A close-up covers part of the page; its size and place are in its style.
  const close = view.pageView ? canvas.style : null;
  const part = (v: string | undefined, fallback: number) => (v ? parseFloat(v) / 100 : fallback);
  const left = close ? part(close.left, 0) : 0;
  const top = close ? part(close.top, 0) : 0;
  const across = close ? part(close.width, 1) : 1;
  const down = close ? part(close.height, 1) : 1;

  const coords = view.imageCoordinates ?? view.pageView?.imageCoordinates;
  const photos: PixelBox[] = [];
  const known = coords && close ? photoChoices.get(coords) : undefined;
  const choices: boolean[] = [];
  for (let i = 0; coords && i + 5 < coords.length; i += 6) {
    const [x1, y1, x2, y2, x3, y3] = Array.from({ length: 6 }, (_, k) => coords[i + k]);
    const xs = [x1, x2, x3, x2 + x3 - x1];
    const ys = [y1, y2, y3, y2 + y3 - y1];
    const px = (f: number) => Math.round(((f - left) / across) * width);
    const py = (f: number) => Math.round(((f - top) / down) * height);
    const box: PixelBox = [
      Math.max(0, px(Math.min(...xs))),
      Math.max(0, py(Math.min(...ys))),
      Math.min(width, px(Math.max(...xs))),
      Math.min(height, py(Math.max(...ys))),
    ];
    const visible = box[2] - box[0] > 1 && box[3] - box[1] > 1;
    const photo = known ? known[i / 6] : visible && isPhoto(image.data, width, box);
    choices.push(photo);
    if (visible && photo) photos.push(box);
  }
  if (coords && !close) photoChoices.set(coords as object, choices);

  darkenPixels(image.data, width, height, darkLut(tone), photos);
  ctx.putImageData(image, 0, 0);
  canvas.classList.add(DARK_CLASS);
}

// Runs landmark detection on real PDFs and prints what it finds. Skipped
// unless CARREL_SAMPLE_PDFS names a folder of PDFs:
//
//   CARREL_SAMPLE_PDFS=~/papers npx vitest run tests/landmarks.pdfs.test.ts

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readLandmarks } from '../src/renderer/landmarks';
import { LANDMARK_KINDS } from '../src/shared/landmarks';

const dir = process.env.CARREL_SAMPLE_PDFS;

describe.skipIf(!dir)('landmarks in sample PDFs', () => {
  const files = dir ? fs.readdirSync(dir).filter((f) => f.endsWith('.pdf')) : [];
  for (const file of files) {
    it(file, async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const data = new Uint8Array(fs.readFileSync(path.join(dir!, file)));
      const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
      const t = performance.now();
      const found = await readLandmarks(doc as never);
      const ms = Math.round(performance.now() - t);
      const show = (r: { page: number; rect: number[] }) => `p${r.page} [${r.rect.map((n) => n.toFixed(2)).join(' ')}]`;
      const report = LANDMARK_KINDS.map((k) => {
        const rs = found[k];
        const detail = k === 'headings' || k === 'figures' ? rs.slice(0, 3).map(show).join(', ') + (rs.length > 3 ? ' …' : '') : rs.map(show).join(', ');
        return `  ${k.padEnd(13)} ${String(rs.length).padStart(2)}  ${detail}`;
      });
      console.log(`${file} (${doc.numPages} pages, ${ms} ms)\n${report.join('\n')}`);
      expect(found).toBeTruthy();
    }, 60_000);
  }
});

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseGuideText } from '../src/main/storage/guideFile';

export const DEFAULT_GUIDE_PATH = path.join(__dirname, '..', 'guide', 'default-guide.yaml');

export async function defaultGuide() {
  return parseGuideText(await fs.readFile(DEFAULT_GUIDE_PATH, 'utf8'));
}

export async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'carrel-test-'));
}

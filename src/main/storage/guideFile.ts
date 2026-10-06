import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { GuideError, parseGuide, type Guide } from '../../shared/guide';
import { readTextIfExists, writeFileAtomic } from './files';

export const GUIDE_FILE = 'guide.yaml';

/**
 * SHA-256 hashes of default guides from earlier versions of Carrel. A guide
 * file matching one of these was never edited, so it is safe to replace with
 * the current default; that is how improvements to the default reach people.
 * Add the hash of the current default here whenever it changes.
 */
const PREVIOUS_DEFAULTS = new Set([
  'ce2569ca27d91f4d8610b5cd452e2f69c2a0a1c2a5e36a70ac59a5c87f8d96d1', // 0.1.0
  '214b9ef3cca378f6d03515dc4fbca9f66d2fe7b5f7de0387db551549bf38f38d', // 0.2.0
  '81450d9d85c844ab900ee7a56876ddadb964de9761486f4ae662adbea5d41d67', // 0.3.0 to 0.6.3
]);

export function guideHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export interface LoadedGuide {
  guide: Guide;
  /** Where the user's guide lives (whether or not it exists). */
  path: string;
  /** Set when the user's guide could not be used and the built-in one is in use. */
  problem: string | null;
  missing: boolean;
}

export function parseGuideText(text: string): Guide {
  const doc = YAML.parseDocument(text);
  if (doc.errors.length) {
    const e = doc.errors[0];
    const line = e.linePos?.[0]?.line;
    const message = e.message.split('\n')[0].replace(/\s*at line \d+, column \d+:?$/, '');
    throw new GuideError(`${line ? `Line ${line}: ` : ''}${message}.`.replace(/\.\.$/, '.'));
  }
  return parseGuide(doc.toJS());
}

export async function readDefaultGuideText(defaultGuidePath: string): Promise<string> {
  return fs.readFile(defaultGuidePath, 'utf8');
}

/**
 * Loads the guide from the library folder. On the first run for a library the
 * built-in guide is copied there. If the file is missing or invalid, the
 * built-in guide is used and the problem is reported.
 */
export async function loadGuide(
  libraryRoot: string,
  defaultGuidePath: string,
  options: { install: boolean },
): Promise<LoadedGuide> {
  const defaultText = await readDefaultGuideText(defaultGuidePath);
  const builtIn = parseGuideText(defaultText);
  const guidePath = path.join(libraryRoot, GUIDE_FILE);
  let text = await readTextIfExists(guidePath);
  if (text === null && options.install) {
    await fs.mkdir(libraryRoot, { recursive: true });
    await writeFileAtomic(guidePath, defaultText);
    text = defaultText;
  }
  if (text !== null && text !== defaultText && PREVIOUS_DEFAULTS.has(guideHash(text))) {
    await writeFileAtomic(guidePath, defaultText);
    text = defaultText;
  }
  if (text === null) {
    return {
      guide: builtIn,
      path: guidePath,
      problem: `Your guide file is missing, so Carrel is using its built-in guide.`,
      missing: true,
    };
  }
  try {
    return { guide: parseGuideText(text), path: guidePath, problem: null, missing: false };
  } catch (err) {
    const why = err instanceof GuideError ? err.message : String(err);
    return {
      guide: builtIn,
      path: guidePath,
      problem: `Your guide file could not be used, so Carrel is using its built-in guide. ${why}`,
      missing: false,
    };
  }
}

export async function restoreDefaultGuide(libraryRoot: string, defaultGuidePath: string): Promise<void> {
  await fs.mkdir(libraryRoot, { recursive: true });
  await writeFileAtomic(path.join(libraryRoot, GUIDE_FILE), await readDefaultGuideText(defaultGuidePath));
}

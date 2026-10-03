import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { GuideError, parseGuide, type Guide } from '../../shared/guide';
import { readTextIfExists, writeFileAtomic } from './files';

export const GUIDE_FILE = 'guide.yaml';

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

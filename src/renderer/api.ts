import type { CarrelApi } from '../shared/api';

declare global {
  interface Window {
    carrel: CarrelApi;
  }
}

export const api: CarrelApi = window.carrel;

export function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Electron prefixes errors from the main process; the prefix is noise.
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

import { describe, expect, it } from 'vitest';
import { normalizeLook, pagesAreDark, savedLook } from '../src/shared/look';
import { compareVersions } from '../src/shared/version';

describe('compareVersions', () => {
  it('orders by number, not text', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersions('0.3.0', '0.4.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('v1.2', '1.2.0')).toBe(0);
  });
  it('puts a pre-release before its release', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBe(1);
  });
});

describe('normalizeLook', () => {
  it('falls back to the defaults for anything unknown', () => {
    expect(normalizeLook(undefined)).toEqual({ tone: 'linen', accent: '#00356b', pages: 'match' });
    expect(normalizeLook({ tone: 'neon', accent: 'red', pages: 'sideways' as never })).toEqual({
      tone: 'linen',
      accent: '#00356b',
      pages: 'match',
    });
  });
  it('keeps a known tone, any hex colour and a page choice', () => {
    expect(normalizeLook({ tone: 'sepia', accent: '#AA00FF', pages: 'dark' })).toEqual({
      tone: 'sepia',
      accent: '#aa00ff',
      pages: 'dark',
    });
  });
});

describe('savedLook', () => {
  it('moves people who kept the old defaults to the new ones', () => {
    expect(savedLook({ tone: 'paper', accent: '#2e7d5b' })).toEqual({
      look: { tone: 'linen', accent: '#00356b', pages: 'match' },
      toneChosen: false,
      accentChosen: false,
    });
  });
  it('keeps what someone chose', () => {
    expect(savedLook({ tone: 'sepia', accent: '#8e4ec6', pages: 'light' }).look).toEqual({
      tone: 'sepia',
      accent: '#8e4ec6',
      pages: 'light',
    });
    expect(savedLook({ tone: 'paper', accent: '#2e7d5b' }, { tone: true, accent: true }).look).toEqual({
      tone: 'paper',
      accent: '#2e7d5b',
      pages: 'match',
    });
  });
});

describe('pagesAreDark', () => {
  it('follows the mode, or the choice', () => {
    expect(pagesAreDark('match', true)).toBe(true);
    expect(pagesAreDark('match', false)).toBe(false);
    expect(pagesAreDark('dark', false)).toBe(true);
    expect(pagesAreDark('light', true)).toBe(false);
  });
});

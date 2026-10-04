import { describe, expect, it } from 'vitest';
import { normalizeLook } from '../src/shared/look';
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
    expect(normalizeLook(undefined)).toEqual({ tone: 'paper', accent: '#2e7d5b' });
    expect(normalizeLook({ tone: 'neon', accent: 'red' })).toEqual({ tone: 'paper', accent: '#2e7d5b' });
  });
  it('keeps a known tone and any hex colour', () => {
    expect(normalizeLook({ tone: 'sepia', accent: '#AA00FF' })).toEqual({ tone: 'sepia', accent: '#aa00ff' });
  });
});

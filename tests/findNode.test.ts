import { describe, expect, it } from 'vitest';
import { candidateDirs } from '../src/main/findNode';

describe('candidateDirs', () => {
  const dirs = (tree: Record<string, string[]>, env: NodeJS.ProcessEnv = {}) =>
    candidateDirs('/Users/a', env, (d) => tree[d] ?? []);

  it('looks in version managers first, then Homebrew and the standard places', () => {
    const list = dirs({});
    expect(list.indexOf('/Users/a/.volta/bin')).toBeLessThan(list.indexOf('/opt/homebrew/bin'));
    expect(list).toContain('/usr/local/bin');
  });

  it('prefers the newest nvm version, comparing numbers rather than text', () => {
    const list = dirs({ '/Users/a/.nvm/versions/node': ['v9.11.2', 'v20.11.0', 'v18.19.1', '.DS_Store'] });
    const nvm = list.filter((d) => d.includes('.nvm'));
    expect(nvm).toEqual([
      '/Users/a/.nvm/versions/node/v20.11.0/bin',
      '/Users/a/.nvm/versions/node/v18.19.1/bin',
      '/Users/a/.nvm/versions/node/v9.11.2/bin',
    ]);
  });

  it('follows NVM_DIR when it is set', () => {
    const list = dirs({ '/opt/nvm/versions/node': ['v22.1.0'] }, { NVM_DIR: '/opt/nvm' });
    expect(list).toContain('/opt/nvm/versions/node/v22.1.0/bin');
  });
});

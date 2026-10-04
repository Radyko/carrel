/** Compares two version numbers like 1.2.3; a pre-release (1.2.3-beta) comes before its release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [main, pre] = v.trim().replace(/^v/, '').split('-', 2);
    return { parts: main.split('.').map((n) => Number.parseInt(n, 10) || 0), pre: pre ?? null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.parts.length, y.parts.length); i++) {
    const d = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre < y.pre ? -1 : 1;
}

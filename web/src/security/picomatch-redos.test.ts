import { describe, expect, it } from 'vitest';
import picomatch from 'picomatch';

describe('picomatch CVE-2026-112366 repeated-extglob regression', () => {
  it('does not emit nested unbounded quantifiers for vulnerable patterns', () => {
    for (const pattern of ['+(*)', '+(*a)', '*(*a)', '+(a*)', '+(a*b)', '*(*.js)']) {
      expect(picomatch.makeRe(pattern).source).not.toMatch(/\)[+*]/);
    }
  });

  it('rejects crafted non-matching input without catastrophic backtracking', () => {
    const input = 'a'.repeat(50) + 'b';
    for (const pattern of ['+(*a)', '*(*a)', '+(*a)c', 'x+(*a)']) {
      const started = Date.now();
      expect(picomatch.isMatch(input, pattern)).toBe(false);
      expect(Date.now() - started).toBeLessThan(500);
    }
  });

  it('preserves ordinary matching semantics', () => {
    expect(picomatch.isMatch('abc', '+(*)c')).toBe(true);
    expect(picomatch.isMatch('aaa', '+(*a)')).toBe(true);
    expect(picomatch.isMatch('a.a', '+(*a)')).toBe(true);
    expect(picomatch.isMatch('ab', '+(*a)')).toBe(false);
    expect(picomatch.isMatch('axbayb', '+(a*b)')).toBe(true);
    expect(picomatch.isMatch('axbay', '+(a*b)')).toBe(false);
    expect(picomatch.isMatch('foo.js', '*(*.js)')).toBe(true);
    expect(picomatch.isMatch('foo.ts', '*(*.js)')).toBe(false);
  });
});

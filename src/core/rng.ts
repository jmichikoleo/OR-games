import type { RNG } from './types'

/** mulberry32 — small, fast, and seeded so every instance has a shareable id. */
export function makeRng(seed: number): RNG {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
  }
}

/** Seeds are shown in the UI so two people can play the same instance. */
export function seedFromString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0
}

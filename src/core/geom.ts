export interface Pt {
  x: number
  y: number
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

export function tourLength(pts: readonly Pt[], order: readonly number[]): number {
  if (order.length < 2) return 0
  let total = 0
  for (let i = 0; i < order.length; i++) {
    total += dist(pts[order[i]], pts[order[(i + 1) % order.length]])
  }
  return total
}

/** Path length without returning to the start — for open routes. */
export function pathLength(pts: readonly Pt[], order: readonly number[]): number {
  let total = 0
  for (let i = 0; i + 1 < order.length; i++) total += dist(pts[order[i]], pts[order[i + 1]])
  return total
}

export function nearestIndex(p: Pt, pts: readonly Pt[], within = Infinity): number {
  let best = -1
  let bestD = within
  for (let i = 0; i < pts.length; i++) {
    const d = dist(p, pts[i])
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** Scatter points with a minimum separation so nothing overlaps visually. */
export function scatter(
  n: number,
  w: number,
  h: number,
  pad: number,
  minGap: number,
  rnd: () => number,
): Pt[] {
  const pts: Pt[] = []
  let guard = 0
  while (pts.length < n && guard++ < n * 400) {
    const p = { x: pad + rnd() * (w - 2 * pad), y: pad + rnd() * (h - 2 * pad) }
    if (pts.every((q) => dist(p, q) >= minGap)) pts.push(p)
  }
  return pts
}

/** Distance from a point to a line segment — used to click edges, not nodes. */
export function pointSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return dist(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Union-find, for spanning trees and connectivity checks. */
export function makeUnionFind(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  return {
    find,
    /** Returns false when the two were already connected — i.e. this closes a cycle. */
    union(a: number, b: number): boolean {
      const ra = find(a)
      const rb = find(b)
      if (ra === rb) return false
      parent[ra] = rb
      return true
    },
    components(): number {
      let c = 0
      for (let i = 0; i < n; i++) if (find(i) === i) c++
      return c
    },
  }
}

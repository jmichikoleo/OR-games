import { type Pt, dist } from './geom'

export interface Edge {
  a: number
  b: number
  len: number
}

/** Proper crossing only — segments that merely share an endpoint don't count. */
export function segmentsCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (a: Pt, b: Pt, c: Pt) => (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x)
  const d1 = d(p3, p4, p1)
  const d2 = d(p3, p4, p2)
  const d3 = d(p1, p2, p3)
  const d4 = d(p1, p2, p4)
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0)
}

/**
 * A readable map: the Euclidean MST first (it never self-crosses, and it
 * guarantees connectivity), then the shortest extra edges that don't cross
 * anything already placed. The result is planar, so no edge ever passes under
 * another and the player can see the whole structure.
 */
export function buildPlanarGraph(pts: Pt[], targetEdges: number, maxEdge: number): Edge[] {
  const cand: Edge[] = []
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      cand.push({ a: i, b: j, len: dist(pts[i], pts[j]) })
    }
  }
  cand.sort((x, y) => x.len - y.len)

  const parent = pts.map((_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  const edges: Edge[] = []

  for (const e of cand) {
    const ra = find(e.a)
    const rb = find(e.b)
    if (ra !== rb) {
      parent[ra] = rb
      edges.push(e)
    }
  }

  for (const e of cand) {
    if (edges.length >= targetEdges) break
    if (e.len > maxEdge) continue
    if (edges.some((x) => x.a === e.a && x.b === e.b)) continue
    const crosses = edges.some(
      (x) =>
        x.a !== e.a &&
        x.a !== e.b &&
        x.b !== e.a &&
        x.b !== e.b &&
        segmentsCross(pts[x.a], pts[x.b], pts[e.a], pts[e.b]),
    )
    if (!crosses) edges.push(e)
  }

  return edges
}

/** node index -> ids of the edges touching it */
export function adjacency(n: number, edges: Edge[]): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => [])
  edges.forEach((e, i) => {
    adj[e.a].push(i)
    adj[e.b].push(i)
  })
  return adj
}

export function edgeBetween(edges: Edge[], adj: number[][], u: number, v: number): number {
  for (const e of adj[u]) {
    const ed = edges[e]
    if (ed.a === v || ed.b === v) return e
  }
  return -1
}

export const otherEnd = (e: Edge, v: number): number => (e.a === v ? e.b : e.a)

/** The two nodes furthest apart — a start and a finish that span the map. */
export function farthestPair(pts: Pt[]): [number, number] {
  let best: [number, number] = [0, pts.length - 1]
  let bestD = -1
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = dist(pts[i], pts[j])
      if (d > bestD) {
        bestD = d
        best = [i, j]
      }
    }
  }
  return best
}

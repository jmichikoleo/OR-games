export interface Arc {
  from: number
  to: number
  cap: number
  cost: number
}

/**
 * Min-cost flow by successive shortest paths. Pushes up to `target` units from
 * source to sink as cheaply as possible, or as much as will go when no target
 * is given. Returns how much ended up on each arc, in the order they were
 * handed in. Exact.
 */
export function minCostFlow(
  n: number,
  arcs: Arc[],
  source: number,
  sink: number,
  target = Infinity,
): number[] {
  const from: number[] = []
  const to: number[] = []
  const cap: number[] = []
  const price: number[] = []

  arcs.forEach((a) => {
    from.push(a.from, a.to)
    to.push(a.to, a.from)
    cap.push(a.cap, 0)
    price.push(a.cost, -a.cost)
  })

  let moved = 0
  while (moved < target) {
    const dist = new Float64Array(n).fill(Infinity)
    const prev = new Int32Array(n).fill(-1)
    dist[source] = 0
    for (let pass = 0; pass < n; pass++) {
      let changed = false
      for (let e = 0; e < to.length; e++) {
        if (cap[e] <= 0 || dist[from[e]] === Infinity) continue
        const alt = dist[from[e]] + price[e]
        if (alt < dist[to[e]] - 1e-9) {
          dist[to[e]] = alt
          prev[to[e]] = e
          changed = true
        }
      }
      if (!changed) break
    }
    if (dist[sink] === Infinity) break

    let push = target - moved
    for (let v = sink; v !== source; v = from[prev[v]]) push = Math.min(push, cap[prev[v]])
    for (let v = sink; v !== source; v = from[prev[v]]) {
      cap[prev[v]] -= push
      cap[prev[v] ^ 1] += push
    }
    moved += push
  }

  // Whatever came back on the reverse edge is what actually flowed.
  return arcs.map((_, i) => cap[i * 2 + 1])
}

/** The transportation special case. Supply feeds demand and the two must match. */
export function minCostPlan(
  supply: number[],
  demand: number[],
  cost: number[][],
): number[][] {
  const w = supply.length
  const d = demand.length
  const n = w + d + 2
  const src = 0
  const sink = n - 1
  const arcs: Arc[] = []

  supply.forEach((s, i) => arcs.push({ from: src, to: 1 + i, cap: s, cost: 0 }))
  const shipStart = arcs.length
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) {
      arcs.push({ from: 1 + i, to: 1 + w + j, cap: 1e9, cost: cost[i][j] })
    }
  }
  demand.forEach((x, j) => arcs.push({ from: 1 + w + j, to: sink, cap: x, cost: 0 }))

  const flow = minCostFlow(n, arcs, src, sink)
  const plan: number[][] = Array.from({ length: w }, () => new Array(d).fill(0))
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) plan[i][j] = flow[shipStart + i * d + j]
  }
  return plan
}

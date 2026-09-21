import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, dist, nearestIndex, scatter } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const PRIZES = 11

interface Instance {
  /** nodes[0] is the depot; the rest carry prizes. */
  nodes: Pt[]
  scores: number[]
  budget: number
}
/** Prize-node indices in visit order. The depot legs are implicit. */
type Solution = number[]

function routeLength(inst: Instance, sol: Solution): number {
  if (sol.length === 0) return 0
  let total = dist(inst.nodes[0], inst.nodes[sol[0]])
  for (let i = 0; i + 1 < sol.length; i++) {
    total += dist(inst.nodes[sol[i]], inst.nodes[sol[i + 1]])
  }
  return total + dist(inst.nodes[sol[sol.length - 1]], inst.nodes[0])
}

const collected = (inst: Instance, sol: Solution) =>
  sol.reduce((n, i) => n + inst.scores[i], 0)

/**
 * Held-Karp again, but keeping the cheapest way to reach every (subset, last)
 * pair and then taking the highest-scoring subset that still fits the budget.
 * Exact at 11 prizes.
 */
function bestRoute(inst: Instance): Solution {
  const m = inst.nodes.length - 1
  const full = 1 << m
  const d: number[][] = inst.nodes.map((a) => inst.nodes.map((b) => dist(a, b)))
  const dp = new Float64Array(full * m).fill(Infinity)
  const par = new Int16Array(full * m).fill(-1)

  for (let j = 0; j < m; j++) dp[(1 << j) * m + j] = d[0][j + 1]

  for (let mask = 1; mask < full; mask++) {
    for (let j = 0; j < m; j++) {
      if (!(mask & (1 << j))) continue
      const cur = dp[mask * m + j]
      if (cur === Infinity) continue
      for (let k = 0; k < m; k++) {
        if (mask & (1 << k)) continue
        const nm = mask | (1 << k)
        const cost = cur + d[j + 1][k + 1]
        if (cost < dp[nm * m + k]) {
          dp[nm * m + k] = cost
          par[nm * m + k] = j
        }
      }
    }
  }

  const maskScore = (mask: number) => {
    let s = 0
    for (let j = 0; j < m; j++) if (mask & (1 << j)) s += inst.scores[j + 1]
    return s
  }

  let bestMask = 0
  let bestEnd = -1
  let bestScore = 0
  let bestLen = Infinity
  for (let mask = 1; mask < full; mask++) {
    const s = maskScore(mask)
    if (s < bestScore) continue
    for (let j = 0; j < m; j++) {
      if (!(mask & (1 << j))) continue
      const total = dp[mask * m + j] + d[j + 1][0]
      if (total > inst.budget) continue
      // Prefer more points; break ties on the shorter route.
      if (s > bestScore || total < bestLen) {
        bestScore = s
        bestLen = total
        bestMask = mask
        bestEnd = j
      }
    }
  }

  if (bestEnd < 0) return []
  const order: number[] = []
  let mask = bestMask
  let j = bestEnd
  while (j !== -1) {
    order.push(j + 1)
    const p = par[mask * m + j]
    mask ^= 1 << j
    j = p
  }
  return order.reverse()
}

export const orienteering: Minigame<Instance, Solution> = {
  id: 'orienteering',
  title: 'Prize Run',
  problem: 'Orienteering',
  family: 'routing',
  blurb: 'Collect as many points as you can and be back at the depot before the fuel runs out. You cannot visit everything.',
  howTo: 'Click checkpoints to add them to the run. Click one already on the route to cut back to it. The bar up top is your fuel.',
  objective: 'max',
  unit: 'pts',

  generate(rng: RNG): Instance {
    const nodes = scatter(PRIZES + 1, VW, VH, 75, 108, rng.next)
    const scores = nodes.map(() => 5 + rng.int(21))
    scores[0] = 0

    // Budget is half a greedy full tour: enough for a real route, never enough
    // for every checkpoint.
    const seen = new Set<number>([0])
    let cur = 0
    let nn = 0
    while (seen.size < nodes.length) {
      let best = -1
      let bestD = Infinity
      for (let i = 0; i < nodes.length; i++) {
        if (seen.has(i)) continue
        const dd = dist(nodes[cur], nodes[i])
        if (dd < bestD) {
          bestD = dd
          best = i
        }
      }
      nn += bestD
      seen.add(best)
      cur = best
    }
    nn += dist(nodes[cur], nodes[0])

    return { nodes, scores, budget: Math.round(nn * 0.5) }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const len = routeLength(inst, sol)
    if (len > inst.budget) {
      return {
        value: 0,
        feasible: false,
        note: `Over fuel by ${Math.round(len - inst.budget)} km. Drop a checkpoint.`,
      }
    }
    return {
      value: collected(inst, sol),
      feasible: true,
      note: `${Math.round(len)} of ${inst.budget} km used · ${sol.length} checkpoints.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestRoute(inst), label: 'Held-Karp DP', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let hover = -1
    let sol: Solution = api.current()
    let ref: Solution | null = null

    function polyline(ctx: CanvasRenderingContext2D, route: Solution) {
      ctx.beginPath()
      ctx.moveTo(inst.nodes[0].x, inst.nodes[0].y)
      route.forEach((i) => ctx.lineTo(inst.nodes[i].x, inst.nodes[i].y))
      ctx.lineTo(inst.nodes[0].x, inst.nodes[0].y)
      ctx.stroke()
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)

      // Fuel gauge.
      const len = routeLength(inst, sol)
      const frac = Math.min(1, len / inst.budget)
      const bx = 60
      const bw = VW - 120
      ctx.save()
      ctx.fillStyle = 'rgba(255,255,255,0.07)'
      ctx.beginPath()
      ctx.roundRect(bx, 22, bw, 12, 6)
      ctx.fill()
      ctx.fillStyle = len > inst.budget ? '#f87171' : accent
      ctx.beginPath()
      ctx.roundRect(bx, 22, Math.max(4, bw * frac), 12, 6)
      ctx.fill()
      ctx.restore()

      if (ref) {
        ctx.save()
        ctx.setLineDash([9, 9])
        ctx.strokeStyle = 'rgba(255,255,255,0.42)'
        ctx.lineWidth = 2
        polyline(ctx, ref)
        ctx.restore()
      }

      if (sol.length) {
        ctx.save()
        ctx.strokeStyle = accent
        ctx.lineWidth = 3.5
        ctx.lineJoin = 'round'
        polyline(ctx, sol)
        ctx.restore()
      }

      // Depot.
      const dp = inst.nodes[0]
      ctx.save()
      ctx.translate(dp.x, dp.y)
      ctx.rotate(Math.PI / 4)
      ctx.beginPath()
      ctx.roundRect(-14, -14, 28, 28, 4)
      ctx.fillStyle = accent
      ctx.fill()
      ctx.restore()

      inst.nodes.forEach((p, i) => {
        if (i === 0) return
        const pos = sol.indexOf(i)
        const taken = pos >= 0
        const r = 11 + inst.scores[i] * 0.45
        ctx.save()
        if (i === hover && !taken) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 10, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = taken ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = taken ? accent : 'rgba(255,255,255,0.4)'
        ctx.stroke()
        ctx.fillStyle = taken ? '#0b0d11' : 'rgba(255,255,255,0.72)'
        ctx.font = '700 14px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(inst.scores[i]), p.x, p.y + 0.5)
        ctx.restore()
      })
    }

    const onMove = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      let next = nearestIndex(v, inst.nodes, 42)
      if (next === 0) next = -1
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next > 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = nearestIndex(s.toVirtual(ev), inst.nodes, 42)
      if (hit <= 0) return
      const at = sol.indexOf(hit)
      api.commit(at >= 0 ? sol.slice(0, at) : [...sol, hit])
    }

    s.canvas.addEventListener('pointermove', onMove)
    s.canvas.addEventListener('pointerdown', onClick)
    s.onResize(() => draw(sol, ref))

    return {
      draw,
      destroy() {
        s.canvas.removeEventListener('pointermove', onMove)
        s.canvas.removeEventListener('pointerdown', onClick)
        s.destroy()
      },
    }
  },
}

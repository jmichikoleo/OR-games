import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, dist, nearestIndex, scatter, tourLength } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const N = 13

interface Instance {
  pts: Pt[]
}
type Solution = number[]

/**
 * Held-Karp. Exact, and at n=13 it runs in a few million operations —
 * which means the player is scored against the true optimum, not a heuristic.
 */
function heldKarp(pts: Pt[]): number[] {
  const n = pts.length
  const full = 1 << n
  const INF = Infinity
  const dp = new Float64Array(full * n).fill(INF)
  const parent = new Int16Array(full * n).fill(-1)
  const d: number[][] = pts.map((a) => pts.map((b) => dist(a, b)))

  dp[(1 << 0) * n + 0] = 0
  for (let mask = 1; mask < full; mask++) {
    if (!(mask & 1)) continue
    for (let j = 0; j < n; j++) {
      const cur = dp[mask * n + j]
      if (cur === INF || !(mask & (1 << j))) continue
      for (let k = 1; k < n; k++) {
        if (mask & (1 << k)) continue
        const next = mask | (1 << k)
        const cost = cur + d[j][k]
        if (cost < dp[next * n + k]) {
          dp[next * n + k] = cost
          parent[next * n + k] = j
        }
      }
    }
  }

  let bestEnd = 1
  let best = INF
  const last = full - 1
  for (let j = 1; j < n; j++) {
    const total = dp[last * n + j] + d[j][0]
    if (total < best) {
      best = total
      bestEnd = j
    }
  }

  const order: number[] = []
  let mask = last
  let j = bestEnd
  while (j !== -1) {
    order.push(j)
    const p = parent[mask * n + j]
    mask ^= 1 << j
    j = p
  }
  return order.reverse()
}

export const tsp: Minigame<Instance, Solution> = {
  id: 'tsp',
  title: 'Milk Run',
  problem: 'Travelling Salesman Problem',
  family: 'routing',
  blurb: 'Visit every city once and come home, on the shortest possible loop.',
  howTo: 'Click cities in the order you want to visit them. Click a city already on the route to cut back to it.',
  objective: 'min',
  unit: 'km',

  generate(rng: RNG): Instance {
    return { pts: scatter(N, VW, VH, 70, 110, rng.next) }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const left = inst.pts.length - sol.length
    if (left > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${left} ${left === 1 ? 'city' : 'cities'} still unvisited.`,
      }
    }
    return {
      value: tourLength(inst.pts, sol),
      feasible: true,
      note: 'Tour complete. Every city visited exactly once.',
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: heldKarp(inst.pts), label: 'Held-Karp', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let hover = -1
    let sol: Solution = api.current()
    let ref: Solution | null = null

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)

      if (ref) {
        ctx.save()
        ctx.setLineDash([9, 9])
        ctx.strokeStyle = 'rgba(255,255,255,0.42)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ref.forEach((idx, i) => {
          const p = inst.pts[idx]
          if (i === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        })
        ctx.closePath()
        ctx.stroke()
        ctx.restore()
      }

      if (sol.length > 1) {
        ctx.save()
        ctx.strokeStyle = accent
        ctx.lineWidth = 3.5
        ctx.lineJoin = 'round'
        ctx.beginPath()
        sol.forEach((idx, i) => {
          const p = inst.pts[idx]
          if (i === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        })
        if (sol.length === inst.pts.length) ctx.closePath()
        ctx.stroke()
        ctx.restore()
      }

      inst.pts.forEach((p, i) => {
        const pos = sol.indexOf(i)
        const visited = pos >= 0
        ctx.save()
        if (i === hover && !visited) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 26, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, 15, 0, Math.PI * 2)
        ctx.fillStyle = visited ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = visited ? accent : 'rgba(255,255,255,0.45)'
        ctx.stroke()
        ctx.fillStyle = visited ? '#0b0d11' : 'rgba(255,255,255,0.7)'
        ctx.font = '700 15px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(visited ? String(pos + 1) : '', p.x, p.y + 0.5)
        ctx.restore()
      })
    }

    const onMove = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      const next = nearestIndex(v, inst.pts, 40)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      const hit = nearestIndex(v, inst.pts, 40)
      if (hit < 0) return
      const at = sol.indexOf(hit)
      // Clicking a city already on the route rewinds to just before it.
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

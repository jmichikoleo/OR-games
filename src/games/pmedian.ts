import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, dist, nearestIndex, scatter } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const P = 3
const SITES = 10
const DEMANDS = 26

interface Instance {
  demands: Pt[]
  weights: number[]
  sites: Pt[]
  p: number
}
type Solution = number[]

const CLUSTER = ['#06b6d4', '#f472b6', '#facc15', '#a78bfa', '#34d399']

function cost(inst: Instance, open: readonly number[]): number {
  if (open.length === 0) return Infinity
  let total = 0
  for (let i = 0; i < inst.demands.length; i++) {
    let best = Infinity
    for (const s of open) {
      const d = dist(inst.demands[i], inst.sites[s])
      if (d < best) best = d
    }
    total += best * inst.weights[i]
  }
  return total
}

function assign(inst: Instance, open: readonly number[]): number[] {
  return inst.demands.map((d) => {
    let best = -1
    let bestD = Infinity
    for (const s of open) {
      const v = dist(d, inst.sites[s])
      if (v < bestD) {
        bestD = v
        best = s
      }
    }
    return best
  })
}

/** C(10,3) = 120 combinations. Enumerating them is exact and instant. */
function bestSubset(inst: Instance): number[] {
  const m = inst.sites.length
  let best: number[] = []
  let bestCost = Infinity
  const combo: number[] = []
  const walk = (start: number) => {
    if (combo.length === inst.p) {
      const c = cost(inst, combo)
      if (c < bestCost) {
        bestCost = c
        best = [...combo]
      }
      return
    }
    for (let i = start; i < m; i++) {
      combo.push(i)
      walk(i + 1)
      combo.pop()
    }
  }
  walk(0)
  return best
}

export const pmedian: Minigame<Instance, Solution> = {
  id: 'pmedian',
  title: 'Three Depots',
  problem: 'p-Median',
  family: 'location',
  blurb: 'Open 3 depots out of 10 candidate sites so the weighted travel of every customer is as small as possible.',
  howTo: 'Click a square site to open or close it. Bigger circles are heavier customers, so they pull harder.',
  objective: 'min',
  unit: 'wkm',

  generate(rng: RNG): Instance {
    const demands = scatter(DEMANDS, VW, VH, 60, 60, rng.next)
    const sites = scatter(SITES, VW, VH, 90, 150, rng.next)
    return {
      demands,
      weights: demands.map(() => 1 + rng.int(4)),
      sites,
      p: P,
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    if (sol.length < inst.p) {
      const left = inst.p - sol.length
      return { value: 0, feasible: false, note: `Open ${left} more ${left === 1 ? 'depot' : 'depots'}.` }
    }
    return {
      value: cost(inst, sol),
      feasible: true,
      note: `${inst.p} depots open. Every customer routes to its nearest one.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestSubset(inst), label: 'exhaustive', exact: true }
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
      clearBoard(ctx, VW, VH)
      const owner = sol.length ? assign(inst, sol) : inst.demands.map(() => -1)
      const colorFor = (site: number) => CLUSTER[Math.max(0, sol.indexOf(site)) % CLUSTER.length]

      // Assignment spokes, drawn first so markers sit on top.
      ctx.save()
      ctx.lineWidth = 1.5
      inst.demands.forEach((d, i) => {
        const o = owner[i]
        if (o < 0) return
        ctx.strokeStyle = colorFor(o) + '55'
        ctx.beginPath()
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(inst.sites[o].x, inst.sites[o].y)
        ctx.stroke()
      })
      ctx.restore()

      inst.demands.forEach((d, i) => {
        const o = owner[i]
        ctx.beginPath()
        ctx.arc(d.x, d.y, 4 + inst.weights[i] * 2.2, 0, Math.PI * 2)
        ctx.fillStyle = o < 0 ? 'rgba(255,255,255,0.28)' : colorFor(o)
        ctx.fill()
      })

      inst.sites.forEach((p, i) => {
        const open = sol.includes(i)
        const isRef = !!ref && ref.includes(i)
        ctx.save()
        ctx.translate(p.x, p.y)
        if (isRef) {
          ctx.beginPath()
          ctx.setLineDash([6, 6])
          ctx.arc(0, 0, 30, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,0.65)'
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (i === hover) {
          ctx.beginPath()
          ctx.arc(0, 0, 25, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fill()
        }
        const r = 13
        ctx.beginPath()
        ctx.roundRect(-r, -r, r * 2, r * 2, 4)
        ctx.fillStyle = open ? colorFor(i) : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = open ? colorFor(i) : 'rgba(255,255,255,0.5)'
        ctx.stroke()
        ctx.restore()
      })
    }

    const onMove = (ev: PointerEvent) => {
      const next = nearestIndex(s.toVirtual(ev), inst.sites, 40)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = nearestIndex(s.toVirtual(ev), inst.sites, 40)
      if (hit < 0) return
      if (sol.includes(hit)) api.commit(sol.filter((x) => x !== hit))
      // At capacity, the oldest depot closes so a click always does something.
      else if (sol.length >= inst.p) api.commit([...sol.slice(1), hit])
      else api.commit([...sol, hit])
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

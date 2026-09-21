import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, dist, nearestIndex, scatter } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const SITES = 12
const CUSTOMERS = 30

interface Instance {
  customers: Pt[]
  sites: Pt[]
  /** What each depot costs to run before it ships a single box. */
  fixed: number[]
}
/** Depots you decided to open. */
type Solution = number[]

const runCost = (inst: Instance, from: Pt, site: number) =>
  Math.round(dist(from, inst.sites[site]) / 10)

function split(inst: Instance, sol: Solution) {
  const rent = sol.reduce((a, i) => a + inst.fixed[i], 0)
  let runs = 0
  const owner: number[] = []
  inst.customers.forEach((c) => {
    let best = -1
    let bestC = Infinity
    sol.forEach((s) => {
      const v = runCost(inst, c, s)
      if (v < bestC) {
        bestC = v
        best = s
      }
    })
    owner.push(best)
    runs += bestC
  })
  return { rent, runs, owner, total: rent + runs }
}

/** 2^12 subsets of depots, every one costed out. */
function bestOpening(inst: Instance): Solution {
  let best: Solution = [0]
  let bestVal = Infinity
  for (let mask = 1; mask < 1 << SITES; mask++) {
    const open = Array.from({ length: SITES }, (_, i) => i).filter((i) => (mask >> i) & 1)
    const v = split(inst, open).total
    if (v < bestVal) {
      bestVal = v
      best = open
    }
  }
  return best
}

export const ufl: Minigame<Instance, Solution> = {
  id: 'ufl',
  title: 'Worth Opening',
  problem: 'Uncapacitated Facility Location',
  family: 'location',
  blurb: 'Every depot costs money before it ships a single box, and shutting one means longer runs for everyone it used to serve. Nobody tells you how many to open.',
  howTo: 'Click a site to open or close a depot. The number on it is the rent. The lines are deliveries, and they get longer the fewer depots you keep.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    return {
      customers: scatter(CUSTOMERS, VW, VH, 60, 58, rng.next),
      sites: scatter(SITES, VW, VH, 105, 128, rng.next),
      fixed: Array.from({ length: SITES }, () => 90 + rng.int(131)),
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    if (sol.length === 0) {
      return { value: 0, feasible: false, note: 'Every depot is shut, so nothing gets delivered.' }
    }
    const { rent, runs, total } = split(inst, sol)
    return {
      value: total,
      feasible: true,
      note: `${sol.length} depots at ${rent} in rent and ${runs} in deliveries.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestOpening(inst), label: 'exhaustive', exact: true }
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
      const { owner } = sol.length ? split(inst, sol) : { owner: inst.customers.map(() => -1) }

      ctx.save()
      ctx.lineWidth = 1.4
      ctx.strokeStyle = `${accent}44`
      inst.customers.forEach((c, i) => {
        if (owner[i] < 0) return
        ctx.beginPath()
        ctx.moveTo(c.x, c.y)
        ctx.lineTo(inst.sites[owner[i]].x, inst.sites[owner[i]].y)
        ctx.stroke()
      })
      ctx.restore()

      inst.customers.forEach((c, i) => {
        ctx.save()
        ctx.beginPath()
        ctx.arc(c.x, c.y, 5.5, 0, Math.PI * 2)
        ctx.fillStyle = owner[i] < 0 ? 'rgba(255,255,255,0.25)' : accent
        ctx.fill()
        ctx.restore()
      })

      inst.sites.forEach((p, i) => {
        const open = sol.includes(i)
        const isRef = !!ref && ref.includes(i)
        ctx.save()
        if (isRef) {
          ctx.beginPath()
          ctx.setLineDash([6, 6])
          ctx.arc(p.x, p.y, 27, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (i === hover) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 24, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fill()
        }
        const r = 13
        ctx.beginPath()
        ctx.roundRect(p.x - r, p.y - r, r * 2, r * 2, 4)
        ctx.fillStyle = open ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = open ? accent : 'rgba(255,255,255,0.5)'
        ctx.stroke()

        const label = String(inst.fixed[i])
        ctx.font = '700 11px "JetBrains Mono", monospace'
        const w = ctx.measureText(label).width + 10
        ctx.beginPath()
        ctx.roundRect(p.x - w / 2, p.y + 17, w, 16, 4)
        ctx.fillStyle = open ? accent : '#141821'
        ctx.fill()
        ctx.strokeStyle = open ? accent : 'rgba(255,255,255,0.18)'
        ctx.lineWidth = 1.2
        ctx.stroke()
        ctx.fillStyle = open ? '#0a0c10' : 'rgba(255,255,255,0.6)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, p.x, p.y + 25.5)
        ctx.restore()
      })
    }

    const onMove = (ev: PointerEvent) => {
      const next = nearestIndex(s.toVirtual(ev), inst.sites, 38)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = nearestIndex(s.toVirtual(ev), inst.sites, 38)
      if (hit < 0) return
      api.commit(sol.includes(hit) ? sol.filter((x) => x !== hit) : [...sol, hit])
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

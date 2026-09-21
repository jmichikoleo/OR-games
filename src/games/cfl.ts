import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, dist, nearestIndex, scatter } from '../core/geom'
import { minCostPlan } from '../core/flow'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const DEPOTS = 7
const CUSTOMERS = 12

interface Instance {
  customers: Pt[]
  need: number[]
  sites: Pt[]
  fixed: number[]
  room: number[]
}
/** Depots you opened. */
type Solution = number[]

const unitCost = (inst: Instance, c: Pt, site: number) =>
  Math.max(1, Math.round(dist(c, inst.sites[site]) / 10))

const totalNeed = (inst: Instance) => inst.need.reduce((a, b) => a + b, 0)

interface Served {
  rent: number
  ship: number
  total: number
  /** plan[openIndex][customer] units moved. */
  plan: number[][]
}

/**
 * Once you pick which depots open, working out who ships to whom is a plain
 * transportation problem, so the flow solver settles it exactly. A dummy
 * customer soaks up whatever capacity nobody needs.
 */
function serve(inst: Instance, open: Solution): Served | null {
  if (!open.length) return null
  const capacity = open.reduce((a, i) => a + inst.room[i], 0)
  const need = totalNeed(inst)
  if (capacity < need) return null

  const supply = open.map((i) => inst.room[i])
  const demand = [...inst.need, capacity - need]
  const cost = open.map((i) => [...inst.customers.map((c) => unitCost(inst, c, i)), 0])
  const plan = minCostPlan(supply, demand, cost)

  let ship = 0
  plan.forEach((row, i) => {
    for (let j = 0; j < CUSTOMERS; j++) ship += row[j] * cost[i][j]
  })
  const rent = open.reduce((a, i) => a + inst.fixed[i], 0)
  return { rent, ship, total: rent + ship, plan }
}

/** 2^7 subsets of depots, each one costed out properly. */
function bestOpening(inst: Instance): Solution {
  let best: Solution = inst.sites.map((_, i) => i)
  let bestVal = Infinity
  for (let mask = 1; mask < 1 << DEPOTS; mask++) {
    const open = Array.from({ length: DEPOTS }, (_, i) => i).filter((i) => (mask >> i) & 1)
    const out = serve(inst, open)
    if (out && out.total < bestVal) {
      bestVal = out.total
      best = open
    }
  }
  return best
}

export const cfl: Minigame<Instance, Solution> = {
  id: 'cfl',
  title: 'Room to Ship',
  problem: 'Capacitated Facility Location',
  family: 'location',
  blurb: 'Same depots, same rent, except now each one only holds so much. The cheap depot sitting in the middle of everybody can only take so many boxes before the rest travel further.',
  howTo: 'Click a site to open or close a depot. The badge shows how full it is against what it holds. A customer split between two depots gets two lines.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    const customers = scatter(CUSTOMERS, VW, VH, 70, 95, rng.next)
    return {
      customers,
      need: customers.map(() => 8 + rng.int(15)),
      sites: scatter(DEPOTS, VW, VH, 115, 175, rng.next),
      fixed: Array.from({ length: DEPOTS }, () => 120 + rng.int(160)),
      room: Array.from({ length: DEPOTS }, () => 45 + rng.int(50)),
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const out = serve(inst, sol)
    if (!out) {
      const capacity = sol.reduce((a, i) => a + inst.room[i], 0)
      return {
        value: 0,
        feasible: false,
        note: sol.length === 0
          ? 'Every depot is shut, so nothing gets delivered.'
          : `Open depots hold ${capacity} but ${totalNeed(inst)} needs shipping.`,
      }
    }
    return {
      value: out.total,
      feasible: true,
      note: `${sol.length} depots at ${out.rent} in rent and ${out.ship} in deliveries.`,
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
      const out = serve(inst, sol)
      const load = new Array(DEPOTS).fill(0)

      if (out) {
        ctx.save()
        ctx.lineCap = 'round'
        out.plan.forEach((row, k) => {
          const site = sol[k]
          for (let j = 0; j < CUSTOMERS; j++) {
            const units = row[j]
            if (units <= 0) continue
            load[site] += units
            ctx.strokeStyle = `${accent}66`
            ctx.lineWidth = 1 + (units / 22) * 5
            ctx.beginPath()
            ctx.moveTo(inst.customers[j].x, inst.customers[j].y)
            ctx.lineTo(inst.sites[site].x, inst.sites[site].y)
            ctx.stroke()
          }
        })
        ctx.restore()
      }

      inst.customers.forEach((c, j) => {
        ctx.save()
        ctx.beginPath()
        ctx.arc(c.x, c.y, 4 + inst.need[j] * 0.32, 0, Math.PI * 2)
        ctx.fillStyle = out ? accent : 'rgba(255,255,255,0.25)'
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
          ctx.arc(p.x, p.y, 30, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (i === hover) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 26, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fill()
        }
        const r = 14
        ctx.beginPath()
        ctx.roundRect(p.x - r, p.y - r, r * 2, r * 2, 4)
        ctx.fillStyle = open ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = open ? accent : 'rgba(255,255,255,0.5)'
        ctx.stroke()

        const rentTag = `rent ${inst.fixed[i]}`
        const roomTag = open ? `${load[i]} of ${inst.room[i]}` : `holds ${inst.room[i]}`
        ctx.font = '700 11px "JetBrains Mono", monospace'
        const w = Math.max(ctx.measureText(rentTag).width, ctx.measureText(roomTag).width) + 12
        ctx.beginPath()
        ctx.roundRect(p.x - w / 2, p.y + 18, w, 30, 5)
        ctx.fillStyle = open ? accent : '#141821'
        ctx.fill()
        ctx.strokeStyle = open ? accent : 'rgba(255,255,255,0.18)'
        ctx.lineWidth = 1.2
        ctx.stroke()
        ctx.fillStyle = open ? '#0a0c10' : 'rgba(255,255,255,0.6)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(rentTag, p.x, p.y + 26)
        ctx.font = '500 10px "JetBrains Mono", monospace'
        ctx.fillText(roomTag, p.x, p.y + 40)
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

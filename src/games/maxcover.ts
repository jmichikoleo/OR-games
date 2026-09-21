import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, dist, nearestIndex, scatter } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const P = 3
const SITES = 12
const DEMANDS = 34
const RADIUS = 205

interface Instance {
  demands: Pt[]
  weights: number[]
  sites: Pt[]
  p: number
}
/** Masts you switched on. */
type Solution = number[]

const covered = (inst: Instance, sol: Solution, i: number) =>
  sol.some((s) => dist(inst.demands[i], inst.sites[s]) <= RADIUS)

const reached = (inst: Instance, sol: Solution) =>
  inst.weights.reduce((a, w, i) => a + (covered(inst, sol, i) ? w : 0), 0)

/** C(12,3) is 220 placements, so all of them get tried. */
function bestSites(inst: Instance): Solution {
  let best: Solution = []
  let bestVal = -1
  const combo: number[] = []
  const walk = (start: number) => {
    if (combo.length === inst.p) {
      const v = reached(inst, combo)
      if (v > bestVal) {
        bestVal = v
        best = [...combo]
      }
      return
    }
    for (let i = start; i < inst.sites.length; i++) {
      combo.push(i)
      walk(i + 1)
      combo.pop()
    }
  }
  walk(0)
  return best
}

export const maxcover: Minigame<Instance, Solution> = {
  id: 'maxcover',
  title: 'In Range',
  problem: 'Maximal Covering Location',
  family: 'location',
  blurb: 'Three masts and a fixed range each. You will never reach everybody, so reach as many people as you can.',
  howTo: 'Click a square site to switch a mast on or off. Anyone inside a circle is covered, and bigger dots are more people.',
  objective: 'max',
  unit: 'people',

  generate(rng: RNG): Instance {
    const demands = scatter(DEMANDS, VW, VH, 55, 52, rng.next)
    return {
      demands,
      weights: demands.map(() => 1 + rng.int(5)),
      sites: scatter(SITES, VW, VH, 110, 130, rng.next),
      p: P,
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    if (sol.length < inst.p) {
      const left = inst.p - sol.length
      return { value: 0, feasible: false, note: `Switch on ${left} more mast${left === 1 ? '' : 's'}.` }
    }
    const total = inst.weights.reduce((a, b) => a + b, 0)
    const got = reached(inst, sol)
    return {
      value: got,
      feasible: true,
      note: `${got} of ${total} people are in range.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestSites(inst), label: 'exhaustive', exact: true }
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

      sol.forEach((i) => {
        const p = inst.sites[i]
        ctx.save()
        ctx.beginPath()
        ctx.arc(p.x, p.y, RADIUS, 0, Math.PI * 2)
        ctx.fillStyle = `${accent}16`
        ctx.fill()
        ctx.strokeStyle = `${accent}70`
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
      })

      inst.demands.forEach((d, i) => {
        const on = covered(inst, sol, i)
        ctx.save()
        ctx.beginPath()
        ctx.arc(d.x, d.y, 4 + inst.weights[i] * 2, 0, Math.PI * 2)
        ctx.fillStyle = on ? accent : 'rgba(255,255,255,0.22)'
        ctx.fill()
        ctx.restore()
      })

      inst.sites.forEach((p, i) => {
        const on = sol.includes(i)
        const isRef = !!ref && ref.includes(i)
        ctx.save()
        ctx.translate(p.x, p.y)
        if (isRef) {
          ctx.beginPath()
          ctx.setLineDash([6, 6])
          ctx.arc(0, 0, 28, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (i === hover) {
          ctx.beginPath()
          ctx.arc(0, 0, 24, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fill()
        }
        const r = 12
        ctx.beginPath()
        ctx.roundRect(-r, -r, r * 2, r * 2, 4)
        ctx.fillStyle = on ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = on ? accent : 'rgba(255,255,255,0.5)'
        ctx.stroke()
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
      if (sol.includes(hit)) api.commit(sol.filter((x) => x !== hit))
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

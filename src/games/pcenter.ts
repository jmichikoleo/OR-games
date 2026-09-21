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
  sites: Pt[]
  p: number
}
/** Which candidate sites you opened. */
type Solution = number[]

/** How far the worst-served town has to travel. */
function worstTrip(inst: Instance, open: readonly number[]): { value: number; who: number } {
  if (!open.length) return { value: Infinity, who: -1 }
  let worst = -1
  let who = -1
  inst.demands.forEach((d, i) => {
    let near = Infinity
    for (const s of open) near = Math.min(near, dist(d, inst.sites[s]))
    if (near > worst) {
      worst = near
      who = i
    }
  })
  return { value: worst, who }
}

/** C(10,3) = 120 — just look at all of them. */
function bestSubset(inst: Instance): Solution {
  let best: Solution = []
  let bestVal = Infinity
  const combo: number[] = []
  const walk = (start: number) => {
    if (combo.length === inst.p) {
      const v = worstTrip(inst, combo).value
      if (v < bestVal) {
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

export const pcenter: Minigame<Instance, Solution> = {
  id: 'pcenter',
  title: 'Worst Case',
  problem: 'p-Center',
  family: 'location',
  blurb: 'Three fire stations. What matters is not the average response. It is how long the unluckiest town has to wait.',
  howTo: 'Click a square site to open or close it. The ring around each station is the current worst response time. The red town is the one setting it.',
  objective: 'min',
  unit: 'km',

  generate(rng: RNG): Instance {
    return {
      demands: scatter(DEMANDS, VW, VH, 60, 62, rng.next),
      sites: scatter(SITES, VW, VH, 95, 150, rng.next),
      p: P,
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    if (sol.length < inst.p) {
      const left = inst.p - sol.length
      return { value: 0, feasible: false, note: `Open ${left} more station${left === 1 ? '' : 's'}.` }
    }
    const { value } = worstTrip(inst, sol)
    return {
      value,
      feasible: true,
      note: `Every town is within ${Math.round(value)} km of a station.`,
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
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const { value: radius, who } = worstTrip(inst, sol)
      const ready = sol.length >= inst.p

      // The coverage rings: every town lives inside at least one of them.
      if (ready) {
        ctx.save()
        sol.forEach((i) => {
          const p = inst.sites[i]
          ctx.beginPath()
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
          ctx.fillStyle = `${accent}14`
          ctx.fill()
          ctx.strokeStyle = `${accent}66`
          ctx.lineWidth = 1.5
          ctx.stroke()
        })
        ctx.restore()
      }

      inst.demands.forEach((d, i) => {
        const worst = i === who && ready
        if (worst) {
          let nearSite = -1
          let nearD = Infinity
          sol.forEach((x) => {
            const dd = dist(d, inst.sites[x])
            if (dd < nearD) {
              nearD = dd
              nearSite = x
            }
          })
          ctx.save()
          ctx.strokeStyle = '#f87171'
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.moveTo(d.x, d.y)
          ctx.lineTo(inst.sites[nearSite].x, inst.sites[nearSite].y)
          ctx.stroke()
          ctx.restore()
        }
        ctx.save()
        ctx.beginPath()
        ctx.arc(d.x, d.y, worst ? 9 : 6, 0, Math.PI * 2)
        ctx.fillStyle = worst ? '#f87171' : ready ? accent : 'rgba(255,255,255,0.3)'
        ctx.fill()
        ctx.restore()
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
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'
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
        ctx.fillStyle = open ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = open ? accent : 'rgba(255,255,255,0.5)'
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

import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, dist, nearestIndex, scatter } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 620
const LOADS = 7

interface Instance {
  yard: Pt
  /** Where each load waits and where it has to end up. */
  from: Pt[]
  to: Pt[]
}
/** The order you run the loads in. */
type Solution = number[]

/** Everything between putting one load down and picking the next one up.
 *  The loaded miles never change, so only the empty ones are yours to fix. */
function emptyMiles(inst: Instance, sol: Solution): number {
  if (!sol.length) return 0
  let total = dist(inst.yard, inst.from[sol[0]])
  for (let i = 0; i + 1 < sol.length; i++) {
    total += dist(inst.to[sol[i]], inst.from[sol[i + 1]])
  }
  total += dist(inst.to[sol[sol.length - 1]], inst.yard)
  return total
}

const loadedMiles = (inst: Instance) =>
  inst.from.reduce((a, p, i) => a + dist(p, inst.to[i]), 0)

/** Held-Karp over the loads. The lorry is only ever carrying one thing, so
 *  the order of the loads is the whole decision. */
function bestRun(inst: Instance): Solution {
  const full = 1 << LOADS
  const dp = Array.from({ length: full }, () => new Float64Array(LOADS).fill(Infinity))
  const via = Array.from({ length: full }, () => new Int8Array(LOADS).fill(-1))
  for (let j = 0; j < LOADS; j++) dp[1 << j][j] = dist(inst.yard, inst.from[j])
  for (let mask = 1; mask < full; mask++) {
    for (let j = 0; j < LOADS; j++) {
      const v = dp[mask][j]
      if (v === Infinity || !((mask >> j) & 1)) continue
      for (let k = 0; k < LOADS; k++) {
        if ((mask >> k) & 1) continue
        const alt = v + dist(inst.to[j], inst.from[k])
        const next = mask | (1 << k)
        if (alt < dp[next][k]) {
          dp[next][k] = alt
          via[next][k] = j
        }
      }
    }
  }
  let end = 0
  let bestVal = Infinity
  for (let j = 0; j < LOADS; j++) {
    const v = dp[full - 1][j] + dist(inst.to[j], inst.yard)
    if (v < bestVal) {
      bestVal = v
      end = j
    }
  }
  const order: number[] = []
  let mask = full - 1
  let j = end
  while (j >= 0) {
    order.push(j)
    const prev = via[mask][j]
    mask ^= 1 << j
    j = prev
  }
  return order.reverse()
}

export const stacker: Minigame<Instance, Solution> = {
  id: 'stacker',
  title: 'Running Empty',
  problem: 'Pickup and Delivery',
  family: 'routing',
  blurb: 'Seven loads, each waiting somewhere and wanted somewhere else, and a lorry that only carries one at a time. The loaded miles are the same whatever you do. Everything you can win or lose is in the miles you run with nothing on the back.',
  howTo: 'Click a load where it is waiting to run it next. Click the one you have just dropped to take it back off the list. The dashed lines are the miles you are paying for and carrying nothing.',
  objective: 'min',
  unit: 'empty',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      let pts = scatter(1 + LOADS * 2, VW, VH, 78, 88, rng.next)
      while (pts.length < 1 + LOADS * 2) pts = scatter(1 + LOADS * 2, VW, VH, 78, 88, rng.next)
      const inst: Instance = {
        yard: pts[0],
        from: pts.slice(1, 1 + LOADS),
        to: pts.slice(1 + LOADS),
      }
      const plain = emptyMiles(inst, inst.from.map((_, i) => i))
      // A yard where taking the loads in the order they came in is wasteful.
      if (emptyMiles(inst, bestRun(inst)) / plain < 0.8 || tries > 120) return inst
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    if (sol.length < LOADS) {
      const left = LOADS - sol.length
      return { value: 0, feasible: false, note: `${left} load${left === 1 ? '' : 's'} still waiting.` }
    }
    const empty = Math.round(emptyMiles(inst, sol))
    const laden = Math.round(loadedMiles(inst))
    return {
      value: empty,
      feasible: true,
      note: `${laden} miles with a load on and ${empty} without, so ${Math.round((empty / (empty + laden)) * 100)} percent of the day is empty.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestRun(inst), label: 'Held-Karp', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let hover = -1

    const arrow = (ctx: CanvasRenderingContext2D, a: Pt, b: Pt) => {
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const tipX = b.x - Math.cos(ang) * 20
      const tipY = b.y - Math.sin(ang) * 20
      ctx.beginPath()
      ctx.moveTo(tipX, tipY)
      ctx.lineTo(tipX - Math.cos(ang - 0.42) * 13, tipY - Math.sin(ang - 0.42) * 13)
      ctx.lineTo(tipX - Math.cos(ang + 0.42) * 13, tipY - Math.sin(ang + 0.42) * 13)
      ctx.closePath()
      ctx.fill()
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)

      // The pairing, so you can see where each load wants to go before you run it.
      ctx.save()
      ctx.setLineDash([2, 6])
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 1.5
      inst.from.forEach((p, i) => {
        if (sol.includes(i)) return
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(inst.to[i].x, inst.to[i].y)
        ctx.stroke()
      })
      ctx.setLineDash([])
      ctx.restore()

      if (ref) {
        ctx.save()
        ctx.setLineDash([7, 8])
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(inst.yard.x, inst.yard.y)
        ref.forEach((n, i) => {
          if (i > 0) ctx.lineTo(inst.from[n].x, inst.from[n].y)
          else ctx.lineTo(inst.from[n].x, inst.from[n].y)
          ctx.moveTo(inst.to[n].x, inst.to[n].y)
        })
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }

      // Empty legs first, then the loaded ones over the top.
      ctx.save()
      ctx.setLineDash([8, 7])
      ctx.strokeStyle = '#ff5c7a'
      ctx.lineWidth = 2.5
      let at = inst.yard
      sol.forEach((n) => {
        ctx.beginPath()
        ctx.moveTo(at.x, at.y)
        ctx.lineTo(inst.from[n].x, inst.from[n].y)
        ctx.stroke()
        at = inst.to[n]
      })
      if (sol.length === LOADS) {
        ctx.beginPath()
        ctx.moveTo(at.x, at.y)
        ctx.lineTo(inst.yard.x, inst.yard.y)
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.restore()

      ctx.save()
      ctx.strokeStyle = accent
      ctx.fillStyle = accent
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      sol.forEach((n) => {
        ctx.beginPath()
        ctx.moveTo(inst.from[n].x, inst.from[n].y)
        ctx.lineTo(inst.to[n].x, inst.to[n].y)
        ctx.stroke()
        arrow(ctx, inst.from[n], inst.to[n])
      })
      ctx.restore()

      ctx.save()
      ctx.beginPath()
      ctx.arc(inst.yard.x, inst.yard.y, 20, 0, Math.PI * 2)
      ctx.fillStyle = accent
      ctx.fill()
      ctx.fillStyle = '#0b090e'
      ctx.font = '700 13px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Y', inst.yard.x, inst.yard.y + 0.5)
      ctx.restore()

      inst.from.forEach((p, i) => {
        const at2 = sol.indexOf(i)
        ctx.save()
        if (i === hover && at2 < 0) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 28, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.09)'
          ctx.fill()
        }
        ctx.beginPath()
        ctx.roundRect(p.x - 15, p.y - 15, 30, 30, 6)
        ctx.fillStyle = at2 >= 0 ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = at2 >= 0 ? accent : 'rgba(255,255,255,0.45)'
        ctx.stroke()
        ctx.fillStyle = at2 >= 0 ? '#0b090e' : 'rgba(255,255,255,0.8)'
        ctx.font = '700 13px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(at2 >= 0 ? at2 + 1 : i + 1), p.x, p.y + 0.5)
        ctx.restore()
      })

      inst.to.forEach((p, i) => {
        const done = sol.includes(i)
        ctx.save()
        ctx.beginPath()
        ctx.arc(p.x, p.y, 13, 0, Math.PI * 2)
        ctx.fillStyle = done ? accent : '#0f1218'
        ctx.globalAlpha = done ? 0.55 : 1
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.lineWidth = 2
        ctx.strokeStyle = done ? accent : 'rgba(255,255,255,0.3)'
        ctx.stroke()
        ctx.fillStyle = done ? '#0b090e' : 'rgba(255,255,255,0.55)'
        ctx.font = '600 11px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(i + 1), p.x, p.y + 0.5)
        ctx.restore()
      })
    }

    const onMove = (ev: PointerEvent) => {
      const next = nearestIndex(s.toVirtual(ev), inst.from, 34)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = nearestIndex(s.toVirtual(ev), inst.from, 34)
      if (hit < 0) return
      if (sol.length && hit === sol[sol.length - 1]) {
        api.commit(sol.slice(0, -1))
        return
      }
      if (sol.includes(hit)) return
      api.commit([...sol, hit])
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

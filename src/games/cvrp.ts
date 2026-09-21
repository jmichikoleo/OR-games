import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, dist, nearestIndex, scatter } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const STOPS = 9
const VANS = 3
const ROUTE_COLORS = ['#ff4d9d', '#5b8cff', '#52e68a']

interface Instance {
  /** nodes[0] is the yard, the rest are drops. */
  nodes: Pt[]
  load: number[]
  hold: number
}
/** One list of drops per van, in the order it visits them. */
type Solution = number[][]

function legLength(inst: Instance, route: number[]): number {
  if (!route.length) return 0
  let total = dist(inst.nodes[0], inst.nodes[route[0]])
  for (let i = 0; i + 1 < route.length; i++) {
    total += dist(inst.nodes[route[i]], inst.nodes[route[i + 1]])
  }
  return total + dist(inst.nodes[route[route.length - 1]], inst.nodes[0])
}

const routeLoad = (inst: Instance, route: number[]) =>
  route.reduce((a, s) => a + inst.load[s], 0)

const driven = (inst: Instance, sol: Solution) =>
  sol.reduce((a, r) => a + legLength(inst, r), 0)

/**
 * Exact for a board this small. Work out the best round trip for every group
 * of drops a van could legally carry, then pick the cheapest way to split the
 * nine drops into at most three of those groups.
 */
function bestPlan(inst: Instance): Solution {
  const full = (1 << STOPS) - 1
  const d: number[][] = inst.nodes.map((a) => inst.nodes.map((b) => dist(a, b)))
  const tour = new Float64Array(full + 1).fill(Infinity)
  const order: number[][] = new Array(full + 1)

  for (let mask = 1; mask <= full; mask++) {
    const who: number[] = []
    let need = 0
    for (let i = 0; i < STOPS; i++) {
      if ((mask >> i) & 1) {
        who.push(i + 1)
        need += inst.load[i + 1]
      }
    }
    if (need > inst.hold) continue

    // Held-Karp over just this group of drops.
    const k = who.length
    const sub = 1 << k
    const dp = new Float64Array(sub * k).fill(Infinity)
    const par = new Int16Array(sub * k).fill(-1)
    for (let i = 0; i < k; i++) dp[(1 << i) * k + i] = d[0][who[i]]
    for (let m = 1; m < sub; m++) {
      for (let i = 0; i < k; i++) {
        if (!((m >> i) & 1)) continue
        const cur = dp[m * k + i]
        if (cur === Infinity) continue
        for (let j = 0; j < k; j++) {
          if ((m >> j) & 1) continue
          const nm = m | (1 << j)
          const cost = cur + d[who[i]][who[j]]
          if (cost < dp[nm * k + j]) {
            dp[nm * k + j] = cost
            par[nm * k + j] = i
          }
        }
      }
    }
    let best = Infinity
    let end = 0
    for (let i = 0; i < k; i++) {
      const total = dp[(sub - 1) * k + i] + d[who[i]][0]
      if (total < best) {
        best = total
        end = i
      }
    }
    tour[mask] = best
    const seq: number[] = []
    let m = sub - 1
    let i = end
    while (i !== -1) {
      seq.push(who[i])
      const p = par[m * k + i]
      m ^= 1 << i
      i = p
    }
    order[mask] = seq.reverse()
  }

  // Split the drops into at most three of those groups, as cheaply as possible.
  const best = Array.from({ length: VANS + 1 }, () => new Float64Array(full + 1).fill(Infinity))
  const take = Array.from({ length: VANS + 1 }, () => new Int32Array(full + 1).fill(0))
  for (let v = 0; v <= VANS; v++) best[v][0] = 0

  for (let v = 1; v <= VANS; v++) {
    for (let mask = 1; mask <= full; mask++) {
      const low = mask & -mask
      for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
        if (!(sub & low)) continue
        if (tour[sub] === Infinity) continue
        const cand = tour[sub] + best[v - 1][mask ^ sub]
        if (cand < best[v][mask]) {
          best[v][mask] = cand
          take[v][mask] = sub
        }
      }
    }
  }

  const out: Solution = []
  let mask = full
  let v = VANS
  while (mask > 0 && v > 0) {
    const sub = take[v][mask]
    if (!sub) break
    out.push(order[sub])
    mask ^= sub
    v--
  }
  while (out.length < VANS) out.push([])
  return out
}

export const cvrp: Minigame<Instance, Solution> = {
  id: 'cvrp',
  title: 'Three Vans',
  problem: 'Capacitated Vehicle Routing',
  family: 'routing',
  blurb: 'Nine drops and three vans, each one only able to carry so much. Split the round between them and keep the total mileage down.',
  howTo: 'Click drops to build the route the current van takes. Click the yard to send that van off and start the next one. Click a drop already on a route to cut back to it.',
  objective: 'min',
  unit: 'km',

  generate(rng: RNG): Instance {
    const nodes = scatter(STOPS + 1, VW, VH, 80, 118, rng.next)
    const load = nodes.map(() => 3 + rng.int(10))
    load[0] = 0
    const total = load.reduce((a, b) => a + b, 0)
    return { nodes, load, hold: Math.ceil((total / VANS) * 1.14) }
  },

  initial(): Solution {
    return [[]]
  },

  evaluate(inst, sol) {
    const done = sol.flat()
    const over = sol.filter((r) => routeLoad(inst, r) > inst.hold).length
    if (over > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${over} van${over === 1 ? ' is' : 's are'} loaded past what they hold.`,
      }
    }
    const left = STOPS - done.length
    if (left > 0) {
      return { value: 0, feasible: false, note: `${left} drop${left === 1 ? '' : 's'} nobody is going to.` }
    }
    const running = sol.filter((r) => r.length).length
    return {
      value: driven(inst, sol),
      feasible: true,
      note: `Every drop covered by ${running} van${running === 1 ? '' : 's'}.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestPlan(inst), label: 'group tours plus exact split', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let hover = -1

    function polyline(ctx: CanvasRenderingContext2D, route: number[]) {
      if (!route.length) return
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
      const placed = new Set(sol.flat())
      const current = sol.length - 1
      const carrying = routeLoad(inst, sol[current] ?? [])

      if (ref) {
        ctx.save()
        ctx.setLineDash([9, 9])
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'
        ctx.lineWidth = 2
        ref.forEach((r) => polyline(ctx, r))
        ctx.restore()
      }

      sol.forEach((route, v) => {
        if (!route.length) return
        ctx.save()
        ctx.strokeStyle = ROUTE_COLORS[v % ROUTE_COLORS.length]
        ctx.lineWidth = 3.5
        ctx.lineJoin = 'round'
        polyline(ctx, route)
        ctx.restore()
      })

      const dp = inst.nodes[0]
      ctx.save()
      ctx.translate(dp.x, dp.y)
      ctx.rotate(Math.PI / 4)
      ctx.beginPath()
      ctx.roundRect(-15, -15, 30, 30, 4)
      ctx.fillStyle = accent
      ctx.fill()
      ctx.restore()

      inst.nodes.forEach((p, i) => {
        if (i === 0) return
        const van = sol.findIndex((r) => r.includes(i))
        const on = van >= 0
        const fits = carrying + inst.load[i] <= inst.hold
        ctx.save()
        ctx.globalAlpha = on || fits ? 1 : 0.35
        if (i === hover && !on) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 28, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, 17, 0, Math.PI * 2)
        ctx.fillStyle = on ? ROUTE_COLORS[van % ROUTE_COLORS.length] : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = on ? ROUTE_COLORS[van % ROUTE_COLORS.length] : 'rgba(255,255,255,0.45)'
        ctx.stroke()
        ctx.fillStyle = on ? '#0a0c10' : 'rgba(255,255,255,0.72)'
        ctx.font = '700 13px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(inst.load[i]), p.x, p.y + 0.5)
        ctx.restore()
      })

      ctx.save()
      ctx.font = '500 12px "JetBrains Mono", monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      sol.forEach((r, v) => {
        ctx.fillStyle = ROUTE_COLORS[v % ROUTE_COLORS.length]
        const tag = `van ${v + 1} carrying ${routeLoad(inst, r)} of ${inst.hold}`
        ctx.fillText(tag, 24, 22 + v * 18)
      })
      if (placed.size < STOPS && sol.length < VANS) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fillText('click the yard to send this van off', 24, 22 + sol.length * 18)
      }
      ctx.restore()
    }

    const onMove = (ev: PointerEvent) => {
      const next = nearestIndex(s.toVirtual(ev), inst.nodes, 40)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = nearestIndex(s.toVirtual(ev), inst.nodes, 40)
      if (hit < 0) return
      const current = sol.length - 1

      if (hit === 0) {
        // Send the current van off and roll out the next one.
        if (!sol[current].length || sol.length >= VANS) return
        api.commit([...sol.map((r) => [...r]), []])
        return
      }

      const van = sol.findIndex((r) => r.includes(hit))
      if (van >= 0) {
        const at = sol[van].indexOf(hit)
        const next = sol.map((r) => [...r])
        next[van] = next[van].slice(0, at)
        api.commit(next)
        return
      }
      if (routeLoad(inst, sol[current]) + inst.load[hit] > inst.hold) return
      const next = sol.map((r) => [...r])
      next[current].push(hit)
      api.commit(next)
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

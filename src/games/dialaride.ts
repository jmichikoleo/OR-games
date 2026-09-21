import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, dist, nearestIndex, scatter } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const RIDES = 5
const STOPS = RIDES * 2
const SEATS = 3

const LETTERS = 'ABCDE'
const COLORS = ['#f59e0b', '#60a5fa', '#34d399', '#f472b6', '#c084fc']

interface Instance {
  /** nodes[0] is the depot, 1..5 the pickups, 6..10 the drop-offs. */
  nodes: Pt[]
}
/** The stops you visited, in order. Leaving and returning to the depot is implied. */
type Solution = number[]

const pickupOf = (r: number) => 1 + r
const dropOf = (r: number) => 1 + RIDES + r
const rideOf = (node: number) => (node - 1) % RIDES
const isPickup = (node: number) => node >= 1 && node <= RIDES

function routeLength(inst: Instance, sol: Solution): number {
  if (!sol.length) return 0
  let total = dist(inst.nodes[0], inst.nodes[sol[0]])
  for (let i = 0; i + 1 < sol.length; i++) total += dist(inst.nodes[sol[i]], inst.nodes[sol[i + 1]])
  return total + dist(inst.nodes[sol[sol.length - 1]], inst.nodes[0])
}

/** Who is in the van after each stop. */
function loads(sol: Solution): number[] {
  let n = 0
  return sol.map((node) => (isPickup(node) ? ++n : --n))
}

/** Stops you are allowed to visit next: seats free, and nobody dropped early. */
function legalNext(sol: Solution): Set<number> {
  const seen = new Set(sol)
  const load = sol.reduce((a, node) => a + (isPickup(node) ? 1 : -1), 0)
  const out = new Set<number>()
  for (let r = 0; r < RIDES; r++) {
    if (!seen.has(pickupOf(r)) && load < SEATS) out.add(pickupOf(r))
    if (seen.has(pickupOf(r)) && !seen.has(dropOf(r))) out.add(dropOf(r))
  }
  return out
}

/**
 * Held-Karp over subsets of the ten stops. A subset is only reachable if every
 * drop-off in it has its pickup too, and if the van was never over capacity —
 * both of which the subset itself tells you, so the DP stays exact.
 */
function bestRoute(inst: Instance): Solution {
  const full = 1 << STOPS
  const idx = (n: number) => n - 1
  const node = (i: number) => i + 1
  const d: number[][] = inst.nodes.map((a) => inst.nodes.map((b) => dist(a, b)))

  const okMask = new Array(full).fill(false)
  for (let mask = 0; mask < full; mask++) {
    let load = 0
    let ok = true
    for (let r = 0; r < RIDES; r++) {
      const p = (mask >> idx(pickupOf(r))) & 1
      const q = (mask >> idx(dropOf(r))) & 1
      if (q && !p) {
        ok = false
        break
      }
      load += p - q
    }
    okMask[mask] = ok && load <= SEATS
  }

  const dp = new Float64Array(full * STOPS).fill(Infinity)
  const par = new Int16Array(full * STOPS).fill(-1)
  for (let r = 0; r < RIDES; r++) {
    const i = idx(pickupOf(r))
    dp[(1 << i) * STOPS + i] = d[0][pickupOf(r)]
  }

  for (let mask = 1; mask < full; mask++) {
    if (!okMask[mask]) continue
    for (let last = 0; last < STOPS; last++) {
      if (!((mask >> last) & 1)) continue
      const cur = dp[mask * STOPS + last]
      if (cur === Infinity) continue
      for (let nx = 0; nx < STOPS; nx++) {
        if ((mask >> nx) & 1) continue
        const nm = mask | (1 << nx)
        if (!okMask[nm]) continue
        const cost = cur + d[node(last)][node(nx)]
        if (cost < dp[nm * STOPS + nx]) {
          dp[nm * STOPS + nx] = cost
          par[nm * STOPS + nx] = last
        }
      }
    }
  }

  let bestEnd = -1
  let best = Infinity
  const last = full - 1
  for (let i = 0; i < STOPS; i++) {
    const total = dp[last * STOPS + i] + d[node(i)][0]
    if (total < best) {
      best = total
      bestEnd = i
    }
  }

  const order: Solution = []
  let mask = last
  let i = bestEnd
  while (i !== -1) {
    order.push(node(i))
    const p = par[mask * STOPS + i]
    mask ^= 1 << i
    i = p
  }
  return order.reverse()
}

export const dialaride: Minigame<Instance, Solution> = {
  id: 'dialaride',
  title: 'Shared Ride',
  problem: 'Dial-a-Ride',
  family: 'routing',
  blurb: 'Five people want a lift. One van, three seats, and nobody can be dropped off somewhere they were never picked up from.',
  howTo: 'Click stops in the order you will drive them. Circles are pickups, squares are drop-offs, and the dashed line pairs each rider. Dim stops are ones you cannot legally do yet.',
  objective: 'min',
  unit: 'km',

  generate(rng: RNG): Instance {
    return { nodes: scatter(STOPS + 1, VW, VH, 75, 108, rng.next) }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const left = STOPS - sol.length
    if (left > 0) {
      return { value: 0, feasible: false, note: `${left} stop${left === 1 ? '' : 's'} still to make.` }
    }
    const peak = Math.max(...loads(sol))
    return {
      value: routeLength(inst, sol),
      feasible: true,
      note: `Everyone delivered, never more than ${peak} in the van.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestRoute(inst), label: 'Held-Karp DP', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let hover = -1

    function polyline(ctx: CanvasRenderingContext2D, route: Solution) {
      if (!route.length) return
      ctx.beginPath()
      ctx.moveTo(inst.nodes[0].x, inst.nodes[0].y)
      route.forEach((n) => ctx.lineTo(inst.nodes[n].x, inst.nodes[n].y))
      ctx.lineTo(inst.nodes[0].x, inst.nodes[0].y)
      ctx.stroke()
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const legal = legalNext(sol)

      // Which pickup belongs to which drop-off.
      for (let r = 0; r < RIDES; r++) {
        const A = inst.nodes[pickupOf(r)]
        const B = inst.nodes[dropOf(r)]
        ctx.save()
        ctx.setLineDash([4, 6])
        ctx.strokeStyle = `${COLORS[r]}55`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        ctx.stroke()
        ctx.restore()
      }

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

        // How many are aboard on each leg.
        const load = loads(sol)
        sol.forEach((n, i) => {
          const A = inst.nodes[n]
          const B = inst.nodes[i + 1 < sol.length ? sol[i + 1] : 0]
          const mx = (A.x + B.x) / 2
          const my = (A.y + B.y) / 2
          if (load[i] === 0) return
          ctx.save()
          ctx.beginPath()
          ctx.arc(mx, my, 10, 0, Math.PI * 2)
          ctx.fillStyle = '#0a0c10'
          ctx.fill()
          ctx.strokeStyle = accent
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.fillStyle = accent
          ctx.font = '700 11px "JetBrains Mono", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(load[i]), mx, my + 0.5)
          ctx.restore()
        })
      }

      const dp = inst.nodes[0]
      ctx.save()
      ctx.translate(dp.x, dp.y)
      ctx.rotate(Math.PI / 4)
      ctx.beginPath()
      ctx.roundRect(-14, -14, 28, 28, 4)
      ctx.fillStyle = accent
      ctx.fill()
      ctx.restore()

      inst.nodes.forEach((p, n) => {
        if (n === 0) return
        const r = rideOf(n)
        const pick = isPickup(n)
        const at = sol.indexOf(n)
        const done = at >= 0
        const can = legal.has(n)
        ctx.save()
        ctx.globalAlpha = done || can ? 1 : 0.28
        if (n === hover && can && !done) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 27, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.09)'
          ctx.fill()
        }
        ctx.beginPath()
        if (pick) ctx.arc(p.x, p.y, 16, 0, Math.PI * 2)
        else ctx.roundRect(p.x - 15, p.y - 15, 30, 30, 4)
        ctx.fillStyle = done ? COLORS[r] : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = COLORS[r]
        ctx.stroke()
        ctx.fillStyle = done ? '#0a0c10' : COLORS[r]
        ctx.font = '700 13px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(LETTERS[r], p.x, p.y + 0.5)
        if (done) {
          ctx.fillStyle = 'rgba(255,255,255,0.65)'
          ctx.font = '500 10px "JetBrains Mono", monospace'
          ctx.fillText(String(at + 1), p.x, p.y - 25)
        }
        ctx.restore()
      })
    }

    const onMove = (ev: PointerEvent) => {
      const next = nearestIndex(s.toVirtual(ev), inst.nodes, 38)
      if (next !== hover) {
        hover = next
        const legal = legalNext(sol)
        s.canvas.style.cursor = next > 0 && (legal.has(next) || sol.includes(next)) ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = nearestIndex(s.toVirtual(ev), inst.nodes, 38)
      if (hit <= 0) return
      const at = sol.indexOf(hit)
      // Clicking a stop already on the route rewinds to just before it.
      if (at >= 0) return api.commit(sol.slice(0, at))
      if (!legalNext(sol).has(hit)) return
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

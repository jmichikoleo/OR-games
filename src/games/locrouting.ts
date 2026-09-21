import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, dist, nearestIndex, scatter } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 620
const DEPOTS = 3
const DROPS = 9
const FULL = 1 << DROPS
/** Board units a unit of haulage buys. */
const PER_COST = 5
const DEPOT_COLORS = ['#ff4d9d', '#5b8cff', '#52e68a']

interface Instance {
  yard: Pt[]
  shop: Pt[]
  rent: number[]
  /** Best round trip out of each yard for every set of shops. Worked out once. */
  round: Float64Array[]
}
/** Which yard serves each shop. */
type Solution = number[]

/** Held-Karp out of one yard, kept for every set of shops rather than just
 *  the full one, because the whole question is which shops go together. */
function roundsFrom(yard: Pt, shop: Pt[]): Float64Array {
  const dp = Array.from({ length: FULL }, () => new Float64Array(DROPS).fill(Infinity))
  for (let j = 0; j < DROPS; j++) dp[1 << j][j] = dist(yard, shop[j])
  for (let mask = 1; mask < FULL; mask++) {
    for (let j = 0; j < DROPS; j++) {
      const v = dp[mask][j]
      if (v === Infinity || !((mask >> j) & 1)) continue
      for (let k = 0; k < DROPS; k++) {
        if ((mask >> k) & 1) continue
        const alt = v + dist(shop[j], shop[k])
        const next = mask | (1 << k)
        if (alt < dp[next][k]) dp[next][k] = alt
      }
    }
  }
  const out = new Float64Array(FULL)
  for (let mask = 1; mask < FULL; mask++) {
    let best = Infinity
    for (let j = 0; j < DROPS; j++) {
      if (!((mask >> j) & 1)) continue
      best = Math.min(best, dp[mask][j] + dist(shop[j], yard))
    }
    out[mask] = best
  }
  return out
}

const masksOf = (sol: Solution): number[] => {
  const out = new Array(DEPOTS).fill(0)
  sol.forEach((d, i) => (out[d] |= 1 << i))
  return out
}

function billOf(inst: Instance, sol: Solution): number {
  const masks = masksOf(sol)
  let total = 0
  masks.forEach((mask, d) => {
    if (!mask) return
    total += inst.rent[d] + inst.round[d][mask] / PER_COST
  })
  return Math.round(total)
}

/** All 19,683 ways of handing nine shops to three yards. */
function bestSplit(inst: Instance): Solution {
  const sol = new Array(DROPS).fill(0)
  let best: Solution = []
  let bestVal = Infinity
  const walk = (i: number) => {
    if (i === DROPS) {
      const v = billOf(inst, sol)
      if (v < bestVal) {
        bestVal = v
        best = [...sol]
      }
      return
    }
    for (let d = 0; d < DEPOTS; d++) {
      sol[i] = d
      walk(i + 1)
    }
  }
  walk(0)
  return best
}

const nearestYard = (inst: Instance): Solution =>
  inst.shop.map((p) => {
    let best = 0
    inst.yard.forEach((y, d) => {
      if (dist(p, y) < dist(p, inst.yard[best])) best = d
    })
    return best
  })

export const locrouting: Minigame<Instance, Solution> = {
  id: 'locrouting',
  title: 'Yards and Rounds',
  problem: 'Location-Routing',
  family: 'location',
  blurb: 'Three yards you pay rent on and nine shops to serve. A van goes out of every yard you use and comes back to it, so the yard worth keeping is not the one nearest the shops, it is the one whose round happens to fall in a neat loop.',
  howTo: 'Click a shop to hand it to the next yard. A yard with no shops on its books costs you nothing, so closing one is done by taking its last shop away.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      let pts = scatter(DEPOTS + DROPS, VW, VH, 80, 118, rng.next)
      while (pts.length < DEPOTS + DROPS) pts = scatter(DEPOTS + DROPS, VW, VH, 80, 118, rng.next)
      const yard = pts.slice(0, DEPOTS)
      const shop = pts.slice(DEPOTS)
      const inst: Instance = {
        yard,
        shop,
        rent: yard.map(() => 140 + rng.int(220)),
        round: yard.map((y) => roundsFrom(y, shop)),
      }
      const best = billOf(inst, bestSplit(inst))
      const near = billOf(inst, nearestYard(inst))
      // Sending every shop to its closest yard has to be the wrong answer.
      if (best / near < 0.9 || tries > 60) return inst
    }
  },

  initial(inst): Solution {
    // Everybody goes to whichever yard is nearest, which ignores the rent
    // and ignores what the rounds end up looking like.
    return nearestYard(inst)
  },

  evaluate(inst, sol) {
    const masks = masksOf(sol)
    const open = masks.filter((m) => m).length
    const sizes = masks.filter((m) => m).map((m) => {
      let n = 0
      for (let i = 0; i < DROPS; i++) if ((m >> i) & 1) n++
      return n
    })
    return {
      value: billOf(inst, sol),
      feasible: true,
      note: `${open} yard${open === 1 ? '' : 's'} in use, carrying ${sizes.join(', ')} shops.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestSplit(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let hover = -1

    /** Redo the best round for a set of shops so it can be drawn, not just costed. */
    function orderFor(d: number, mask: number): number[] {
      const stops: number[] = []
      for (let i = 0; i < DROPS; i++) if ((mask >> i) & 1) stops.push(i)
      if (stops.length < 2) return stops
      let best: number[] = stops
      let bestLen = Infinity
      const walk = (left: number[], acc: number[], len: number) => {
        if (len >= bestLen) return
        if (!left.length) {
          const total = len + dist(inst.shop[acc[acc.length - 1]], inst.yard[d])
          if (total < bestLen) {
            bestLen = total
            best = [...acc]
          }
          return
        }
        left.forEach((n, i) => {
          const from = acc.length ? inst.shop[acc[acc.length - 1]] : inst.yard[d]
          walk([...left.slice(0, i), ...left.slice(i + 1)], [...acc, n], len + dist(from, inst.shop[n]))
        })
      }
      walk(stops, [], 0)
      return best
    }

    function drawRounds(which: Solution, ghost: boolean) {
      const { ctx } = s
      masksOf(which).forEach((mask, d) => {
        if (!mask) return
        const order = orderFor(d, mask)
        ctx.save()
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        if (ghost) {
          ctx.setLineDash([6, 7])
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'
          ctx.lineWidth = 2
        } else {
          ctx.strokeStyle = DEPOT_COLORS[d]
          ctx.lineWidth = 3
        }
        ctx.beginPath()
        ctx.moveTo(inst.yard[d].x, inst.yard[d].y)
        order.forEach((n) => ctx.lineTo(inst.shop[n].x, inst.shop[n].y))
        ctx.lineTo(inst.yard[d].x, inst.yard[d].y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      })
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      clearBoard(ctx, VW, VH)
      if (ref) drawRounds(ref, true)
      drawRounds(sol, false)
      const masks = masksOf(sol)

      inst.yard.forEach((p, d) => {
        const live = masks[d] !== 0
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(p.x - 19, p.y - 19, 38, 38, 8)
        ctx.fillStyle = live ? DEPOT_COLORS[d] : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = live ? DEPOT_COLORS[d] : 'rgba(255,255,255,0.32)'
        ctx.stroke()
        ctx.fillStyle = live ? '#0b090e' : 'rgba(255,255,255,0.6)'
        ctx.font = '700 14px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(d + 1), p.x, p.y + 0.5)
        ctx.fillStyle = live ? DEPOT_COLORS[d] : 'rgba(255,255,255,0.35)'
        ctx.font = '600 11px "JetBrains Mono", monospace'
        ctx.fillText(live ? `rent ${inst.rent[d]}` : `shut, saves ${inst.rent[d]}`, p.x, p.y + 33)
        ctx.restore()
      })

      inst.shop.forEach((p, i) => {
        const d = sol[i]
        ctx.save()
        if (i === hover) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 26, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.09)'
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, 13, 0, Math.PI * 2)
        ctx.fillStyle = DEPOT_COLORS[d]
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = ref && ref[i] !== d ? '#ffffff' : DEPOT_COLORS[d]
        ctx.stroke()
        ctx.restore()
      })
    }

    const onMove = (ev: PointerEvent) => {
      const next = nearestIndex(s.toVirtual(ev), inst.shop, 34)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = nearestIndex(s.toVirtual(ev), inst.shop, 34)
      if (hit < 0) return
      const next = [...sol]
      next[hit] = (next[hit] + 1) % DEPOTS
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

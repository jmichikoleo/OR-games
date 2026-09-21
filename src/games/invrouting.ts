import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, dist } from '../core/geom'
import { makeSurface } from '../core/canvas'

const SHOPS = 4
const DAYS = 5
const MASKS = 1 << SHOPS
const PANEL = 290
const GAP = 22
const TOP = 36
const VGAP = 18
const COLS = 3
/** Five days laid out three across and two down, so a panel keeps its size
 *  on a narrow screen instead of shrinking to a postage stamp. */
const VW = COLS * PANEL + (COLS - 1) * GAP
const VH = 2 * (TOP + PANEL) + VGAP
const NAMES = ['A', 'B', 'C', 'D']

interface Instance {
  /** Where the shops sit, in a hundred by hundred square. The yard is the middle. */
  at: Pt[]
  yard: Pt
  /** Tank size, what the shop gets through in a day, and what is in it on Monday. */
  tank: number[]
  daily: number[]
  start: number[]
  /** Cost of a unit sitting in a tank overnight. */
  hold: number
  /** Best round trip for every set of shops. Worked out once. */
  trip: number[]
}
/** Which shops the lorry calls on each day, as a set per day. */
type Solution = number[]

function tripsFor(at: Pt[], yard: Pt): number[] {
  const out = new Array(MASKS).fill(0)
  for (let mask = 1; mask < MASKS; mask++) {
    const stops: number[] = []
    for (let i = 0; i < SHOPS; i++) if ((mask >> i) & 1) stops.push(i)
    let best = Infinity
    const walk = (left: number[], from: Pt, run: number) => {
      if (run >= best) return
      if (!left.length) {
        best = Math.min(best, run + dist(from, yard))
        return
      }
      left.forEach((n, i) =>
        walk([...left.slice(0, i), ...left.slice(i + 1)], at[n], run + dist(from, at[n])),
      )
    }
    walk(stops, yard, 0)
    out[mask] = Math.round(best)
  }
  return out
}

interface Week {
  /** Level in each tank at the end of each day. */
  level: number[][]
  /** True where the tank actually ran out before the lorry arrived. Landing
   *  on exactly nothing is legal, so the two are not the same thing. */
  short: boolean[][]
  dry: number
  miles: number
  holding: number
}

function runWeek(inst: Instance, sol: Solution): Week {
  const level: number[][] = []
  const short: boolean[][] = []
  const have = [...inst.start]
  let dry = 0
  let miles = 0
  let holding = 0
  for (let d = 0; d < DAYS; d++) {
    miles += inst.trip[sol[d] & (MASKS - 1)]
    const ran: boolean[] = []
    for (let i = 0; i < SHOPS; i++) {
      if ((sol[d] >> i) & 1) have[i] = inst.tank[i]
      have[i] -= inst.daily[i]
      ran.push(have[i] < 0)
      if (have[i] < 0) {
        dry++
        have[i] = 0
      }
      holding += have[i] * inst.hold
    }
    level.push([...have])
    short.push(ran)
  }
  return { level, short, dry, miles, holding: Math.round(holding) }
}

const billOf = (inst: Instance, sol: Solution) => {
  const w = runWeek(inst, sol)
  return w.miles + w.holding
}

/** Only call when the tank would otherwise run dry. Cheap on lorries and
 *  dear on everything else, because it sends one out nearly every day. */
function lastMinute(inst: Instance): Solution {
  const have = [...inst.start]
  const out: number[] = []
  for (let d = 0; d < DAYS; d++) {
    let mask = 0
    for (let i = 0; i < SHOPS; i++) {
      if (have[i] - inst.daily[i] < 0) mask |= 1 << i
    }
    for (let i = 0; i < SHOPS; i++) {
      if ((mask >> i) & 1) have[i] = inst.tank[i]
      have[i] = Math.max(0, have[i] - inst.daily[i])
    }
    out.push(mask)
  }
  return out
}

/** Walk the sets of shops day by day, dropping any week that has already
 *  cost more than the best one found or has let a tank run dry. */
function bestWeek(inst: Instance): Solution {
  const sol = new Array(DAYS).fill(0)
  let best = lastMinute(inst)
  let bestVal = billOf(inst, best)
  const have = [...inst.start]
  const walk = (d: number, spend: number) => {
    if (spend >= bestVal) return
    if (d === DAYS) {
      bestVal = spend
      best = [...sol]
      return
    }
    for (let mask = 0; mask < MASKS; mask++) {
      const keep = [...have]
      let ok = true
      let add = inst.trip[mask]
      for (let i = 0; i < SHOPS; i++) {
        if ((mask >> i) & 1) have[i] = inst.tank[i]
        have[i] -= inst.daily[i]
        if (have[i] < 0) ok = false
        add += have[i] * inst.hold
      }
      if (ok) {
        sol[d] = mask
        walk(d + 1, spend + add)
      }
      for (let i = 0; i < SHOPS; i++) have[i] = keep[i]
    }
  }
  walk(0, 0)
  return best
}

export const invrouting: Minigame<Instance, Solution> = {
  id: 'invrouting',
  title: 'Top Them Up',
  problem: 'Inventory Routing',
  family: 'routing',
  blurb: 'Four shops with tanks that empty at their own pace and one lorry for the week. Nobody tells you when to go. Turn up late and a tank runs dry, turn up often and you pay for a round trip that filled one tank halfway.',
  howTo: 'Click a shop on any day to call on it that day, and the lorry fills its tank right up. The number on each shop is what is left in it that night. Calling on two shops on the same day is one trip, not two.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      const yard = { x: 50, y: 50 }
      // Shops need room between them or two of them land on the same dot and
      // there is nothing to click.
      const at: Pt[] = []
      let guard = 0
      while (at.length < SHOPS && guard++ < 4000) {
        const q = { x: 10 + rng.next() * 80, y: 10 + rng.next() * 80 }
        if (dist(q, yard) < 20) continue
        if (at.some((o) => dist(q, o) < 28)) continue
        at.push(q)
      }
      if (at.length < SHOPS) continue
      const daily = Array.from({ length: SHOPS }, () => 5 + rng.int(8))
      const tank = daily.map((u) => u * (2 + rng.int(3)) + rng.int(6))
      const inst: Instance = {
        at,
        yard,
        daily,
        tank,
        start: tank.map((c, i) => Math.max(daily[i], Math.round(c * (0.35 + rng.next() * 0.5)))),
        hold: 1 + rng.int(3),
        trip: tripsFor(at, yard),
      }
      const best = billOf(inst, bestWeek(inst))
      const late = billOf(inst, lastMinute(inst))
      // Only a week where waiting until a tank is nearly dry costs you.
      if (best / late < 0.88 || tries > 120) return inst
    }
  },

  initial(inst): Solution {
    return lastMinute(inst)
  },

  evaluate(inst, sol) {
    const w = runWeek(inst, sol)
    if (w.dry > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${w.dry} shop day${w.dry === 1 ? '' : 's'} ran dry before the lorry got there.`,
      }
    }
    const runs = sol.filter((m) => m).length
    return {
      value: w.miles + w.holding,
      feasible: true,
      note: `${runs} day${runs === 1 ? '' : 's'} out for ${w.miles} miles, and ${w.holding} of stock sitting in tanks.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestWeek(inst), label: 'branch and bound', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let hover: [number, number] = [-1, -1]

    const cornerOf = (d: number) => ({
      x: (d % COLS) * (PANEL + GAP),
      y: Math.floor(d / COLS) * (TOP + PANEL + VGAP) + TOP,
    })
    const inPanel = (d: number, p: Pt): Pt => {
      const c = cornerOf(d)
      return { x: c.x + 18 + (p.x / 100) * (PANEL - 36), y: c.y + 18 + (p.y / 100) * (PANEL - 36) }
    }
    const spotOf = (d: number, i: number): Pt => inPanel(d, inst.at[i])
    const yardOf = (d: number): Pt => inPanel(d, inst.yard)

    const hitAt = (p: Pt): [number, number] => {
      for (let d = 0; d < DAYS; d++) {
        for (let i = 0; i < SHOPS; i++) {
          if (dist(p, spotOf(d, i)) < 24) return [d, i]
        }
      }
      return [-1, -1]
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      ctx.clearRect(0, 0, VW, VH)
      const week = runWeek(inst, sol)

      for (let d = 0; d < DAYS; d++) {
        const { x: x0, y: y0 } = cornerOf(d)
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(x0, y0, PANEL, PANEL, 10)
        ctx.fillStyle = 'rgba(255,255,255,0.03)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.font = '700 13px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(`day ${d + 1}`, x0 + 3, y0 - 18)
        ctx.fillStyle = sol[d] ? accent : 'rgba(255,255,255,0.3)'
        ctx.font = '600 11.5px "JetBrains Mono", monospace'
        ctx.fillText(sol[d] ? `${inst.trip[sol[d]]} miles` : 'lorry stays in', x0 + 3, y0 - 4)
        ctx.restore()

        if (ref && ref[d]) {
          ctx.save()
          ctx.setLineDash([4, 5])
          ctx.strokeStyle = 'rgba(255,255,255,0.45)'
          ctx.lineWidth = 1.5
          const stops: number[] = []
          for (let i = 0; i < SHOPS; i++) if ((ref[d] >> i) & 1) stops.push(i)
          ctx.beginPath()
          ctx.moveTo(yardOf(d).x, yardOf(d).y)
          stops.forEach((i) => ctx.lineTo(spotOf(d, i).x, spotOf(d, i).y))
          ctx.lineTo(yardOf(d).x, yardOf(d).y)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.restore()
        }

        if (sol[d]) {
          const stops: number[] = []
          for (let i = 0; i < SHOPS; i++) if ((sol[d] >> i) & 1) stops.push(i)
          ctx.save()
          ctx.strokeStyle = accent
          ctx.lineWidth = 2
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(yardOf(d).x, yardOf(d).y)
          stops.forEach((i) => ctx.lineTo(spotOf(d, i).x, spotOf(d, i).y))
          ctx.lineTo(yardOf(d).x, yardOf(d).y)
          ctx.stroke()
          ctx.restore()
        }

        const y = yardOf(d)
        ctx.save()
        ctx.beginPath()
        ctx.arc(y.x, y.y, 7, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fill()
        ctx.restore()

        for (let i = 0; i < SHOPS; i++) {
          const p = spotOf(d, i)
          const called = ((sol[d] >> i) & 1) === 1
          const left = week.level[d][i]
          const empty = week.short[d][i]
          ctx.save()
          if (hover[0] === d && hover[1] === i) {
            ctx.beginPath()
            ctx.arc(p.x, p.y, 28, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(255,255,255,0.1)'
            ctx.fill()
          }
          ctx.beginPath()
          ctx.arc(p.x, p.y, 20, 0, Math.PI * 2)
          ctx.fillStyle = empty ? '#ff5c7a' : called ? accent : '#14121a'
          ctx.fill()
          ctx.lineWidth = 2
          ctx.strokeStyle = empty ? '#ff5c7a' : called ? accent : 'rgba(255,255,255,0.3)'
          ctx.stroke()
          ctx.fillStyle = empty || called ? '#0b090e' : 'rgba(255,255,255,0.7)'
          ctx.font = '700 14px "JetBrains Mono", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(left), p.x, p.y + 0.5)
          ctx.fillStyle = 'rgba(255,255,255,0.4)'
          ctx.font = '600 10px "JetBrains Mono", monospace'
          ctx.fillText(NAMES[i], p.x, p.y - 29)
          ctx.restore()
        }
      }

      // The sixth slot is spare, so the shop details live there.
      const spare = cornerOf(DAYS)
      ctx.save()
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = '700 12px "JetBrains Mono", monospace'
      ctx.fillText('the shops', spare.x + 4, spare.y + 4)
      inst.at.forEach((_, i) => {
        ctx.fillStyle = week.short.some((row) => row[i]) ? '#ff5c7a' : 'rgba(255,255,255,0.62)'
        ctx.font = '600 12px "JetBrains Mono", monospace'
        ctx.fillText(
          `${NAMES[i]}  tank ${inst.tank[i]}, uses ${inst.daily[i]} a day`,
          spare.x + 4,
          spare.y + 32 + i * 21,
        )
      })
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.font = '600 11px "JetBrains Mono", monospace'
      ctx.fillText(`stock costs ${inst.hold} a unit a night`, spare.x + 4, spare.y + 32 + SHOPS * 21 + 8)
      ctx.restore()
    }

    const onMove = (ev: PointerEvent) => {
      const next = hitAt(s.toVirtual(ev))
      if (next[0] !== hover[0] || next[1] !== hover[1]) {
        hover = next
        s.canvas.style.cursor = next[0] >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const [d, i] = hitAt(s.toVirtual(ev))
      if (d < 0) return
      const next = [...sol]
      next[d] ^= 1 << i
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

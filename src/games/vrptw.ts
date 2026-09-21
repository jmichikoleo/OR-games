import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, dist, nearestIndex, scatter } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 620
const STOPS = 8
const NODES = STOPS + 1
/** Board units the van covers in a minute. */
const SPEED = 13
const OPENS = 8 * 60

interface Instance {
  at: Pt[]
  /** Earliest and latest the door is open, in minutes from eight.  */
  from: number[]
  until: number[]
  /** How long you are inside. */
  stay: number[]
}
/** The stops in the order you call on them. */
type Solution = number[]

const drive = (inst: Instance, a: number, b: number) => dist(inst.at[a], inst.at[b]) / SPEED

const clock = (m: number) => {
  const t = Math.round(OPENS + m)
  return `${Math.floor(t / 60)}.${String(t % 60).padStart(2, '0')}`
}

interface Call {
  stop: number
  arrive: number
  begin: number
  leave: number
  late: boolean
}

function run(inst: Instance, sol: Solution): Call[] {
  const out: Call[] = []
  let t = 0
  let at = 0
  for (const stop of sol) {
    const arrive = t + drive(inst, at, stop)
    const begin = Math.max(arrive, inst.from[stop])
    out.push({ stop, arrive, begin, leave: begin + inst.stay[stop], late: arrive > inst.until[stop] })
    t = begin + inst.stay[stop]
    at = stop
  }
  return out
}

const homeAt = (inst: Instance, sol: Solution) => {
  const calls = run(inst, sol)
  if (!calls.length) return 0
  const last = calls[calls.length - 1]
  return Math.round(last.leave + drive(inst, last.stop, 0))
}

/**
 * Held-Karp where the number held is the earliest you can be finished at that
 * stop having called on that set. Turning up early only ever means waiting, so
 * earliest is always at least as good, and the search stays exact.
 */
function bestRound(inst: Instance): Solution | null {
  const full = 1 << STOPS
  const done = Array.from({ length: full }, () => new Float64Array(STOPS).fill(Infinity))
  const via = Array.from({ length: full }, () => new Int8Array(STOPS).fill(-1))
  for (let j = 0; j < STOPS; j++) {
    const stop = j + 1
    const arrive = drive(inst, 0, stop)
    if (arrive > inst.until[stop]) continue
    done[1 << j][j] = Math.max(arrive, inst.from[stop]) + inst.stay[stop]
  }
  for (let mask = 1; mask < full; mask++) {
    for (let j = 0; j < STOPS; j++) {
      const t = done[mask][j]
      if (t === Infinity || !((mask >> j) & 1)) continue
      for (let k = 0; k < STOPS; k++) {
        if ((mask >> k) & 1) continue
        const stop = k + 1
        const arrive = t + drive(inst, j + 1, stop)
        if (arrive > inst.until[stop]) continue
        const end = Math.max(arrive, inst.from[stop]) + inst.stay[stop]
        const next = mask | (1 << k)
        if (end < done[next][k]) {
          done[next][k] = end
          via[next][k] = j
        }
      }
    }
  }
  let end = -1
  let bestVal = Infinity
  for (let j = 0; j < STOPS; j++) {
    const v = done[full - 1][j] + drive(inst, j + 1, 0)
    if (v < bestVal) {
      bestVal = v
      end = j
    }
  }
  if (end < 0 || bestVal === Infinity) return null
  const order: number[] = []
  let mask = full - 1
  let j = end
  while (j >= 0) {
    order.push(j + 1)
    const prev = via[mask][j]
    mask ^= 1 << j
    j = prev
  }
  return order.reverse()
}

export const vrptw: Minigame<Instance, Solution> = {
  id: 'vrptw',
  title: 'On the Clock',
  problem: 'Vehicle Routing with Time Windows',
  family: 'routing',
  blurb: 'Eight drops and every door is only open for part of the morning. Turning up early just means sitting outside, and turning up late means the drop does not happen at all, so the shortest way round is almost never the right way round.',
  howTo: 'Click a stop to drive there next. Click the one you are parked at to back out of it. The van leaves the depot at eight and you are scored on when it gets back.',
  objective: 'min',
  unit: 'min',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      let at = scatter(NODES, VW, VH, 85, 150, rng.next)
      while (at.length < NODES) at = scatter(NODES, VW, VH, 85, 150, rng.next)
      const inst: Instance = {
        at,
        from: new Array(NODES).fill(0),
        until: new Array(NODES).fill(600),
        stay: at.map(() => 5 + rng.int(9)),
      }
      // Walk one made up round and hang a window off each arrival, so the
      // morning is known to be doable before anybody plays it.
      const order = Array.from({ length: STOPS }, (_, i) => i + 1)
      for (let i = order.length - 1; i > 0; i--) {
        const j = rng.int(i + 1)
        ;[order[i], order[j]] = [order[j], order[i]]
      }
      let t = 0
      let here = 0
      for (const stop of order) {
        t += drive(inst, here, stop)
        inst.from[stop] = Math.max(0, Math.round(t - rng.int(22)))
        inst.until[stop] = Math.round(t + 8 + rng.int(26))
        t = Math.max(t, inst.from[stop]) + inst.stay[stop]
        here = stop
      }
      const best = bestRound(inst)
      if (!best) continue
      const plain = homeAt(inst, order)
      // Keep a morning where the made up round is well off the answer.
      if (homeAt(inst, best) / plain < 0.88 || tries > 200) return inst
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    if (sol.length < STOPS) {
      const left = STOPS - sol.length
      return { value: 0, feasible: false, note: `${left} drop${left === 1 ? '' : 's'} still to make.` }
    }
    const calls = run(inst, sol)
    const late = calls.filter((c) => c.late).length
    if (late) {
      return {
        value: 0,
        feasible: false,
        note: `${late} door${late === 1 ? ' was' : 's were'} shut by the time you got there.`,
      }
    }
    const waiting = Math.round(calls.reduce((a, c) => a + (c.begin - c.arrive), 0))
    return {
      value: homeAt(inst, sol),
      feasible: true,
      note: `Back at ${clock(homeAt(inst, sol))} with ${waiting} minutes spent waiting on doors.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestRound(inst)!, label: 'Held-Karp', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let hover = -1

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const calls = run(inst, sol)
      const here = sol.length ? sol[sol.length - 1] : 0

      if (ref) {
        ctx.save()
        ctx.setLineDash([6, 7])
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(inst.at[0].x, inst.at[0].y)
        ref.forEach((stop) => ctx.lineTo(inst.at[stop].x, inst.at[stop].y))
        ctx.lineTo(inst.at[0].x, inst.at[0].y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }

      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = accent
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(inst.at[0].x, inst.at[0].y)
      sol.forEach((stop) => ctx.lineTo(inst.at[stop].x, inst.at[stop].y))
      if (sol.length === STOPS) ctx.lineTo(inst.at[0].x, inst.at[0].y)
      ctx.stroke()
      ctx.restore()

      inst.at.forEach((p, i) => {
        const call = calls.find((c) => c.stop === i)
        const isHere = i === here
        const reachable = i !== 0 && !sol.includes(i)
        ctx.save()
        if (i === hover && (reachable || isHere)) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 30, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.09)'
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, i === 0 ? 19 : 16, 0, Math.PI * 2)
        const col = i === 0 ? accent : call ? (call.late ? '#ff5c7a' : accent) : '#0f1218'
        ctx.fillStyle = col
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = call?.late ? '#ff5c7a' : call || i === 0 ? accent : 'rgba(255,255,255,0.4)'
        ctx.stroke()
        ctx.fillStyle = call || i === 0 ? '#0b090e' : 'rgba(255,255,255,0.75)'
        ctx.font = '700 13px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(i === 0 ? 'D' : call ? String(sol.indexOf(i) + 1) : String(i), p.x, p.y + 0.5)

        if (i > 0) {
          ctx.font = '600 11px "JetBrains Mono", monospace'
          ctx.fillStyle = 'rgba(255,255,255,0.55)'
          ctx.fillText(`${clock(inst.from[i])} to ${clock(inst.until[i])}`, p.x, p.y + 32)
          if (call) {
            const waited = call.begin - call.arrive
            ctx.fillStyle = call.late ? '#ff5c7a' : waited > 1 ? '#ffbe3d' : '#52e68a'
            ctx.fillText(
              call.late ? `shut at ${clock(call.arrive)}` : `in at ${clock(call.begin)}`,
              p.x,
              p.y + 46,
            )
          }
        }
        ctx.restore()
      })
    }

    const onMove = (ev: PointerEvent) => {
      const next = nearestIndex(s.toVirtual(ev), inst.at, 42)
      if (next !== hover) {
        hover = next
        const here = sol.length ? sol[sol.length - 1] : 0
        s.canvas.style.cursor = next > 0 && (next === here || !sol.includes(next)) ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = nearestIndex(s.toVirtual(ev), inst.at, 42)
      if (hit <= 0) return
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

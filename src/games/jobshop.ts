import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 516
const JOBS = 4
const MACH = 3
const OPS = JOBS * MACH
const PAD = 74
const SPAN = VW - PAD - 40
const LANE_Y = [88, 186, 284]
const LANE_H = 60
const AXIS_Y = 366
const GHOST_Y = [400, 434, 468]
const GHOST_H = 26

const LETTERS = 'ABCD'
const COLORS = ['#a78bfa', '#38bdf8', '#34d399', '#fbbf24']

interface Op {
  machine: number
  dur: number
}
interface Instance {
  /** jobs[j] is job j's operations, in the order they must happen. */
  jobs: Op[][]
  /** opAt[j][m] is which operation of job j runs on machine m. */
  opAt: number[][]
}
/** For each machine, the order it works through the jobs. */
type Solution = number[][]

const opId = (j: number, k: number) => j * MACH + k

interface Schedule {
  start: number[]
  makespan: number
  ok: boolean
}

/**
 * Turn "what order does each machine work in" into actual start times, by
 * longest path through the disjunctive graph. Some order combinations are
 * genuinely impossible — machine 1 waiting on machine 2 waiting on machine 1 —
 * and those come back as a deadlock rather than a schedule.
 */
function schedule(inst: Instance, sol: Solution): Schedule {
  const preds: number[][] = Array.from({ length: OPS }, () => [])
  const indeg = new Array(OPS).fill(0)

  const link = (from: number, to: number) => {
    preds[to].push(from)
    indeg[to]++
  }

  for (let j = 0; j < JOBS; j++) {
    for (let k = 1; k < MACH; k++) link(opId(j, k - 1), opId(j, k))
  }
  for (let m = 0; m < MACH; m++) {
    const order = sol[m]
    for (let i = 1; i < order.length; i++) {
      link(opId(order[i - 1], inst.opAt[order[i - 1]][m]), opId(order[i], inst.opAt[order[i]][m]))
    }
  }

  const start = new Array(OPS).fill(0)
  const queue: number[] = []
  for (let i = 0; i < OPS; i++) if (indeg[i] === 0) queue.push(i)

  const succ: number[][] = Array.from({ length: OPS }, () => [])
  preds.forEach((ps, to) => ps.forEach((from) => succ[from].push(to)))

  let seen = 0
  while (queue.length) {
    const u = queue.shift()!
    seen++
    const j = Math.floor(u / MACH)
    const k = u % MACH
    const end = start[u] + inst.jobs[j][k].dur
    for (const v of succ[u]) {
      if (end > start[v]) start[v] = end
      if (--indeg[v] === 0) queue.push(v)
    }
  }

  if (seen < OPS) return { start, makespan: 0, ok: false }

  let makespan = 0
  for (let j = 0; j < JOBS; j++) {
    for (let k = 0; k < MACH; k++) {
      makespan = Math.max(makespan, start[opId(j, k)] + inst.jobs[j][k].dur)
    }
  }
  return { start, makespan, ok: true }
}

/** No schedule can beat the busiest machine or the longest single job. */
function lowerBound(inst: Instance): number {
  const machine = new Array(MACH).fill(0)
  let job = 0
  for (let j = 0; j < JOBS; j++) {
    let total = 0
    for (let k = 0; k < MACH; k++) {
      total += inst.jobs[j][k].dur
      machine[inst.jobs[j][k].machine] += inst.jobs[j][k].dur
    }
    job = Math.max(job, total)
  }
  return Math.max(job, ...machine)
}

const PERMS: number[][] = (() => {
  const out: number[][] = []
  const walk = (left: number[], acc: number[]) => {
    if (!left.length) return void out.push(acc)
    left.forEach((x, i) => walk([...left.slice(0, i), ...left.slice(i + 1)], [...acc, x]))
  }
  walk([0, 1, 2, 3], [])
  return out
})()

export const jobshop: Minigame<Instance, Solution> = {
  id: 'jobshop',
  title: 'Shop Floor',
  problem: 'Job Shop Scheduling',
  family: 'scheduling',
  blurb: 'Four jobs, three machines. Every job needs the machines in its own fixed order, and no machine can do two things at once.',
  howTo: 'Click an operation to lift it, then click a gap on the same machine to drop it. Gaps in a lane are a machine waiting on another machine.',
  objective: 'min',
  unit: 'min',

  generate(rng: RNG): Instance {
    const jobs: Op[][] = Array.from({ length: JOBS }, () => {
      const route = [0, 1, 2]
      for (let i = route.length - 1; i > 0; i--) {
        const k = rng.int(i + 1)
        ;[route[i], route[k]] = [route[k], route[i]]
      }
      return route.map((machine) => ({ machine, dur: 4 + rng.int(11) }))
    })
    const opAt = jobs.map((ops) => {
      const at = new Array(MACH).fill(0)
      ops.forEach((o, k) => (at[o.machine] = k))
      return at
    })
    return { jobs, opAt }
  },

  initial(): Solution {
    // Every machine takes the jobs in name order — always schedulable, never good.
    return Array.from({ length: MACH }, () => Array.from({ length: JOBS }, (_, j) => j))
  },

  evaluate(inst, sol) {
    const sch = schedule(inst, sol)
    if (!sch.ok) {
      return {
        value: 0,
        feasible: false,
        note: 'Deadlock. Two machines are each waiting for the other, so reorder one of them.',
      }
    }
    const lb = lowerBound(inst)
    return {
      value: sch.makespan,
      feasible: true,
      note:
        sch.makespan === lb
          ? 'Finished at the lower bound. No schedule can do better.'
          : `Finished at ${sch.makespan} and nothing can beat ${lb}.`,
    }
  },

  solve(inst): Reference<Solution> {
    // 24 orders per machine, three machines: 13,824 combinations, all checked.
    let best: Solution = inst.jobs.map(() => [0, 1, 2, 3])
    let bestSpan = Infinity
    for (const a of PERMS) {
      for (const b of PERMS) {
        for (const c of PERMS) {
          const cand = [a, b, c]
          const sch = schedule(inst, cand)
          if (sch.ok && sch.makespan < bestSpan) {
            bestSpan = sch.makespan
            best = [a.slice(), b.slice(), c.slice()]
          }
        }
      }
    }
    return { solution: best, label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    const lb = lowerBound(inst)

    let sol: Solution = api.current()
    let ref: Solution | null = null
    let held: { m: number; pos: number } | null = null
    let slot = -1
    let boxes: { m: number; pos: number; x: number; y: number; w: number; h: number }[] = []
    let axisMax = 1

    /** Insertion points along one lane, in the current schedule's coordinates. */
    function laneSlots(m: number, sch: Schedule): number[] {
      const xs: number[] = []
      const order = sol[m]
      order.forEach((j) => {
        const k = inst.opAt[j][m]
        xs.push(sch.start[opId(j, k)])
      })
      const lastJob = order[order.length - 1]
      if (lastJob !== undefined) {
        const k = inst.opAt[lastJob][m]
        xs.push(sch.start[opId(lastJob, k)] + inst.jobs[lastJob][k].dur)
      }
      return xs
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const sch = schedule(inst, sol)
      boxes = []

      axisMax = Math.max(sch.ok ? sch.makespan : lb * 1.6, lb) * 1.1
      const xOf = (t: number) => PAD + (t / axisMax) * SPAN

      LANE_Y.forEach((y, m) => {
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(PAD, y, SPAN, LANE_H, 6)
        ctx.fillStyle = 'rgba(255,255,255,0.035)'
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.45)'
        ctx.font = '500 12px "JetBrains Mono", monospace'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(`M${m + 1}`, PAD - 14, y + LANE_H / 2)
        ctx.restore()
      })

      // Operations, laid out either at their real start times or, when the
      // orders deadlock, just packed in sequence so you can still see them.
      let packed = new Array(MACH).fill(0)
      sol.forEach((order, m) => {
        order.forEach((j, pos) => {
          const k = inst.opAt[j][m]
          const dur = inst.jobs[j][k].dur
          const t = sch.ok ? sch.start[opId(j, k)] : packed[m]
          packed[m] += dur
          const x = xOf(t)
          const w = (dur / axisMax) * SPAN
          const y = LANE_Y[m]
          boxes.push({ m, pos, x, y, w, h: LANE_H })

          const lifted = held?.m === m && held.pos === pos
          ctx.save()
          ctx.beginPath()
          ctx.roundRect(x + 1, y + 4, Math.max(2, w - 2), LANE_H - 8, 4)
          ctx.fillStyle = COLORS[j]
          ctx.globalAlpha = lifted ? 0.3 : sch.ok ? 0.8 : 0.35
          ctx.fill()
          ctx.globalAlpha = 1
          if (lifted) {
            ctx.setLineDash([5, 4])
            ctx.strokeStyle = 'rgba(255,255,255,0.85)'
            ctx.lineWidth = 2
            ctx.stroke()
            ctx.setLineDash([])
          }
          ctx.fillStyle = '#0a0c10'
          ctx.font = '700 13px "JetBrains Mono", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          if (w > 24) ctx.fillText(`${LETTERS[j]}${k + 1}`, x + w / 2, y + LANE_H / 2 - 6)
          if (w > 30) {
            ctx.font = '500 10px "JetBrains Mono", monospace'
            ctx.fillText(String(dur), x + w / 2, y + LANE_H / 2 + 9)
          }
          ctx.restore()
        })
      })

      if (held && sch.ok) {
        const lane = held.m
        const xs = laneSlots(lane, sch)
        xs.forEach((t, i) => {
          const on = i === slot
          ctx.save()
          ctx.strokeStyle = on ? accent : 'rgba(255,255,255,0.3)'
          ctx.lineWidth = on ? 3.5 : 2
          if (on) {
            ctx.shadowColor = accent
            ctx.shadowBlur = 10
          }
          ctx.beginPath()
          ctx.moveTo(xOf(t), LANE_Y[lane] - 8)
          ctx.lineTo(xOf(t), LANE_Y[lane] + LANE_H + 8)
          ctx.stroke()
          ctx.restore()
        })
      }

      // Lower bound and finish markers.
      ctx.save()
      ctx.setLineDash([5, 5])
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(xOf(lb), LANE_Y[0] - 24)
      ctx.lineTo(xOf(lb), LANE_Y[2] + LANE_H + 8)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '500 10px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText('lower bound', xOf(lb), LANE_Y[0] - 28)
      ctx.restore()

      if (sch.ok) {
        ctx.save()
        ctx.strokeStyle = accent
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(xOf(sch.makespan), LANE_Y[0] - 12)
        ctx.lineTo(xOf(sch.makespan), LANE_Y[2] + LANE_H + 8)
        ctx.stroke()
        ctx.fillStyle = accent
        ctx.font = '700 12px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(`finish ${sch.makespan}`, xOf(sch.makespan) + 7, LANE_Y[2] + LANE_H + 12)
        ctx.restore()
      }

      if (ref) {
        const rs = schedule(inst, ref)
        if (rs.ok) {
          // Ghost Gantt of the solver's schedule: seeing the number it hit is
          // useless without seeing the arrangement that got there.
          ctx.save()
          ctx.fillStyle = 'rgba(255,255,255,0.4)'
          ctx.font = '500 10px "JetBrains Mono", monospace'
          ctx.textAlign = 'right'
          ctx.textBaseline = 'middle'
          ctx.fillText('optimal', PAD - 14, GHOST_Y[1] + GHOST_H / 2)
          ref.forEach((order, m) => {
            order.forEach((j) => {
              const k = inst.opAt[j][m]
              const dur = inst.jobs[j][k].dur
              const x = xOf(rs.start[opId(j, k)])
              const w = (dur / axisMax) * SPAN
              ctx.beginPath()
              ctx.roundRect(x + 1, GHOST_Y[m], Math.max(2, w - 2), GHOST_H, 3)
              ctx.fillStyle = COLORS[j]
              ctx.globalAlpha = 0.45
              ctx.fill()
              ctx.globalAlpha = 1
              if (w > 24) {
                ctx.fillStyle = 'rgba(255,255,255,0.9)'
                ctx.font = '700 10px "JetBrains Mono", monospace'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(`${LETTERS[j]}${k + 1}`, x + w / 2, GHOST_Y[m] + GHOST_H / 2)
              }
            })
          })
          ctx.restore()

          ctx.save()
          ctx.setLineDash([4, 4])
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(xOf(rs.makespan), LANE_Y[0] - 12)
          ctx.lineTo(xOf(rs.makespan), LANE_Y[2] + LANE_H + 8)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.fillStyle = 'rgba(255,255,255,0.8)'
          ctx.font = '700 11px "JetBrains Mono", monospace'
          ctx.textAlign = 'right'
          ctx.textBaseline = 'bottom'
          ctx.fillText(`optimal ${rs.makespan}`, xOf(rs.makespan) - 7, LANE_Y[0] - 14)
          ctx.restore()
        }
      }

      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.font = '500 10px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (let i = 0; i <= 4; i++) {
        const tv = Math.round((axisMax * i) / 4)
        ctx.beginPath()
        ctx.moveTo(xOf(tv), AXIS_Y - 6)
        ctx.lineTo(xOf(tv), AXIS_Y)
        ctx.stroke()
        ctx.fillText(String(tv), xOf(tv), AXIS_Y + 5)
      }
      ctx.restore()
    }

    const boxAt = (x: number, y: number) =>
      boxes.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) ?? null

    const nearestSlot = (m: number, x: number): number => {
      const sch = schedule(inst, sol)
      if (!sch.ok) return 0
      const xs = laneSlots(m, sch).map((t) => PAD + (t / axisMax) * SPAN)
      let best = 0
      let bestD = Infinity
      xs.forEach((bx, i) => {
        const d = Math.abs(bx - x)
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      return best
    }

    const onMove = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      if (held) {
        const next = nearestSlot(held.m, v.x)
        if (next !== slot) {
          slot = next
          draw(sol, ref)
        }
        return
      }
      s.canvas.style.cursor = boxAt(v.x, v.y) ? 'grab' : 'default'
    }

    const onClick = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      if (!held) {
        const b = boxAt(v.x, v.y)
        if (!b) return
        held = { m: b.m, pos: b.pos }
        slot = nearestSlot(b.m, v.x)
        draw(sol, ref)
        return
      }
      // Dropping far from the machine's own lane just puts it back.
      const laneTop = LANE_Y[held.m]
      if (v.y < laneTop - 40 || v.y > laneTop + LANE_H + 40) {
        held = null
        slot = -1
        draw(sol, ref)
        return
      }
      const from = held
      const target = nearestSlot(from.m, v.x)
      const next = sol.map((o) => [...o])
      const [job] = next[from.m].splice(from.pos, 1)
      next[from.m].splice(target > from.pos ? target - 1 : target, 0, job)
      held = null
      slot = -1
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

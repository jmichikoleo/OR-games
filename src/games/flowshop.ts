import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 470
const JOBS = 6
const MACH = 4
const PAD = 76
const SPAN = VW - PAD - 40
const LANE_Y = [84, 158, 232, 306]
const LANE_H = 52
const AXIS_Y = 392

const LETTERS = 'ABCDEF'
const COLORS = ['#ff4d9d', '#5b8cff', '#52e68a', '#ffbe3d', '#c77dff', '#3ddbd9']

interface Instance {
  /** times[job][station] */
  times: number[][]
}
/** The queue. Every station works through it in the same order. */
type Solution = number[]

interface Run {
  start: number[][]
  makespan: number
}

/** Each job waits for the station to free up and for its own previous station. */
function runLine(inst: Instance, seq: Solution): Run {
  const start: number[][] = []
  const done: number[][] = []
  seq.forEach((job, j) => {
    start.push(new Array(MACH).fill(0))
    done.push(new Array(MACH).fill(0))
    for (let k = 0; k < MACH; k++) {
      const afterPrevJob = j > 0 ? done[j - 1][k] : 0
      const afterPrevStation = k > 0 ? done[j][k - 1] : 0
      start[j][k] = Math.max(afterPrevJob, afterPrevStation)
      done[j][k] = start[j][k] + inst.times[job][k]
    }
  })
  return { start, makespan: done[seq.length - 1][MACH - 1] }
}

/** No queue can beat the busiest station or the longest single job. */
function lowerBound(inst: Instance): number {
  let byStation = 0
  for (let k = 0; k < MACH; k++) {
    byStation = Math.max(byStation, inst.times.reduce((a, t) => a + t[k], 0))
  }
  const byJob = Math.max(...inst.times.map((t) => t.reduce((a, b) => a + b, 0)))
  return Math.max(byStation, byJob)
}

const PERMS: number[][] = (() => {
  const out: number[][] = []
  const walk = (left: number[], acc: number[]) => {
    if (!left.length) return void out.push(acc)
    left.forEach((x, i) => walk([...left.slice(0, i), ...left.slice(i + 1)], [...acc, x]))
  }
  walk([0, 1, 2, 3, 4, 5], [])
  return out
})()

export const flowshop: Minigame<Instance, Solution> = {
  id: 'flowshop',
  title: 'Assembly Line',
  problem: 'Flow Shop Scheduling',
  family: 'scheduling',
  blurb: 'Six jobs, four stations, and every job goes through the stations in the same order. The only thing you decide is who queues where.',
  howTo: 'Click a job in the top row to lift it, then click a gap in that row to drop it. The other three stations follow whatever order you set.',
  objective: 'min',
  unit: 'min',

  generate(rng: RNG): Instance {
    return {
      times: Array.from({ length: JOBS }, () =>
        Array.from({ length: MACH }, () => 3 + rng.int(13)),
      ),
    }
  },

  initial(): Solution {
    return Array.from({ length: JOBS }, (_, i) => i)
  },

  evaluate(inst, sol) {
    const { makespan } = runLine(inst, sol)
    const lb = lowerBound(inst)
    return {
      value: makespan,
      feasible: true,
      note: makespan === lb
        ? 'Down to the lower bound. No queue can do better.'
        : `The last job leaves at ${makespan} and nothing can beat ${lb}.`,
    }
  },

  solve(inst): Reference<Solution> {
    let best = PERMS[0]
    let bestSpan = Infinity
    for (const perm of PERMS) {
      const span = runLine(inst, perm).makespan
      if (span < bestSpan) {
        bestSpan = span
        best = perm
      }
    }
    return { solution: [...best], label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    const lb = lowerBound(inst)

    let sol: Solution = api.current()
    let ref: Solution | null = null
    let held = -1
    let slot = -1
    let axisMax = 1
    let boxes: { pos: number; x: number; w: number }[] = []

    const queueSlots = (run: Run) => {
      const xs = sol.map((_, j) => run.start[j][0])
      const last = sol.length - 1
      xs.push(run.start[last][0] + inst.times[sol[last]][0])
      return xs
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const run = runLine(inst, sol)
      axisMax = Math.max(run.makespan, lb) * 1.08
      const xOf = (t: number) => PAD + (t / axisMax) * SPAN
      boxes = []

      LANE_Y.forEach((y, k) => {
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(PAD, y, SPAN, LANE_H, 6)
        ctx.fillStyle = 'rgba(255,255,255,0.035)'
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.45)'
        ctx.font = '500 12px "JetBrains Mono", monospace'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(`S${k + 1}`, PAD - 14, y + LANE_H / 2)
        ctx.restore()
      })

      sol.forEach((job, j) => {
        for (let k = 0; k < MACH; k++) {
          const x = xOf(run.start[j][k])
          const w = (inst.times[job][k] / axisMax) * SPAN
          const y = LANE_Y[k]
          if (k === 0) boxes.push({ pos: j, x, w })
          ctx.save()
          ctx.beginPath()
          ctx.roundRect(x + 1, y + 4, Math.max(2, w - 2), LANE_H - 8, 4)
          ctx.fillStyle = COLORS[job]
          ctx.globalAlpha = held === j ? 0.3 : 0.82
          ctx.fill()
          ctx.globalAlpha = 1
          if (held === j) {
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
          if (w > 20) ctx.fillText(LETTERS[job], x + w / 2, y + LANE_H / 2)
          ctx.restore()
        }
      })

      if (held >= 0) {
        queueSlots(run).forEach((t, i) => {
          const on = i === slot
          ctx.save()
          ctx.strokeStyle = on ? accent : 'rgba(255,255,255,0.3)'
          ctx.lineWidth = on ? 3.5 : 2
          if (on) {
            ctx.shadowColor = accent
            ctx.shadowBlur = 10
          }
          ctx.beginPath()
          ctx.moveTo(xOf(t), LANE_Y[0] - 10)
          ctx.lineTo(xOf(t), LANE_Y[0] + LANE_H + 10)
          ctx.stroke()
          ctx.restore()
        })
      }

      ctx.save()
      ctx.setLineDash([5, 5])
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(xOf(lb), LANE_Y[0] - 26)
      ctx.lineTo(xOf(lb), LANE_Y[3] + LANE_H + 8)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '500 10px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText('lower bound', xOf(lb), LANE_Y[0] - 30)
      ctx.restore()

      ctx.save()
      ctx.strokeStyle = accent
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(xOf(run.makespan), LANE_Y[0] - 14)
      ctx.lineTo(xOf(run.makespan), LANE_Y[3] + LANE_H + 8)
      ctx.stroke()
      ctx.fillStyle = accent
      ctx.font = '700 12px "JetBrains Mono", monospace'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.fillText(`done at ${run.makespan}`, xOf(run.makespan) - 8, LANE_Y[3] + LANE_H + 12)
      ctx.restore()

      if (ref) {
        const rs = runLine(inst, ref)
        ctx.save()
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(xOf(rs.makespan), LANE_Y[0] - 14)
        ctx.lineTo(xOf(rs.makespan), LANE_Y[3] + LANE_H + 8)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.font = '700 11px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        ctx.fillText(`best ${rs.makespan}`, xOf(rs.makespan) + 8, LANE_Y[0] - 16)
        ctx.fillStyle = 'rgba(255,255,255,0.45)'
        ctx.font = '500 11px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(`best queue ${ref.map((j) => LETTERS[j]).join(' ')}`, PAD, 24)
        ctx.restore()
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

    const nearestSlot = (x: number) => {
      const xs = queueSlots(runLine(inst, sol)).map((t) => PAD + (t / axisMax) * SPAN)
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
      if (held >= 0) {
        const next = nearestSlot(v.x)
        if (next !== slot) {
          slot = next
          draw(sol, ref)
        }
        return
      }
      const over =
        v.y >= LANE_Y[0] && v.y <= LANE_Y[0] + LANE_H
          ? boxes.find((b) => v.x >= b.x && v.x <= b.x + b.w)
          : undefined
      s.canvas.style.cursor = over ? 'grab' : 'default'
    }

    const onClick = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      if (held < 0) {
        if (v.y < LANE_Y[0] - 12 || v.y > LANE_Y[0] + LANE_H + 12) return
        const box = boxes.find((b) => v.x >= b.x && v.x <= b.x + b.w)
        if (!box) return
        held = box.pos
        slot = nearestSlot(v.x)
        draw(sol, ref)
        return
      }
      if (v.y < LANE_Y[0] - 46 || v.y > LANE_Y[0] + LANE_H + 46) {
        held = -1
        slot = -1
        draw(sol, ref)
        return
      }
      const from = held
      const target = nearestSlot(v.x)
      const next = [...sol]
      const [job] = next.splice(from, 1)
      next.splice(target > from ? target - 1 : target, 0, job)
      held = -1
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

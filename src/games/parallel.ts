import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 400
const MACHINES = 3
const JOBS = 12
const PAD = 78
const SPAN = VW - PAD - 40
const LANE_Y = [86, 176, 266]
const LANE_H = 56
const AXIS_Y = 344

const LETTERS = 'ABCDEFGHIJKL'
const COLORS = [
  '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#22d3ee',
  '#fb923c', '#c084fc', '#4ade80', '#38bdf8', '#facc15', '#f87171',
]

interface Instance {
  times: number[]
  total: number
}
/** Machine index for each job. */
type Solution = number[]

const loadsOf = (inst: Instance, sol: Solution) => {
  const l = new Array(MACHINES).fill(0)
  sol.forEach((m, j) => (l[m] += inst.times[j]))
  return l
}

/**
 * P || Cmax is NP-hard, but at 12 jobs and 3 machines every assignment fits in
 * 3^11 once job A is pinned to the first machine (the machines are identical,
 * so that costs nothing). Exhaustive, so the target really is the optimum.
 */
function optimalAssign(inst: Instance): Solution {
  const n = inst.times.length
  const combos = Math.pow(MACHINES, n - 1)
  const assign = new Array(n).fill(0)
  let bestSpan = Infinity
  let best: Solution = new Array(n).fill(0)

  for (let code = 0; code < combos; code++) {
    let c = code
    for (let i = 1; i < n; i++) {
      assign[i] = c % MACHINES
      c = Math.floor(c / MACHINES)
    }
    const load = new Array(MACHINES).fill(0)
    for (let i = 0; i < n; i++) load[assign[i]] += inst.times[i]
    const span = Math.max(load[0], load[1], load[2])
    if (span < bestSpan) {
      bestSpan = span
      best = [...assign]
    }
  }
  return best
}

export const parallel: Minigame<Instance, Solution> = {
  id: 'parallel',
  title: 'Three Lines',
  problem: 'Parallel Machine Scheduling',
  family: 'scheduling',
  blurb: 'Twelve jobs, three identical lines. You finish when the slowest line finishes, so the whole game is balancing them.',
  howTo: 'Click a job to send it to the next line. The white marker is your finish time. The dashed line is the perfect split nobody can beat.',
  objective: 'min',
  unit: 'min',

  generate(rng: RNG): Instance {
    const times = Array.from({ length: JOBS }, () => 6 + rng.int(22))
    return { times, total: times.reduce((a, b) => a + b, 0) }
  },

  initial(): Solution {
    // Round robin: a fair starting point that is almost never optimal.
    return Array.from({ length: JOBS }, (_, i) => i % MACHINES)
  },

  evaluate(inst, sol) {
    const l = loadsOf(inst, sol)
    return {
      value: Math.max(...l),
      feasible: true,
      note: `Lines finish at ${l.join(' · ')} minutes.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: optimalAssign(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    const axisMax = (inst.total / MACHINES) * 1.75
    const xOf = (t: number) => PAD + (t / axisMax) * SPAN

    let sol: Solution = api.current()
    let ref: Solution | null = null
    let hover = -1

    /** Screen rect of each job block, rebuilt on every draw for hit testing. */
    let boxes: { j: number; x: number; y: number; w: number; h: number }[] = []

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const load = loadsOf(inst, sol)
      const span = Math.max(...load)
      boxes = []

      // Lane tracks.
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
        ctx.fillText(`L${m + 1}`, PAD - 14, y + LANE_H / 2 - 8)
        ctx.fillStyle = load[m] === span ? accent : 'rgba(255,255,255,0.35)'
        ctx.font = '700 13px "JetBrains Mono", monospace'
        ctx.fillText(String(load[m]), PAD - 14, y + LANE_H / 2 + 10)
        ctx.restore()
      })

      // Blocks.
      const cursor = new Array(MACHINES).fill(0)
      sol.forEach((m, j) => {
        const t = inst.times[j]
        const x = xOf(cursor[m])
        const w = (t / axisMax) * SPAN
        const y = LANE_Y[m]
        cursor[m] += t
        boxes.push({ j, x, y, w, h: LANE_H })
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(x + 1, y + 3, Math.max(2, w - 2), LANE_H - 6, 4)
        ctx.fillStyle = COLORS[j % COLORS.length]
        ctx.globalAlpha = j === hover ? 0.95 : 0.72
        ctx.fill()
        ctx.globalAlpha = 1
        if (j === hover) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.stroke()
        }
        ctx.fillStyle = '#0a0c10'
        ctx.font = '700 13px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        if (w > 26) ctx.fillText(LETTERS[j], x + w / 2, y + LANE_H / 2 - 6)
        if (w > 34) {
          ctx.font = '500 10px "JetBrains Mono", monospace'
          ctx.fillText(String(t), x + w / 2, y + LANE_H / 2 + 9)
        }
        ctx.restore()
      })

      // Perfect split — the makespan nobody can go below.
      const perfect = inst.total / MACHINES
      ctx.save()
      ctx.setLineDash([5, 5])
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(xOf(perfect), LANE_Y[0] - 22)
      ctx.lineTo(xOf(perfect), LANE_Y[2] + LANE_H + 8)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '500 10px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText('perfect split', xOf(perfect), LANE_Y[0] - 26)
      ctx.restore()

      // Where you actually finish.
      ctx.save()
      ctx.strokeStyle = accent
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(xOf(span), LANE_Y[0] - 12)
      ctx.lineTo(xOf(span), LANE_Y[2] + LANE_H + 8)
      ctx.stroke()
      ctx.fillStyle = accent
      ctx.font = '700 12px "JetBrains Mono", monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`finish ${span}`, xOf(span) + 7, LANE_Y[2] + LANE_H + 12)
      ctx.restore()

      if (ref) {
        const rspan = Math.max(...loadsOf(inst, ref))
        ctx.save()
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(xOf(rspan), LANE_Y[0] - 12)
        ctx.lineTo(xOf(rspan), LANE_Y[2] + LANE_H + 8)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.font = '700 11px "JetBrains Mono", monospace'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillText(`optimal ${rspan}`, xOf(rspan) - 7, LANE_Y[0] - 14)
        ctx.restore()
      }

      // Time axis.
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.font = '500 10px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (let k = 0; k <= 4; k++) {
        const tv = Math.round((axisMax * k) / 4)
        ctx.beginPath()
        ctx.moveTo(xOf(tv), AXIS_Y - 6)
        ctx.lineTo(xOf(tv), AXIS_Y)
        ctx.stroke()
        ctx.fillText(String(tv), xOf(tv), AXIS_Y + 5)
      }
      ctx.restore()
    }

    const hit = (ev: PointerEvent): number => {
      const v = s.toVirtual(ev)
      for (const b of boxes) {
        if (v.x >= b.x && v.x <= b.x + b.w && v.y >= b.y && v.y <= b.y + b.h) return b.j
      }
      return -1
    }

    const onMove = (ev: PointerEvent) => {
      const next = hit(ev)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const j = hit(ev)
      if (j < 0) return
      const next = [...sol]
      next[j] = (next[j] + 1) % MACHINES
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

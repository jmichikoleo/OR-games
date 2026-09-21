import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 470
const N = 9
const PAD = 62
const SPAN = VW - PAD * 2
const LANE_TOP = 40
const LANE_H = 21
const BAR_Y = 272
const BAR_H = 62
const AXIS_Y = 356
const REF_Y = 396

const LETTERS = 'ABCDEFGHIJKL'
const COLORS = [
  '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f472b6',
  '#22d3ee', '#fb923c', '#c084fc', '#4ade80',
]

interface Job {
  p: number
  d: number
  w: number
}
interface Instance {
  jobs: Job[]
  total: number
}
/** A permutation of job indices — the order they run on the one machine. */
type Solution = number[]

/** Completion time of every job under a given sequence. */
function completions(inst: Instance, sol: Solution): number[] {
  const c = new Array(inst.jobs.length).fill(0)
  let t = 0
  for (const j of sol) {
    t += inst.jobs[j].p
    c[j] = t
  }
  return c
}

function weightedTardiness(inst: Instance, sol: Solution): number {
  const c = completions(inst, sol)
  return inst.jobs.reduce((sum, job, i) => sum + job.w * Math.max(0, c[i] - job.d), 0)
}

/**
 * 1 || sum w_j T_j is NP-hard, but a DP over subsets is exact at n=9:
 * the machine is never idle, so the set scheduled so far fixes the clock.
 */
function optimalOrder(inst: Instance): Solution {
  const jobs = inst.jobs
  const n = jobs.length
  const full = 1 << n
  const dp = new Float64Array(full).fill(Infinity)
  const par = new Int16Array(full).fill(-1)
  const time = new Float64Array(full)
  dp[0] = 0
  for (let mask = 0; mask < full; mask++) {
    if (mask > 0) {
      let t = 0
      for (let j = 0; j < n; j++) if (mask & (1 << j)) t += jobs[j].p
      time[mask] = t
    }
    if (dp[mask] === Infinity) continue
    for (let j = 0; j < n; j++) {
      if (mask & (1 << j)) continue
      const done = time[mask] + jobs[j].p
      const cost = dp[mask] + jobs[j].w * Math.max(0, done - jobs[j].d)
      const nm = mask | (1 << j)
      if (cost < dp[nm]) {
        dp[nm] = cost
        par[nm] = j
      }
    }
  }
  const order: number[] = []
  let mask = full - 1
  while (mask) {
    const j = par[mask]
    order.push(j)
    mask ^= 1 << j
  }
  return order.reverse()
}

export const singlemachine: Minigame<Instance, Solution> = {
  id: 'singlemachine',
  title: 'One Machine',
  problem: 'Single Machine Scheduling',
  family: 'scheduling',
  blurb: 'One machine, nine jobs, nine deadlines. Order them so the weighted lateness is as small as possible.',
  howTo: 'Click a job to lift it, then click the gap where it should go. Heavier jobs cost more per unit late. The ladder above shows every overrun.',
  objective: 'min',
  unit: 'pen',

  generate(rng: RNG): Instance {
    const jobs: Job[] = Array.from({ length: N }, () => ({
      p: 8 + rng.int(23),
      d: 0,
      w: 1 + rng.int(5),
    }))
    const total = jobs.reduce((a, j) => a + j.p, 0)
    // Due dates land inside the horizon, so some job is always going to be late.
    jobs.forEach((j) => {
      j.d = Math.round(rng.range(0.3, 0.85) * total)
    })
    return { jobs, total }
  },

  initial(inst): Solution {
    return inst.jobs.map((_, i) => i)
  },

  evaluate(inst, sol) {
    const c = completions(inst, sol)
    const late = inst.jobs.filter((j, i) => c[i] > j.d).length
    return {
      value: weightedTardiness(inst, sol),
      feasible: true,
      note: `${late} of ${inst.jobs.length} jobs finish late.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: optimalOrder(inst), label: 'subset DP', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let held = -1
    let slot = -1

    const xOf = (t: number) => PAD + (t / inst.total) * SPAN

    /** Left edge of every block, plus the far right edge — the insertion points. */
    function boundaries(order: Solution): number[] {
      const xs: number[] = []
      let t = 0
      for (const j of order) {
        xs.push(xOf(t))
        t += inst.jobs[j].p
      }
      xs.push(xOf(t))
      return xs
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const c = completions(inst, sol)

      // Overrun ladder: one lane per job, due date to completion.
      inst.jobs.forEach((job, i) => {
        const y = LANE_TOP + i * LANE_H + LANE_H / 2
        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(PAD, y)
        ctx.lineTo(PAD + SPAN, y)
        ctx.stroke()

        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.font = '500 11px "JetBrains Mono", monospace'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${LETTERS[i]}·${job.w}`, PAD - 10, y)

        const dx = xOf(job.d)
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(dx, y - 6)
        ctx.lineTo(dx, y + 6)
        ctx.stroke()

        const cx = xOf(c[i])
        const tard = Math.max(0, c[i] - job.d)
        if (tard > 0) {
          ctx.strokeStyle = '#f87171'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.moveTo(dx, y)
          ctx.lineTo(cx, y)
          ctx.stroke()
          ctx.fillStyle = '#f87171'
          ctx.font = '500 10px "JetBrains Mono", monospace'
          ctx.textAlign = 'left'
          ctx.fillText(`+${tard * job.w}`, cx + 9, y)
        }
        ctx.beginPath()
        ctx.arc(cx, y, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = tard > 0 ? '#f87171' : COLORS[i % COLORS.length]
        ctx.fill()
        ctx.restore()
      })

      // The schedule itself.
      let t = 0
      sol.forEach((j, pos) => {
        const job = inst.jobs[j]
        const x = xOf(t)
        const w = (job.p / inst.total) * SPAN
        const late = c[j] > job.d
        ctx.save()
        ctx.globalAlpha = held === pos ? 0.35 : 1
        ctx.beginPath()
        ctx.roundRect(x + 1, BAR_Y, Math.max(2, w - 2), BAR_H, 4)
        ctx.fillStyle = COLORS[j % COLORS.length]
        ctx.globalAlpha *= 0.75
        ctx.fill()
        ctx.globalAlpha = held === pos ? 0.35 : 1
        if (held === pos) {
          ctx.setLineDash([5, 4])
          ctx.strokeStyle = 'rgba(255,255,255,0.85)'
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.setLineDash([])
        } else if (late) {
          ctx.strokeStyle = '#f87171'
          ctx.lineWidth = 2
          ctx.stroke()
        }
        ctx.fillStyle = '#0a0c10'
        ctx.font = '700 15px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(LETTERS[j], x + w / 2, BAR_Y + BAR_H / 2)
        ctx.restore()
        t += job.p
      })

      // Insertion points, only while a job is in hand.
      if (held >= 0) {
        const xs = boundaries(sol)
        xs.forEach((x, i) => {
          ctx.save()
          const on = i === slot
          ctx.strokeStyle = on ? accent : 'rgba(255,255,255,0.32)'
          ctx.lineWidth = on ? 3.5 : 2
          if (on) {
            ctx.shadowColor = accent
            ctx.shadowBlur = 10
          }
          ctx.beginPath()
          ctx.moveTo(x, BAR_Y - 10)
          ctx.lineTo(x, BAR_Y + BAR_H + 10)
          ctx.stroke()
          ctx.restore()
        })
      }

      // Time axis.
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '500 10px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (let k = 0; k <= 4; k++) {
        const tv = Math.round((inst.total * k) / 4)
        const x = xOf(tv)
        ctx.beginPath()
        ctx.moveTo(x, AXIS_Y - 6)
        ctx.lineTo(x, AXIS_Y)
        ctx.stroke()
        ctx.fillText(String(tv), x, AXIS_Y + 5)
      }
      ctx.restore()

      // The solver's sequence, once revealed.
      if (ref) {
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.font = '500 10px "JetBrains Mono", monospace'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText('optimal', PAD - 10, REF_Y + 11)
        let rt = 0
        ref.forEach((j) => {
          const job = inst.jobs[j]
          const x = xOf(rt)
          const w = (job.p / inst.total) * SPAN
          ctx.beginPath()
          ctx.roundRect(x + 1, REF_Y, Math.max(2, w - 2), 22, 3)
          ctx.fillStyle = COLORS[j % COLORS.length]
          ctx.globalAlpha = 0.4
          ctx.fill()
          ctx.globalAlpha = 1
          ctx.fillStyle = 'rgba(255,255,255,0.85)'
          ctx.font = '700 11px "JetBrains Mono", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(LETTERS[j], x + w / 2, REF_Y + 11)
          rt += job.p
        })
        ctx.restore()
      }
    }

    function blockAt(x: number): number {
      let t = 0
      for (let pos = 0; pos < sol.length; pos++) {
        const w = (inst.jobs[sol[pos]].p / inst.total) * SPAN
        if (x >= xOf(t) && x <= xOf(t) + w) return pos
        t += inst.jobs[sol[pos]].p
      }
      return -1
    }

    const nearestSlot = (x: number): number => {
      const xs = boundaries(sol)
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
      const over = v.y >= BAR_Y && v.y <= BAR_Y + BAR_H ? blockAt(v.x) : -1
      s.canvas.style.cursor = over >= 0 ? 'grab' : 'default'
    }

    const onClick = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      if (held < 0) {
        if (v.y < BAR_Y - 12 || v.y > BAR_Y + BAR_H + 12) return
        const pos = blockAt(v.x)
        if (pos < 0) return
        held = pos
        slot = nearestSlot(v.x)
        draw(sol, ref)
        return
      }
      // Dropping outside the schedule band just puts the job back.
      if (v.y < BAR_Y - 40 || v.y > BAR_Y + BAR_H + 40) {
        held = -1
        slot = -1
        draw(sol, ref)
        return
      }
      const target = nearestSlot(v.x)
      const next = [...sol]
      const [job] = next.splice(held, 1)
      next.splice(target > held ? target - 1 : target, 0, job)
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

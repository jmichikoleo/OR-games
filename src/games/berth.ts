import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 440
const BERTHS = 3
const SHIPS = 6
const PAD = 86
const SPAN = VW - PAD - 40
const LANE_Y = [92, 192, 292]
const LANE_H = 64
const AXIS_Y = 382

const NAMES = ['Aster', 'Brig', 'Corvo', 'Dace', 'Ember', 'Fjord']
const COLORS = ['#ff4d9d', '#5b8cff', '#52e68a', '#ffbe3d', '#c77dff', '#3ddbd9']
/** Berth one has the good cranes. Berth three has the old ones. */
const CRANE = [1, 1.3, 1.7]

interface Instance {
  size: number[]
  arrival: number[]
}
/** Which ships go on which berth, in the order they come alongside. */
type Solution = number[][]

const hours = (inst: Instance, ship: number, berth: number) =>
  Math.round(inst.size[ship] * CRANE[berth])

interface Run {
  start: number[]
  end: number[]
  latest: number
}

function runPort(inst: Instance, sol: Solution): Run {
  const start = new Array(SHIPS).fill(0)
  const end = new Array(SHIPS).fill(0)
  let latest = 0
  sol.forEach((queue, b) => {
    let free = 0
    queue.forEach((ship) => {
      start[ship] = Math.max(free, inst.arrival[ship])
      end[ship] = start[ship] + hours(inst, ship, b)
      free = end[ship]
      latest = Math.max(latest, end[ship])
    })
  })
  return { start, end, latest }
}

const inPort = (inst: Instance, sol: Solution) => {
  const { end } = runPort(inst, sol)
  return sol.flat().reduce((a, ship) => a + (end[ship] - inst.arrival[ship]), 0)
}

/** Every way of slotting six ships into three ordered queues. 20,160 of them. */
function bestPlan(inst: Instance): Solution {
  const lanes: Solution = [[], [], []]
  let best: Solution = [[], [], []]
  let bestVal = Infinity
  const walk = (i: number) => {
    if (i === SHIPS) {
      const v = inPort(inst, lanes)
      if (v < bestVal) {
        bestVal = v
        best = lanes.map((l) => [...l])
      }
      return
    }
    for (let b = 0; b < BERTHS; b++) {
      for (let pos = 0; pos <= lanes[b].length; pos++) {
        lanes[b].splice(pos, 0, i)
        walk(i + 1)
        lanes[b].splice(pos, 1)
      }
    }
  }
  walk(0)
  return best
}

export const berth: Minigame<Instance, Solution> = {
  id: 'berth',
  title: 'Alongside',
  problem: 'Berth Allocation',
  family: 'scheduling',
  blurb: 'Six ships turning up through the day and three berths to unload them. Berth one has the good cranes and berth three has the old ones, so where a ship goes matters as much as when.',
  howTo: 'Click a ship to lift it, then click a gap on any berth to drop it there. The hollow bar in front of a ship is time it spent waiting at anchor.',
  objective: 'min',
  unit: 'hours',

  generate(rng: RNG): Instance {
    return {
      size: Array.from({ length: SHIPS }, () => 6 + rng.int(13)),
      arrival: Array.from({ length: SHIPS }, () => rng.int(23)),
    }
  },

  initial(): Solution {
    // Round robin in arrival order, which is what a tired harbourmaster does.
    const lanes: Solution = [[], [], []]
    for (let i = 0; i < SHIPS; i++) lanes[i % BERTHS].push(i)
    return lanes
  },

  evaluate(inst, sol) {
    const { end } = runPort(inst, sol)
    const waiting = sol
      .flat()
      .filter((ship) => end[ship] - hours(inst, ship, sol.findIndex((q) => q.includes(ship))) > inst.arrival[ship])
    return {
      value: inPort(inst, sol),
      feasible: true,
      note: waiting.length === 0
        ? 'Nobody waited at anchor.'
        : `${waiting.length} ship${waiting.length === 1 ? '' : 's'} sat at anchor before berthing.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestPlan(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let held: { berth: number; pos: number } | null = null
    let lane = -1
    let slot = -1
    let axisMax = 1
    let boxes: { berth: number; pos: number; x: number; y: number; w: number }[] = []

    const laneSlots = (b: number, run: Run) => {
      const xs = sol[b].map((ship) => run.start[ship])
      const last = sol[b][sol[b].length - 1]
      xs.push(last === undefined ? 0 : run.end[last])
      return xs
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const run = runPort(inst, sol)
      axisMax = Math.max(1, run.latest) * 1.06
      const xOf = (t: number) => PAD + (t / axisMax) * SPAN
      boxes = []

      LANE_Y.forEach((y, b) => {
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(PAD, y, SPAN, LANE_H, 6)
        ctx.fillStyle = 'rgba(255,255,255,0.035)'
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.45)'
        ctx.font = '500 12px "JetBrains Mono", monospace'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(`B${b + 1}`, PAD - 14, y + LANE_H / 2 - 8)
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.font = '500 10px "JetBrains Mono", monospace'
        ctx.fillText(`${CRANE[b].toFixed(1)}x`, PAD - 14, y + LANE_H / 2 + 9)
        ctx.restore()
      })

      sol.forEach((queue, b) => {
        queue.forEach((ship, pos) => {
          const y = LANE_Y[b]
          const x = xOf(run.start[ship])
          const w = ((run.end[ship] - run.start[ship]) / axisMax) * SPAN
          boxes.push({ berth: b, pos, x, y, w })

          if (run.start[ship] > inst.arrival[ship]) {
            const wx = xOf(inst.arrival[ship])
            ctx.save()
            ctx.setLineDash([3, 3])
            ctx.strokeStyle = `${COLORS[ship]}88`
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.roundRect(wx, y + 18, Math.max(2, x - wx), LANE_H - 36, 3)
            ctx.stroke()
            ctx.setLineDash([])
            ctx.restore()
          }

          const lifted = held?.berth === b && held.pos === pos
          ctx.save()
          ctx.beginPath()
          ctx.roundRect(x + 1, y + 5, Math.max(2, w - 2), LANE_H - 10, 4)
          ctx.fillStyle = COLORS[ship]
          ctx.globalAlpha = lifted ? 0.3 : 0.82
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
          ctx.font = '700 12px "JetBrains Mono", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          if (w > 44) ctx.fillText(NAMES[ship], x + w / 2, y + LANE_H / 2)
          else if (w > 18) ctx.fillText(NAMES[ship][0], x + w / 2, y + LANE_H / 2)
          ctx.restore()
        })
      })

      if (held && lane >= 0) {
        laneSlots(lane, run).forEach((t, i) => {
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

      if (ref) {
        const rs = runPort(inst, ref)
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.45)'
        ctx.font = '500 11px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        const lines = ref.map((q, b) => `B${b + 1} ${q.map((sh) => NAMES[sh]).join(' ') || 'empty'}`)
        ctx.fillText(`best plan   ${lines.join('    ')}`, PAD, 22)
        ctx.fillText(`which gets everyone away in ${inPort(inst, ref)} hours`, PAD, 38)
        ctx.restore()
        void rs
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
        ctx.fillText(`${tv}h`, xOf(tv), AXIS_Y + 5)
      }
      ctx.restore()
    }

    const laneAt = (y: number) => LANE_Y.findIndex((ly) => y >= ly - 14 && y <= ly + LANE_H + 14)

    const nearestSlot = (b: number, x: number) => {
      const xs = laneSlots(b, runPort(inst, sol)).map((t) => PAD + (t / axisMax) * SPAN)
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
        const l = laneAt(v.y)
        const sl = l >= 0 ? nearestSlot(l, v.x) : -1
        if (l !== lane || sl !== slot) {
          lane = l
          slot = sl
          draw(sol, ref)
        }
        return
      }
      const over = boxes.find(
        (b) => v.x >= b.x && v.x <= b.x + b.w && v.y >= b.y && v.y <= b.y + LANE_H,
      )
      s.canvas.style.cursor = over ? 'grab' : 'default'
    }

    const onClick = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      if (!held) {
        const box = boxes.find(
          (b) => v.x >= b.x && v.x <= b.x + b.w && v.y >= b.y && v.y <= b.y + LANE_H,
        )
        if (!box) return
        held = { berth: box.berth, pos: box.pos }
        lane = box.berth
        slot = nearestSlot(box.berth, v.x)
        draw(sol, ref)
        return
      }
      const target = laneAt(v.y)
      if (target < 0) {
        held = null
        lane = -1
        slot = -1
        draw(sol, ref)
        return
      }
      const from = held
      const at = nearestSlot(target, v.x)
      const next = sol.map((q) => [...q])
      const [ship] = next[from.berth].splice(from.pos, 1)
      const shift = target === from.berth && at > from.pos ? at - 1 : at
      next[target].splice(Math.min(shift, next[target].length), 0, ship)
      held = null
      lane = -1
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

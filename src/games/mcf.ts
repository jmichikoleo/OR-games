import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, nearestIndex } from '../core/geom'
import { type Arc, minCostFlow } from '../core/flow'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 560
const R = 21

const LAYOUT: Pt[] = [
  { x: 95, y: 280 },
  { x: 355, y: 120 },
  { x: 355, y: 280 },
  { x: 355, y: 440 },
  { x: 655, y: 120 },
  { x: 655, y: 280 },
  { x: 655, y: 440 },
  { x: 905, y: 280 },
]
const SOURCE = 0
const SINK = 7
const LABELS = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'T']

interface Instance {
  arcs: Arc[]
  /** How much has to get across, come what may. */
  order: number
}
/** Units running down each pipe. */
type Solution = number[]

interface Step {
  arc: number
  dir: 1 | -1
}

function residualFrom(inst: Instance, flow: Solution, u: number) {
  const out: { v: number; step: Step; room: number; price: number }[] = []
  inst.arcs.forEach((a, i) => {
    if (a.from === u && flow[i] < a.cap) {
      out.push({ v: a.to, step: { arc: i, dir: 1 }, room: a.cap - flow[i], price: a.cost })
    } else if (a.to === u && flow[i] > 0) {
      out.push({ v: a.from, step: { arc: i, dir: -1 }, room: flow[i], price: -a.cost })
    }
  })
  return out
}

const shipped = (inst: Instance, flow: Solution) =>
  inst.arcs.reduce((a, arc, i) => a + (arc.from === SOURCE ? flow[i] : 0), 0)

const billFor = (inst: Instance, flow: Solution) =>
  inst.arcs.reduce((a, arc, i) => a + flow[i] * arc.cost, 0)

export const mcf: Minigame<Instance, Solution> = {
  id: 'mcf',
  title: 'Best Value',
  problem: 'Minimum-Cost Flow',
  family: 'flow',
  blurb: 'A fixed load has to get from S to T. Every pipe has a limit and a price a unit, and the cheap pipes are never quite big enough to take the lot.',
  howTo: 'Click along a route from S to T and it fills as far as it can. Walking backwards down a pipe that is already carrying something pulls units back out, which is how you undo an expensive route.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    const arcs: Arc[] = []
    for (const i of [1, 2, 3]) {
      arcs.push({ from: SOURCE, to: i, cap: 5 + rng.int(9), cost: 1 + rng.int(4) })
    }
    const targets = [4, 5, 6]
    for (let i = targets.length - 1; i > 0; i--) {
      const k = rng.int(i + 1)
      ;[targets[i], targets[k]] = [targets[k], targets[i]]
    }
    ;[1, 2, 3].forEach((from, i) => {
      arcs.push({ from, to: targets[i], cap: 3 + rng.int(8), cost: 1 + rng.int(9) })
    })
    const extras: Arc[] = []
    for (const from of [1, 2, 3]) {
      for (const to of [4, 5, 6]) {
        if (!arcs.some((a) => a.from === from && a.to === to)) {
          extras.push({ from, to, cap: 3 + rng.int(8), cost: 1 + rng.int(9) })
        }
      }
    }
    for (let i = extras.length - 1; i > 0; i--) {
      const k = rng.int(i + 1)
      ;[extras[i], extras[k]] = [extras[k], extras[i]]
    }
    arcs.push(...extras.slice(0, 3))
    for (const i of [4, 5, 6]) {
      arcs.push({ from: i, to: SINK, cap: 4 + rng.int(9), cost: 1 + rng.int(4) })
    }

    // Ask for three quarters of what the network can actually carry.
    const wide = minCostFlow(LAYOUT.length, arcs, SOURCE, SINK)
    const most = arcs.reduce((a, arc, i) => a + (arc.from === SOURCE ? wide[i] : 0), 0)
    return { arcs, order: Math.max(1, Math.round(most * 0.75)) }
  },

  initial(inst): Solution {
    return inst.arcs.map(() => 0)
  },

  evaluate(inst, sol) {
    const out = shipped(inst, sol)
    if (out < inst.order) {
      return {
        value: 0,
        feasible: false,
        note: `${inst.order - out} of the ${inst.order} units still to move.`,
      }
    }
    return {
      value: billFor(inst, sol),
      feasible: true,
      note: `All ${inst.order} units across.`,
    }
  },

  solve(inst): Reference<Solution> {
    return {
      solution: minCostFlow(LAYOUT.length, inst.arcs, SOURCE, SINK, inst.order),
      label: 'successive shortest paths',
      exact: true,
    }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let path: number[] = [SOURCE]
    let steps: Step[] = []
    let hover = -1

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const onPath = new Map<number, 1 | -1>()
      steps.forEach((st) => onPath.set(st.arc, st.dir))
      const here = path[path.length - 1]

      inst.arcs.forEach((a, i) => {
        const A = LAYOUT[a.from]
        const B = LAYOUT[a.to]
        const dx = B.x - A.x
        const dy = B.y - A.y
        const len = Math.hypot(dx, dy)
        const ux = dx / len
        const uy = dy / len
        const p0 = { x: A.x + ux * R, y: A.y + uy * R }
        const p1 = { x: B.x - ux * (R + 8), y: B.y - uy * (R + 8) }
        const f = sol[i]
        const picked = onPath.get(i)

        ctx.save()
        ctx.lineCap = 'round'
        ctx.strokeStyle = f === 0 ? 'rgba(255,255,255,0.15)' : f >= a.cap ? accent : `${accent}aa`
        ctx.lineWidth = f === 0 ? 2.5 : 3 + Math.min(6, (f / a.cap) * 5)
        ctx.beginPath()
        ctx.moveTo(p0.x, p0.y)
        ctx.lineTo(p1.x, p1.y)
        ctx.stroke()

        if (picked) {
          ctx.strokeStyle = picked === 1 ? '#ffffff' : '#ff5c7a'
          ctx.lineWidth = 2
          ctx.setLineDash(picked === 1 ? [] : [6, 5])
          ctx.beginPath()
          ctx.moveTo(p0.x, p0.y)
          ctx.lineTo(p1.x, p1.y)
          ctx.stroke()
          ctx.setLineDash([])
        }

        ctx.fillStyle = f === 0 ? 'rgba(255,255,255,0.28)' : accent
        ctx.beginPath()
        ctx.moveTo(p1.x + ux * 8, p1.y + uy * 8)
        ctx.lineTo(p1.x - uy * 5.5, p1.y + ux * 5.5)
        ctx.lineTo(p1.x + uy * 5.5, p1.y - ux * 5.5)
        ctx.closePath()
        ctx.fill()

        const t = 0.38
        const mx = p0.x + (p1.x - p0.x) * t - uy * 13
        const my = p0.y + (p1.y - p0.y) * t + ux * 13
        const label = `${f}/${a.cap}`
        ctx.font = '700 12px "JetBrains Mono", monospace'
        const w = ctx.measureText(label).width + 10
        ctx.beginPath()
        ctx.roundRect(mx - w / 2, my - 16, w, 18, 5)
        ctx.fillStyle = f > 0 ? accent : '#141821'
        ctx.fill()
        ctx.strokeStyle = f > 0 ? accent : 'rgba(255,255,255,0.16)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = f > 0 ? '#0a0c10' : 'rgba(255,255,255,0.6)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, mx, my - 7)

        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.font = '500 10.5px "JetBrains Mono", monospace'
        ctx.fillText(`${a.cost} each`, mx, my + 10)
        if (ref) {
          ctx.fillStyle = 'rgba(255,255,255,0.75)'
          ctx.font = '700 10px "JetBrains Mono", monospace'
          ctx.fillText(`best ${ref[i]}`, mx, my + 24)
        }
        ctx.restore()
      })

      const options = new Set(residualFrom(inst, sol, here).map((o) => o.v))
      LAYOUT.forEach((p, i) => {
        const isHere = i === here
        const open = options.has(i) && !path.includes(i)
        ctx.save()
        if (i === hover && open) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, R + 11, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.09)'
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, R, 0, Math.PI * 2)
        ctx.fillStyle = isHere ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = isHere
          ? accent
          : i === SINK
            ? '#52e68a'
            : open
              ? 'rgba(255,255,255,0.65)'
              : 'rgba(255,255,255,0.3)'
        ctx.stroke()
        ctx.fillStyle = isHere ? '#0a0c10' : i === SINK ? '#52e68a' : 'rgba(255,255,255,0.8)'
        ctx.font = '700 14px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(LABELS[i], p.x, p.y + 0.5)
        ctx.restore()
      })

      ctx.save()
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = '500 12px "JetBrains Mono", monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`${shipped(inst, sol)} of ${inst.order} units across`, 60, 22)
      ctx.restore()
    }

    const onMove = (ev: PointerEvent) => {
      const next = nearestIndex(s.toVirtual(ev), LAYOUT, 34)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = nearestIndex(s.toVirtual(ev), LAYOUT, 34)
      if (hit < 0) return
      const here = path[path.length - 1]

      if (hit === here) {
        if (path.length > 1) {
          path = path.slice(0, -1)
          steps = steps.slice(0, -1)
          draw(sol, ref)
        }
        return
      }
      if (path.includes(hit)) return

      const move = residualFrom(inst, sol, here).find((o) => o.v === hit)
      if (!move) return
      path = [...path, hit]
      steps = [...steps, move.step]

      if (hit !== SINK) {
        draw(sol, ref)
        return
      }
      // Fill the route, but never past what was actually ordered.
      const room = Math.min(
        ...steps.map((st) => (st.dir === 1 ? inst.arcs[st.arc].cap - sol[st.arc] : sol[st.arc])),
      )
      const push = Math.min(room, inst.order - shipped(inst, sol))
      const next = [...sol]
      if (push > 0) steps.forEach((st) => (next[st.arc] += st.dir * push))
      path = [SOURCE]
      steps = []
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

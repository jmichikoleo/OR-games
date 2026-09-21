import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, nearestIndex } from '../core/geom'
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

interface Arc {
  from: number
  to: number
  cap: number
}
interface Instance {
  arcs: Arc[]
}
/** How much is flowing down each pipe. */
type Solution = number[]

interface Step {
  arc: number
  /** +1 pushes along the pipe, -1 pulls flow back out of it. */
  dir: 1 | -1
}

/** Every move available from u: spare capacity forward, or flow to undo backward. */
function residualFrom(inst: Instance, flow: Solution, u: number): { v: number; step: Step; room: number }[] {
  const out: { v: number; step: Step; room: number }[] = []
  inst.arcs.forEach((a, i) => {
    if (a.from === u && flow[i] < a.cap) out.push({ v: a.to, step: { arc: i, dir: 1 }, room: a.cap - flow[i] })
    else if (a.to === u && flow[i] > 0) out.push({ v: a.from, step: { arc: i, dir: -1 }, room: flow[i] })
  })
  return out
}

const valueOf = (inst: Instance, flow: Solution) =>
  inst.arcs.reduce((a, arc, i) => a + (arc.from === SOURCE ? flow[i] : 0), 0)

/** Set of nodes still reachable from the source once the flow is maximum. */
function reachable(inst: Instance, flow: Solution): boolean[] {
  const seen = new Array(LAYOUT.length).fill(false)
  seen[SOURCE] = true
  const queue = [SOURCE]
  while (queue.length) {
    const u = queue.shift()!
    for (const { v } of residualFrom(inst, flow, u)) {
      if (!seen[v]) {
        seen[v] = true
        queue.push(v)
      }
    }
  }
  return seen
}

/** Edmonds-Karp: shortest augmenting path each round until none is left. */
function maxFlow(inst: Instance): Solution {
  const flow = inst.arcs.map(() => 0)
  for (;;) {
    const prev: (Step | null)[] = new Array(LAYOUT.length).fill(null)
    const seen = new Array(LAYOUT.length).fill(false)
    seen[SOURCE] = true
    const queue = [SOURCE]
    while (queue.length && !seen[SINK]) {
      const u = queue.shift()!
      for (const { v, step } of residualFrom(inst, flow, u)) {
        if (seen[v]) continue
        seen[v] = true
        prev[v] = step
        queue.push(v)
      }
    }
    if (!seen[SINK]) return flow

    const path: Step[] = []
    let cur = SINK
    while (cur !== SOURCE) {
      const st = prev[cur]!
      path.push(st)
      cur = st.dir === 1 ? inst.arcs[st.arc].from : inst.arcs[st.arc].to
    }
    const bottleneck = Math.min(
      ...path.map((st) => (st.dir === 1 ? inst.arcs[st.arc].cap - flow[st.arc] : flow[st.arc])),
    )
    path.forEach((st) => (flow[st.arc] += st.dir * bottleneck))
  }
}

export const maxflow: Minigame<Instance, Solution> = {
  id: 'maxflow',
  title: 'Full Pressure',
  problem: 'Maximum Flow',
  family: 'flow',
  blurb: 'Push as much as you can from S to T. Every pipe has a limit, and whatever goes into a junction has to come back out.',
  howTo: 'Click along a route from S to T and it fills to the tightest pipe on the way. Walking backwards down a pipe that is already carrying flow takes some back out. That is how you undo a bad route.',
  objective: 'max',
  unit: 'units',

  generate(rng: RNG): Instance {
    const arcs: Arc[] = []
    for (const i of [1, 2, 3]) arcs.push({ from: SOURCE, to: i, cap: 6 + rng.int(13) })

    // A perfect matching across the middle first, so nothing is stranded.
    const targets = [4, 5, 6]
    for (let i = targets.length - 1; i > 0; i--) {
      const k = rng.int(i + 1)
      ;[targets[i], targets[k]] = [targets[k], targets[i]]
    }
    ;[1, 2, 3].forEach((from, i) => arcs.push({ from, to: targets[i], cap: 3 + rng.int(10) }))

    const extras: Arc[] = []
    for (const from of [1, 2, 3]) {
      for (const to of [4, 5, 6]) {
        if (!arcs.some((a) => a.from === from && a.to === to)) extras.push({ from, to, cap: 0 })
      }
    }
    for (let i = extras.length - 1; i > 0; i--) {
      const k = rng.int(i + 1)
      ;[extras[i], extras[k]] = [extras[k], extras[i]]
    }
    extras.slice(0, 3).forEach((a) => arcs.push({ ...a, cap: 3 + rng.int(10) }))

    for (const i of [4, 5, 6]) arcs.push({ from: i, to: SINK, cap: 5 + rng.int(12) })
    return { arcs }
  },

  initial(inst): Solution {
    return inst.arcs.map(() => 0)
  },

  evaluate(inst, sol) {
    const v = valueOf(inst, sol)
    const full = inst.arcs.filter((a, i) => sol[i] === a.cap && sol[i] > 0).length
    return {
      value: v,
      feasible: true,
      note: v === 0 ? 'Nothing flowing yet. Trace a route from S to T.' : `${v} units through, ${full} pipes maxed out.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: maxFlow(inst), label: 'Edmonds-Karp', exact: true }
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

      const cutSet = ref ? reachable(inst, ref) : null
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
        const full = f >= a.cap
        const inCut = !!cutSet && cutSet[a.from] && !cutSet[a.to]
        const picked = onPath.get(i)

        ctx.save()
        ctx.lineCap = 'round'
        ctx.strokeStyle = f === 0 ? 'rgba(255,255,255,0.15)' : full ? accent : `${accent}aa`
        ctx.lineWidth = f === 0 ? 2.5 : 3 + Math.min(6, (f / a.cap) * 5)
        ctx.beginPath()
        ctx.moveTo(p0.x, p0.y)
        ctx.lineTo(p1.x, p1.y)
        ctx.stroke()

        if (picked) {
          ctx.strokeStyle = picked === 1 ? '#ffffff' : '#f87171'
          ctx.lineWidth = 2
          ctx.setLineDash(picked === 1 ? [] : [6, 5])
          ctx.beginPath()
          ctx.moveTo(p0.x, p0.y)
          ctx.lineTo(p1.x, p1.y)
          ctx.stroke()
          ctx.setLineDash([])
        }

        if (inCut) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'
          ctx.lineWidth = 2
          ctx.setLineDash([5, 6])
          ctx.beginPath()
          ctx.moveTo(p0.x, p0.y)
          ctx.lineTo(p1.x, p1.y)
          ctx.stroke()
          ctx.setLineDash([])
        }

        // Arrowhead.
        ctx.fillStyle = f === 0 ? 'rgba(255,255,255,0.28)' : accent
        ctx.beginPath()
        ctx.moveTo(p1.x + ux * 8, p1.y + uy * 8)
        ctx.lineTo(p1.x - uy * 5.5, p1.y + ux * 5.5)
        ctx.lineTo(p1.x + uy * 5.5, p1.y - ux * 5.5)
        ctx.closePath()
        ctx.fill()

        // Crossing pipes would stack their labels on top of each other at the
        // midpoint, so sit them at 38% along instead.
        const t = 0.38
        const mx = p0.x + (p1.x - p0.x) * t - uy * 12
        const my = p0.y + (p1.y - p0.y) * t + ux * 12
        const label = `${f}/${a.cap}`
        ctx.font = '700 12px "JetBrains Mono", monospace'
        const w = ctx.measureText(label).width + 10
        ctx.beginPath()
        ctx.roundRect(mx - w / 2, my - 9, w, 18, 5)
        ctx.fillStyle = full ? accent : '#141821'
        ctx.fill()
        ctx.strokeStyle = full ? accent : 'rgba(255,255,255,0.16)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = full ? '#0a0c10' : f > 0 ? accent : 'rgba(255,255,255,0.6)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, mx, my + 0.5)
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
            ? '#4ade80'
            : open
              ? 'rgba(255,255,255,0.65)'
              : 'rgba(255,255,255,0.3)'
        ctx.stroke()
        ctx.fillStyle = isHere ? '#0a0c10' : i === SINK ? '#4ade80' : 'rgba(255,255,255,0.8)'
        ctx.font = '700 14px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(LABELS[i], p.x, p.y + 0.5)
        ctx.restore()
      })

      if (cutSet) {
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.font = '500 12px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText('dashed pipes are the min cut, the bottleneck that caps everything', 60, 24)
        ctx.restore()
      }
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
      // Reached the sink: fill the route to its tightest pipe and start over.
      const bottleneck = Math.min(
        ...steps.map((st) =>
          st.dir === 1 ? inst.arcs[st.arc].cap - sol[st.arc] : sol[st.arc],
        ),
      )
      const next = [...sol]
      steps.forEach((st) => (next[st.arc] += st.dir * bottleneck))
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

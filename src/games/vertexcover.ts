import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, nearestIndex, scatter } from '../core/geom'
import { type Edge, adjacency, buildPlanarGraph } from '../core/graph'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const NODES = 14
const TARGET_EDGES = 24
const MAX_EDGE = 340

interface Instance {
  nodes: Pt[]
  edges: Edge[]
  adj: number[][]
}
/** Junctions with a guard on them. */
type Solution = number[]

const popcount = (x: number) => {
  let c = 0
  while (x) {
    x &= x - 1
    c++
  }
  return c
}

/** 2^14 subsets against 24 edges — small enough to simply check them all. */
function minCover(inst: Instance): Solution {
  const n = inst.nodes.length
  let best = Array.from({ length: n }, (_, i) => i)
  for (let mask = 0; mask < 1 << n; mask++) {
    const cnt = popcount(mask)
    if (cnt >= best.length) continue
    let ok = true
    for (const e of inst.edges) {
      if (!((mask >> e.a) & 1) && !((mask >> e.b) & 1)) {
        ok = false
        break
      }
    }
    if (ok) best = Array.from({ length: n }, (_, i) => i).filter((i) => (mask >> i) & 1)
  }
  return best
}

export const vertexcover: Minigame<Instance, Solution> = {
  id: 'vertexcover',
  title: 'Guard Posts',
  problem: 'Vertex Cover',
  family: 'covering',
  blurb: 'Every street needs a guard watching at least one of its ends. Cover the whole town with as few guards as you can.',
  howTo: 'Click a junction to post or remove a guard. Streets nobody is watching stay red.',
  objective: 'min',
  unit: 'guards',

  generate(rng: RNG): Instance {
    const nodes = scatter(NODES, VW, VH, 80, 115, rng.next)
    const edges = buildPlanarGraph(nodes, TARGET_EDGES, MAX_EDGE)
    return { nodes, edges, adj: adjacency(nodes.length, edges) }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const open = inst.edges.filter((e) => !sol.includes(e.a) && !sol.includes(e.b)).length
    if (open > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${open} street${open === 1 ? '' : 's'} with nobody watching.`,
      }
    }
    return {
      value: sol.length,
      feasible: true,
      note: `Whole town watched by ${sol.length} guard${sol.length === 1 ? '' : 's'}.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: minCover(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let hover = -1
    let sol: Solution = api.current()
    let ref: Solution | null = null

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)

      inst.edges.forEach((e) => {
        const A = inst.nodes[e.a]
        const B = inst.nodes[e.b]
        const watched = sol.includes(e.a) || sol.includes(e.b)
        ctx.save()
        ctx.lineCap = 'round'
        ctx.strokeStyle = watched ? 'rgba(255,255,255,0.2)' : '#f87171'
        ctx.lineWidth = watched ? 2.5 : 3.5
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        ctx.stroke()
        ctx.restore()
      })

      inst.nodes.forEach((p, i) => {
        const on = sol.includes(i)
        const opt = !!ref && ref.includes(i)
        ctx.save()
        if (i === hover) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 29, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fill()
        }
        if (opt) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 25, 0, Math.PI * 2)
          ctx.setLineDash([5, 5])
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.setLineDash([])
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, on ? 17 : 13, 0, Math.PI * 2)
        ctx.fillStyle = on ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = on ? accent : 'rgba(255,255,255,0.45)'
        ctx.stroke()
        if (on) {
          ctx.fillStyle = '#0a0c10'
          ctx.font = '700 14px "JetBrains Mono", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('●', p.x, p.y + 0.5)
        }
        ctx.restore()
      })
    }

    const onMove = (ev: PointerEvent) => {
      const next = nearestIndex(s.toVirtual(ev), inst.nodes, 34)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = nearestIndex(s.toVirtual(ev), inst.nodes, 34)
      if (hit < 0) return
      api.commit(sol.includes(hit) ? sol.filter((x) => x !== hit) : [...sol, hit])
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

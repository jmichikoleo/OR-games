import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, makeUnionFind, pointSegmentDistance, scatter } from '../core/geom'
import { type Edge, buildPlanarGraph } from '../core/graph'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const NODES = 14
const TARGET_EDGES = 25
const MAX_EDGE = 360

interface Instance {
  nodes: Pt[]
  edges: Edge[]
  /** Price of laying each cable — unrelated to how long the line looks. */
  costs: number[]
}
/** The edge ids you've bought. */
type Solution = number[]

/** Edges that close a loop, in click order — the ones to paint red. */
function loopEdges(inst: Instance, sol: Solution): Set<number> {
  const uf = makeUnionFind(inst.nodes.length)
  const bad = new Set<number>()
  for (const i of sol) {
    const e = inst.edges[i]
    if (!uf.union(e.a, e.b)) bad.add(i)
  }
  return bad
}

export const mst: Minigame<Instance, Solution> = {
  id: 'mst',
  title: 'Wire It Up',
  problem: 'Minimum Spanning Tree',
  family: 'flow',
  blurb: 'Connect all fourteen towns with cable for the least money. Every town reachable, not one loop of wasted wire.',
  howTo: 'Click a cable to buy it or sell it back. Numbers are prices. A loop means you bought a cable you did not need.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    const nodes = scatter(NODES, VW, VH, 75, 112, rng.next)
    const edges = buildPlanarGraph(nodes, TARGET_EDGES, MAX_EDGE)
    return { nodes, edges, costs: edges.map(() => 2 + rng.int(39)) }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const loops = loopEdges(inst, sol)
    if (loops.size > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${loops.size === 1 ? '1 cable closes' : `${loops.size} cables close`} a loop. Sell ${loops.size === 1 ? 'it' : 'them'} back.`,
      }
    }
    const uf = makeUnionFind(inst.nodes.length)
    sol.forEach((i) => uf.union(inst.edges[i].a, inst.edges[i].b))
    const comps = uf.components()
    if (comps > 1) {
      return {
        value: 0,
        feasible: false,
        note: `${comps} separate clusters. ${comps - 1} more cable${comps === 2 ? '' : 's'} to go.`,
      }
    }
    return {
      value: sol.reduce((a, i) => a + inst.costs[i], 0),
      feasible: true,
      note: `Every town connected with ${sol.length} cables, no loops.`,
    }
  },

  solve(inst): Reference<Solution> {
    // Kruskal: cheapest first, skip anything that would close a loop.
    const order = inst.edges.map((_, i) => i).sort((a, b) => inst.costs[a] - inst.costs[b])
    const uf = makeUnionFind(inst.nodes.length)
    const pick: Solution = []
    for (const i of order) {
      const e = inst.edges[i]
      if (uf.union(e.a, e.b)) pick.push(i)
    }
    return { solution: pick, label: 'Kruskal', exact: true }
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
      const loops = loopEdges(inst, sol)

      inst.edges.forEach((e, i) => {
        const A = inst.nodes[e.a]
        const B = inst.nodes[e.b]
        const on = sol.includes(i)
        const bad = loops.has(i)
        const colour = bad ? '#f87171' : on ? accent : 'rgba(255,255,255,0.15)'
        ctx.save()
        ctx.lineCap = 'round'
        if (i === hover && !on) {
          ctx.strokeStyle = 'rgba(255,255,255,0.4)'
          ctx.lineWidth = 8
          ctx.beginPath()
          ctx.moveTo(A.x, A.y)
          ctx.lineTo(B.x, B.y)
          ctx.stroke()
        }
        ctx.strokeStyle = colour
        ctx.lineWidth = on ? 5 : 3
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        ctx.stroke()

        if (ref && ref.includes(i)) {
          ctx.setLineDash([7, 7])
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(A.x, A.y)
          ctx.lineTo(B.x, B.y)
          ctx.stroke()
          ctx.setLineDash([])
        }

        const mx = (A.x + B.x) / 2
        const my = (A.y + B.y) / 2
        const label = String(inst.costs[i])
        ctx.font = '700 12px "JetBrains Mono", monospace'
        const w = ctx.measureText(label).width + 11
        ctx.beginPath()
        ctx.roundRect(mx - w / 2, my - 9, w, 18, 5)
        ctx.fillStyle = on ? colour : '#141821'
        ctx.fill()
        ctx.strokeStyle = on ? colour : 'rgba(255,255,255,0.15)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = on ? '#0a0c10' : 'rgba(255,255,255,0.68)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, mx, my + 0.5)
        ctx.restore()
      })

      inst.nodes.forEach((p) => {
        ctx.save()
        ctx.beginPath()
        ctx.arc(p.x, p.y, 11, 0, Math.PI * 2)
        ctx.fillStyle = '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.stroke()
        ctx.restore()
      })
    }

    const pick = (ev: PointerEvent): number => {
      const v = s.toVirtual(ev)
      let best = -1
      let bestD = 18
      inst.edges.forEach((e, i) => {
        const d = pointSegmentDistance(v, inst.nodes[e.a], inst.nodes[e.b])
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      return best
    }

    const onMove = (ev: PointerEvent) => {
      const next = pick(ev)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = pick(ev)
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

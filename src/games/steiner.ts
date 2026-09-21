import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, makeUnionFind, pointSegmentDistance, scatter } from '../core/geom'
import { type Edge, buildPlanarGraph } from '../core/graph'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const NODES = 11
const TERMINALS = 4
const TARGET_EDGES = 19
const MAX_EDGE = 400

interface Instance {
  nodes: Pt[]
  edges: Edge[]
  costs: number[]
  /** The villages that have to end up joined. */
  terminals: number[]
}
/** Stretches of cable you bought. */
type Solution = number[]

function joinsAll(inst: Instance, sol: Solution): boolean {
  const uf = makeUnionFind(inst.nodes.length)
  sol.forEach((i) => uf.union(inst.edges[i].a, inst.edges[i].b))
  const root = uf.find(inst.terminals[0])
  return inst.terminals.every((t) => uf.find(t) === root)
}

/**
 * Exact for a board this size. Any Steiner tree uses some set of the spare
 * towns, and given that set the cheapest tree is just the minimum spanning
 * tree of what is left, so trying all 2^7 spare sets settles it.
 */
function bestTree(inst: Instance): Solution {
  const spare = inst.nodes
    .map((_, i) => i)
    .filter((i) => !inst.terminals.includes(i))
  let best: Solution = []
  let bestCost = Infinity

  for (let mask = 0; mask < 1 << spare.length; mask++) {
    const keep = new Set(inst.terminals)
    spare.forEach((v, i) => {
      if ((mask >> i) & 1) keep.add(v)
    })
    const order = inst.edges
      .map((_, i) => i)
      .filter((i) => keep.has(inst.edges[i].a) && keep.has(inst.edges[i].b))
      .sort((a, b) => inst.costs[a] - inst.costs[b])

    const uf = makeUnionFind(inst.nodes.length)
    const pick: Solution = []
    let cost = 0
    for (const i of order) {
      if (uf.union(inst.edges[i].a, inst.edges[i].b)) {
        pick.push(i)
        cost += inst.costs[i]
      }
    }
    if (pick.length !== keep.size - 1) continue
    if (cost < bestCost) {
      bestCost = cost
      best = pick
    }
  }
  return best
}

export const steiner: Minigame<Instance, Solution> = {
  id: 'steiner',
  title: 'Four Villages',
  problem: 'Steiner Tree',
  family: 'flow',
  blurb: 'Four villages need to end up on the same network. You can lay cable straight between them or run it through the smaller towns in between, whichever works out cheaper.',
  howTo: 'Click a stretch of cable to buy it or sell it back. The four squares have to end up joined. The round towns are optional, use them only if they save you money.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    const nodes = scatter(NODES, VW, VH, 85, 135, rng.next)
    const edges = buildPlanarGraph(nodes, TARGET_EDGES, MAX_EDGE)
    const order = nodes.map((_, i) => i)
    for (let i = order.length - 1; i > 0; i--) {
      const k = rng.int(i + 1)
      ;[order[i], order[k]] = [order[k], order[i]]
    }
    return {
      nodes,
      edges,
      costs: edges.map(() => 3 + rng.int(28)),
      terminals: order.slice(0, TERMINALS).sort((a, b) => a - b),
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    if (!joinsAll(inst, sol)) {
      const uf = makeUnionFind(inst.nodes.length)
      sol.forEach((i) => uf.union(inst.edges[i].a, inst.edges[i].b))
      const groups = new Set(inst.terminals.map((t) => uf.find(t))).size
      return {
        value: 0,
        feasible: false,
        note: `The villages are still in ${groups} separate groups.`,
      }
    }
    return {
      value: sol.reduce((a, i) => a + inst.costs[i], 0),
      feasible: true,
      note: `All four villages joined using ${sol.length} stretches of cable.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestTree(inst), label: 'exhaustive over spare towns', exact: true }
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

      inst.edges.forEach((e, i) => {
        const A = inst.nodes[e.a]
        const B = inst.nodes[e.b]
        const on = sol.includes(i)
        ctx.save()
        ctx.lineCap = 'round'
        if (i === hover && !on) {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'
          ctx.lineWidth = 8
          ctx.beginPath()
          ctx.moveTo(A.x, A.y)
          ctx.lineTo(B.x, B.y)
          ctx.stroke()
        }
        ctx.strokeStyle = on ? accent : 'rgba(255,255,255,0.14)'
        ctx.lineWidth = on ? 5 : 2.5
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        ctx.stroke()

        if (ref && ref.includes(i)) {
          ctx.setLineDash([7, 7])
          ctx.strokeStyle = 'rgba(255,255,255,0.78)'
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
        ctx.fillStyle = on ? accent : '#141821'
        ctx.fill()
        ctx.strokeStyle = on ? accent : 'rgba(255,255,255,0.15)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = on ? '#0a0c10' : 'rgba(255,255,255,0.68)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, mx, my + 0.5)
        ctx.restore()
      })

      inst.nodes.forEach((p, i) => {
        const village = inst.terminals.includes(i)
        ctx.save()
        if (village) {
          ctx.beginPath()
          ctx.roundRect(p.x - 15, p.y - 15, 30, 30, 5)
          ctx.fillStyle = accent
          ctx.fill()
          ctx.beginPath()
          ctx.roundRect(p.x - 21, p.y - 21, 42, 42, 8)
          ctx.strokeStyle = `${accent}77`
          ctx.lineWidth = 2
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 10, 0, Math.PI * 2)
          ctx.fillStyle = '#0f1218'
          ctx.fill()
          ctx.lineWidth = 2.5
          ctx.strokeStyle = 'rgba(255,255,255,0.45)'
          ctx.stroke()
        }
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

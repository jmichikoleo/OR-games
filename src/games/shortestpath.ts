import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, nearestIndex, scatter } from '../core/geom'
import { type Edge, adjacency, buildPlanarGraph, edgeBetween, farthestPair, otherEnd } from '../core/graph'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const NODES = 12
const TARGET_EDGES = 20
const MAX_EDGE = 400

interface Instance {
  nodes: Pt[]
  edges: Edge[]
  adj: number[][]
  /** Toll on each edge — deliberately unrelated to how long the road looks. */
  costs: number[]
  start: number
  goal: number
}
/** Node sequence, always beginning at the start junction. */
type Solution = number[]

const edgeAt = (inst: Instance, u: number, v: number) => edgeBetween(inst.edges, inst.adj, u, v)

function dijkstra(inst: Instance): Solution {
  const n = inst.nodes.length
  const distTo = new Float64Array(n).fill(Infinity)
  const prev = new Int16Array(n).fill(-1)
  const done = new Array(n).fill(false)
  distTo[inst.start] = 0

  for (let it = 0; it < n; it++) {
    let u = -1
    let best = Infinity
    for (let i = 0; i < n; i++) {
      if (!done[i] && distTo[i] < best) {
        best = distTo[i]
        u = i
      }
    }
    if (u < 0) break
    done[u] = true
    for (const e of inst.adj[u]) {
      const v = otherEnd(inst.edges[e], u)
      const alt = distTo[u] + inst.costs[e]
      if (alt < distTo[v]) {
        distTo[v] = alt
        prev[v] = u
      }
    }
  }

  const path: Solution = []
  let cur = inst.goal
  while (cur !== -1) {
    path.push(cur)
    if (cur === inst.start) break
    cur = prev[cur]
  }
  return path.reverse()
}

export const shortestpath: Minigame<Instance, Solution> = {
  id: 'shortestpath',
  title: 'Toll Roads',
  problem: 'Shortest Path',
  family: 'flow',
  blurb: 'Get from S to E for the smallest total toll. The cheapest road is rarely the one that looks most direct.',
  howTo: 'Click a connected junction to take that road. Click the junction you are on to back up. Numbers are tolls, not distances.',
  objective: 'min',
  unit: 'toll',

  generate(rng: RNG): Instance {
    const nodes = scatter(NODES, VW, VH, 80, 122, rng.next)
    const edges = buildPlanarGraph(nodes, TARGET_EDGES, MAX_EDGE)
    const [start, goal] = farthestPair(nodes)
    return {
      nodes,
      edges,
      adj: adjacency(nodes.length, edges),
      costs: edges.map(() => 2 + rng.int(29)),
      start,
      goal,
    }
  },

  initial(inst): Solution {
    return [inst.start]
  },

  evaluate(inst, sol) {
    let spent = 0
    for (let i = 0; i + 1 < sol.length; i++) {
      const e = edgeAt(inst, sol[i], sol[i + 1])
      if (e < 0) return { value: 0, feasible: false, note: 'That route breaks. Start again.' }
      spent += inst.costs[e]
    }
    if (sol[sol.length - 1] !== inst.goal) {
      return { value: 0, feasible: false, note: `${spent} paid so far and you are not at E yet.` }
    }
    return {
      value: spent,
      feasible: true,
      note: `Arrived at E in ${sol.length - 1} hop${sol.length === 2 ? '' : 's'}.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: dijkstra(inst), label: 'Dijkstra', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let hover = -1
    let sol: Solution = api.current()
    let ref: Solution | null = null

    const onPath = (path: Solution | null, e: number): boolean => {
      if (!path) return false
      for (let i = 0; i + 1 < path.length; i++) {
        if (edgeAt(inst, path[i], path[i + 1]) === e) return true
      }
      return false
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const here = sol[sol.length - 1]

      inst.edges.forEach((e, i) => {
        const A = inst.nodes[e.a]
        const B = inst.nodes[e.b]
        const taken = onPath(sol, i)
        ctx.save()
        ctx.lineCap = 'round'
        ctx.strokeStyle = taken ? accent : 'rgba(255,255,255,0.16)'
        ctx.lineWidth = taken ? 5 : 3
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        ctx.stroke()

        if (onPath(ref, i)) {
          ctx.setLineDash([7, 7])
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(A.x, A.y)
          ctx.lineTo(B.x, B.y)
          ctx.stroke()
          ctx.setLineDash([])
        }
        ctx.restore()

        // Toll tag.
        const mx = (A.x + B.x) / 2
        const my = (A.y + B.y) / 2
        const label = String(inst.costs[i])
        ctx.save()
        ctx.font = '700 13px "JetBrains Mono", monospace'
        const w = ctx.measureText(label).width + 12
        ctx.beginPath()
        ctx.roundRect(mx - w / 2, my - 10, w, 20, 6)
        ctx.fillStyle = taken ? accent : '#141821'
        ctx.fill()
        ctx.strokeStyle = taken ? accent : 'rgba(255,255,255,0.16)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = taken ? '#0a0c10' : 'rgba(255,255,255,0.72)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, mx, my + 0.5)
        ctx.restore()
      })

      inst.nodes.forEach((p, i) => {
        const isHere = i === here
        const reachable = i !== here && edgeAt(inst, here, i) >= 0
        const tag = i === inst.start ? 'S' : i === inst.goal ? 'E' : ''
        ctx.save()
        if (i === hover && reachable) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 27, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.09)'
          ctx.fill()
        }
        if (tag) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 22, 0, Math.PI * 2)
          ctx.strokeStyle = i === inst.goal ? '#4ade80' : accent
          ctx.lineWidth = 2
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, 15, 0, Math.PI * 2)
        ctx.fillStyle = isHere ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = isHere
          ? accent
          : reachable
            ? 'rgba(255,255,255,0.6)'
            : 'rgba(255,255,255,0.3)'
        ctx.stroke()
        if (tag) {
          ctx.fillStyle = isHere ? '#0a0c10' : i === inst.goal ? '#4ade80' : accent
          ctx.font = '700 13px "JetBrains Mono", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(tag, p.x, p.y + 0.5)
        }
        ctx.restore()
      })
    }

    const onMove = (ev: PointerEvent) => {
      const next = nearestIndex(s.toVirtual(ev), inst.nodes, 38)
      if (next !== hover) {
        hover = next
        const here = sol[sol.length - 1]
        const usable =
          next >= 0 && (next === here ? sol.length > 1 : edgeAt(inst, here, next) >= 0)
        s.canvas.style.cursor = usable ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = nearestIndex(s.toVirtual(ev), inst.nodes, 38)
      if (hit < 0) return
      const here = sol[sol.length - 1]
      if (hit === here) {
        if (sol.length > 1) api.commit(sol.slice(0, -1))
        return
      }
      if (edgeAt(inst, here, hit) < 0) return
      api.commit([...sol, hit])
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

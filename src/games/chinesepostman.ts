import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, nearestIndex, scatter } from '../core/geom'
import { type Edge, adjacency, buildPlanarGraph, edgeBetween, otherEnd } from '../core/graph'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const NODES = 9
const TARGET_EDGES = 14
const MAX_EDGE = 430

interface Instance {
  nodes: Pt[]
  edges: Edge[]
  /** node -> ids of incident edges */
  adj: number[][]
}
/** The walk, as a sequence of node indices. Always starts at the depot, node 0. */
type Solution = number[]

const edgeAt = (inst: Instance, u: number, v: number): number =>
  edgeBetween(inst.edges, inst.adj, u, v)

/**
 * Exact CPP: shortest paths, then a minimum-weight perfect matching on the
 * odd-degree corners (DP over subsets — at most 8 of them), then Hierholzer
 * on the graph with those paths doubled.
 */
function optimalWalk(inst: Instance): Solution {
  const n = inst.nodes.length
  const D = Array.from({ length: n }, () => new Float64Array(n).fill(Infinity))
  const NXT = Array.from({ length: n }, () => new Int16Array(n).fill(-1))
  for (let i = 0; i < n; i++) {
    D[i][i] = 0
    NXT[i][i] = i
  }
  for (const e of inst.edges) {
    if (e.len < D[e.a][e.b]) {
      D[e.a][e.b] = D[e.b][e.a] = e.len
      NXT[e.a][e.b] = e.b
      NXT[e.b][e.a] = e.a
    }
  }
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (D[i][k] + D[k][j] < D[i][j]) {
          D[i][j] = D[i][k] + D[k][j]
          NXT[i][j] = NXT[i][k]
        }
      }
    }
  }

  const deg = new Array(n).fill(0)
  inst.edges.forEach((e) => {
    deg[e.a]++
    deg[e.b]++
  })
  const odd = deg.map((d, i) => (d % 2 ? i : -1)).filter((i) => i >= 0)

  const mult = inst.edges.map(() => 1)
  if (odd.length > 0) {
    const k = odd.length
    const memo = new Float64Array(1 << k).fill(-1)
    const choice = new Int16Array(1 << k).fill(-1)
    const rec = (mask: number): number => {
      if (mask === 0) return 0
      if (memo[mask] >= 0) return memo[mask]
      let i = 0
      while (!(mask & (1 << i))) i++
      let best = Infinity
      let bestJ = -1
      for (let j = i + 1; j < k; j++) {
        if (!(mask & (1 << j))) continue
        const c = D[odd[i]][odd[j]] + rec(mask ^ (1 << i) ^ (1 << j))
        if (c < best) {
          best = c
          bestJ = j
        }
      }
      memo[mask] = best
      choice[mask] = bestJ
      return best
    }
    rec((1 << k) - 1)

    let mask = (1 << k) - 1
    while (mask) {
      let i = 0
      while (!(mask & (1 << i))) i++
      const j = choice[mask]
      if (j < 0) break
      let cur = odd[i]
      const dest = odd[j]
      while (cur !== dest) {
        const nx = NXT[cur][dest]
        mult[edgeAt(inst, cur, nx)]++
        cur = nx
      }
      mask ^= (1 << i) | (1 << j)
    }
  }

  // Hierholzer over the multigraph.
  const inc: number[][] = inst.nodes.map(() => [])
  const insts: { a: number; b: number }[] = []
  inst.edges.forEach((e, id) => {
    for (let c = 0; c < mult[id]; c++) {
      const iid = insts.length
      insts.push({ a: e.a, b: e.b })
      inc[e.a].push(iid)
      inc[e.b].push(iid)
    }
  })

  const used = new Array(insts.length).fill(false)
  const ptr = inst.nodes.map(() => 0)
  const stack = [0]
  const circuit: number[] = []
  while (stack.length) {
    const v = stack[stack.length - 1]
    while (ptr[v] < inc[v].length && used[inc[v][ptr[v]]]) ptr[v]++
    if (ptr[v] === inc[v].length) {
      circuit.push(stack.pop()!)
    } else {
      const id = inc[v][ptr[v]++]
      used[id] = true
      stack.push(insts[id].a === v ? insts[id].b : insts[id].a)
    }
  }
  return circuit.reverse()
}

function traversalCounts(inst: Instance, walk: Solution): number[] {
  const counts = inst.edges.map(() => 0)
  for (let i = 0; i + 1 < walk.length; i++) {
    const e = edgeAt(inst, walk[i], walk[i + 1])
    if (e >= 0) counts[e]++
  }
  return counts
}

export const chinesepostman: Minigame<Instance, Solution> = {
  id: 'chinesepostman',
  title: 'Every Street',
  problem: 'Chinese Postman',
  family: 'routing',
  blurb: 'Walk down every street at least once and get back to the depot, covering as little ground as you can.',
  howTo: 'Click a connected corner to walk that street. Click the corner you are standing on to step back. Repeated streets show a doubled line.',
  objective: 'min',
  unit: 'm',

  generate(rng: RNG): Instance {
    const nodes = scatter(NODES, VW, VH, 85, 145, rng.next)
    const edges = buildPlanarGraph(nodes, TARGET_EDGES, MAX_EDGE)
    return { nodes, edges, adj: adjacency(nodes.length, edges) }
  },

  initial(): Solution {
    return [0]
  },

  evaluate(inst, sol) {
    let len = 0
    const counts = inst.edges.map(() => 0)
    for (let i = 0; i + 1 < sol.length; i++) {
      const e = edgeAt(inst, sol[i], sol[i + 1])
      if (e < 0) return { value: 0, feasible: false, note: 'That route breaks. Start again.' }
      counts[e]++
      len += inst.edges[e].len
    }
    const missing = counts.filter((c) => c === 0).length
    if (missing > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${missing} street${missing === 1 ? '' : 's'} not walked yet.`,
      }
    }
    if (sol[sol.length - 1] !== 0) {
      return { value: 0, feasible: false, note: 'Every street walked. Now get back to the depot.' }
    }
    const repeats = counts.filter((c) => c > 1).length
    return {
      value: len,
      feasible: true,
      note: `Round complete. ${repeats} street${repeats === 1 ? '' : 's'} walked more than once.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: optimalWalk(inst), label: 'matching + Euler', exact: true }
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

      const counts = traversalCounts(inst, sol)
      const refCounts = ref ? traversalCounts(inst, ref) : null
      const here = sol[sol.length - 1]

      inst.edges.forEach((e, i) => {
        const A = inst.nodes[e.a]
        const B = inst.nodes[e.b]
        const c = counts[i]
        ctx.save()
        ctx.lineCap = 'round'
        if (c === 0) {
          ctx.strokeStyle = 'rgba(255,255,255,0.14)'
          ctx.lineWidth = 3
        } else if (c === 1) {
          ctx.strokeStyle = accent
          ctx.lineWidth = 4.5
        } else {
          ctx.strokeStyle = accent
          ctx.lineWidth = 9
        }
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        ctx.stroke()

        if (c > 1) {
          ctx.strokeStyle = '#0a0c10'
          ctx.lineWidth = 2
          ctx.stroke()
        }

        if (refCounts && refCounts[i] > 1) {
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
      })

      inst.nodes.forEach((p, i) => {
        const isHere = i === here
        const reachable = i !== here && edgeAt(inst, here, i) >= 0
        ctx.save()
        if (i === hover && reachable) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 28, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.09)'
          ctx.fill()
        }
        if (i === 0) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 22, 0, Math.PI * 2)
          ctx.strokeStyle = accent
          ctx.lineWidth = 2
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, 15, 0, Math.PI * 2)
        ctx.fillStyle = isHere ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = isHere ? accent : reachable ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)'
        ctx.stroke()
        if (i === 0) {
          ctx.fillStyle = isHere ? '#0b0d11' : accent
          ctx.font = '700 13px "JetBrains Mono", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('D', p.x, p.y + 0.5)
        }
        ctx.restore()
      })
    }

    const onMove = (ev: PointerEvent) => {
      const next = nearestIndex(s.toVirtual(ev), inst.nodes, 40)
      if (next !== hover) {
        hover = next
        const here = sol[sol.length - 1]
        const usable = next >= 0 && (next === here ? sol.length > 1 : edgeAt(inst, here, next) >= 0)
        s.canvas.style.cursor = usable ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const hit = nearestIndex(s.toVirtual(ev), inst.nodes, 40)
      if (hit < 0) return
      const here = sol[sol.length - 1]
      // Clicking where you stand rewinds the last step, for free.
      if (hit === here) {
        if (sol.length > 1) api.commit(sol.slice(0, -1))
        return
      }
      const e = edgeAt(inst, here, hit)
      if (e < 0) return
      api.commit([...sol, otherEnd(inst.edges[e], here)])
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

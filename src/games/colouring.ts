import type { Minigame, Reference, RNG } from '../core/types'
import type { Pt } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const NODES = 13
const EDGES = 26
const CX = 500
const CY = 296
const R = 238
const PALETTE = ['#f43f5e', '#facc15', '#34d399', '#60a5fa', '#c084fc', '#fb923c']
const SW = 54
const SH = 36
const SY = 578

interface Instance {
  nodes: Pt[]
  edges: { a: number; b: number }[]
  adj: boolean[][]
}
/** Colour index per node, or -1 for unpainted. */
type Solution = number[]

function buildAdj(n: number, edges: { a: number; b: number }[]): boolean[][] {
  const adj = Array.from({ length: n }, () => new Array(n).fill(false))
  edges.forEach((e) => {
    adj[e.a][e.b] = true
    adj[e.b][e.a] = true
  })
  return adj
}

/**
 * Backtracking k-colouring. The symmetry break — never reach for colour c+1
 * before colour c has been used — is what keeps the search instant at n=13.
 */
function colourWith(n: number, adj: boolean[][], k: number): number[] | null {
  const deg = adj.map((row) => row.filter(Boolean).length)
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => deg[b] - deg[a])
  const col = new Array(n).fill(-1)

  const walk = (i: number, used: number): boolean => {
    if (i === n) return true
    const v = order[i]
    const limit = Math.min(k - 1, used)
    for (let c = 0; c <= limit; c++) {
      let clash = false
      for (let u = 0; u < n; u++) {
        if (adj[v][u] && col[u] === c) {
          clash = true
          break
        }
      }
      if (clash) continue
      col[v] = c
      if (walk(i + 1, Math.max(used, c + 1))) return true
      col[v] = -1
    }
    return false
  }

  return walk(0, 0) ? col : null
}

function chromatic(n: number, adj: boolean[][], maxK: number): number[] | null {
  for (let k = 1; k <= maxK; k++) {
    const c = colourWith(n, adj, k)
    if (c) return c
  }
  return null
}

const distinct = (sol: Solution) => new Set(sol.filter((c) => c >= 0)).size

export const colouring: Minigame<Instance, Solution> = {
  id: 'colouring',
  title: 'Colour Clash',
  problem: 'Graph Colouring',
  family: 'covering',
  blurb: 'Paint every node so no two joined by a line share a colour, using as few colours as you can.',
  howTo: 'Pick a colour from the strip, then click nodes to paint them. Clicking a node in its own colour wipes it. Red lines are clashes.',
  objective: 'min',
  unit: 'colours',

  generate(rng: RNG): Instance {
    const nodes: Pt[] = Array.from({ length: NODES }, (_, i) => {
      const t = -Math.PI / 2 + (2 * Math.PI * i) / NODES
      return { x: CX + R * Math.cos(t), y: CY + R * Math.sin(t) }
    })

    const pairs: { a: number; b: number }[] = []
    for (let i = 0; i < NODES; i++) {
      for (let j = i + 1; j < NODES; j++) pairs.push({ a: i, b: j })
    }
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = rng.int(i + 1)
      ;[pairs[i], pairs[j]] = [pairs[j], pairs[i]]
    }

    // Keep the instance inside the palette: trim until five colours suffice.
    let edges = pairs.slice(0, EDGES)
    let adj = buildAdj(NODES, edges)
    while (edges.length > 1 && !colourWith(NODES, adj, 5)) {
      edges = edges.slice(0, -1)
      adj = buildAdj(NODES, edges)
    }

    return { nodes, edges, adj }
  },

  initial(): Solution {
    return new Array(NODES).fill(-1)
  },

  evaluate(inst, sol) {
    const blank = sol.filter((c) => c < 0).length
    if (blank > 0) {
      return { value: 0, feasible: false, note: `${blank} node${blank === 1 ? '' : 's'} still unpainted.` }
    }
    const clashes = inst.edges.filter((e) => sol[e.a] === sol[e.b]).length
    if (clashes > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${clashes} line${clashes === 1 ? '' : 's'} join two nodes of the same colour.`,
      }
    }
    const k = distinct(sol)
    return { value: k, feasible: true, note: `Clean colouring with ${k} colours.` }
  },

  solve(inst): Reference<Solution> {
    const best = chromatic(NODES, inst.adj, PALETTE.length)
    return { solution: best ?? new Array(NODES).fill(0), label: 'exact search', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let brush = 0
    let hover = -1
    let sol: Solution = api.current()
    let ref: Solution | null = null

    const swatchX = (i: number) => CX - (PALETTE.length * (SW + 8)) / 2 + i * (SW + 8) + 4

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      clearBoard(ctx, VW, VH)

      inst.edges.forEach((e) => {
        const A = inst.nodes[e.a]
        const B = inst.nodes[e.b]
        const clash = sol[e.a] >= 0 && sol[e.a] === sol[e.b]
        ctx.save()
        ctx.strokeStyle = clash ? '#f87171' : 'rgba(255,255,255,0.13)'
        ctx.lineWidth = clash ? 3 : 1.6
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        ctx.stroke()
        ctx.restore()
      })

      inst.nodes.forEach((p, i) => {
        const c = sol[i]
        ctx.save()
        if (i === hover) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 33, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fill()
        }
        if (ref && ref[i] >= 0) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 30, 0, Math.PI * 2)
          ctx.setLineDash([5, 5])
          ctx.strokeStyle = PALETTE[ref[i]]
          ctx.lineWidth = 2.5
          ctx.stroke()
          ctx.setLineDash([])
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, 23, 0, Math.PI * 2)
        ctx.fillStyle = c >= 0 ? PALETTE[c] : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = c >= 0 ? PALETTE[c] : 'rgba(255,255,255,0.4)'
        ctx.stroke()
        ctx.fillStyle = c >= 0 ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.55)'
        ctx.font = '700 13px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(i + 1), p.x, p.y + 0.5)
        ctx.restore()
      })

      PALETTE.forEach((col, i) => {
        const x = swatchX(i)
        const on = i === brush
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(x, SY, SW, SH, 8)
        ctx.fillStyle = col
        ctx.globalAlpha = on ? 1 : 0.42
        ctx.fill()
        ctx.globalAlpha = 1
        if (on) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2.5
          ctx.stroke()
        }
        ctx.restore()
      })
    }

    const nodeAt = (p: Pt): number => {
      for (let i = 0; i < inst.nodes.length; i++) {
        if (Math.hypot(p.x - inst.nodes[i].x, p.y - inst.nodes[i].y) <= 30) return i
      }
      return -1
    }

    const swatchAt = (p: Pt): number => {
      if (p.y < SY || p.y > SY + SH) return -1
      for (let i = 0; i < PALETTE.length; i++) {
        const x = swatchX(i)
        if (p.x >= x && p.x <= x + SW) return i
      }
      return -1
    }

    const onMove = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      const next = nodeAt(v)
      const overSwatch = swatchAt(v) >= 0
      if (next !== hover) {
        hover = next
        draw(sol, ref)
      }
      s.canvas.style.cursor = next >= 0 || overSwatch ? 'pointer' : 'default'
    }

    const onClick = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      const sw = swatchAt(v)
      if (sw >= 0) {
        brush = sw
        draw(sol, ref)
        return
      }
      const i = nodeAt(v)
      if (i < 0) return
      const next = [...sol]
      next[i] = sol[i] === brush ? -1 : brush
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

import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt, makeUnionFind } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const N = 12
const CX = 500
const CY = 310
const R = 250

interface Wire {
  a: number
  b: number
  w: number
}
interface Instance {
  nodes: Pt[]
  wires: Wire[]
}
/** Nodes you moved over to the far side. Everyone else stays put. */
type Solution = number[]

const crossing = (sol: Solution, e: Wire) =>
  sol.includes(e.a) !== sol.includes(e.b)

const cutWeight = (inst: Instance, sol: Solution) =>
  inst.wires.reduce((a, e) => a + (crossing(sol, e) ? e.w : 0), 0)

/** Every way of splitting twelve nodes into two non-empty sides. */
function bestSplit(inst: Instance): Solution {
  let best: Solution = [0]
  let bestVal = Infinity
  // Node 0 always stays, which kills the mirror-image duplicates.
  for (let mask = 1; mask < 1 << (N - 1); mask++) {
    const side = Array.from({ length: N - 1 }, (_, i) => i + 1).filter((i) => (mask >> (i - 1)) & 1)
    const v = cutWeight(inst, side)
    if (v < bestVal) {
      bestVal = v
      best = side
    }
  }
  return best
}

export const mincut: Minigame<Instance, Solution> = {
  id: 'mincut',
  title: 'Clean Break',
  problem: 'Minimum Cut',
  family: 'covering',
  blurb: 'Split the network into two halves. Every wire that ends up crossing between them has to be cut, so find the split that costs you least.',
  howTo: 'Click a node to send it across to the other side. Red wires are the ones you are cutting and the number on each is what it costs. Thicker wires are heavier.',
  objective: 'min',
  unit: 'weight',

  generate(rng: RNG): Instance {
    const nodes: Pt[] = Array.from({ length: N }, (_, i) => {
      const t = -Math.PI / 2 + (2 * Math.PI * i) / N
      return { x: CX + R * Math.cos(t), y: CY + R * Math.sin(t) }
    })

    // Three loose clusters, so the cheapest split is a real group rather than
    // whichever node happens to be loneliest.
    const group = Array.from({ length: N }, () => rng.int(3))
    const wires: Wire[] = []
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const same = group[i] === group[j]
        const keep = rng.next() < (same ? 0.72 : 0.16)
        if (keep) wires.push({ a: i, b: j, w: same ? 4 + rng.int(6) : 1 + rng.int(4) })
      }
    }

    const uf = makeUnionFind(N)
    wires.forEach((e) => uf.union(e.a, e.b))
    for (let i = 1; i < N; i++) {
      if (uf.find(i) !== uf.find(0)) {
        wires.push({ a: 0, b: i, w: 1 + rng.int(4) })
        uf.union(0, i)
      }
    }
    return { nodes, wires }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    if (sol.length === 0 || sol.length === N) {
      return { value: 0, feasible: false, note: 'Both sides need at least one node on them.' }
    }
    const cut = inst.wires.filter((e) => crossing(sol, e)).length
    return {
      value: cutWeight(inst, sol),
      feasible: true,
      note: `${sol.length} nodes moved across and ${cut} wires cut.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestSplit(inst), label: 'exhaustive', exact: true }
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
      const across = new Set(sol)

      inst.wires.forEach((e) => {
        const A = inst.nodes[e.a]
        const B = inst.nodes[e.b]
        const cut = crossing(sol, e)
        ctx.save()
        ctx.lineCap = 'round'
        ctx.strokeStyle = cut ? '#ff5c7a' : 'rgba(255,255,255,0.13)'
        ctx.lineWidth = 1 + e.w * 0.55
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        ctx.stroke()
        if (cut) {
          const mx = (A.x + B.x) / 2
          const my = (A.y + B.y) / 2
          const label = String(e.w)
          ctx.font = '700 11px "JetBrains Mono", monospace'
          const w = ctx.measureText(label).width + 10
          ctx.beginPath()
          ctx.roundRect(mx - w / 2, my - 8, w, 16, 4)
          ctx.fillStyle = '#ff5c7a'
          ctx.fill()
          ctx.fillStyle = '#14060d'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(label, mx, my + 0.5)
        }
        ctx.restore()
      })

      inst.nodes.forEach((p, i) => {
        const moved = across.has(i)
        const best = !!ref && ref.includes(i)
        ctx.save()
        if (i === hover) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 32, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fill()
        }
        if (best) {
          ctx.beginPath()
          ctx.setLineDash([5, 5])
          ctx.arc(p.x, p.y, 29, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.setLineDash([])
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, 22, 0, Math.PI * 2)
        ctx.fillStyle = moved ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = moved ? accent : 'rgba(255,255,255,0.45)'
        ctx.stroke()
        ctx.fillStyle = moved ? '#0a0c10' : 'rgba(255,255,255,0.6)'
        ctx.font = '700 13px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(i + 1), p.x, p.y + 0.5)
        ctx.restore()
      })
    }

    const nodeAt = (p: Pt) => {
      for (let i = 0; i < N; i++) {
        if (Math.hypot(p.x - inst.nodes[i].x, p.y - inst.nodes[i].y) <= 30) return i
      }
      return -1
    }

    const onMove = (ev: PointerEvent) => {
      const next = nodeAt(s.toVirtual(ev))
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const i = nodeAt(s.toVirtual(ev))
      if (i < 0) return
      api.commit(sol.includes(i) ? sol.filter((x) => x !== i) : [...sol, i])
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

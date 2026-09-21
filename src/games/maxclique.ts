import type { Minigame, Reference, RNG } from '../core/types'
import type { Pt } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const N = 14
const EDGES = 48
const CX = 500
const CY = 308
const R = 248

interface Instance {
  nodes: Pt[]
  pairs: { a: number; b: number }[]
  knows: boolean[][]
}
/** The people you sat at the table. */
type Solution = number[]

function buildKnows(pairs: { a: number; b: number }[]): boolean[][] {
  const k = Array.from({ length: N }, () => new Array(N).fill(false))
  pairs.forEach((e) => {
    k[e.a][e.b] = true
    k[e.b][e.a] = true
  })
  return k
}

const strangers = (inst: Instance, sol: Solution) => {
  const out: [number, number][] = []
  for (let i = 0; i < sol.length; i++) {
    for (let j = i + 1; j < sol.length; j++) {
      if (!inst.knows[sol[i]][sol[j]]) out.push([sol[i], sol[j]])
    }
  }
  return out
}

/** All 16,384 groups get checked, so the target really is the largest one. */
function biggestTable(inst: Instance): Solution {
  let best: Solution = []
  for (let mask = 1; mask < 1 << N; mask++) {
    const who: number[] = []
    for (let i = 0; i < N; i++) if ((mask >> i) & 1) who.push(i)
    if (who.length <= best.length) continue
    let ok = true
    for (let i = 0; i < who.length && ok; i++) {
      for (let j = i + 1; j < who.length; j++) {
        if (!inst.knows[who[i]][who[j]]) {
          ok = false
          break
        }
      }
    }
    if (ok) best = who
  }
  return best
}

export const maxclique: Minigame<Instance, Solution> = {
  id: 'maxclique',
  title: 'Round Table',
  problem: 'Maximum Clique',
  family: 'covering',
  blurb: 'Fourteen guests, and a line between two of them means they already know each other. Seat the biggest group where every single person knows every other one.',
  howTo: 'Click a guest to seat them or send them away. If you seat two people who have never met, the gap between them turns red.',
  objective: 'max',
  unit: 'guests',

  generate(rng: RNG): Instance {
    const nodes: Pt[] = Array.from({ length: N }, (_, i) => {
      const t = -Math.PI / 2 + (2 * Math.PI * i) / N
      return { x: CX + R * Math.cos(t), y: CY + R * Math.sin(t) }
    })
    const all: { a: number; b: number }[] = []
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) all.push({ a: i, b: j })
    }
    for (let i = all.length - 1; i > 0; i--) {
      const k = rng.int(i + 1)
      ;[all[i], all[k]] = [all[k], all[i]]
    }
    const pairs = all.slice(0, EDGES)
    return { nodes, pairs, knows: buildKnows(pairs) }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const bad = strangers(inst, sol)
    if (bad.length > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${bad.length} ${bad.length === 1 ? 'pair has' : 'pairs have'} never met. Send one of them away.`,
      }
    }
    if (sol.length === 0) {
      return { value: 0, feasible: false, note: 'Nobody is seated yet.' }
    }
    return {
      value: sol.length,
      feasible: true,
      note: `${sol.length} guests and everyone knows everyone.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: biggestTable(inst), label: 'exhaustive', exact: true }
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
      const seated = new Set(sol)

      inst.pairs.forEach((e) => {
        const A = inst.nodes[e.a]
        const B = inst.nodes[e.b]
        const both = seated.has(e.a) && seated.has(e.b)
        ctx.save()
        ctx.strokeStyle = both ? accent : 'rgba(255,255,255,0.12)'
        ctx.lineWidth = both ? 3 : 1.4
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        ctx.stroke()
        ctx.restore()
      })

      // Seated pairs with no line between them are the whole problem.
      strangers(inst, sol).forEach(([a, b]) => {
        const A = inst.nodes[a]
        const B = inst.nodes[b]
        ctx.save()
        ctx.setLineDash([6, 6])
        ctx.strokeStyle = '#ff5c7a'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        ctx.stroke()
        ctx.restore()
      })

      inst.nodes.forEach((p, i) => {
        const on = seated.has(i)
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
        ctx.fillStyle = on ? accent : '#0f1218'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = on ? accent : 'rgba(255,255,255,0.4)'
        ctx.stroke()
        ctx.fillStyle = on ? '#0a0c10' : 'rgba(255,255,255,0.6)'
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

import type { Minigame, Reference, RNG } from '../core/types'
import { type Pt } from '../core/geom'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 520
const N = 8
const COLS = 4
const CELL = 180
const PADX = (VW - COLS * CELL) / 2
const PADY = 76

const LETTERS = 'ABCDEFGH'
const NAMES = ['Press', 'Paint', 'Weld', 'Store', 'Pack', 'Test', 'Office', 'Ship']
const COLORS = [
  '#f472b6', '#60a5fa', '#34d399', '#fbbf24',
  '#a78bfa', '#22d3ee', '#fb923c', '#4ade80',
]

const CENTER: Pt[] = Array.from({ length: N }, (_, k) => ({
  x: PADX + (k % COLS) * CELL + CELL / 2,
  y: PADY + Math.floor(k / COLS) * CELL + CELL / 2,
}))

/** Walking distance between two bays, in aisles. */
const GRID_D: number[][] = Array.from({ length: N }, (_, a) =>
  Array.from({ length: N }, (_, b) =>
    Math.abs((a % COLS) - (b % COLS)) + Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS)),
  ),
)

interface Instance {
  /** flow[i][j] is how many trips a day run between department i and j. */
  flow: number[][]
}
/** at[bay] = which department sits there. */
type Solution = number[]

function costOf(inst: Instance, at: Solution): number {
  let total = 0
  for (let k = 0; k < N; k++) {
    for (let l = k + 1; l < N; l++) total += inst.flow[at[k]][at[l]] * GRID_D[k][l]
  }
  return total
}

/** 8! = 40,320 layouts. Every single one gets checked. */
function bestLayout(inst: Instance): Solution {
  let best: Solution = Array.from({ length: N }, (_, i) => i)
  let bestCost = Infinity
  const at = new Array(N).fill(-1)
  const used = new Array(N).fill(false)
  const walk = (k: number) => {
    if (k === N) {
      const c = costOf(inst, at)
      if (c < bestCost) {
        bestCost = c
        best = [...at]
      }
      return
    }
    for (let d = 0; d < N; d++) {
      if (used[d]) continue
      used[d] = true
      at[k] = d
      walk(k + 1)
      used[d] = false
    }
  }
  walk(0)
  return best
}

export const qap: Minigame<Instance, Solution> = {
  id: 'qap',
  title: 'Floor Plan',
  problem: 'Quadratic Assignment (Facility Layout)',
  family: 'assignment',
  blurb: 'Eight departments, eight bays. Departments that send a lot of work to each other should not be at opposite ends of the building.',
  howTo: 'Click one bay, then another, to swap what is in them. Thicker lines mean more trips a day between those two departments.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    const flow = Array.from({ length: N }, () => new Array(N).fill(0))
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        // Mostly quiet pairs with a handful of busy ones, like a real plant.
        const v = rng.next() < 0.45 ? 1 + rng.int(9) : 0
        flow[i][j] = v
        flow[j][i] = v
      }
    }
    return { flow }
  },

  initial(): Solution {
    return Array.from({ length: N }, (_, i) => i)
  },

  evaluate(inst, sol) {
    return {
      value: costOf(inst, sol),
      feasible: true,
      note: 'Every department has a bay. Swap two to try something else.',
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestLayout(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let picked = -1
    let hover = -1

    const maxFlow = Math.max(1, ...inst.flow.flat())

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)

      for (let k = 0; k < N; k++) {
        const x = PADX + (k % COLS) * CELL
        const y = PADY + Math.floor(k / COLS) * CELL
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(x + 10, y + 10, CELL - 20, CELL - 20, 12)
        ctx.fillStyle = '#0f1218'
        ctx.fill()
        ctx.lineWidth = picked === k ? 3 : 2
        ctx.strokeStyle =
          picked === k ? '#ffffff' : hover === k ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.14)'
        ctx.stroke()
        ctx.restore()
      }

      // Traffic, over the bay cards so a route can be traced end to end,
      // but under the department markers so those stay readable.
      for (let k = 0; k < N; k++) {
        for (let l = k + 1; l < N; l++) {
          const f = inst.flow[sol[k]][sol[l]]
          if (f === 0) continue
          const A = CENTER[k]
          const B = CENTER[l]
          ctx.save()
          ctx.strokeStyle = accent
          ctx.globalAlpha = 0.12 + (f / maxFlow) * 0.38
          ctx.lineWidth = 1 + (f / maxFlow) * 8
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(A.x, A.y)
          ctx.lineTo(B.x, B.y)
          ctx.stroke()
          ctx.restore()
        }
      }

      for (let k = 0; k < N; k++) {
        const d = sol[k]
        const c = CENTER[k]
        ctx.save()
        ctx.beginPath()
        ctx.arc(c.x, c.y - 12, 26, 0, Math.PI * 2)
        ctx.fillStyle = COLORS[d]
        ctx.globalAlpha = picked === k ? 1 : 0.85
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.fillStyle = '#0a0c10'
        ctx.font = '700 22px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(LETTERS[d], c.x, c.y - 11)

        ctx.fillStyle = 'rgba(255,255,255,0.65)'
        ctx.font = '500 13px "JetBrains Mono", monospace'
        ctx.fillText(NAMES[d], c.x, c.y + 28)

        if (ref) {
          ctx.fillStyle = ref[k] === d ? accent : 'rgba(255,255,255,0.45)'
          ctx.font = '700 11px "JetBrains Mono", monospace'
          ctx.fillText(`best: ${LETTERS[ref[k]]}`, c.x, c.y + 50)
        }
        ctx.restore()
      }
    }

    const bayAt = (p: Pt) => {
      const col = Math.floor((p.x - PADX) / CELL)
      const row = Math.floor((p.y - PADY) / CELL)
      if (col < 0 || col >= COLS || row < 0 || row >= N / COLS) return -1
      return row * COLS + col
    }

    const onMove = (ev: PointerEvent) => {
      const k = bayAt(s.toVirtual(ev))
      if (k !== hover) {
        hover = k
        s.canvas.style.cursor = k >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const k = bayAt(s.toVirtual(ev))
      if (k < 0) return
      if (picked < 0) {
        picked = k
        draw(sol, ref)
        return
      }
      if (picked === k) {
        picked = -1
        draw(sol, ref)
        return
      }
      const next = [...sol]
      ;[next[picked], next[k]] = [next[k], next[picked]]
      picked = -1
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

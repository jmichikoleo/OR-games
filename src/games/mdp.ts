import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 640
const COLS = 6
const ROWS = 5
const CELLS = COLS * ROWS
const CW = 140
const CH = 112
const OX = (VW - COLS * CW) / 2
const OY = 46

const STEP = -0.2
const GAMMA = 0.93
const SLIP = 0.1
const SWEEPS = 500

/** right, down, left, up */
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

interface Instance {
  /** 0 floor, 1 wall, 2 payoff square */
  kind: number[]
  payoff: number[]
}
/** Which way each floor square points. */
type Solution = number[]

const at = (r: number, c: number) => r * COLS + c

function step(inst: Instance, s: number, dir: number): number {
  const r = Math.floor(s / COLS)
  const c = s % COLS
  const nr = r + DY[dir]
  const nc = c + DX[dir]
  if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return s
  const n = at(nr, nc)
  return inst.kind[n] === 1 ? s : n
}

/** Four times in five you go where you pointed. The rest you slide sideways. */
function outcomes(inst: Instance, s: number, dir: number): [number, number][] {
  return [
    [step(inst, s, dir), 1 - 2 * SLIP],
    [step(inst, s, (dir + 1) % 4), SLIP],
    [step(inst, s, (dir + 3) % 4), SLIP],
  ]
}

function valueOf(inst: Instance, sol: Solution): number[] {
  const V = new Float64Array(CELLS)
  for (let s = 0; s < CELLS; s++) if (inst.kind[s] === 2) V[s] = inst.payoff[s]
  for (let it = 0; it < SWEEPS; it++) {
    for (let s = 0; s < CELLS; s++) {
      if (inst.kind[s] !== 0) continue
      let acc = 0
      for (const [n, p] of outcomes(inst, s, sol[s])) acc += p * V[n]
      V[s] = STEP + GAMMA * acc
    }
  }
  return Array.from(V)
}

/** Value iteration, which is exact to well inside a tenth of a point. */
function bestPolicy(inst: Instance): Solution {
  const V = new Float64Array(CELLS)
  for (let s = 0; s < CELLS; s++) if (inst.kind[s] === 2) V[s] = inst.payoff[s]
  for (let it = 0; it < SWEEPS; it++) {
    for (let s = 0; s < CELLS; s++) {
      if (inst.kind[s] !== 0) continue
      let best = -Infinity
      for (let d = 0; d < 4; d++) {
        let acc = 0
        for (const [n, p] of outcomes(inst, s, d)) acc += p * V[n]
        best = Math.max(best, STEP + GAMMA * acc)
      }
      V[s] = best
    }
  }
  const pol = new Array(CELLS).fill(0)
  for (let s = 0; s < CELLS; s++) {
    if (inst.kind[s] !== 0) continue
    let best = -Infinity
    for (let d = 0; d < 4; d++) {
      let acc = 0
      for (const [n, p] of outcomes(inst, s, d)) acc += p * V[n]
      if (acc > best) {
        best = acc
        pol[s] = d
      }
    }
  }
  return pol
}

const totalValue = (inst: Instance, V: number[]) =>
  V.reduce((a, v, s) => a + (inst.kind[s] === 0 ? v : 0), 0)

export const mdp: Minigame<Instance, Solution> = {
  id: 'mdp',
  title: 'Slippery Floor',
  problem: 'Markov Decision Process',
  family: 'stochastic',
  blurb: 'Point every square the way you want the robot to go. The floor is slippery, so four times in five it goes that way and the rest of the time it slides sideways.',
  howTo: 'Click a square on the side you want its arrow to face. The number on each square is what the robot expects to collect starting from there.',
  objective: 'max',
  unit: 'value',

  generate(rng: RNG): Instance {
    const kind = new Array(CELLS).fill(0)
    const payoff = new Array(CELLS).fill(0)
    const free = Array.from({ length: CELLS }, (_, i) => i)
    for (let i = free.length - 1; i > 0; i--) {
      const k = rng.int(i + 1)
      ;[free[i], free[k]] = [free[k], free[i]]
    }
    const goal = free[0]
    kind[goal] = 2
    payoff[goal] = 10

    // Two pits, kept away from the goal so the board is not a coin flip.
    let placed = 0
    for (const s of free.slice(1)) {
      if (placed === 2) break
      const far =
        Math.abs(Math.floor(s / COLS) - Math.floor(goal / COLS)) +
          Math.abs((s % COLS) - (goal % COLS)) >= 2
      if (!far) continue
      kind[s] = 2
      payoff[s] = placed === 0 ? -5 : -3
      placed++
    }
    for (const s of free) {
      if (kind[s] !== 0) continue
      if (kind.filter((k) => k === 1).length >= 4) break
      if (rng.next() < 0.22) kind[s] = 1
    }
    return { kind, payoff }
  },

  initial(inst): Solution {
    // Point everything straight at the payoff and ignore the pits entirely,
    // which is exactly the mistake the game is about.
    const goal = inst.kind.findIndex((k, i) => k === 2 && inst.payoff[i] > 0)
    const gr = Math.floor(goal / COLS)
    const gc = goal % COLS
    return Array.from({ length: CELLS }, (_, i) => {
      const dr = gr - Math.floor(i / COLS)
      const dc = gc - (i % COLS)
      if (Math.abs(dc) >= Math.abs(dr)) return dc >= 0 ? 0 : 2
      return dr > 0 ? 1 : 3
    })
  },

  evaluate(inst, sol) {
    const V = valueOf(inst, sol)
    const total = totalValue(inst, V)
    const stuck = V.filter((v, s) => inst.kind[s] === 0 && v < 0).length
    return {
      value: total,
      feasible: true,
      note: stuck === 0
        ? 'Every square is worth standing on.'
        : `${stuck} squares are still worth less than nothing to start from.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestPolicy(inst), label: 'value iteration', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let hover = -1

    function arrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, dir: number, size: number) {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate((dir * Math.PI) / 2)
      ctx.beginPath()
      ctx.moveTo(size, 0)
      ctx.lineTo(-size * 0.6, size * 0.62)
      ctx.lineTo(-size * 0.25, 0)
      ctx.lineTo(-size * 0.6, -size * 0.62)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const V = valueOf(inst, sol)
      const span = Math.max(1, ...V.map((v) => Math.abs(v)))

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = at(r, c)
          const x = OX + c * CW
          const y = OY + r * CH
          const cx = x + CW / 2
          const cy = y + CH / 2
          ctx.save()
          ctx.beginPath()
          ctx.roundRect(x + 4, y + 4, CW - 8, CH - 8, 10)

          if (inst.kind[cell] === 1) {
            ctx.fillStyle = 'rgba(255,255,255,0.055)'
            ctx.fill()
            ctx.restore()
            continue
          }

          if (inst.kind[cell] === 2) {
            const good = inst.payoff[cell] > 0
            ctx.fillStyle = good ? 'rgba(82,230,138,0.24)' : 'rgba(255,92,122,0.22)'
            ctx.fill()
            ctx.strokeStyle = good ? '#52e68a' : '#ff5c7a'
            ctx.lineWidth = 2
            ctx.stroke()
            ctx.fillStyle = good ? '#52e68a' : '#ff5c7a'
            ctx.font = '700 26px "JetBrains Mono", monospace'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(inst.payoff[cell] > 0 ? `+${inst.payoff[cell]}` : String(inst.payoff[cell]), cx, cy)
            ctx.restore()
            continue
          }

          const v = V[cell]
          const t = Math.min(1, Math.abs(v) / span)
          ctx.fillStyle = v >= 0 ? `rgba(82,230,138,${0.05 + t * 0.16})` : `rgba(255,92,122,${0.05 + t * 0.16})`
          ctx.fill()
          ctx.strokeStyle = cell === hover ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.09)'
          ctx.lineWidth = cell === hover ? 2 : 1.5
          ctx.stroke()

          ctx.fillStyle = accent
          arrow(ctx, cx, cy - 6, sol[cell], 18)

          // The solver's arrow sits in the corner rather than on top, so a
          // square where the two disagree is obvious at a glance.
          if (ref) {
            const agrees = ref[cell] === sol[cell]
            ctx.fillStyle = agrees ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)'
            arrow(ctx, x + CW - 26, y + 24, ref[cell], 9)
          }

          ctx.fillStyle = 'rgba(255,255,255,0.6)'
          ctx.font = '500 13px "JetBrains Mono", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(v.toFixed(1), cx, cy + 32)
          ctx.restore()
        }
      }
    }

    const cellAt = (px: number, py: number) => {
      const c = Math.floor((px - OX) / CW)
      const r = Math.floor((py - OY) / CH)
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1
      return at(r, c)
    }

    const onMove = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      const cell = cellAt(v.x, v.y)
      const next = cell >= 0 && inst.kind[cell] === 0 ? cell : -1
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      const cell = cellAt(v.x, v.y)
      if (cell < 0 || inst.kind[cell] !== 0) return
      const cx = OX + (cell % COLS) * CW + CW / 2
      const cy = OY + Math.floor(cell / COLS) * CH + CH / 2
      const dx = v.x - cx
      const dy = v.y - cy
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3
      const next = [...sol]
      next[cell] = dir
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

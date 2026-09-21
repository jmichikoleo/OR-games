import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const COLS = 4
const ROWS = 3
const WARDS = COLS * ROWS
const SEATS = 3
const VW = 1000
const VH = 560
const PAD = 90
const CELL_W = (VW - PAD * 2) / COLS
const CELL_H = (VH - PAD * 2) / ROWS
const SEAT_COLORS = ['#ff4d9d', '#5b8cff', '#52e68a']

interface Instance {
  people: number[]
}
/** Which seat each ward votes in. */
type Solution = number[]

const neighbours = (i: number): number[] => {
  const r = Math.floor(i / COLS)
  const c = i % COLS
  const out: number[] = []
  if (r > 0) out.push(i - COLS)
  if (r < ROWS - 1) out.push(i + COLS)
  if (c > 0) out.push(i - 1)
  if (c < COLS - 1) out.push(i + 1)
  return out
}

function seatSizes(inst: Instance, sol: Solution): number[] {
  const out = new Array(SEATS).fill(0)
  sol.forEach((s, i) => (out[s] += inst.people[i]))
  return out
}

/** A seat has to be one piece of the map, not two halves with a gap. */
function whole(sol: Solution, seat: number): boolean {
  const own = sol.map((s, i) => (s === seat ? i : -1)).filter((i) => i >= 0)
  if (!own.length) return false
  const seen = new Set([own[0]])
  const queue = [own[0]]
  while (queue.length) {
    const at = queue.pop()!
    for (const n of neighbours(at)) {
      if (sol[n] === seat && !seen.has(n)) {
        seen.add(n)
        queue.push(n)
      }
    }
  }
  return seen.size === own.length
}

const broken = (sol: Solution) =>
  Array.from({ length: SEATS }, (_, s) => s).filter((s) => !whole(sol, s))

/**
 * Walk every way of cutting twelve wards into three seats, in a form that
 * never counts the same map twice under a different set of seat numbers.
 * Around 88,000 of them, and the ones that come apart are thrown out.
 */
function bestMap(inst: Instance): Solution {
  const sol = new Array(WARDS).fill(0)
  let best: Solution = []
  let bestVal = Infinity
  const walk = (i: number, used: number) => {
    if (i === WARDS) {
      if (used < SEATS) return
      if (broken(sol).length) return
      const v = Math.max(...seatSizes(inst, sol))
      if (v < bestVal) {
        bestVal = v
        best = [...sol]
      }
      return
    }
    for (let s = 0; s <= Math.min(used, SEATS - 1); s++) {
      sol[i] = s
      walk(i + 1, Math.max(used, s + 1))
    }
  }
  walk(0, 0)
  return best
}

export const districting: Minigame<Instance, Solution> = {
  id: 'districting',
  title: 'Fair Shares',
  problem: 'Districting',
  family: 'location',
  blurb: 'Twelve wards, three seats, and every seat has to be one unbroken piece of the map. The council wants the biggest seat as small as it can be, which is harder than it sounds when the crowded wards sit next to each other.',
  howTo: 'Click a ward to move it to the next seat. Every seat must hold at least one ward and must join up, so a seat split into two pieces does not count.',
  objective: 'min',
  unit: 'people',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      const inst: Instance = { people: Array.from({ length: WARDS }, () => 8 + rng.int(36)) }
      const best = Math.max(...seatSizes(inst, bestMap(inst)))
      const rows = Array.from({ length: WARDS }, (_, i) => Math.floor(i / COLS))
      const start = Math.max(...seatSizes(inst, rows))
      // Three flat stripes has to be a clearly poor way to cut it up.
      if (best / start < 0.88 || tries > 200) return inst
    }
  },

  initial(): Solution {
    // Three flat stripes across the map, which nobody drew on purpose.
    return Array.from({ length: WARDS }, (_, i) => Math.floor(i / COLS))
  },

  evaluate(inst, sol) {
    const sizes = seatSizes(inst, sol)
    const empty = sizes.filter((n) => n === 0).length
    if (empty) {
      return { value: 0, feasible: false, note: `${empty} seat${empty === 1 ? ' has' : 's have'} no wards.` }
    }
    const cut = broken(sol)
    if (cut.length) {
      return {
        value: 0,
        feasible: false,
        note: `${cut.length} seat${cut.length === 1 ? ' is' : 's are'} in more than one piece.`,
      }
    }
    return {
      value: Math.max(...sizes),
      feasible: true,
      note: `Seats hold ${sizes.join(', ')} people.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestMap(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let hover = -1

    const boxOf = (i: number) => ({
      x: PAD + (i % COLS) * CELL_W,
      y: PAD + Math.floor(i / COLS) * CELL_H,
    })
    const wardAt = (x: number, y: number) => {
      const c = Math.floor((x - PAD) / CELL_W)
      const r = Math.floor((y - PAD) / CELL_H)
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1
      return r * COLS + c
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      clearBoard(ctx, VW, VH)
      const sizes = seatSizes(inst, sol)
      const cut = broken(sol)

      inst.people.forEach((n, i) => {
        const { x, y } = boxOf(i)
        const seat = sol[i]
        const col = SEAT_COLORS[seat]
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(x + 4, y + 4, CELL_W - 8, CELL_H - 8, 10)
        ctx.fillStyle = `${col}${i === hover ? '4d' : '2e'}`
        ctx.fill()
        ctx.strokeStyle = cut.includes(seat) ? '#ff5c7a' : col
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.font = '700 26px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(n), x + CELL_W / 2, y + CELL_H / 2 - 4)
        if (ref && ref[i] !== seat) {
          ctx.fillStyle = SEAT_COLORS[ref[i]]
          ctx.font = '700 11px "JetBrains Mono", monospace'
          ctx.fillText('solver moves this', x + CELL_W / 2, y + CELL_H / 2 + 22)
        }
        ctx.restore()
      })

      // Thick lines where two seats meet, so the shape of the map reads.
      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineWidth = 5
      ctx.strokeStyle = '#0b090e'
      inst.people.forEach((_, i) => {
        const { x, y } = boxOf(i)
        const c = i % COLS
        const r = Math.floor(i / COLS)
        if (c < COLS - 1 && sol[i] !== sol[i + 1]) {
          ctx.beginPath()
          ctx.moveTo(x + CELL_W, y + 2)
          ctx.lineTo(x + CELL_W, y + CELL_H - 2)
          ctx.stroke()
        }
        if (r < ROWS - 1 && sol[i] !== sol[i + COLS]) {
          ctx.beginPath()
          ctx.moveTo(x + 2, y + CELL_H)
          ctx.lineTo(x + CELL_W - 2, y + CELL_H)
          ctx.stroke()
        }
      })
      ctx.restore()

      sizes.forEach((n, seat) => {
        const x = PAD + (seat + 0.5) * ((VW - PAD * 2) / SEATS)
        ctx.save()
        ctx.fillStyle = SEAT_COLORS[seat]
        ctx.font = '700 15px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`Seat ${seat + 1}   ${n}`, x, 46)
        ctx.restore()
      })
    }

    const onMove = (ev: PointerEvent) => {
      const p = s.toVirtual(ev)
      const next = wardAt(p.x, p.y)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const p = s.toVirtual(ev)
      const hit = wardAt(p.x, p.y)
      if (hit < 0) return
      const next = [...sol]
      next[hit] = (next[hit] + 1) % SEATS
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

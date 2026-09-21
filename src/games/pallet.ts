import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const CELL = 80
const EDGE = 20

/**
 * Pallet and box sizes where the boxes provably cannot tile the pallet, so
 * the area sum is a promise nobody can keep, and where the search settles in
 * well under a millisecond. Picked over the whole range beforehand.
 */
const SHAPES: [number, number, number, number][] = [
  [7, 8, 3, 3], [7, 9, 3, 3], [7, 9, 4, 2], [8, 7, 3, 3], [8, 7, 4, 2], [8, 9, 3, 3],
  [8, 9, 4, 2], [8, 9, 5, 2], [8, 9, 6, 2], [8, 10, 3, 3], [9, 7, 3, 3], [9, 7, 4, 2],
  [9, 8, 3, 3], [9, 8, 4, 2], [9, 8, 5, 2], [9, 8, 6, 2], [9, 9, 6, 2], [9, 10, 3, 3],
  [9, 10, 4, 2], [9, 10, 6, 2], [9, 11, 3, 3], [9, 12, 4, 2], [9, 12, 5, 3], [9, 12, 6, 2],
  [10, 7, 3, 3], [10, 7, 4, 2], [10, 8, 3, 3], [10, 9, 3, 3], [10, 9, 4, 2], [10, 9, 6, 2],
  [10, 10, 3, 3], [10, 11, 6, 2], [10, 11, 6, 3], [10, 12, 3, 3], [11, 7, 3, 3], [11, 7, 6, 2],
  [11, 8, 4, 2], [11, 8, 4, 3], [11, 8, 6, 2], [11, 9, 3, 3], [11, 10, 6, 2], [11, 10, 6, 3],
  [11, 11, 4, 3], [11, 12, 3, 3], [11, 12, 6, 2], [11, 12, 6, 3], [12, 7, 3, 3], [12, 7, 4, 2],
  [12, 7, 6, 2], [12, 9, 5, 3], [12, 9, 6, 2], [12, 10, 3, 3], [12, 11, 6, 2], [12, 11, 6, 3],
  [12, 12, 5, 3], [12, 12, 5, 4], [13, 7, 3, 3], [13, 7, 5, 2], [13, 7, 5, 3], [13, 7, 6, 2],
  [13, 8, 4, 2], [13, 8, 5, 2], [13, 9, 3, 3], [13, 10, 6, 3], [13, 12, 6, 2], [14, 7, 5, 3],
  [14, 7, 6, 2], [14, 8, 4, 3], [14, 8, 5, 2], [14, 9, 3, 3], [14, 9, 5, 3], [14, 9, 6, 3],
  [14, 12, 5, 3], [14, 12, 6, 3], [15, 8, 6, 2], [15, 8, 6, 3], [15, 10, 6, 3],
]

interface Instance {
  /** Pallet in board widths and board depths. */
  wide: number
  deep: number
  /** The box, long side then short. */
  long: number
  short: number
}
interface Box {
  row: number
  col: number
  /** Long side running across the pallet rather than up it. */
  flat: boolean
}
type Solution = Box[]

const sizeOf = (inst: Instance, flat: boolean): [number, number] =>
  flat ? [inst.long, inst.short] : [inst.short, inst.long]

const areaCap = (inst: Instance) =>
  Math.floor((inst.wide * inst.deep) / (inst.long * inst.short))

function coverOf(inst: Instance, sol: Solution): Int8Array | null {
  const grid = new Int8Array(inst.wide * inst.deep).fill(-1)
  for (let n = 0; n < sol.length; n++) {
    const { row, col, flat } = sol[n]
    const [w, h] = sizeOf(inst, flat)
    if (col + w > inst.wide || row + h > inst.deep || row < 0 || col < 0) return null
    for (let y = row; y < row + h; y++) {
      for (let x = col; x < col + w; x++) {
        if (grid[y * inst.wide + x] >= 0) return null
        grid[y * inst.wide + x] = n
      }
    }
  }
  return grid
}

/**
 * Take the top left square nobody has claimed and either start a box there,
 * either way up, or give the square up for lost. That covers every packing
 * there is. The bound is what the space left could hold if it were perfect.
 */
function bestPack(inst: Instance): Solution {
  const cells = inst.wide * inst.deep
  const area = inst.long * inst.short
  const grid = new Uint8Array(cells)
  const shapes: [number, number][] =
    inst.long === inst.short ? [[inst.long, inst.short]] : [[inst.long, inst.short], [inst.short, inst.long]]
  const here: Solution = []
  let best: Solution = []
  let free = cells
  let put = 0

  const room = (r: number, c: number, w: number, h: number) => {
    if (c + w > inst.wide || r + h > inst.deep) return false
    for (let y = r; y < r + h; y++) {
      for (let x = c; x < c + w; x++) if (grid[y * inst.wide + x]) return false
    }
    return true
  }
  const paint = (r: number, c: number, w: number, h: number, v: number) => {
    for (let y = r; y < r + h; y++) {
      for (let x = c; x < c + w; x++) grid[y * inst.wide + x] = v
    }
  }

  const walk = (from: number) => {
    if (put + Math.floor(free / area) <= best.length) return
    let i = from
    while (i < cells && grid[i]) i++
    if (i === cells) {
      if (put > best.length) best = here.map((b) => ({ ...b }))
      return
    }
    const r = Math.floor(i / inst.wide)
    const c = i % inst.wide
    for (const [w, h] of shapes) {
      if (!room(r, c, w, h)) continue
      paint(r, c, w, h, 1)
      free -= area
      put++
      here.push({ row: r, col: c, flat: w === inst.long })
      walk(i + 1)
      here.pop()
      put--
      free += area
      paint(r, c, w, h, 0)
    }
    grid[i] = 2
    free--
    walk(i + 1)
    free++
    grid[i] = 0
  }
  walk(0)
  return best
}

export const pallet: Minigame<Instance, Solution> = {
  id: 'pallet',
  title: 'Stack It',
  problem: 'Pallet Loading',
  family: 'packing',
  blurb: 'One size of box and one pallet, and the only question is how many you can get on. The area says one thing and the corners say another, because a box you cannot turn sideways is a box that does not go on.',
  howTo: 'Click an empty square to start a box there. Clicking a box stands it on its end, and clicking it once more takes it off. The number the area says ought to fit is usually more than the number that really does.',
  objective: 'max',
  unit: 'boxes',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      const [wide, deep, long, short] = SHAPES[rng.int(SHAPES.length)]
      const inst = { wide, deep, long, short }
      // A four box pallet is over before it starts.
      if (bestPack(inst).length >= 6 || tries > 40) return inst
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const grid = coverOf(inst, sol)
    if (!grid) return { value: 0, feasible: false, note: 'Two boxes are sitting on top of each other.' }
    let bare = 0
    for (let i = 0; i < grid.length; i++) if (grid[i] < 0) bare++
    return {
      value: sol.length,
      feasible: true,
      note: `${sol.length} on, ${bare} square${bare === 1 ? '' : 's'} of pallet bare. The area alone says ${areaCap(inst)} ought to fit.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestPack(inst), label: 'branch and bound', exact: true }
  },

  mount(host, inst, api) {
    const VW = inst.wide * CELL + EDGE * 2
    const VH = inst.deep * CELL + EDGE * 2
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let hover = -1

    const cellAt = (x: number, y: number) => {
      const c = Math.floor((x - EDGE) / CELL)
      const r = Math.floor((y - EDGE) / CELL)
      if (c < 0 || c >= inst.wide || r < 0 || r >= inst.deep) return -1
      return r * inst.wide + c
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const grid = coverOf(inst, sol)

      ctx.save()
      ctx.beginPath()
      ctx.roundRect(EDGE, EDGE, inst.wide * CELL, inst.deep * CELL, 8)
      ctx.fillStyle = 'rgba(255,255,255,0.03)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()

      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 1
      for (let c = 1; c < inst.wide; c++) {
        ctx.beginPath()
        ctx.moveTo(EDGE + c * CELL, EDGE)
        ctx.lineTo(EDGE + c * CELL, EDGE + inst.deep * CELL)
        ctx.stroke()
      }
      for (let r = 1; r < inst.deep; r++) {
        ctx.beginPath()
        ctx.moveTo(EDGE, EDGE + r * CELL)
        ctx.lineTo(EDGE + inst.wide * CELL, EDGE + r * CELL)
        ctx.stroke()
      }
      ctx.restore()

      if (hover >= 0 && grid && grid[hover] < 0) {
        const r = Math.floor(hover / inst.wide)
        const c = hover % inst.wide
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.09)'
        ctx.fillRect(EDGE + c * CELL, EDGE + r * CELL, CELL, CELL)
        ctx.restore()
      }

      sol.forEach((b, n) => {
        const [w, h] = sizeOf(inst, b.flat)
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(EDGE + b.col * CELL + 4, EDGE + b.row * CELL + 4, w * CELL - 8, h * CELL - 8, 7)
        ctx.fillStyle = accent
        ctx.globalAlpha = grid && hover >= 0 && grid[hover] === n ? 0.95 : 0.78
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.strokeStyle = accent
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = '#0b090e'
        ctx.font = '700 15px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(
          `${w} by ${h}`,
          EDGE + (b.col + w / 2) * CELL,
          EDGE + (b.row + h / 2) * CELL,
        )
        ctx.restore()
      })

      if (ref) {
        ctx.save()
        ctx.setLineDash([7, 6])
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 2.5
        ref.forEach((b) => {
          const [w, h] = sizeOf(inst, b.flat)
          ctx.beginPath()
          ctx.roundRect(EDGE + b.col * CELL + 9, EDGE + b.row * CELL + 9, w * CELL - 18, h * CELL - 18, 6)
          ctx.stroke()
        })
        ctx.setLineDash([])
        ctx.restore()
      }
    }

    const onMove = (ev: PointerEvent) => {
      const p = s.toVirtual(ev)
      const next = cellAt(p.x, p.y)
      if (next !== hover) {
        hover = next
        s.canvas.style.cursor = next >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const p = s.toVirtual(ev)
      const hit = cellAt(p.x, p.y)
      if (hit < 0) return
      const grid = coverOf(inst, sol)
      if (!grid) return
      const row = Math.floor(hit / inst.wide)
      const col = hit % inst.wide
      const on = grid[hit]

      if (on >= 0) {
        // Flat, then on its end, then off. A box already on its end, or one
        // that will not turn where it stands, comes straight off.
        const b = sol[on]
        const rest = sol.filter((_, i) => i !== on)
        const turned = { ...b, flat: false }
        if (inst.long !== inst.short && b.flat && coverOf(inst, [...rest, turned])) {
          api.commit([...rest, turned])
        } else {
          api.commit(rest)
        }
        return
      }
      for (const flat of [true, false]) {
        const box = { row, col, flat }
        if (coverOf(inst, [...sol, box])) {
          api.commit([...sol, box])
          return
        }
      }
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

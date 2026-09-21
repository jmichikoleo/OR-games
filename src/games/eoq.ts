import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 600
const LINES = 4
const STEP = 5
const MIN_Q = 5
const MAX_Q = 125
const OPTIONS = (MAX_Q - MIN_Q) / STEP + 1

const ROW_H = 128
const ROW_TOP = 70
const CHART_X = 150
const CHART_W = 600
const CHART_H = 60
const SLIDE_DY = 92
const CAP_Y = 28

const NAMES = ['Bolts', 'Hinges', 'Panels', 'Seals']
const COLORS = ['#ff4d9d', '#5b8cff', '#52e68a', '#ffbe3d']

interface Line {
  name: string
  /** Units sold a year. */
  demand: number
  /** Cost of placing one order, whatever the size. */
  order: number
  /** Cost of keeping one unit on the shelf for a year. */
  holding: number
}
interface Instance {
  lines: Line[]
  capacity: number
}
/** How many of each line you buy at a time. */
type Solution = number[]

const lineCost = (l: Line, q: number) => (l.order * l.demand) / q + (l.holding * q) / 2

const totalCost = (inst: Instance, sol: Solution) =>
  inst.lines.reduce((a, l, i) => a + lineCost(l, sol[i]), 0)

const used = (sol: Solution) => sol.reduce((a, b) => a + b, 0)

/** Order sizes are multiples of five, so the whole thing fits in a small DP. */
function bestOrders(inst: Instance): Solution {
  const cap = inst.capacity / STEP
  let dp = new Float64Array(cap + 1).fill(0)
  const picks: number[][] = []

  inst.lines.forEach((l) => {
    const next = new Float64Array(cap + 1).fill(Infinity)
    const pick = new Array(cap + 1).fill(MIN_Q)
    for (let c = 0; c <= cap; c++) {
      for (let o = 0; o < OPTIONS; o++) {
        const q = MIN_Q + o * STEP
        const slots = q / STEP
        if (slots > c) break
        const cand = lineCost(l, q) + dp[c - slots]
        if (cand < next[c]) {
          next[c] = cand
          pick[c] = q
        }
      }
    }
    dp = next
    picks.push(pick)
  })

  const out = new Array(LINES).fill(MIN_Q)
  let left = cap
  for (let i = LINES - 1; i >= 0; i--) {
    const q = picks[i][left]
    out[i] = q
    left -= q / STEP
  }
  return out
}

export const eoq: Minigame<Instance, Solution> = {
  id: 'eoq',
  title: 'Reorder',
  problem: 'Economic Order Quantity',
  family: 'inventory',
  blurb: 'Buy in bulk and you place fewer orders, but the stock sits on the shelf costing you rent. The shelf only holds so much across all four lines.',
  howTo: 'Drag a slider to change how much of that line you buy at a time. The sawtooth is stock over a year and the bar up top is the shelf.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    const lines: Line[] = NAMES.map((name) => ({
      name,
      demand: 150 + rng.int(450),
      order: 8 + rng.int(20),
      holding: 3 + rng.int(8),
    }))
    const free = lines.reduce((a, l) => {
      const q = Math.sqrt((2 * l.order * l.demand) / l.holding)
      return a + Math.min(MAX_Q, Math.max(MIN_Q, Math.round(q / STEP) * STEP))
    }, 0)
    return { lines, capacity: Math.max(40, Math.round((free * 0.6) / STEP) * STEP) }
  },

  initial(inst): Solution {
    // Split the shelf evenly, which is never right and always feasible.
    const each = Math.max(MIN_Q, Math.floor(inst.capacity / LINES / STEP) * STEP)
    return new Array(LINES).fill(each)
  },

  evaluate(inst, sol) {
    const shelf = used(sol)
    if (shelf > inst.capacity) {
      return {
        value: 0,
        feasible: false,
        note: `The shelf is over by ${shelf - inst.capacity} units.`,
      }
    }
    const runs = inst.lines.reduce((a, l, i) => a + l.demand / sol[i], 0)
    return {
      value: Math.round(totalCost(inst, sol)),
      feasible: true,
      note: `${shelf} of ${inst.capacity} units of shelf used and ${runs.toFixed(0)} orders placed a year.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestOrders(inst), label: 'shelf-space DP', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    const xOfQ = (q: number) => CHART_X + ((q - MIN_Q) / (MAX_Q - MIN_Q)) * CHART_W
    const qOfX = (x: number) => {
      const raw = MIN_Q + ((x - CHART_X) / CHART_W) * (MAX_Q - MIN_Q)
      return Math.max(MIN_Q, Math.min(MAX_Q, Math.round(raw / STEP) * STEP))
    }

    let sol: Solution = api.current()
    let ref: Solution | null = null
    let dragging = -1

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const shelf = used(sol)
      const over = shelf > inst.capacity

      // Shelf gauge.
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(CHART_X, CAP_Y, CHART_W, 14, 7)
      ctx.fillStyle = 'rgba(255,255,255,0.07)'
      ctx.fill()
      let at = CHART_X
      sol.forEach((q, i) => {
        const w = (Math.min(q, inst.capacity) / inst.capacity) * CHART_W
        ctx.beginPath()
        ctx.roundRect(at, CAP_Y, Math.max(1, w - 1), 14, 4)
        ctx.fillStyle = over ? '#ff5c7a' : COLORS[i]
        ctx.globalAlpha = 0.85
        ctx.fill()
        ctx.globalAlpha = 1
        at += w
      })
      ctx.fillStyle = over ? '#ff5c7a' : 'rgba(255,255,255,0.5)'
      ctx.font = '500 11px "JetBrains Mono", monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(`shelf ${shelf} of ${inst.capacity}`, CHART_X + CHART_W + 14, CAP_Y + 7)
      ctx.restore()

      inst.lines.forEach((l, i) => {
        const top = ROW_TOP + i * ROW_H
        const base = top + CHART_H
        const q = sol[i]
        const cycles = l.demand / q

        ctx.save()
        ctx.fillStyle = COLORS[i]
        ctx.font = '700 14px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(l.name, 10, top + 16)
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.font = '500 10px "JetBrains Mono", monospace'
        ctx.fillText(`${l.demand} a year`, 10, top + 34)
        ctx.fillText(`order ${l.order}, hold ${l.holding}`, 10, top + 48)
        ctx.restore()

        // Stock over a year, one tooth per order.
        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(CHART_X, base + 0.5)
        ctx.lineTo(CHART_X + CHART_W, base + 0.5)
        ctx.stroke()

        const height = (q / MAX_Q) * CHART_H
        const teeth = Math.max(1, Math.round(cycles))
        const wTooth = CHART_W / teeth
        ctx.beginPath()
        ctx.moveTo(CHART_X, base)
        for (let t = 0; t < teeth; t++) {
          const x0 = CHART_X + t * wTooth
          ctx.lineTo(x0, base - height)
          ctx.lineTo(x0 + wTooth, base)
        }
        ctx.closePath()
        ctx.fillStyle = `${COLORS[i]}33`
        ctx.fill()
        ctx.strokeStyle = COLORS[i]
        ctx.lineWidth = 1.6
        ctx.stroke()
        ctx.restore()

        // Slider.
        const sy = top + SLIDE_DY
        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,0.14)'
        ctx.lineWidth = 5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(CHART_X, sy)
        ctx.lineTo(CHART_X + CHART_W, sy)
        ctx.stroke()

        if (ref) {
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'
          ctx.lineWidth = 2
          ctx.setLineDash([4, 4])
          ctx.beginPath()
          ctx.moveTo(xOfQ(ref[i]), sy - 13)
          ctx.lineTo(xOfQ(ref[i]), sy + 13)
          ctx.stroke()
          ctx.setLineDash([])
        }

        ctx.beginPath()
        ctx.arc(xOfQ(q), sy, 10, 0, Math.PI * 2)
        ctx.fillStyle = COLORS[i]
        ctx.fill()
        ctx.strokeStyle = '#0a0c10'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.restore()

        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.72)'
        ctx.font = '700 15px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${q} at a time`, CHART_X + CHART_W + 14, top + 24)
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.font = '500 11px "JetBrains Mono", monospace'
        ctx.fillText(`${cycles.toFixed(1)} orders a year`, CHART_X + CHART_W + 14, top + 44)
        ctx.fillStyle = COLORS[i]
        ctx.font = '700 13px "JetBrains Mono", monospace'
        ctx.fillText(`${Math.round(lineCost(l, q))} a year`, CHART_X + CHART_W + 14, top + 66)
        ctx.restore()
      })

      if (accent) ctx.globalAlpha = 1
    }

    const rowAt = (y: number) => {
      const i = Math.floor((y - ROW_TOP) / ROW_H)
      return i >= 0 && i < LINES ? i : -1
    }

    const setFrom = (ev: PointerEvent) => {
      if (dragging < 0) return
      const v = s.toVirtual(ev)
      const q = qOfX(v.x)
      if (q === sol[dragging]) return
      const next = [...sol]
      next[dragging] = q
      api.commit(next)
    }

    const onDown = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      const row = rowAt(v.y)
      if (row < 0) return
      dragging = row
      s.canvas.setPointerCapture(ev.pointerId)
      setFrom(ev)
    }
    const onMove = (ev: PointerEvent) => {
      if (dragging >= 0) return setFrom(ev)
      const v = s.toVirtual(ev)
      s.canvas.style.cursor = rowAt(v.y) >= 0 ? 'ew-resize' : 'default'
    }
    const onUp = (ev: PointerEvent) => {
      dragging = -1
      if (s.canvas.hasPointerCapture(ev.pointerId)) s.canvas.releasePointerCapture(ev.pointerId)
    }

    s.canvas.addEventListener('pointerdown', onDown)
    s.canvas.addEventListener('pointermove', onMove)
    s.canvas.addEventListener('pointerup', onUp)
    s.onResize(() => draw(sol, ref))

    return {
      draw,
      destroy() {
        s.canvas.removeEventListener('pointerdown', onDown)
        s.canvas.removeEventListener('pointermove', onMove)
        s.canvas.removeEventListener('pointerup', onUp)
        s.destroy()
      },
    }
  },
}

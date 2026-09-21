import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 470
const SEATS = 60
const PAD = 74
const SPAN = VW - PAD - 60
const ROW_Y = [86, 164, 242]
const ROW_H = 58
const BAR_Y = 328
const BAR_H = 56
const LABEL_Y = 402
const SPREAD = 6

const NAMES = ['Saver', 'Flex', 'Full']
const COLORS = ['#5b8cff', '#ffbe3d', '#ff4d9d']

interface FareClass {
  fare: number
  lo: number
  prob: number[]
}
interface Instance {
  /** Cheapest first, because that is the order people book in. */
  classes: FareClass[]
}
/** Seats held back from the cheaper fares. First entry is for Full only. */
type Solution = number[]

const roomFor = (sol: Solution) => [SEATS - sol[1], sol[1] - sol[0], sol[0]]

function tent(lo: number, hi: number): number[] {
  const raw = Array.from({ length: hi - lo + 1 }, (_, i) => 1 + Math.min(i, hi - lo - i))
  const total = raw.reduce((a, b) => a + b, 0)
  return raw.map((w) => w / total)
}

/**
 * Walk the booking order. Savers take what they are allowed, then Flex takes
 * what is left above the Full protection, then Full takes the remainder.
 */
function expectedRevenue(inst: Instance, y1: number, y2: number): number {
  const [saver, flex, full] = inst.classes

  const expFull: number[] = []
  for (let r = 0; r <= SEATS; r++) {
    let e = 0
    full.prob.forEach((p, i) => (e += p * Math.min(full.lo + i, r)))
    expFull.push(e)
  }

  let total = 0
  saver.prob.forEach((p3, i3) => {
    const sold3 = Math.min(saver.lo + i3, SEATS - y2)
    const left1 = SEATS - sold3
    flex.prob.forEach((p2, i2) => {
      const sold2 = Math.min(flex.lo + i2, Math.max(0, left1 - y1))
      const left2 = left1 - sold2
      total += p3 * p2 * (saver.fare * sold3 + flex.fare * sold2 + full.fare * expFull[left2])
    })
  })
  return total
}

export const seatinventory: Minigame<Instance, Solution> = {
  id: 'seatinventory',
  title: 'Hold Back',
  problem: 'Seat Inventory Control',
  family: 'markets',
  blurb: 'Cheap seats sell first and full fare books last. Sell too many cheap ones and you turn away the people who would have paid triple.',
  howTo: 'Drag the two dividers to decide how much of the plane each fare can have. The charts above show how many seats each fare usually wants.',
  objective: 'max',
  unit: 'rev',

  generate(rng: RNG): Instance {
    const saverFare = 60 + rng.int(40)
    const flexFare = saverFare + 40 + rng.int(60)
    const fullFare = flexFare + 60 + rng.int(90)
    const build = (fare: number, mean: number): FareClass => ({
      fare,
      lo: mean - SPREAD,
      prob: tent(mean - SPREAD, mean + SPREAD),
    })
    return {
      classes: [
        build(saverFare, 32 + rng.int(16)),
        build(flexFare, 17 + rng.int(10)),
        build(fullFare, 11 + rng.int(9)),
      ],
    }
  },

  initial(): Solution {
    // Sell the whole plane to whoever turns up first.
    return [0, 0]
  },

  evaluate(inst, sol) {
    const [y1, y2] = sol
    const room = roomFor(sol)
    return {
      value: expectedRevenue(inst, y1, y2),
      feasible: true,
      note: `Room for ${room[0]} Saver, ${room[1]} Flex and ${room[2]} Full.`,
    }
  },

  solve(inst): Reference<Solution> {
    let best: Solution = [0, 0]
    let bestVal = -Infinity
    for (let y2 = 0; y2 <= SEATS; y2++) {
      for (let y1 = 0; y1 <= y2; y1++) {
        const v = expectedRevenue(inst, y1, y2)
        if (v > bestVal) {
          bestVal = v
          best = [y1, y2]
        }
      }
    }
    return { solution: best, label: 'enumerated', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    const xOf = (v: number) => PAD + (v / SEATS) * SPAN
    const vOf = (x: number) => ((x - PAD) / SPAN) * SEATS

    let sol: Solution = api.current()
    let ref: Solution | null = null
    let dragging = -1

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const room = roomFor(sol)
      const edges = [SEATS - sol[1], SEATS - sol[0]]

      inst.classes.forEach((c, k) => {
        const base = ROW_Y[k] + ROW_H
        const peak = Math.max(...c.prob)
        ctx.save()
        c.prob.forEach((p, i) => {
          const seats = c.lo + i
          const h = (p / peak) * ROW_H
          const w = SPAN / SEATS
          ctx.fillStyle = COLORS[k]
          ctx.globalAlpha = seats <= room[k] ? 0.85 : 0.22
          ctx.beginPath()
          ctx.roundRect(xOf(seats) - w / 2 + 1, base - h, Math.max(2, w - 2), h, 2)
          ctx.fill()
        })
        ctx.globalAlpha = 1
        ctx.strokeStyle = COLORS[k]
        ctx.lineWidth = 2
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(xOf(room[k]), ROW_Y[k] - 4)
        ctx.lineTo(xOf(room[k]), base)
        ctx.stroke()
        ctx.setLineDash([])

        ctx.fillStyle = COLORS[k]
        ctx.font = '700 12px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${NAMES[k]} ${c.fare}`, 8, base - ROW_H / 2)
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.font = '500 10px "JetBrains Mono", monospace'
        ctx.fillText(`room ${room[k]}`, 8, base - ROW_H / 2 + 15)
        ctx.restore()
      })

      // The plane, split into what each fare may take.
      const bounds = [0, edges[0], edges[1], SEATS]
      for (let k = 0; k < 3; k++) {
        const x0 = xOf(bounds[k])
        const x1 = xOf(bounds[k + 1])
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(x0 + 1, BAR_Y, Math.max(1, x1 - x0 - 2), BAR_H, 4)
        ctx.fillStyle = COLORS[k]
        ctx.globalAlpha = 0.72
        ctx.fill()
        ctx.globalAlpha = 1
        if (x1 - x0 > 34) {
          ctx.fillStyle = '#0a0c10'
          ctx.font = '700 14px "JetBrains Mono", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(room[k]), (x0 + x1) / 2, BAR_Y + BAR_H / 2)
        }
        ctx.restore()
      }

      if (ref) {
        const refEdges = [SEATS - ref[1], SEATS - ref[0]]
        ctx.save()
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 2
        refEdges.forEach((e) => {
          ctx.beginPath()
          ctx.moveTo(xOf(e), BAR_Y - 14)
          ctx.lineTo(xOf(e), BAR_Y + BAR_H + 14)
          ctx.stroke()
        })
        ctx.setLineDash([])
        ctx.restore()
      }

      edges.forEach((e) => {
        ctx.save()
        ctx.beginPath()
        ctx.arc(xOf(e), BAR_Y + BAR_H / 2, 11, 0, Math.PI * 2)
        ctx.fillStyle = accent
        ctx.fill()
        ctx.strokeStyle = '#0a0c10'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.restore()
      })

      ctx.save()
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '500 11px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(`${SEATS} seats on the plane`, PAD + SPAN / 2, LABEL_Y)
      ctx.restore()
    }

    const setFrom = (ev: PointerEvent) => {
      const b = Math.round(vOf(s.toVirtual(ev).x))
      const next: Solution = [...sol]
      if (dragging === 0) next[1] = Math.max(next[0], Math.min(SEATS, SEATS - b))
      else next[0] = Math.max(0, Math.min(next[1], SEATS - b))
      if (next[0] !== sol[0] || next[1] !== sol[1]) api.commit(next)
    }

    const onDown = (ev: PointerEvent) => {
      const x = s.toVirtual(ev).x
      const edges = [SEATS - sol[1], SEATS - sol[0]]
      dragging = Math.abs(xOf(edges[0]) - x) <= Math.abs(xOf(edges[1]) - x) ? 0 : 1
      s.canvas.setPointerCapture(ev.pointerId)
      setFrom(ev)
    }
    const onMove = (ev: PointerEvent) => {
      if (dragging >= 0) setFrom(ev)
    }
    const onUp = (ev: PointerEvent) => {
      dragging = -1
      if (s.canvas.hasPointerCapture(ev.pointerId)) s.canvas.releasePointerCapture(ev.pointerId)
    }

    s.canvas.style.cursor = 'ew-resize'
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

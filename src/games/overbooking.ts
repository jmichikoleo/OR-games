import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 520
const PAD = 70
const SPAN = VW - PAD * 2
const BASE = 390
const TRACK = 452
const MAX_OVER = 34

interface Instance {
  capacity: number
  /** Chance a booked passenger actually turns up. */
  showProb: number
  fare: number
  bumpCost: number
}
/** How many seats you are willing to sell. */
type Solution = number

/** Binomial pmf in log space, so large booking limits stay stable. */
function binomPmf(n: number, p: number): Float64Array {
  const out = new Float64Array(n + 1)
  let lp = n * Math.log(1 - p)
  out[0] = Math.exp(lp)
  const ratio = Math.log(p / (1 - p))
  for (let j = 0; j < n; j++) {
    lp += Math.log((n - j) / (j + 1)) + ratio
    out[j + 1] = Math.exp(lp)
  }
  return out
}

function expectedBumps(inst: Instance, n: number): number {
  const pmf = binomPmf(n, inst.showProb)
  let e = 0
  for (let j = inst.capacity + 1; j <= n; j++) e += (j - inst.capacity) * pmf[j]
  return e
}

const profitOf = (inst: Instance, n: number) =>
  inst.fare * n - inst.bumpCost * expectedBumps(inst, n)

export const overbooking: Minigame<Instance, Solution> = {
  id: 'overbooking',
  title: 'One More Seat',
  problem: 'Overbooking',
  family: 'markets',
  blurb: 'Some passengers never turn up, so selling only as many seats as you have flies the plane half empty. Sell too many and you pay people to stay behind.',
  howTo: 'Drag anywhere to set how many seats you sell. The bars are how many passengers actually show up. Anything right of the white line gets bumped.',
  objective: 'max',
  unit: 'rev',

  generate(rng: RNG): Instance {
    const capacity = 90 + rng.int(40)
    const fare = 120 + rng.int(180)
    return {
      capacity,
      showProb: 0.8 + rng.next() * 0.14,
      fare,
      bumpCost: Math.round(fare * (1.5 + rng.next() * 2.5)),
    }
  },

  initial(inst): Solution {
    return inst.capacity
  },

  evaluate(inst, sol) {
    const n = Math.max(inst.capacity, Math.min(inst.capacity + MAX_OVER, sol))
    const bumps = expectedBumps(inst, n)
    return {
      value: profitOf(inst, n),
      feasible: true,
      note: `${n} seats sold · ${bumps.toFixed(1)} passengers bumped on an average day.`,
    }
  },

  solve(inst): Reference<Solution> {
    let best = inst.capacity
    let bestVal = -Infinity
    for (let n = inst.capacity; n <= inst.capacity + MAX_OVER; n++) {
      const v = profitOf(inst, n)
      if (v > bestVal) {
        bestVal = v
        best = n
      }
    }
    return { solution: best, label: 'enumerated', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    const lo = inst.capacity - 28
    const hi = inst.capacity + MAX_OVER + 4
    const xOf = (v: number) => PAD + ((v - lo) / (hi - lo)) * SPAN
    const vOf = (x: number) => lo + ((x - PAD) / SPAN) * (hi - lo)

    let sol: Solution = api.current()
    let ref: Solution | null = null
    let dragging = false

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)

      const pmf = binomPmf(sol, inst.showProb)
      let peak = 0
      for (let j = Math.max(0, lo); j <= Math.min(sol, hi); j++) peak = Math.max(peak, pmf[j])
      const bw = SPAN / (hi - lo) - 1.5

      for (let j = Math.max(0, lo); j <= Math.min(sol, hi); j++) {
        const h = (pmf[j] / peak) * 260
        const over = j > inst.capacity
        ctx.save()
        ctx.fillStyle = over ? '#f87171' : accent
        ctx.globalAlpha = over ? 0.9 : 0.8
        ctx.beginPath()
        ctx.roundRect(xOf(j) - bw / 2, BASE - h, bw, h, 2)
        ctx.fill()
        ctx.restore()
      }

      // Capacity line.
      const cx = xOf(inst.capacity) + bw / 2 + 1
      ctx.save()
      ctx.setLineDash([6, 6])
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx, 60)
      ctx.lineTo(cx, BASE)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.font = '700 12px "JetBrains Mono", monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.fillText(`${inst.capacity} seats on the plane`, cx + 8, 56)
      ctx.restore()

      // Baseline.
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PAD, BASE + 0.5)
      ctx.lineTo(VW - PAD, BASE + 0.5)
      ctx.stroke()
      ctx.restore()

      // Slider.
      const tx0 = xOf(inst.capacity)
      const tx1 = xOf(inst.capacity + MAX_OVER)
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(tx0, TRACK)
      ctx.lineTo(tx1, TRACK)
      ctx.stroke()

      if (ref !== null) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(xOf(ref), TRACK - 18)
        ctx.lineTo(xOf(ref), TRACK + 18)
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(xOf(sol), TRACK, 11, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.font = '700 13px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(`selling ${sol}`, xOf(sol), TRACK + 22)
      ctx.restore()

      // Deal terms, so the trade-off is on screen.
      ctx.save()
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.font = '500 12px "JetBrains Mono", monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(
        `fare ${inst.fare}   bump payout ${inst.bumpCost}   show-up rate ${(inst.showProb * 100).toFixed(0)}%`,
        PAD,
        24,
      )
      ctx.restore()
    }

    const setFrom = (ev: PointerEvent) => {
      const v = Math.round(vOf(s.toVirtual(ev).x))
      const clamped = Math.max(inst.capacity, Math.min(inst.capacity + MAX_OVER, v))
      if (clamped !== sol) api.commit(clamped)
    }

    const onDown = (ev: PointerEvent) => {
      dragging = true
      s.canvas.setPointerCapture(ev.pointerId)
      setFrom(ev)
    }
    const onMove = (ev: PointerEvent) => {
      if (dragging) setFrom(ev)
    }
    const onUp = (ev: PointerEvent) => {
      dragging = false
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

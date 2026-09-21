import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 480
const BAYS = 10
const PAD = 72
const SPAN = VW - PAD - 48
const BAY_W = SPAN / BAYS
const BASE = 344
const BAR_MAX = 196
const LABEL_Y = 356

const CRANE_NAMES = ['Crane 1', 'Crane 2', 'Crane 3']
const COLORS = ['#ff4d9d', '#5b8cff', '#52e68a']

interface Instance {
  /** Boxes to shift out of each bay, bow to stern. */
  work: number[]
  /** Boxes an hour each crane manages. They are not the same age. */
  speed: number[]
}
/** Where the two gaps between cranes sit, as bay boundaries. */
type Solution = number[]

function spans(sol: Solution): [number, number][] {
  const [a, b] = sol
  return [
    [0, a],
    [a, b],
    [b, BAYS],
  ]
}

function hoursEach(inst: Instance, sol: Solution): number[] {
  return spans(sol).map(([from, to], c) => {
    let load = 0
    for (let i = from; i < to; i++) load += inst.work[i]
    return load / inst.speed[c]
  })
}

const finishTime = (inst: Instance, sol: Solution) =>
  Math.round(Math.max(...hoursEach(inst, sol)) * 10) / 10

/** Cranes sit on one rail and cannot pass each other, so every split is a
 *  pair of cuts. Sixty six of them. All checked. */
function bestSplit(inst: Instance): Solution {
  let best: Solution = [0, 0]
  let bestVal = Infinity
  for (let a = 0; a <= BAYS; a++) {
    for (let b = a; b <= BAYS; b++) {
      const v = finishTime(inst, [a, b])
      if (v < bestVal) {
        bestVal = v
        best = [a, b]
      }
    }
  }
  return best
}

export const quaycrane: Minigame<Instance, Solution> = {
  id: 'quaycrane',
  title: 'Quayside',
  problem: 'Quay Crane Scheduling',
  family: 'scheduling',
  blurb: 'Three cranes on one rail working a ship bow to stern. They cannot pass each other, so all you get to choose is where one crane stops and the next begins. The ship leaves when the last crane does.',
  howTo: 'Drag either gap along the ship to hand bays from one crane to its neighbour. Crane one is the newest and crane three is the oldest, so equal piles of boxes are not equal hours.',
  objective: 'min',
  unit: 'hours',

  generate(rng: RNG): Instance {
    return {
      work: Array.from({ length: BAYS }, () => 8 + rng.int(18)),
      speed: [1, 0.78 + rng.next() * 0.12, 0.6 + rng.next() * 0.12].map(
        (v) => Math.round(v * 100) / 100,
      ),
    }
  },

  initial(): Solution {
    // Three even stretches of the ship, which ignores the crane ages entirely.
    return [Math.round(BAYS / 3), Math.round((2 * BAYS) / 3)]
  },

  evaluate(inst, sol) {
    const hrs = hoursEach(inst, sol)
    const idle = hrs.filter((h) => h === 0).length
    return {
      value: finishTime(inst, sol),
      feasible: true,
      note: idle > 0
        ? `${idle} crane${idle === 1 ? ' is' : 's are'} standing idle.`
        : `Cranes finish at ${hrs.map((h) => h.toFixed(1)).join(', ')} hours.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestSplit(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    const xOf = (bay: number) => PAD + bay * BAY_W
    const bayOf = (x: number) => Math.max(0, Math.min(BAYS, Math.round((x - PAD) / BAY_W)))

    let sol: Solution = api.current()
    let ref: Solution | null = null
    let dragging = -1

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      clearBoard(ctx, VW, VH)
      const peak = Math.max(...inst.work)
      const hrs = hoursEach(inst, sol)
      const slowest = Math.max(...hrs)

      spans(sol).forEach(([from, to], c) => {
        if (to <= from) return
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(xOf(from) + 2, 96, (to - from) * BAY_W - 4, BASE - 96, 8)
        ctx.fillStyle = `${COLORS[c]}12`
        ctx.fill()
        ctx.restore()
      })

      inst.work.forEach((w, i) => {
        const crane = spans(sol).findIndex(([from, to]) => i >= from && i < to)
        const h = (w / peak) * BAR_MAX
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(xOf(i) + 12, BASE - h, BAY_W - 24, h, 4)
        ctx.fillStyle = crane >= 0 ? COLORS[crane] : 'rgba(255,255,255,0.18)'
        ctx.globalAlpha = 0.85
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.font = '700 12px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(String(w), xOf(i) + BAY_W / 2, BASE - h - 6)
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.font = '500 10px "JetBrains Mono", monospace'
        ctx.textBaseline = 'top'
        ctx.fillText(`bay ${i + 1}`, xOf(i) + BAY_W / 2, LABEL_Y)
        ctx.restore()
      })

      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PAD, BASE + 0.5)
      ctx.lineTo(PAD + SPAN, BASE + 0.5)
      ctx.stroke()
      ctx.restore()

      spans(sol).forEach(([from, to], c) => {
        const mid = to > from ? (xOf(from) + xOf(to)) / 2 : xOf(from)
        ctx.save()
        ctx.fillStyle = COLORS[c]
        ctx.font = '700 13px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(`${CRANE_NAMES[c]} ${hrs[c].toFixed(1)}h`, mid, 58)
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.font = '500 10px "JetBrains Mono", monospace'
        ctx.fillText(`${inst.speed[c]} boxes an hour`, mid, 76)
        if (hrs[c] === slowest && slowest > 0) {
          ctx.fillStyle = COLORS[c]
          ctx.font = '500 10px "JetBrains Mono", monospace'
          ctx.fillText('ship waits on this one', mid, 388)
        }
        ctx.restore()
      })

      if (ref) {
        ctx.save()
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'
        ctx.lineWidth = 2
        ref.forEach((cut) => {
          ctx.beginPath()
          ctx.moveTo(xOf(cut), 90)
          ctx.lineTo(xOf(cut), BASE + 10)
          ctx.stroke()
        })
        ctx.setLineDash([])
        ctx.restore()
      }

      sol.forEach((cut, i) => {
        ctx.save()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(xOf(cut), 96)
        ctx.lineTo(xOf(cut), BASE)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(xOf(cut), BASE + 22, 11, 0, Math.PI * 2)
        ctx.fillStyle = i === dragging ? '#ffffff' : 'rgba(255,255,255,0.8)'
        ctx.fill()
        ctx.strokeStyle = '#0a0c10'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.restore()
      })
    }

    const setFrom = (ev: PointerEvent) => {
      if (dragging < 0) return
      const bay = bayOf(s.toVirtual(ev).x)
      const next: Solution = [...sol]
      if (dragging === 0) next[0] = Math.min(bay, next[1])
      else next[1] = Math.max(bay, next[0])
      if (next[0] !== sol[0] || next[1] !== sol[1]) api.commit(next)
    }

    const onDown = (ev: PointerEvent) => {
      const x = s.toVirtual(ev).x
      dragging = Math.abs(xOf(sol[0]) - x) <= Math.abs(xOf(sol[1]) - x) ? 0 : 1
      s.canvas.setPointerCapture(ev.pointerId)
      setFrom(ev)
    }
    const onMove = (ev: PointerEvent) => {
      if (dragging >= 0) setFrom(ev)
    }
    const onUp = (ev: PointerEvent) => {
      dragging = -1
      if (s.canvas.hasPointerCapture(ev.pointerId)) s.canvas.releasePointerCapture(ev.pointerId)
      draw(sol, ref)
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

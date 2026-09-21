import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 520
const STUFF = 5
const NUTRIENTS = 3
const SACKS = 20
const TRACK_X = 250
const TRACK_W = 470
const ROW_TOP = 96
const ROW_H = 58
const GAUGE_TOP = 396
const GAUGE_H = 34

const NAMES = ['Barley', 'Maize', 'Soya', 'Bran', 'Pellets']
const NUTRIENT = ['Protein', 'Fibre', 'Oil']
const COLORS = ['#ffbe3d', '#ff8c42', '#52e68a', '#5b8cff', '#c77dff']

interface Instance {
  cost: number[]
  /** content[ingredient][nutrient] per sack. */
  content: number[][]
  least: number[]
}
/** Sacks of each ingredient. Twenty sacks make a batch. */
type Solution = number[]

const totalSacks = (sol: Solution) => sol.reduce((a, b) => a + b, 0)

const levels = (inst: Instance, sol: Solution) =>
  Array.from({ length: NUTRIENTS }, (_, n) =>
    sol.reduce((a, sacks, i) => a + sacks * inst.content[i][n], 0),
  )

const priceOf = (inst: Instance, sol: Solution) =>
  sol.reduce((a, sacks, i) => a + sacks * inst.cost[i], 0)

/** Every way of making twenty sacks out of five things. 10,626 of them. */
function cheapestMix(inst: Instance): Solution | null {
  const mix = new Array(STUFF).fill(0)
  let best: Solution | null = null
  let bestPrice = Infinity
  const walk = (i: number, left: number) => {
    if (i === STUFF - 1) {
      mix[i] = left
      const price = priceOf(inst, mix)
      if (price < bestPrice && levels(inst, mix).every((v, n) => v >= inst.least[n])) {
        bestPrice = price
        best = [...mix]
      }
      return
    }
    for (let k = 0; k <= left; k++) {
      mix[i] = k
      walk(i + 1, left - k)
    }
    mix[i] = 0
  }
  walk(0, SACKS)
  return best
}

export const blending: Minigame<Instance, Solution> = {
  id: 'blending',
  title: 'The Mix',
  problem: 'Blending Problem',
  family: 'markets',
  blurb: 'Twenty sacks make a batch of feed and the batch has to clear three minimums. The cheap stuff is cheap because there is not much in it.',
  howTo: 'Drag a slider to change how many sacks of that go in. The batch has to come to twenty and every bar along the bottom has to reach its mark.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    for (;;) {
      const content = Array.from({ length: STUFF }, () =>
        Array.from({ length: NUTRIENTS }, () => 1 + rng.int(9)),
      )
      // Cheap things are thin, dear things are rich, with a bit of noise.
      const cost = content.map(
        (row) => 4 + Math.round(row.reduce((a, b) => a + b, 0) * (0.9 + rng.next() * 0.7)),
      )
      const least = Array.from({ length: NUTRIENTS }, (_, n) => {
        const avg = content.reduce((a, row) => a + row[n], 0) / STUFF
        return Math.round(SACKS * avg * (0.85 + rng.next() * 0.45))
      })
      const inst = { cost, content, least }
      const best = cheapestMix(inst)
      if (!best) continue
      // Reject boards where dumping everything into one sack already works.
      const lazy = Array.from({ length: STUFF }, (_, i) => {
        const one = new Array(STUFF).fill(0)
        one[i] = SACKS
        return levels(inst, one).every((v, n) => v >= least[n])
      })
      if (lazy.some(Boolean)) continue
      return inst
    }
  },

  initial(): Solution {
    const each = Math.floor(SACKS / STUFF)
    const mix = new Array(STUFF).fill(each)
    mix[0] += SACKS - each * STUFF
    return mix
  },

  evaluate(inst, sol) {
    const made = totalSacks(sol)
    if (made !== SACKS) {
      return {
        value: 0,
        feasible: false,
        note: made < SACKS
          ? `${SACKS - made} sacks short of a batch.`
          : `${made - SACKS} sacks over a batch.`,
      }
    }
    const got = levels(inst, sol)
    const thin = got.filter((v, n) => v < inst.least[n]).length
    if (thin > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${thin} of the minimums ${thin === 1 ? 'is' : 'are'} not met.`,
      }
    }
    return { value: priceOf(inst, sol), feasible: true, note: 'A batch that passes on all three.' }
  },

  solve(inst): Reference<Solution> {
    return {
      solution: cheapestMix(inst) ?? new Array(STUFF).fill(SACKS / STUFF),
      label: 'exhaustive',
      exact: true,
    }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    const xOf = (n: number) => TRACK_X + (n / SACKS) * TRACK_W
    const nOf = (x: number) =>
      Math.max(0, Math.min(SACKS, Math.round(((x - TRACK_X) / TRACK_W) * SACKS)))

    let sol: Solution = api.current()
    let ref: Solution | null = null
    let dragging = -1

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const made = totalSacks(sol)
      const got = levels(inst, sol)

      ctx.save()
      ctx.fillStyle = made === SACKS ? accent : '#ff5c7a'
      ctx.font = '700 15px "JetBrains Mono", monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`${made} of ${SACKS} sacks in the batch`, 30, 30)
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '500 12px "JetBrains Mono", monospace'
      ctx.fillText(`costing ${priceOf(inst, sol)}`, 30, 52)
      ctx.restore()

      inst.cost.forEach((cost, i) => {
        const y = ROW_TOP + i * ROW_H
        ctx.save()
        ctx.fillStyle = COLORS[i]
        ctx.font = '700 14px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(NAMES[i], 30, y)
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.font = '500 10.5px "JetBrains Mono", monospace'
        ctx.fillText(`${cost} a sack`, 30, y + 16)
        ctx.fillText(
          inst.content[i].map((c, n) => `${NUTRIENT[n][0]}${c}`).join('  '),
          140,
          y + 16,
        )

        ctx.strokeStyle = 'rgba(255,255,255,0.14)'
        ctx.lineWidth = 5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(TRACK_X, y)
        ctx.lineTo(TRACK_X + TRACK_W, y)
        ctx.stroke()
        ctx.strokeStyle = COLORS[i]
        ctx.beginPath()
        ctx.moveTo(TRACK_X, y)
        ctx.lineTo(xOf(sol[i]), y)
        ctx.stroke()

        if (ref) {
          ctx.setLineDash([4, 4])
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(xOf(ref[i]), y - 13)
          ctx.lineTo(xOf(ref[i]), y + 13)
          ctx.stroke()
          ctx.setLineDash([])
        }

        ctx.beginPath()
        ctx.arc(xOf(sol[i]), y, 10, 0, Math.PI * 2)
        ctx.fillStyle = COLORS[i]
        ctx.fill()
        ctx.strokeStyle = '#0a0c10'
        ctx.lineWidth = 2
        ctx.stroke()

        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.font = '700 15px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.fillText(`${sol[i]}`, TRACK_X + TRACK_W + 22, y)
        ctx.restore()
      })

      inst.least.forEach((least, n) => {
        const y = GAUGE_TOP + n * (GAUGE_H + 6)
        const span = Math.max(least * 1.5, got[n], 1)
        const ok = got[n] >= least
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.font = '500 12px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(NUTRIENT[n], 30, y + GAUGE_H / 2)

        ctx.beginPath()
        ctx.roundRect(140, y + 6, VW - 260, GAUGE_H - 12, 6)
        ctx.fillStyle = 'rgba(255,255,255,0.06)'
        ctx.fill()
        ctx.beginPath()
        ctx.roundRect(140, y + 6, Math.max(2, ((VW - 260) * got[n]) / span), GAUGE_H - 12, 6)
        ctx.fillStyle = ok ? accent : '#ff5c7a'
        ctx.fill()

        const mark = 140 + ((VW - 260) * least) / span
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(mark, y + 2)
        ctx.lineTo(mark, y + GAUGE_H - 2)
        ctx.stroke()

        ctx.fillStyle = ok ? 'rgba(255,255,255,0.7)' : '#ff5c7a'
        ctx.font = '700 12px "JetBrains Mono", monospace'
        ctx.textAlign = 'right'
        ctx.fillText(`${got[n]} of ${least}`, VW - 30, y + GAUGE_H / 2)
        ctx.restore()
      })
    }

    const rowAt = (y: number) => {
      const i = Math.round((y - ROW_TOP) / ROW_H)
      return i >= 0 && i < STUFF && Math.abs(y - (ROW_TOP + i * ROW_H)) < 24 ? i : -1
    }

    const setFrom = (ev: PointerEvent) => {
      if (dragging < 0) return
      const n = nOf(s.toVirtual(ev).x)
      if (n === sol[dragging]) return
      const next = [...sol]
      next[dragging] = n
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
      s.canvas.style.cursor = rowAt(s.toVirtual(ev).y) >= 0 ? 'ew-resize' : 'default'
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

import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 520
const WEEKS = 8
const STEP = 10
const PAD = 76
const SPAN = VW - PAD - 44
const SLOT = SPAN / WEEKS
const PROD_BASE = 268
const PROD_MAX = 176
const INV_BASE = 432
const INV_MAX = 96
const LABEL_Y = 446

interface Instance {
  demand: number[]
  setup: number
  holding: number
  /** Most the plant can turn out in one week. */
  capacity: number
}
/** How much you make each week, in tens. */
type Solution = number[]

function run(inst: Instance, sol: Solution) {
  const stock: number[] = []
  let held = 0
  let short = -1
  for (let t = 0; t < WEEKS; t++) {
    held += sol[t] - inst.demand[t]
    if (held < 0 && short < 0) short = t
    stock.push(held)
  }
  return { stock, short }
}

const billOf = (inst: Instance, sol: Solution) => {
  const { stock } = run(inst, sol)
  const runs = sol.filter((q) => q > 0).length
  return runs * inst.setup + stock.reduce((a, s) => a + Math.max(0, s) * inst.holding, 0)
}

/** DP over the week and the stock carried into it. Exact on the ten unit grid. */
function bestRuns(inst: Instance): Solution {
  const total = inst.demand.reduce((a, b) => a + b, 0)
  const top = total / STEP
  const dp: Float64Array[] = Array.from({ length: WEEKS + 1 }, () =>
    new Float64Array(top + 1).fill(Infinity),
  )
  const pick: number[][] = Array.from({ length: WEEKS }, () => new Array(top + 1).fill(0))
  dp[WEEKS].fill(0)

  for (let t = WEEKS - 1; t >= 0; t--) {
    for (let i = 0; i <= top; i++) {
      for (let q = 0; q <= inst.capacity; q += STEP) {
        const left = i * STEP + q - inst.demand[t]
        if (left < 0 || left / STEP > top) continue
        const cost =
          (q > 0 ? inst.setup : 0) + left * inst.holding + dp[t + 1][left / STEP]
        if (cost < dp[t][i]) {
          dp[t][i] = cost
          pick[t][i] = q
        }
      }
    }
  }

  const out: Solution = []
  let inv = 0
  for (let t = 0; t < WEEKS; t++) {
    const q = pick[t][inv / STEP]
    out.push(q)
    inv += q - inst.demand[t]
  }
  return out
}

export const clsp: Minigame<Instance, Solution> = {
  id: 'clsp',
  title: 'Make to Fit',
  problem: 'Capacitated Lot Sizing',
  family: 'inventory',
  blurb: 'Same warehouse rent as before, except the plant can only turn out so much in a week. Sometimes you have to build stock early because later you simply will not have the hours.',
  howTo: 'Drag the top of a week to set how much you make. The pale bar behind is what the shops want that week and the line across the top is what the plant can manage.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    for (;;) {
      const demand = Array.from({ length: WEEKS }, () => (2 + rng.int(6)) * STEP)
      const total = demand.reduce((a, b) => a + b, 0)
      const capacity = Math.round((total / WEEKS) * 1.3 / STEP) * STEP
      // The plant has to be able to keep up over any run of weeks.
      let need = 0
      let made = 0
      let ok = true
      for (let t = 0; t < WEEKS; t++) {
        need += demand[t]
        made += capacity
        if (made < need) ok = false
      }
      if (!ok) continue
      const holding = 1 + rng.int(3)
      return {
        demand,
        capacity,
        holding,
        setup: Math.round((total / WEEKS) * holding * (2 + rng.next() * 3)),
      }
    }
  },

  initial(inst): Solution {
    // Run flat out from week one until the whole order is made. Always works,
    // and fills the warehouse doing it.
    const total = inst.demand.reduce((a, b) => a + b, 0)
    let made = 0
    return inst.demand.map(() => {
      const q = Math.min(inst.capacity, total - made)
      made += q
      return q
    })
  },

  evaluate(inst, sol) {
    const over = sol.filter((q) => q > inst.capacity).length
    if (over > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${over} week${over === 1 ? '' : 's'} asking the plant for more than it can make.`,
      }
    }
    const { stock, short } = run(inst, sol)
    if (short >= 0) {
      return { value: 0, feasible: false, note: `Week ${short + 1} runs out of stock.` }
    }
    const runs = sol.filter((q) => q > 0).length
    const carried = stock.reduce((a, s) => a + s, 0)
    return {
      value: billOf(inst, sol),
      feasible: true,
      note: `${runs} weeks running, ${carried} unit-weeks sitting in the warehouse.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestRuns(inst), label: 'stock level DP', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let hover = -1
    let dragging = -1

    const cx = (t: number) => PAD + (t + 0.5) * SLOT
    const yOf = (q: number) => PROD_BASE - (q / inst.capacity) * PROD_MAX
    const qOf = (y: number) => {
      const raw = ((PROD_BASE - y) / PROD_MAX) * inst.capacity
      return Math.max(0, Math.min(inst.capacity, Math.round(raw / STEP) * STEP))
    }

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const { stock } = run(inst, sol)
      const maxStock = Math.max(1, ...stock.map((x) => Math.abs(x)))

      ctx.save()
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '500 11px "JetBrains Mono", monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(
        `setup ${inst.setup} a run   holding ${inst.holding} a unit a week   plant makes ${inst.capacity} a week`,
        PAD,
        22,
      )
      ctx.restore()

      ctx.save()
      ctx.setLineDash([5, 5])
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(PAD, yOf(inst.capacity))
      ctx.lineTo(PAD + SPAN, yOf(inst.capacity))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      for (let t = 0; t < WEEKS; t++) {
        const dy = Math.max(PROD_BASE - PROD_MAX * 1.16, yOf(inst.demand[t]))
        ctx.save()
        if (t === hover) {
          ctx.fillStyle = 'rgba(255,255,255,0.04)'
          ctx.fillRect(PAD + t * SLOT, 54, SLOT, INV_BASE - 44)
        }
        ctx.beginPath()
        ctx.roundRect(cx(t) - 34, dy, 68, PROD_BASE - dy, 3)
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        ctx.fill()

        const q = sol[t]
        if (q > 0) {
          ctx.beginPath()
          ctx.roundRect(cx(t) - 22, yOf(q), 44, PROD_BASE - yOf(q), 3)
          ctx.fillStyle = accent
          ctx.fill()
        }
        ctx.strokeStyle = accent
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(cx(t) - 30, yOf(q))
        ctx.lineTo(cx(t) + 30, yOf(q))
        ctx.stroke()

        if (ref) {
          ctx.setLineDash([4, 4])
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(cx(t) - 34, yOf(ref[t]))
          ctx.lineTo(cx(t) + 34, yOf(ref[t]))
          ctx.stroke()
          ctx.setLineDash([])
        }

        ctx.fillStyle = q > 0 ? accent : 'rgba(255,255,255,0.35)'
        ctx.font = '700 12px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(String(q), cx(t), yOf(q) - 8)
        ctx.fillStyle = 'rgba(255,255,255,0.45)'
        ctx.font = '500 11px "JetBrains Mono", monospace'
        ctx.textBaseline = 'top'
        ctx.fillText(`want ${inst.demand[t]}`, cx(t), PROD_BASE + 8)
        ctx.restore()
      }

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(PAD, INV_BASE)
      stock.forEach((v, t) => {
        const y = INV_BASE - (v / maxStock) * INV_MAX
        ctx.lineTo(PAD + t * SLOT, y)
        ctx.lineTo(PAD + (t + 1) * SLOT, y)
      })
      ctx.lineTo(PAD + SPAN, INV_BASE)
      ctx.closePath()
      ctx.fillStyle = `${accent}33`
      ctx.fill()
      ctx.strokeStyle = accent
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PAD, INV_BASE + 0.5)
      ctx.lineTo(PAD + SPAN, INV_BASE + 0.5)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.font = '500 10px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (let t = 0; t < WEEKS; t++) ctx.fillText(`wk ${t + 1}`, cx(t), LABEL_Y)
      ctx.restore()
    }

    const weekAt = (x: number) => {
      const t = Math.floor((x - PAD) / SLOT)
      return t >= 0 && t < WEEKS ? t : -1
    }

    const setFrom = (ev: PointerEvent) => {
      if (dragging < 0) return
      const q = qOf(s.toVirtual(ev).y)
      if (q === sol[dragging]) return
      const next = [...sol]
      next[dragging] = q
      api.commit(next)
    }

    const onDown = (ev: PointerEvent) => {
      const v = s.toVirtual(ev)
      if (v.y > PROD_BASE + 6) return
      const t = weekAt(v.x)
      if (t < 0) return
      dragging = t
      s.canvas.setPointerCapture(ev.pointerId)
      setFrom(ev)
    }
    const onMove = (ev: PointerEvent) => {
      if (dragging >= 0) return setFrom(ev)
      const v = s.toVirtual(ev)
      const t = v.y <= PROD_BASE + 6 ? weekAt(v.x) : -1
      if (t !== hover) {
        hover = t
        s.canvas.style.cursor = t >= 0 ? 'ns-resize' : 'default'
        draw(sol, ref)
      }
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

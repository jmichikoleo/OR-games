import type { Minigame, Reference, RNG } from '../core/types'
import { clearBoard, makeSurface } from '../core/canvas'

const VW = 1000
const VH = 450
const WEEKS = 10
const PAD = 72
const SPAN = VW - PAD - 44
const SLOT = SPAN / WEEKS
const DEM_BASE = 190
const DEM_MAX = 118
const PROD_Y = 212
const PROD_H = 44
const INV_BASE = 392
const INV_MAX = 104
const LABEL_Y = 406

interface Instance {
  demand: number[]
  /** Cost of switching the line on at all, however much you make. */
  setup: number
  /** Cost of carrying one unit for one week. */
  holding: number
}
/** Weeks you fire up the line. */
type Solution = number[]

/** Stock left at the end of each week under a given set of production weeks. */
function run(inst: Instance, sol: Solution) {
  const runs = [...sol].sort((a, b) => a - b)
  const batch = new Array(WEEKS).fill(0)
  runs.forEach((t, i) => {
    const until = i + 1 < runs.length ? runs[i + 1] : WEEKS
    for (let j = t; j < until; j++) batch[t] += inst.demand[j]
  })
  const stock: number[] = []
  let held = 0
  let short = -1
  for (let t = 0; t < WEEKS; t++) {
    held += batch[t]
    held -= inst.demand[t]
    if (held < 0 && short < 0) short = t
    stock.push(held)
  }
  return { batch, stock, short }
}

const costOf = (inst: Instance, sol: Solution) => {
  const { stock } = run(inst, sol)
  return sol.length * inst.setup + stock.reduce((a, s) => a + Math.max(0, s) * inst.holding, 0)
}

/** Produce in week t, cover through week s-1, and pay to carry the rest. */
function segment(inst: Instance, t: number, s: number): number {
  let c = inst.setup
  let held = 0
  for (let i = t; i < s; i++) held += inst.demand[i]
  for (let i = t; i < s; i++) {
    held -= inst.demand[i]
    c += held * inst.holding
  }
  return c
}

/** Wagner-Whitin: the classic O(T^2) DP, exact. */
function bestRuns(inst: Instance): Solution {
  const dp = new Float64Array(WEEKS + 1).fill(Infinity)
  const nxt = new Int32Array(WEEKS + 1).fill(-1)
  dp[WEEKS] = 0
  for (let t = WEEKS - 1; t >= 0; t--) {
    for (let s = t + 1; s <= WEEKS; s++) {
      const c = segment(inst, t, s) + dp[s]
      if (c < dp[t]) {
        dp[t] = c
        nxt[t] = s
      }
    }
  }
  const out: Solution = []
  let t = 0
  while (t < WEEKS) {
    out.push(t)
    t = nxt[t]
  }
  return out
}

export const lotsizing: Minigame<Instance, Solution> = {
  id: 'lotsizing',
  title: 'Batch Run',
  problem: 'Wagner-Whitin Lot Sizing',
  family: 'inventory',
  blurb: 'Starting the line costs the same whether you make ten units or a thousand, but everything you make early sits in the warehouse costing rent.',
  howTo: 'Click a week to switch the line on or off there. Each run makes exactly enough to last until the next one. The shaded area is stock sitting in the warehouse.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    const demand = Array.from({ length: WEEKS }, () => 12 + rng.int(49))
    const holding = 1 + rng.int(3)
    // Setup roughly four to eight weeks of holding, so 3-5 runs is about right.
    const avg = demand.reduce((a, b) => a + b, 0) / WEEKS
    return { demand, holding, setup: Math.round(avg * holding * (3 + rng.next() * 4)) }
  },

  initial(): Solution {
    // Make everything in week one: one setup, a warehouse full of stock.
    return [0]
  },

  evaluate(inst, sol) {
    if (sol.length === 0) {
      return { value: 0, feasible: false, note: 'The line never runs, so there is nothing to sell.' }
    }
    const { stock, short } = run(inst, sol)
    if (short >= 0) {
      return { value: 0, feasible: false, note: `Week ${short + 1} runs out of stock. Make something earlier.` }
    }
    const carried = stock.reduce((a, s) => a + s, 0)
    return {
      value: costOf(inst, sol),
      feasible: true,
      note: `${sol.length} run${sol.length === 1 ? '' : 's'}, ${carried} unit-weeks sitting in the warehouse.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestRuns(inst), label: 'Wagner-Whitin DP', exact: true }
  },

  mount(host, inst, api) {
    const s = makeSurface(host, VW, VH)
    const maxDem = Math.max(...inst.demand)
    let sol: Solution = api.current()
    let ref: Solution | null = null
    let hover = -1

    const cx = (t: number) => PAD + (t + 0.5) * SLOT

    function draw(next: Solution, refSol: Solution | null) {
      sol = next
      ref = refSol
      const { ctx } = s
      const accent = s.accent()
      clearBoard(ctx, VW, VH)
      const { batch, stock } = run(inst, sol)
      const maxStock = Math.max(1, ...stock.map((x) => Math.abs(x)))

      ctx.save()
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '500 11px "JetBrains Mono", monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(
        `setup ${inst.setup} per run   holding ${inst.holding} per unit per week`,
        PAD,
        22,
      )
      ctx.restore()

      // Demand.
      inst.demand.forEach((d, t) => {
        const h = (d / maxDem) * DEM_MAX
        ctx.save()
        if (t === hover) {
          ctx.fillStyle = 'rgba(255,255,255,0.05)'
          ctx.fillRect(PAD + t * SLOT, 48, SLOT, INV_BASE - 40)
        }
        ctx.beginPath()
        ctx.roundRect(cx(t) - 25, DEM_BASE - h, 50, h, 3)
        ctx.fillStyle = 'rgba(255,255,255,0.22)'
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.font = '500 11px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(String(d), cx(t), DEM_BASE - h - 5)
        ctx.restore()
      })

      // Production runs.
      for (let t = 0; t < WEEKS; t++) {
        const on = sol.includes(t)
        const isRef = !!ref && ref.includes(t)
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(cx(t) - 30, PROD_Y, 60, PROD_H, 6)
        if (on) {
          ctx.fillStyle = accent
          ctx.fill()
          ctx.fillStyle = '#0a0c10'
          ctx.font = '700 15px "JetBrains Mono", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(batch[t]), cx(t), PROD_Y + PROD_H / 2)
        } else {
          ctx.setLineDash([4, 4])
          ctx.strokeStyle = 'rgba(255,255,255,0.18)'
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (isRef) {
          ctx.beginPath()
          ctx.roundRect(cx(t) - 34, PROD_Y - 4, 68, PROD_H + 8, 8)
          ctx.setLineDash([5, 5])
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.setLineDash([])
        }
        ctx.restore()
      }

      // Warehouse stock, week by week.
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
      ctx.restore()

      ctx.save()
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

    const onMove = (ev: PointerEvent) => {
      const t = weekAt(s.toVirtual(ev).x)
      if (t !== hover) {
        hover = t
        s.canvas.style.cursor = t >= 0 ? 'pointer' : 'default'
        draw(sol, ref)
      }
    }

    const onClick = (ev: PointerEvent) => {
      const t = weekAt(s.toVirtual(ev).x)
      if (t < 0) return
      api.commit(sol.includes(t) ? sol.filter((x) => x !== t) : [...sol, t].sort((a, b) => a - b))
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

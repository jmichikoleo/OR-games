import type { Minigame, Reference, RNG } from '../core/types'

const ROLL = 100
const KINDS = 4

interface Instance {
  /** Widths customers ordered, and how many of each they want. */
  widths: number[]
  demand: number[]
  rolls: number
}
/** For each roll, the widths cut from it (as indices into `widths`). */
type Solution = number[][]

const cutCounts = (inst: Instance, sol: Solution) => {
  const made = new Array(KINDS).fill(0)
  sol.forEach((roll) => roll.forEach((w) => made[w]++))
  return made
}

const rollUsed = (inst: Instance, roll: number[]) =>
  roll.reduce((a, w) => a + inst.widths[w], 0)

/**
 * Exact: enumerate every way one roll can be cut, then DP over "how much of
 * the order is still outstanding". At four widths and small demands the state
 * space is about 1300, so this really is the minimum number of rolls.
 */
function bestPlan(inst: Instance): Solution {
  const { widths, demand } = inst

  const patterns: number[][] = []
  const cur = new Array(KINDS).fill(0)
  const walk = (i: number, used: number) => {
    if (i === KINDS) {
      if (cur.some((x) => x > 0)) patterns.push([...cur])
      return
    }
    for (let a = 0; a <= demand[i] && used + a * widths[i] <= ROLL; a++) {
      cur[i] = a
      walk(i + 1, used + a * widths[i])
    }
    cur[i] = 0
  }
  walk(0, 0)

  const radix = demand.map((d) => d + 1)
  const size = radix.reduce((a, b) => a * b, 1)
  const decode = (s: number) => {
    const out: number[] = []
    let v = s
    for (let i = 0; i < KINDS; i++) {
      out.push(v % radix[i])
      v = Math.floor(v / radix[i])
    }
    return out
  }
  const encode = (v: number[]) => {
    let s = 0
    for (let i = KINDS - 1; i >= 0; i--) s = s * radix[i] + v[i]
    return s
  }

  const states = Array.from({ length: size }, (_, s) => s).sort(
    (a, b) =>
      decode(a).reduce((x, y) => x + y, 0) - decode(b).reduce((x, y) => x + y, 0),
  )

  const dp = new Float64Array(size).fill(Infinity)
  const via = new Int32Array(size).fill(-1)
  dp[0] = 0

  for (const s of states) {
    if (s === 0) continue
    const rem = decode(s)
    for (let pi = 0; pi < patterns.length; pi++) {
      const p = patterns[pi]
      // A pattern is only worth applying if it cuts something still needed.
      if (!p.some((a, i) => a > 0 && rem[i] > 0)) continue
      const next = rem.map((r, i) => Math.max(0, r - p[i]))
      const cost = dp[encode(next)] + 1
      if (cost < dp[s]) {
        dp[s] = cost
        via[s] = pi
      }
    }
  }

  const plan: Solution = []
  let rem = [...demand]
  let guard = 0
  while (rem.some((r) => r > 0) && guard++ < 60) {
    const pi = via[encode(rem)]
    if (pi < 0) break
    const p = patterns[pi]
    const roll: number[] = []
    p.forEach((a, i) => {
      for (let k = 0; k < Math.min(a, rem[i]); k++) roll.push(i)
    })
    plan.push(roll)
    rem = rem.map((r, i) => Math.max(0, r - p[i]))
  }
  while (plan.length < inst.rolls) plan.push([])
  return plan
}

export const cuttingstock: Minigame<Instance, Solution> = {
  id: 'cuttingstock',
  title: 'Roll Cutter',
  problem: 'Cutting Stock',
  family: 'packing',
  blurb: 'Customers ordered lengths but you only stock 100cm rolls. Cut every order out of as few rolls as you can. Whatever is left on the end is scrap.',
  howTo: 'Click a length to pick it up, then click a roll to cut it there. Click a cut piece to undo it. The dark tail on each roll is wasted stock.',
  objective: 'min',
  unit: 'rolls',

  generate(rng: RNG): Instance {
    const widths: number[] = []
    while (widths.length < KINDS) {
      const w = 18 + rng.int(41)
      if (!widths.some((x) => Math.abs(x - w) < 5)) widths.push(w)
    }
    widths.sort((a, b) => b - a)
    const demand = widths.map(() => 2 + rng.int(4))
    const total = widths.reduce((a, w, i) => a + w * demand[i], 0)
    return { widths, demand, rolls: Math.ceil(total / ROLL) + 3 }
  },

  initial(inst): Solution {
    return Array.from({ length: inst.rolls }, () => [])
  },

  evaluate(inst, sol) {
    const made = cutCounts(inst, sol)
    const left = inst.demand.reduce((a, d, i) => a + Math.max(0, d - made[i]), 0)
    if (left > 0) {
      return { value: 0, feasible: false, note: `${left} ordered ${left === 1 ? 'length' : 'lengths'} still to cut.` }
    }
    const over = sol.filter((r) => rollUsed(inst, r) > ROLL).length
    if (over > 0) {
      return { value: 0, feasible: false, note: `${over} roll${over === 1 ? ' is' : 's are'} cut past 100cm.` }
    }
    const used = sol.filter((r) => r.length > 0)
    const scrap = used.reduce((a, r) => a + (ROLL - rollUsed(inst, r)), 0)
    return {
      value: used.length,
      feasible: true,
      note: `Order complete on ${used.length} rolls, ${scrap}cm scrapped.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestPlan(inst), label: 'pattern DP', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'cs'
    root.innerHTML = `<div class="cs-orders" id="orders"></div><div class="cs-rolls" id="rolls"></div>`
    host.appendChild(root)

    const orders = root.querySelector('#orders') as HTMLElement
    const rolls = root.querySelector('#rolls') as HTMLElement
    let held = -1
    let lastSol: Solution = api.current()
    let lastRef: Solution | null = null

    function draw(sol: Solution, ref: Solution | null) {
      lastSol = sol
      lastRef = ref
      const made = cutCounts(inst, sol)

      orders.innerHTML = ''
      inst.widths.forEach((w, i) => {
        const left = inst.demand[i] - made[i]
        const el = document.createElement('button')
        el.className = `cs-w${held === i ? ' held' : ''}${left === 0 ? ' done' : ''}`
        el.innerHTML = `<b>${w}</b><span>${left} of ${inst.demand[i]} left</span>`
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          if (left === 0) return
          held = held === i ? -1 : i
          draw(sol, ref)
        })
        orders.appendChild(el)
      })

      const refUsed = ref ? ref.filter((r) => r.length > 0).length : null

      rolls.innerHTML = ''
      sol.forEach((roll, r) => {
        const used = rollUsed(inst, roll)
        const el = document.createElement('div')
        el.className = `cs-roll${used > 0 ? ' active' : ''}${used > ROLL ? ' over' : ''}`
        const pieces = roll
          .map(
            (w, k) =>
              `<i class="cs-cut" data-r="${r}" data-k="${k}" style="width:${(inst.widths[w] / ROLL) * 100}%">${inst.widths[w]}</i>`,
          )
          .join('')
        const waste = Math.max(0, ROLL - used)
        el.innerHTML = `${pieces}${waste > 0 ? `<i class="cs-scrap" style="width:${(waste / ROLL) * 100}%">${used > 0 ? waste : ''}</i>` : ''}`
        el.addEventListener('click', () => {
          if (held < 0) return
          if (used + inst.widths[held] > ROLL) return
          const made2 = cutCounts(inst, sol)
          if (made2[held] >= inst.demand[held]) return
          const next = sol.map((x) => [...x])
          next[r].push(held)
          held = -1
          api.commit(next)
        })
        rolls.appendChild(el)
      })

      rolls.querySelectorAll<HTMLElement>('.cs-cut').forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          const r = Number(el.dataset.r)
          const k = Number(el.dataset.k)
          const next = sol.map((x) => [...x])
          next[r].splice(k, 1)
          api.commit(next)
        })
      })

      if (refUsed !== null) {
        const tip = document.createElement('p')
        tip.className = 'cs-tip'
        tip.textContent = `The pattern DP fits the whole order on ${refUsed} rolls.`
        rolls.appendChild(tip)
      }
    }

    const clearHeld = () => {
      if (held >= 0) {
        held = -1
        draw(lastSol, lastRef)
      }
    }
    root.addEventListener('click', clearHeld)

    return {
      draw,
      destroy() {
        root.removeEventListener('click', clearHeld)
        root.remove()
      },
    }
  },
}

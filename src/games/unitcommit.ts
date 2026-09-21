import type { Minigame, Reference, RNG } from '../core/types'

const HOURS = 8
const PLANTS = 4
const PATTERNS = 1 << PLANTS
const NAMES = ['Coalside', 'Riverbend', 'Peaker A', 'Peaker B']

interface Plant {
  /** Least it can run at once it is lit, and the most it can give. */
  floor: number
  ceiling: number
  /** Cost a unit of output, cost an hour just for being lit, cost to light it. */
  perUnit: number
  standing: number
  firing: number
}
interface Instance {
  plants: Plant[]
  demand: number[]
}
/** Bitmask of which plants are lit each hour. */
type Solution = number[]

const lit = (mask: number) =>
  Array.from({ length: PLANTS }, (_, g) => g).filter((g) => (mask >> g) & 1)

const floorOf = (inst: Instance, mask: number) =>
  lit(mask).reduce((a, g) => a + inst.plants[g].floor, 0)

const ceilingOf = (inst: Instance, mask: number) =>
  lit(mask).reduce((a, g) => a + inst.plants[g].ceiling, 0)

/** Everything lit runs at least at its floor, then the cheap ones fill the gap. */
function dispatch(inst: Instance, mask: number, want: number): number[] | null {
  const on = lit(mask)
  if (!on.length) return want === 0 ? [] : null
  if (floorOf(inst, mask) > want || ceilingOf(inst, mask) < want) return null
  const out = new Array(PLANTS).fill(0)
  on.forEach((g) => (out[g] = inst.plants[g].floor))
  let gap = want - floorOf(inst, mask)
  for (const g of [...on].sort((a, b) => inst.plants[a].perUnit - inst.plants[b].perUnit)) {
    const room = Math.min(gap, inst.plants[g].ceiling - inst.plants[g].floor)
    out[g] += room
    gap -= room
  }
  return out
}

function hourCost(inst: Instance, mask: number, want: number): number {
  const out = dispatch(inst, mask, want)
  if (!out) return Infinity
  return lit(mask).reduce((a, g) => a + inst.plants[g].standing + out[g] * inst.plants[g].perUnit, 0)
}

const firingCost = (inst: Instance, before: number, now: number) =>
  lit(now).reduce((a, g) => a + (((before >> g) & 1) ? 0 : inst.plants[g].firing), 0)

const billOf = (inst: Instance, sol: Solution) => {
  let total = 0
  let before = 0
  for (let t = 0; t < HOURS; t++) {
    total += firingCost(inst, before, sol[t]) + hourCost(inst, sol[t], inst.demand[t])
    before = sol[t]
  }
  return total
}

/**
 * The cheap looking start. Reach for the stations that cost least to light,
 * hour by hour, and never think past the hour you are in. The peakers are
 * cheap to start and dear to run, so this burns money all day.
 */
function naivePlan(inst: Instance): Solution {
  const order = [3, 2, 1, 0]
  return inst.demand.map((want) => {
    let mask = 0
    for (const g of order) {
      if (dispatch(inst, mask, want)) break
      mask |= 1 << g
    }
    return dispatch(inst, mask, want) ? mask : PATTERNS - 1
  })
}

/** DP across the hours over which plants are lit. 8 by 16 by 16 states. */
function bestPlan(inst: Instance): Solution | null {
  const dp: number[][] = Array.from({ length: HOURS }, () => new Array(PATTERNS).fill(Infinity))
  const via: number[][] = Array.from({ length: HOURS }, () => new Array(PATTERNS).fill(0))

  for (let p = 0; p < PATTERNS; p++) {
    const c = hourCost(inst, p, inst.demand[0])
    if (c < Infinity) dp[0][p] = firingCost(inst, 0, p) + c
  }
  for (let t = 1; t < HOURS; t++) {
    for (let p = 0; p < PATTERNS; p++) {
      const c = hourCost(inst, p, inst.demand[t])
      if (c === Infinity) continue
      for (let q = 0; q < PATTERNS; q++) {
        if (dp[t - 1][q] === Infinity) continue
        const cand = dp[t - 1][q] + firingCost(inst, q, p) + c
        if (cand < dp[t][p]) {
          dp[t][p] = cand
          via[t][p] = q
        }
      }
    }
  }

  let end = -1
  for (let p = 0; p < PATTERNS; p++) {
    if (end < 0 || dp[HOURS - 1][p] < dp[HOURS - 1][end]) end = p
  }
  if (end < 0 || dp[HOURS - 1][end] === Infinity) return null
  const out = new Array(HOURS).fill(0)
  let p = end
  for (let t = HOURS - 1; t >= 0; t--) {
    out[t] = p
    p = via[t][p]
  }
  return out
}

export const unitcommit: Minigame<Instance, Solution> = {
  id: 'unitcommit',
  title: 'Keep the Lights On',
  problem: 'Unit Commitment',
  family: 'markets',
  blurb: 'Demand rises and falls through the day. Lighting a station costs money before it makes a single unit, and a lit station cannot idle below its floor, so shutting one down overnight is a gamble on the morning.',
  howTo: 'Click a cell to light that station for that hour or shut it down. The number in a lit cell is what it ends up running at. Red means the stations you have lit cannot cover that hour between them.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    for (;;) {
      const plants: Plant[] = [
        { floor: 40, ceiling: 95 + rng.int(20), perUnit: 10 + rng.int(5), standing: 170 + rng.int(70), firing: 500 + rng.int(300) },
        { floor: 20, ceiling: 55 + rng.int(15), perUnit: 16 + rng.int(6), standing: 95 + rng.int(50), firing: 230 + rng.int(160) },
        { floor: 10, ceiling: 30 + rng.int(12), perUnit: 27 + rng.int(8), standing: 30 + rng.int(25), firing: 60 + rng.int(50) },
        { floor: 5, ceiling: 20 + rng.int(12), perUnit: 34 + rng.int(10), standing: 18 + rng.int(18), firing: 35 + rng.int(35) },
      ]
      const shape = [0.5, 0.42, 0.6, 0.88, 1, 0.95, 0.72, 0.55]
      const peak = 150 + rng.int(45)
      const demand = shape.map((f) => Math.round(peak * f * (0.93 + rng.next() * 0.14)))
      const inst = { plants, demand }
      const best = bestPlan(inst)
      if (!best) continue
      const start = naivePlan(inst)
      // Only keep a day where the obvious start is well short of the answer.
      if (start.some((m, t) => !dispatch(inst, m, inst.demand[t]))) continue
      if (billOf(inst, best) / billOf(inst, start) < 0.9) return inst
    }
  },

  initial(inst): Solution {
    return naivePlan(inst)
  },

  evaluate(inst, sol) {
    const bad = sol.filter((mask, t) => !dispatch(inst, mask, inst.demand[t])).length
    if (bad > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${bad} hour${bad === 1 ? '' : 's'} the lit stations cannot cover between them.`,
      }
    }
    let firings = 0
    let before = 0
    sol.forEach((mask) => {
      firings += lit(mask).filter((g) => !((before >> g) & 1)).length
      before = mask
    })
    return {
      value: billOf(inst, sol),
      feasible: true,
      note: `Grid held all day with ${firings} station start ${firings === 1 ? 'up' : 'ups'}.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestPlan(inst) ?? new Array(HOURS).fill(PATTERNS - 1), label: 'hour by hour DP', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'ucm'
    host.appendChild(root)

    function draw(sol: Solution, ref: Solution | null) {
      const peak = Math.max(...inst.demand)
      const head = inst.demand
        .map((d, t) => {
          const ok = !!dispatch(inst, sol[t], d)
          return `<th class="${ok ? '' : 'bad'}">${9 + t}.00<em>${d}</em></th>`
        })
        .join('')

      const rows = inst.plants
        .map((p, g) => {
          const cells = inst.demand
            .map((d, t) => {
              const on = (sol[t] >> g) & 1
              const out = dispatch(inst, sol[t], d)
              const ok = !!out
              const best = !!ref && ((ref[t] >> g) & 1)
              const fresh = on && (t === 0 ? true : !((sol[t - 1] >> g) & 1))
              return `<td class="cell${on ? ' on' : ''}${on && !ok ? ' bad' : ''}${best ? ' opt' : ''}" data-g="${g}" data-t="${t}">
                  ${on ? (out ? out[g] : '!') : ''}
                  ${fresh ? '<i>fire</i>' : ''}
                </td>`
            })
            .join('')
          return `<tr>
              <th class="who">${NAMES[g]}<em>${p.floor} to ${p.ceiling}, ${p.perUnit} a unit</em><em>light it ${p.firing}</em></th>
              ${cells}
            </tr>`
        })
        .join('')

      root.innerHTML = `
        <table><thead><tr><th class="who">demand</th>${head}</tr></thead><tbody>${rows}</tbody></table>
        <div class="ucm-curve">${inst.demand
          .map((d) => `<i style="height:${(d / peak) * 100}%"></i>`)
          .join('')}</div>`

      root.querySelectorAll<HTMLElement>('.cell').forEach((el) => {
        el.addEventListener('click', () => {
          const g = Number(el.dataset.g)
          const t = Number(el.dataset.t)
          const next = [...sol]
          next[t] ^= 1 << g
          api.commit(next)
        })
      })
    }

    return {
      draw,
      destroy() {
        root.remove()
      },
    }
  },
}

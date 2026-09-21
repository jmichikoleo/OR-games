import type { Minigame, Reference, RNG } from '../core/types'

const CROPS = ['Wheat', 'Corn', 'Beet']
const UNIT = 10
const UNITS = 50
const YEARS = ['poor year', 'normal year', 'good year']

interface Instance {
  /** Cost of putting one acre of each crop in the ground. */
  plant: number[]
  /** Tonnes an acre in a normal year. */
  yields: number[]
  /** What the ground gives compared to normal, in each of the three years. */
  swing: number[]
  /** Tonnes of wheat and corn the cattle need whatever happens. */
  need: number[]
  /** What you get for a tonne, and what it costs to buy one back. */
  sell: number[]
  buy: number[]
  /** Beet above this many tonnes fetches the lower price. */
  quota: number
  beetLow: number
}
/** Acres of each crop, counted in tens. */
type Solution = number[]

/** What the year is worth once the ground has told you what it gave. */
function yearProfit(inst: Instance, sol: Solution, s: number): number {
  const acres = sol.map((u) => u * UNIT)
  let money = -acres.reduce((a, n, i) => a + n * inst.plant[i], 0)
  for (let i = 0; i < 2; i++) {
    const grown = acres[i] * inst.yields[i] * inst.swing[s]
    const over = grown - inst.need[i]
    money += over >= 0 ? over * inst.sell[i] : over * inst.buy[i]
  }
  const beet = acres[2] * inst.yields[2] * inst.swing[s]
  money += Math.min(beet, inst.quota) * inst.sell[2] + Math.max(0, beet - inst.quota) * inst.beetLow
  return money
}

const expected = (inst: Instance, sol: Solution) =>
  Math.round(YEARS.reduce((a, _, s) => a + yearProfit(inst, sol, s), 0) / YEARS.length)

/** Every split of the fifty blocks of land, 23,426 of them. */
function bestPlan(inst: Instance): Solution {
  let best: Solution = [0, 0, 0]
  let bestVal = -Infinity
  for (let a = 0; a <= UNITS; a++) {
    for (let b = 0; a + b <= UNITS; b++) {
      const sol = [a, b, UNITS - a - b]
      const v = expected(inst, sol)
      if (v > bestVal) {
        bestVal = v
        best = sol
      }
    }
  }
  return best
}

/** The plan that is right if the ground behaves exactly as it usually does. */
function normalYearPlan(inst: Instance): Solution {
  let best: Solution = [0, 0, 0]
  let bestVal = -Infinity
  for (let a = 0; a <= UNITS; a++) {
    for (let b = 0; a + b <= UNITS; b++) {
      const sol = [a, b, UNITS - a - b]
      const v = yearProfit(inst, sol, 1)
      if (v > bestVal) {
        bestVal = v
        best = sol
      }
    }
  }
  return best
}

export const twostage: Minigame<Instance, Solution> = {
  id: 'twostage',
  title: 'Before You Know',
  problem: 'Two-Stage Stochastic Program',
  family: 'stochastic',
  blurb: 'You put the seed in the ground in March and find out what the weather did in September. The plan that wins in a normal year is not the plan that wins on average, because the years you lose money in cost more than the good ones pay.',
  howTo: 'Give each crop some of the five hundred acres. The three panels show what that same plan is worth in a poor year, a normal one and a good one. You are scored on the average of the three.',
  objective: 'max',
  unit: 'profit',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      const inst: Instance = {
        plant: [140 + rng.int(30), 215 + rng.int(35), 245 + rng.int(35)],
        yields: [2.5, 3, 20],
        swing: [0.4 + rng.next() * 0.18, 1, 1.42 + rng.next() * 0.25],
        need: [200, 240],
        sell: [160 + rng.int(25), 140 + rng.int(25), 33 + rng.int(7)],
        buy: [230 + rng.int(25), 200 + rng.int(25), 0],
        quota: 5000 + rng.int(2200),
        beetLow: 8 + rng.int(6),
      }
      const best = expected(inst, bestPlan(inst))
      const naive = expected(inst, normalYearPlan(inst))
      if (best <= 0 || naive <= 0) continue
      // Only a farm where planning for a normal year actually costs you.
      // The bar drops away after a while so this can never sit here spinning.
      if (naive / best < 0.9 || tries > 300) return inst
    }
  },

  initial(inst): Solution {
    return normalYearPlan(inst)
  },

  evaluate(inst, sol) {
    const used = sol.reduce((a, n) => a + n, 0)
    if (used > UNITS) {
      return { value: 0, feasible: false, note: `${(used - UNITS) * UNIT} acres more than you have.` }
    }
    const bad = yearProfit(inst, sol, 0)
    const idle = (UNITS - used) * UNIT
    return {
      value: expected(inst, sol),
      feasible: true,
      note: idle > 0
        ? `${idle} acres left fallow, and a poor year pays ${Math.round(bad).toLocaleString()}.`
        : `A poor year pays ${Math.round(bad).toLocaleString()}.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestPlan(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'tws'
    root.innerHTML = `<div class="tws-crops" id="crops"></div><div class="tws-years" id="years"></div>`
    host.appendChild(root)
    const crops = root.querySelector('#crops') as HTMLElement
    const years = root.querySelector('#years') as HTMLElement

    function draw(sol: Solution, ref: Solution | null) {
      const used = sol.reduce((a, n) => a + n, 0)
      crops.innerHTML = ''
      CROPS.forEach((name, i) => {
        const row = document.createElement('div')
        row.className = 'tws-crop'
        row.innerHTML = `
          <b>${name}</b>
          <span class="tws-sub">${inst.plant[i]} an acre to plant, ${inst.yields[i]} tonnes an acre</span>
          ${ref ? `<em class="tws-want">solver ${ref[i] * UNIT}</em>` : ''}
          <button class="tws-step" data-d="-1">-</button>
          <span class="tws-acres">${sol[i] * UNIT}</span>
          <button class="tws-step" data-d="1">+</button>`
        row.querySelectorAll('.tws-step').forEach((b) =>
          b.addEventListener('click', () => {
            const d = Number((b as HTMLElement).dataset.d)
            const n = sol[i] + d
            if (n < 0 || (d > 0 && used >= UNITS)) return
            const next = [...sol]
            next[i] = n
            api.commit(next)
          }),
        )
        crops.appendChild(row)
      })

      const spare = (UNITS - used) * UNIT
      const tally = document.createElement('div')
      tally.className = `tws-tally${spare < 0 ? ' over' : ''}`
      tally.textContent = `${used * UNIT} of ${UNITS * UNIT} acres planted`
      crops.appendChild(tally)

      const each = YEARS.map((_, s) => yearProfit(inst, sol, s))
      const low = Math.min(...each)
      years.innerHTML = ''
      YEARS.forEach((label, s) => {
        const card = document.createElement('div')
        card.className = `tws-year${each[s] === low ? ' worst' : ''}`
        card.innerHTML = `
          <span class="tws-yl">${label}</span>
          <b>${Math.round(each[s]).toLocaleString()}</b>
          <span class="tws-ys">ground gives ${Math.round(inst.swing[s] * 100)} percent</span>`
        years.appendChild(card)
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

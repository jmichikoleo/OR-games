import type { Minigame, Reference, RNG } from '../core/types'

const ITEMS = ['Flour', 'Sugar', 'Yeast', 'Salt']
const N = ITEMS.length
const MAX_CYCLE = 12
const MAX_MULT = 8
const WEEKS = 24

interface Instance {
  /** Cost of sending the lorry at all, whatever is on it. */
  major: number
  /** Cost of putting one more line on the order. */
  minor: number[]
  /** Sacks a week, and what it costs to keep one sitting for a week. */
  use: number[]
  hold: number[]
}
/** How often the lorry runs, then how many lorries each line waits for. */
interface Solution {
  cycle: number
  every: number[]
}

const lineCost = (inst: Instance, i: number, cycle: number, k: number) =>
  inst.minor[i] / (k * cycle) + (inst.hold[i] * inst.use[i] * k * cycle) / 2

const weeklyCost = (inst: Instance, sol: Solution) =>
  Math.round(
    (inst.major / sol.cycle + ITEMS.reduce((a, _, i) => a + lineCost(inst, i, sol.cycle, sol.every[i]), 0)) * 10,
  ) / 10

/** Once the lorry runs every so many weeks, each line settles on its own,
 *  so walking the twelve cycles settles the lot. */
function bestPlan(inst: Instance): Solution {
  let best: Solution = { cycle: 1, every: new Array(N).fill(1) }
  let bestVal = Infinity
  for (let cycle = 1; cycle <= MAX_CYCLE; cycle++) {
    const every = ITEMS.map((_, i) => {
      let pick = 1
      for (let k = 2; k <= MAX_MULT; k++) {
        if (lineCost(inst, i, cycle, k) < lineCost(inst, i, cycle, pick)) pick = k
      }
      return pick
    })
    const v = weeklyCost(inst, { cycle, every })
    if (v < bestVal) {
      bestVal = v
      best = { cycle, every }
    }
  }
  return best
}

/** Everything on every lorry, which is what you do before you think about it. */
function everyTime(inst: Instance): Solution {
  let best = 1
  let bestVal = Infinity
  for (let cycle = 1; cycle <= MAX_CYCLE; cycle++) {
    const v = weeklyCost(inst, { cycle, every: new Array(N).fill(1) })
    if (v < bestVal) {
      bestVal = v
      best = cycle
    }
  }
  return { cycle: best, every: new Array(N).fill(1) }
}

export const jointrep: Minigame<Instance, Solution> = {
  id: 'jointrep',
  title: 'One Lorry',
  problem: 'Joint Replenishment',
  family: 'inventory',
  blurb: 'One lorry brings everything, and sending it costs the same whether it carries one line or four. Salt keeps forever and flour eats money sitting in the store, so the two of them do not want to arrive on the same day.',
  howTo: 'Set how often the lorry runs, then say how many lorries each line waits for. A line on two only comes on every second run. The strip shows which weeks each line actually turns up.',
  objective: 'min',
  unit: 'a week',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      // Two lines move fast and cost real money to keep, two move slowly and
      // cost real money to put on the order. That split is the whole puzzle.
      const inst: Instance = {
        major: 180 + rng.int(220),
        minor: [20 + rng.int(26), 24 + rng.int(30), 95 + rng.int(75), 120 + rng.int(90)],
        use: [45 + rng.int(50), 35 + rng.int(40), 9 + rng.int(13), 8 + rng.int(11)],
        hold: [0.9 + rng.next() * 1.3, 0.8 + rng.next() * 1.1, 0.22 + rng.next() * 0.26, 0.2 + rng.next() * 0.24].map(
          (h) => Math.round(h * 100) / 100,
        ),
      }
      const best = weeklyCost(inst, bestPlan(inst))
      const flat = weeklyCost(inst, everyTime(inst))
      // Only a store where putting everything on every lorry costs you.
      if (best / flat < 0.93 || tries > 400) return inst
    }
  },

  initial(inst): Solution {
    return everyTime(inst)
  },

  evaluate(inst, sol) {
    const rare = sol.every.filter((k) => k > 1).length
    const arrivals = ITEMS.map((_, i) => sol.cycle * sol.every[i])
    return {
      value: weeklyCost(inst, sol),
      feasible: true,
      note: rare > 0
        ? `${rare} line${rare === 1 ? '' : 's'} skip a lorry, longest gap ${Math.max(...arrivals)} weeks.`
        : `Every line on every lorry, one in each ${sol.cycle} weeks.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestPlan(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'jrp'
    root.innerHTML = `
      <div class="jrp-cycle" id="cycle"></div>
      <div class="jrp-lines" id="lines"></div>
      <div class="jrp-strip" id="strip"></div>`
    host.appendChild(root)
    const cycleEl = root.querySelector('#cycle') as HTMLElement
    const linesEl = root.querySelector('#lines') as HTMLElement
    const stripEl = root.querySelector('#strip') as HTMLElement

    function draw(sol: Solution, ref: Solution | null) {
      cycleEl.innerHTML = `
        <b>The lorry runs</b>
        <span class="jrp-sub">${inst.major} to send it out, whatever is on the back</span>
        ${ref ? `<em class="jrp-want">solver ${ref.cycle}</em>` : ''}
        <button class="jrp-step" data-d="-1">-</button>
        <span class="jrp-n">${sol.cycle}</span>
        <button class="jrp-step" data-d="1">+</button>
        <span class="jrp-unit">weekly</span>`
      cycleEl.querySelectorAll('.jrp-step').forEach((b) =>
        b.addEventListener('click', () => {
          const next = sol.cycle + Number((b as HTMLElement).dataset.d)
          if (next < 1 || next > MAX_CYCLE) return
          api.commit({ cycle: next, every: [...sol.every] })
        }),
      )

      linesEl.innerHTML = ''
      ITEMS.forEach((name, i) => {
        const row = document.createElement('div')
        row.className = 'jrp-line'
        row.style.setProperty('--who', ['#ff4d9d', '#5b8cff', '#52e68a', '#ffbe3d'][i])
        row.innerHTML = `
          <b>${name}</b>
          <span class="jrp-sub">${inst.use[i]} a week, ${inst.hold[i]} to hold one, ${inst.minor[i]} a line</span>
          ${ref ? `<em class="jrp-want">solver ${ref.every[i]}</em>` : ''}
          <button class="jrp-step" data-d="-1">-</button>
          <span class="jrp-n">${sol.every[i]}</span>
          <button class="jrp-step" data-d="1">+</button>
          <span class="jrp-unit">in ${sol.cycle * sol.every[i]} weeks</span>`
        row.querySelectorAll('.jrp-step').forEach((b) =>
          b.addEventListener('click', () => {
            const next = sol.every[i] + Number((b as HTMLElement).dataset.d)
            if (next < 1 || next > MAX_MULT) return
            const every = [...sol.every]
            every[i] = next
            api.commit({ cycle: sol.cycle, every })
          }),
        )
        linesEl.appendChild(row)
      })

      stripEl.innerHTML = ''
      const lorry = document.createElement('div')
      lorry.className = 'jrp-row'
      lorry.innerHTML = `<span class="jrp-tag">lorry</span><div class="jrp-weeks"></div>`
      const lorryWeeks = lorry.querySelector('.jrp-weeks') as HTMLElement
      for (let w = 0; w < WEEKS; w++) {
        const cell = document.createElement('i')
        cell.className = w % sol.cycle === 0 ? 'on' : ''
        lorryWeeks.appendChild(cell)
      }
      stripEl.appendChild(lorry)

      ITEMS.forEach((name, i) => {
        const gap = sol.cycle * sol.every[i]
        const row = document.createElement('div')
        row.className = 'jrp-row'
        row.style.setProperty('--who', ['#ff4d9d', '#5b8cff', '#52e68a', '#ffbe3d'][i])
        row.innerHTML = `<span class="jrp-tag">${name}</span><div class="jrp-weeks"></div>`
        const weeks = row.querySelector('.jrp-weeks') as HTMLElement
        for (let w = 0; w < WEEKS; w++) {
          const cell = document.createElement('i')
          cell.className = w % gap === 0 ? 'on who' : ''
          weeks.appendChild(cell)
        }
        stripEl.appendChild(row)
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

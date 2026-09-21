import type { Minigame, Reference, RNG } from '../core/types'

const ITEMS = 16

interface Instance {
  weights: number[]
  values: number[]
  capacity: number
}
/** Indices of the items in the bag. */
type Solution = number[]

const sum = (xs: number[], pick: Solution) => pick.reduce((a, i) => a + xs[i], 0)

/** Textbook capacity DP, with a take-table so the chosen set can be replayed. */
function bestPack(inst: Instance): Solution {
  const n = inst.weights.length
  const cap = inst.capacity
  const width = cap + 1
  const dp = new Float64Array(width)
  const take = new Uint8Array(n * width)

  for (let i = 0; i < n; i++) {
    const w = inst.weights[i]
    const v = inst.values[i]
    for (let c = cap; c >= w; c--) {
      const cand = dp[c - w] + v
      if (cand > dp[c]) {
        dp[c] = cand
        take[i * width + c] = 1
      }
    }
  }

  const chosen: Solution = []
  let c = cap
  for (let i = n - 1; i >= 0; i--) {
    if (take[i * width + c]) {
      chosen.push(i)
      c -= inst.weights[i]
    }
  }
  return chosen.reverse()
}

export const knapsack: Minigame<Instance, Solution> = {
  id: 'knapsack',
  title: 'The Heist',
  problem: '0-1 Knapsack',
  family: 'packing',
  blurb: 'One bag, a weight limit, and sixteen things worth stealing. Take the most valuable load that still fits.',
  howTo: 'Click an item to drop it in the bag or take it back out. The bar is your weight limit. Go over and the score stops counting.',
  objective: 'max',
  unit: 'val',

  generate(rng: RNG): Instance {
    const weights = Array.from({ length: ITEMS }, () => 5 + rng.int(26))
    // Value tracks weight loosely, so greedy-by-ratio gets close but not there.
    const values = weights.map((w) => w * 2 + rng.int(26))
    const total = weights.reduce((a, b) => a + b, 0)
    return { weights, values, capacity: Math.round(total * 0.42) }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const w = sum(inst.weights, sol)
    if (w > inst.capacity) {
      return { value: 0, feasible: false, note: `Over the limit by ${w - inst.capacity} kg.` }
    }
    return {
      value: sum(inst.values, sol),
      feasible: true,
      note: `${w} of ${inst.capacity} kg · ${sol.length} item${sol.length === 1 ? '' : 's'} packed.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestPack(inst), label: 'capacity DP', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'kn'
    root.innerHTML = `
      <div class="kn-gauge"><div class="kn-fill" id="fill"></div></div>
      <p class="kn-read" id="read"></p>
      <div class="kn-grid" id="grid"></div>`
    host.appendChild(root)

    const fill = root.querySelector('#fill') as HTMLElement
    const read = root.querySelector('#read') as HTMLElement
    const grid = root.querySelector('#grid') as HTMLElement

    function draw(sol: Solution, ref: Solution | null) {
      const w = sum(inst.weights, sol)
      const over = w > inst.capacity
      fill.style.width = `${Math.min(100, (w / inst.capacity) * 100)}%`
      fill.classList.toggle('over', over)
      read.textContent = `${w} / ${inst.capacity} kg`
      read.classList.toggle('over', over)

      grid.innerHTML = ''
      inst.weights.forEach((wt, i) => {
        const el = document.createElement('button')
        const on = sol.includes(i)
        const opt = !!ref && ref.includes(i)
        el.className = `kn-item${on ? ' on' : ''}${opt ? ' opt' : ''}`
        el.innerHTML = `<b>${inst.values[i]}</b><span>${wt} kg</span>`
        el.addEventListener('click', () => {
          api.commit(on ? sol.filter((x) => x !== i) : [...sol, i])
        })
        grid.appendChild(el)
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

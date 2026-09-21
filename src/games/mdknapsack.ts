import type { Minigame, Reference, RNG } from '../core/types'

const ITEMS = 14

interface Instance {
  weight: number[]
  bulk: number[]
  worth: number[]
  maxWeight: number
  maxBulk: number
}
/** Indices of the crates you loaded. */
type Solution = number[]

const sum = (xs: number[], pick: Solution) => pick.reduce((a, i) => a + xs[i], 0)

/** 2^14 loadings, checked against both limits. */
function bestLoad(inst: Instance): Solution {
  let best: Solution = []
  let bestWorth = 0
  for (let mask = 1; mask < 1 << ITEMS; mask++) {
    let w = 0
    let b = 0
    let v = 0
    for (let i = 0; i < ITEMS; i++) {
      if (!((mask >> i) & 1)) continue
      w += inst.weight[i]
      b += inst.bulk[i]
      if (w > inst.maxWeight || b > inst.maxBulk) break
      v += inst.worth[i]
    }
    if (w > inst.maxWeight || b > inst.maxBulk) continue
    if (v > bestWorth) {
      bestWorth = v
      best = Array.from({ length: ITEMS }, (_, i) => i).filter((i) => (mask >> i) & 1)
    }
  }
  return best
}

export const mdknapsack: Minigame<Instance, Solution> = {
  id: 'mdknapsack',
  title: 'Two Limits',
  problem: 'Multi-Dimensional Knapsack',
  family: 'packing',
  blurb: 'The same van, except now it runs out of floor before it runs out of axle. A crate can be light and still be the thing that stops you loading anything else.',
  howTo: 'Click a crate to load it or take it off. Both bars have to stay inside their limit, and a crate that is fine on one can still break the other.',
  objective: 'max',
  unit: 'value',

  generate(rng: RNG): Instance {
    const weight = Array.from({ length: ITEMS }, () => 4 + rng.int(21))
    const bulk = Array.from({ length: ITEMS }, () => 3 + rng.int(18))
    // Worth tracks both a bit, so neither bar alone tells you what to take.
    const worth = weight.map((w, i) => Math.round(w * 1.4 + bulk[i] * 1.6 + rng.int(22)))
    return {
      weight,
      bulk,
      worth,
      maxWeight: Math.round(weight.reduce((a, b) => a + b, 0) * 0.4),
      maxBulk: Math.round(bulk.reduce((a, b) => a + b, 0) * 0.4),
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const w = sum(inst.weight, sol)
    const b = sum(inst.bulk, sol)
    if (w > inst.maxWeight || b > inst.maxBulk) {
      const bits: string[] = []
      if (w > inst.maxWeight) bits.push(`${w - inst.maxWeight} over on weight`)
      if (b > inst.maxBulk) bits.push(`${b - inst.maxBulk} over on space`)
      return { value: 0, feasible: false, note: `${bits.join(' and ')}.` }
    }
    return {
      value: sum(inst.worth, sol),
      feasible: true,
      note: `${w} of ${inst.maxWeight} weight and ${b} of ${inst.maxBulk} space used.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestLoad(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'mdk'
    root.innerHTML = `
      <div class="mdk-gauges">
        <div class="mdk-gauge"><span class="mdk-tag" id="wtag"></span><i id="wfill"></i></div>
        <div class="mdk-gauge"><span class="mdk-tag" id="btag"></span><i id="bfill"></i></div>
      </div>
      <div class="mdk-grid" id="grid"></div>`
    host.appendChild(root)

    const wfill = root.querySelector('#wfill') as HTMLElement
    const bfill = root.querySelector('#bfill') as HTMLElement
    const wtag = root.querySelector('#wtag') as HTMLElement
    const btag = root.querySelector('#btag') as HTMLElement
    const grid = root.querySelector('#grid') as HTMLElement

    function draw(sol: Solution, ref: Solution | null) {
      const w = sum(inst.weight, sol)
      const b = sum(inst.bulk, sol)
      wfill.style.width = `${Math.min(100, (w / inst.maxWeight) * 100)}%`
      bfill.style.width = `${Math.min(100, (b / inst.maxBulk) * 100)}%`
      wfill.classList.toggle('over', w > inst.maxWeight)
      bfill.classList.toggle('over', b > inst.maxBulk)
      wtag.textContent = `weight ${w} of ${inst.maxWeight}`
      btag.textContent = `space ${b} of ${inst.maxBulk}`
      wtag.classList.toggle('over', w > inst.maxWeight)
      btag.classList.toggle('over', b > inst.maxBulk)

      grid.innerHTML = ''
      inst.worth.forEach((v, i) => {
        const on = sol.includes(i)
        const opt = !!ref && ref.includes(i)
        const el = document.createElement('button')
        el.className = `mdk-item${on ? ' on' : ''}${opt ? ' opt' : ''}`
        el.innerHTML = `<b>${v}</b><span>${inst.weight[i]} kg</span><span>${inst.bulk[i]} sp</span>`
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

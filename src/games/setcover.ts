import type { Minigame, Reference, RNG } from '../core/types'

const M = 18
const S = 10

interface Instance {
  /** Element ids covered by each candidate station. */
  sets: number[][]
  masks: number[]
}
/** Chosen station indices. */
type Solution = number[]

const coverOf = (inst: Instance, sol: Solution) =>
  sol.reduce((mask, i) => mask | inst.masks[i], 0)

const FULL = (1 << M) - 1

const popcount = (x: number) => {
  let c = 0
  while (x) {
    x &= x - 1
    c++
  }
  return c
}

export const setcover: Minigame<Instance, Solution> = {
  id: 'setcover',
  title: 'Fire Stations',
  problem: 'Set Covering',
  family: 'covering',
  blurb: 'Eighteen districts, ten possible stations. Each station reaches a fixed handful of districts. Open the fewest that still reach all eighteen.',
  howTo: 'Click a station to open or close it. The bar under each one shows the districts it reaches. The row up top shows what is still uncovered.',
  objective: 'min',
  unit: 'sets',

  generate(rng: RNG): Instance {
    const sets: number[][] = Array.from({ length: S }, () => {
      const pick = new Set<number>()
      const size = 4 + rng.int(4)
      while (pick.size < size) pick.add(rng.int(M))
      return [...pick].sort((a, b) => a - b)
    })

    // Guarantee the instance is solvable at all.
    for (let e = 0; e < M; e++) {
      if (!sets.some((s) => s.includes(e))) {
        const target = sets[rng.int(S)]
        target.push(e)
        target.sort((a, b) => a - b)
      }
    }

    return { sets, masks: sets.map((s) => s.reduce((m, e) => m | (1 << e), 0)) }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const missing = M - popcount(coverOf(inst, sol))
    if (missing > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${missing} district${missing === 1 ? '' : 's'} with no station in reach.`,
      }
    }
    return {
      value: sol.length,
      feasible: true,
      note: `All 18 districts covered by ${sol.length} station${sol.length === 1 ? '' : 's'}.`,
    }
  },

  solve(inst): Reference<Solution> {
    // 2^10 subsets — small enough to just look at all of them.
    let best: Solution = []
    let bestCount = Infinity
    for (let sub = 1; sub < 1 << S; sub++) {
      const count = popcount(sub)
      if (count >= bestCount) continue
      let cov = 0
      for (let i = 0; i < S; i++) if (sub & (1 << i)) cov |= inst.masks[i]
      if (cov === FULL) {
        bestCount = count
        best = Array.from({ length: S }, (_, i) => i).filter((i) => sub & (1 << i))
      }
    }
    return { solution: best, label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'sc'
    root.innerHTML = `
      <div class="sc-top">
        <h3>districts</h3>
        <div class="sc-universe" id="uni"></div>
      </div>
      <div class="sc-sets" id="sets"></div>`
    host.appendChild(root)

    const uni = root.querySelector('#uni') as HTMLElement
    const list = root.querySelector('#sets') as HTMLElement

    function draw(sol: Solution, ref: Solution | null) {
      const cov = coverOf(inst, sol)

      uni.innerHTML = ''
      for (let e = 0; e < M; e++) {
        const chip = document.createElement('span')
        chip.className = `sc-el${cov & (1 << e) ? ' on' : ''}`
        chip.textContent = String(e + 1)
        uni.appendChild(chip)
      }

      list.innerHTML = ''
      inst.sets.forEach((set, i) => {
        const on = sol.includes(i)
        const opt = !!ref && ref.includes(i)
        const el = document.createElement('button')
        el.className = `sc-set${on ? ' on' : ''}${opt ? ' opt' : ''}`
        const bits = Array.from({ length: M }, (_, e) =>
          `<i class="${set.includes(e) ? 'in' : ''}"></i>`,
        ).join('')
        el.innerHTML = `
          <span class="sc-name">Station ${i + 1}<em>${set.length}</em></span>
          <span class="sc-bits">${bits}</span>`
        el.addEventListener('click', () => {
          api.commit(on ? sol.filter((x) => x !== i) : [...sol, i])
        })
        list.appendChild(el)
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

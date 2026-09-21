import type { Minigame, Reference, RNG } from '../core/types'
import { minCostPlan } from '../core/flow'

const DEPOTS = ['North', 'Mid', 'South']
const STORES = ['Ash', 'Birch', 'Cedar', 'Dell']
const W = DEPOTS.length
const S = STORES.length

interface Instance {
  supply: number[]
  demand: number[]
  /** cost[depot][store] per unit shipped. */
  cost: number[][]
}
/** ship[depot][store] */
type Solution = number[][]

const rowSum = (sol: Solution, i: number) => sol[i].reduce((a, b) => a + b, 0)
const colSum = (sol: Solution, j: number) => sol.reduce((a, r) => a + r[j], 0)
const totalCost = (inst: Instance, sol: Solution) =>
  sol.reduce((a, row, i) => a + row.reduce((b, x, j) => b + x * inst.cost[i][j], 0), 0)

export function cheapestPlan(inst: Instance): Solution {
  return minCostPlan(inst.supply, inst.demand, inst.cost)
}

export const transportation: Minigame<Instance, Solution> = {
  id: 'transportation',
  title: 'Freight',
  problem: 'Transportation Problem',
  family: 'assignment',
  blurb: 'Three depots hold stock, four shops need it, and every depot-to-shop run costs a different amount per unit. Empty the depots for the least money.',
  howTo: 'Click a cell to send one more unit down that route. Click the minus to take one back. The small number is what each unit costs on that run.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    const demand = Array.from({ length: S }, () => 4 + rng.int(6))
    const total = demand.reduce((a, b) => a + b, 0)
    // Split the same total across the depots, so supply and demand balance.
    const supply = new Array(W).fill(0)
    for (let k = 0; k < total; k++) supply[rng.int(W)]++
    return {
      supply,
      demand,
      cost: Array.from({ length: W }, () => Array.from({ length: S }, () => 2 + rng.int(17))),
    }
  },

  initial(): Solution {
    return Array.from({ length: W }, () => new Array(S).fill(0))
  },

  evaluate(inst, sol) {
    const shipped = sol.reduce((a, r) => a + r.reduce((b, x) => b + x, 0), 0)
    const total = inst.supply.reduce((a, b) => a + b, 0)
    if (shipped < total) {
      const left = total - shipped
      return { value: 0, feasible: false, note: `${left} unit${left === 1 ? '' : 's'} still sitting in the depots.` }
    }
    return {
      value: totalCost(inst, sol),
      feasible: true,
      note: 'Every depot emptied, every shop filled.',
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: cheapestPlan(inst), label: 'min-cost flow', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'trn'
    host.appendChild(root)

    function draw(sol: Solution, ref: Solution | null) {
      const head = STORES.map(
        (name, j) =>
          `<th>${name}<em>${colSum(sol, j)}/${inst.demand[j]}</em></th>`,
      ).join('')

      const rows = DEPOTS.map((name, i) => {
        const cells = STORES.map((_, j) => {
          const x = sol[i][j]
          const refX = ref ? ref[i][j] : null
          return `<td class="cell${x > 0 ? ' on' : ''}" data-i="${i}" data-j="${j}">
            ${x > 0 ? `<button class="minus" data-i="${i}" data-j="${j}">&minus;</button>` : ''}
            <b>${x > 0 ? x : '\u00b7'}</b><i>${inst.cost[i][j]}</i>
            ${refX !== null ? `<u>${refX}</u>` : ''}
          </td>`
        }).join('')
        return `<tr><th class="who">${name}<em>${rowSum(sol, i)}/${inst.supply[i]}</em></th>${cells}</tr>`
      }).join('')

      root.innerHTML = `
        <table><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>
        <p class="trn-key"><span><b>4</b> units sent</span><span><i>9</i> cost each</span>${ref ? '<span><u>4</u> what min-cost flow sends</span>' : ''}</p>`

      root.querySelectorAll<HTMLElement>('.cell').forEach((el) => {
        el.addEventListener('click', () => {
          const i = Number(el.dataset.i)
          const j = Number(el.dataset.j)
          if (rowSum(sol, i) >= inst.supply[i]) return
          if (colSum(sol, j) >= inst.demand[j]) return
          const next = sol.map((r) => [...r])
          next[i][j]++
          api.commit(next)
        })
      })

      root.querySelectorAll<HTMLElement>('.minus').forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          const i = Number(el.dataset.i)
          const j = Number(el.dataset.j)
          const next = sol.map((r) => [...r])
          next[i][j] = Math.max(0, next[i][j] - 1)
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

import type { Minigame, Reference, RNG } from '../core/types'

const N = 7
const CREW = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus']
const TASKS = ['Weld', 'Wire', 'Paint', 'Test', 'Pack', 'Mill', 'Ship']

interface Instance {
  /** cost[worker][task], in hours. */
  cost: number[][]
}
/** solution[worker] = task index, or -1 when that worker is idle. */
type Solution = number[]

/**
 * Hungarian algorithm, shortest-augmenting-path form: O(n^3) and exact.
 * Exported so it can be fuzz-checked against brute force.
 */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length
  const INF = Infinity
  const u = new Float64Array(n + 1)
  const v = new Float64Array(n + 1)
  const p = new Int32Array(n + 1)
  const way = new Int32Array(n + 1)

  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Float64Array(n + 1).fill(INF)
    const used = new Array(n + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = INF
      let j1 = 0
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else {
          minv[j] -= delta
        }
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0)
  }

  const ans = new Array(n).fill(-1)
  for (let j = 1; j <= n; j++) if (p[j] > 0) ans[p[j] - 1] = j - 1
  return ans
}

export const assignment: Minigame<Instance, Solution> = {
  id: 'assignment',
  title: 'Crew Call',
  problem: 'Linear Assignment',
  family: 'assignment',
  blurb: 'Seven of the crew, seven jobs, one each. The grid is how many hours each person needs for each job. Find the cheapest pairing.',
  howTo: 'Click a cell to put that person on that job. Anyone already holding the job or the person steps aside automatically.',
  objective: 'min',
  unit: 'hrs',

  generate(rng: RNG): Instance {
    return {
      cost: Array.from({ length: N }, () => Array.from({ length: N }, () => 3 + rng.int(22))),
    }
  },

  initial(): Solution {
    return new Array(N).fill(-1)
  },

  evaluate(inst, sol) {
    const idle = sol.filter((t) => t < 0).length
    if (idle > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${idle} job${idle === 1 ? '' : 's'} still uncovered.`,
      }
    }
    return {
      value: sol.reduce((a, t, w) => a + inst.cost[w][t], 0),
      feasible: true,
      note: 'Everyone has exactly one job.',
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: hungarian(inst.cost), label: 'Hungarian', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'asg'
    host.appendChild(root)

    function draw(sol: Solution, ref: Solution | null) {
      const head = TASKS.map((t) => `<th>${t}</th>`).join('')
      const rows = CREW.map((name, w) => {
        const cells = TASKS.map((_, t) => {
          const on = sol[w] === t
          const opt = !!ref && ref[w] === t
          return `<td class="cell${on ? ' on' : ''}${opt ? ' opt' : ''}" data-w="${w}" data-t="${t}">${inst.cost[w][t]}</td>`
        }).join('')
        return `<tr><th class="who">${name}</th>${cells}</tr>`
      }).join('')
      root.innerHTML = `<table><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`

      root.querySelectorAll<HTMLElement>('.cell').forEach((el) => {
        el.addEventListener('click', () => {
          const w = Number(el.dataset.w)
          const t = Number(el.dataset.t)
          const next = [...sol]
          // A job can only be held by one person, so whoever had it steps aside.
          for (let i = 0; i < next.length; i++) if (next[i] === t) next[i] = -1
          next[w] = sol[w] === t ? -1 : t
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

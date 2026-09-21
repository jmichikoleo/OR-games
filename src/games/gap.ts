import type { Minigame, Reference, RNG } from '../core/types'

const CREW = ['Ash', 'Brook', 'Clay', 'Dune']
const AGENTS = CREW.length
const JOBS = 9

interface Instance {
  /** hours[job][agent] and fee[job][agent] */
  hours: number[][]
  fee: number[][]
  /** Hours each contractor has free this week. */
  free: number[]
}
/** Which contractor took each job, or -1 while it is unclaimed. */
type Solution = number[]

const loadOf = (inst: Instance, sol: Solution) => {
  const l = new Array(AGENTS).fill(0)
  sol.forEach((a, j) => {
    if (a >= 0) l[a] += inst.hours[j][a]
  })
  return l
}

const billOf = (inst: Instance, sol: Solution) =>
  sol.reduce((a, who, j) => a + (who >= 0 ? inst.fee[j][who] : 0), 0)

/** Every one of the 4^9 ways to hand the jobs out. */
function cheapestSplit(inst: Instance): Solution | null {
  const total = Math.pow(AGENTS, JOBS)
  const pick = new Array(JOBS).fill(0)
  let best: Solution | null = null
  let bestFee = Infinity

  for (let code = 0; code < total; code++) {
    let c = code
    for (let j = 0; j < JOBS; j++) {
      pick[j] = c % AGENTS
      c = Math.floor(c / AGENTS)
    }
    const load = new Array(AGENTS).fill(0)
    let fee = 0
    let ok = true
    for (let j = 0; j < JOBS; j++) {
      const a = pick[j]
      load[a] += inst.hours[j][a]
      if (load[a] > inst.free[a]) {
        ok = false
        break
      }
      fee += inst.fee[j][a]
    }
    if (ok && fee < bestFee) {
      bestFee = fee
      best = [...pick]
    }
  }
  return best
}

export const gap: Minigame<Instance, Solution> = {
  id: 'gap',
  title: 'Split the Work',
  problem: 'Generalized Assignment',
  family: 'assignment',
  blurb: 'Nine jobs and four contractors. Each one charges differently and takes a different number of hours, and none of them has a spare week.',
  howTo: 'Click a cell to hand that job to that contractor. The big number is the fee and the small one is the hours it takes them. A contractor over their hours turns red.',
  objective: 'min',
  unit: 'fee',

  generate(rng: RNG): Instance {
    for (;;) {
      const hours = Array.from({ length: JOBS }, () =>
        Array.from({ length: AGENTS }, () => 3 + rng.int(8)),
      )
      const fee = Array.from({ length: JOBS }, () =>
        Array.from({ length: AGENTS }, () => 5 + rng.int(20)),
      )
      const free = Array.from({ length: AGENTS }, () => 17 + rng.int(7))
      const inst = { hours, fee, free }
      // Only hand out a board somebody can actually finish.
      if (cheapestSplit(inst)) return inst
    }
  },

  initial(): Solution {
    return new Array(JOBS).fill(-1)
  },

  evaluate(inst, sol) {
    const load = loadOf(inst, sol)
    const over = load.filter((l, a) => l > inst.free[a]).length
    if (over > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${over} contractor${over === 1 ? ' is' : 's are'} booked past their hours.`,
      }
    }
    const left = sol.filter((a) => a < 0).length
    if (left > 0) {
      return { value: 0, feasible: false, note: `${left} job${left === 1 ? '' : 's'} nobody has taken.` }
    }
    return {
      value: billOf(inst, sol),
      feasible: true,
      note: `Every job placed and nobody over their hours.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: cheapestSplit(inst) ?? new Array(JOBS).fill(0), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'gap'
    host.appendChild(root)

    function draw(sol: Solution, ref: Solution | null) {
      const load = loadOf(inst, sol)
      const head = CREW.map(
        (n, a) =>
          `<th class="${load[a] > inst.free[a] ? 'over' : ''}">${n}<em>${load[a]} of ${inst.free[a]} hrs</em></th>`,
      ).join('')

      const rows = Array.from({ length: JOBS }, (_, j) => {
        const cells = CREW.map((_, a) => {
          const on = sol[j] === a
          const opt = !!ref && ref[j] === a
          const bad = on && load[a] > inst.free[a]
          return `<td class="cell${on ? ' on' : ''}${opt ? ' opt' : ''}${bad ? ' over' : ''}" data-j="${j}" data-a="${a}">
            <b>${inst.fee[j][a]}</b><i>${inst.hours[j][a]}h</i>
          </td>`
        }).join('')
        return `<tr><th class="who">Job ${j + 1}</th>${cells}</tr>`
      }).join('')

      root.innerHTML = `
        <table><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>
        <p class="gap-key"><span><b>14</b> the fee</span><span><i>6h</i> hours it takes them</span></p>`

      root.querySelectorAll<HTMLElement>('.cell').forEach((el) => {
        el.addEventListener('click', () => {
          const j = Number(el.dataset.j)
          const a = Number(el.dataset.a)
          const next = [...sol]
          next[j] = sol[j] === a ? -1 : a
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

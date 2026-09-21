import type { Minigame, Reference, RNG } from '../core/types'

const LINES = ['Letters', 'Parcels', 'Bulk', 'Returns', 'Express']
const DESKS = LINES.length
const POOL = 20

interface Instance {
  /** Items an hour turning up at each line. */
  arrive: number[]
  /** Items an hour one module adds to that line. */
  step: number[]
}
/** Modules on each line. */
type Solution = number[]

const rateOf = (inst: Instance, sol: Solution, i: number) => sol[i] * inst.step[i]

/** Items sitting in the depot waiting on a line, the M/M/1 answer. */
const waitingOn = (inst: Instance, sol: Solution, i: number) => {
  const mu = rateOf(inst, sol, i)
  if (mu <= inst.arrive[i]) return Infinity
  return inst.arrive[i] / (mu - inst.arrive[i])
}

const totalWaiting = (inst: Instance, sol: Solution) =>
  Math.round(LINES.reduce((a, _, i) => a + waitingOn(inst, sol, i), 0) * 10) / 10

/** Fewest modules a line needs before its queue stops running away. */
const leastFor = (inst: Instance, i: number) => Math.floor(inst.arrive[i] / inst.step[i]) + 1

/** Every way of splitting the twenty modules five ways. */
function bestSplit(inst: Instance): Solution | null {
  let best: Solution | null = null
  let bestVal = Infinity
  const acc = new Array(DESKS).fill(0)
  const walk = (i: number, left: number) => {
    if (i === DESKS - 1) {
      acc[i] = left
      const v = totalWaiting(inst, acc)
      if (v < bestVal) {
        bestVal = v
        best = [...acc]
      }
      return
    }
    for (let n = 0; n <= left; n++) {
      acc[i] = n
      walk(i + 1, left - n)
    }
  }
  walk(0, POOL)
  return best
}

/** The start that looks sensible. Give every line just enough to cope, then
 *  pile whatever is spare onto the one with the longest queue of arrivals. */
function naiveSplit(inst: Instance): Solution {
  const out = LINES.map((_, i) => leastFor(inst, i))
  const spare = POOL - out.reduce((a, n) => a + n, 0)
  let busiest = 0
  inst.arrive.forEach((a, i) => {
    if (a > inst.arrive[busiest]) busiest = i
  })
  out[busiest] += Math.max(0, spare)
  return out
}

export const queuestaff: Minigame<Instance, Solution> = {
  id: 'queuestaff',
  title: 'Breaking Point',
  problem: 'M/M/1 Queue Staffing',
  family: 'stochastic',
  blurb: 'Five sorting lines and twenty modules to share out. A line just barely keeping up is far worse than a line comfortably keeping up, and the difference is not gentle. It runs away from you near the edge.',
  howTo: 'Move modules between lines. A line needs to clear items faster than they turn up or its queue never stops growing, and the closer it sits to that edge the longer the queue gets.',
  objective: 'min',
  unit: 'waiting',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      const inst: Instance = {
        arrive: LINES.map(() => 9 + rng.int(20)),
        step: LINES.map(() => 5 + rng.int(6)),
      }
      const least = LINES.reduce((a, _, i) => a + leastFor(inst, i), 0)
      // Enough spare modules to make the split a real choice.
      if (least > POOL - 5 || least < POOL - 11) continue
      const best = bestSplit(inst)
      if (!best) continue
      const naive = naiveSplit(inst)
      if (totalWaiting(inst, best) / totalWaiting(inst, naive) < 0.75 || tries > 400) return inst
    }
  },

  initial(inst): Solution {
    return naiveSplit(inst)
  },

  evaluate(inst, sol) {
    const spent = sol.reduce((a, n) => a + n, 0)
    if (spent > POOL) {
      return { value: 0, feasible: false, note: `${spent - POOL} modules more than you have.` }
    }
    const drowning = LINES.filter((_, i) => rateOf(inst, sol, i) <= inst.arrive[i])
    if (drowning.length) {
      return {
        value: 0,
        feasible: false,
        note: `${drowning.join(' and ')} cannot keep up at all.`,
      }
    }
    const spare = POOL - spent
    return {
      value: totalWaiting(inst, sol),
      feasible: true,
      note: spare > 0
        ? `${spare} module${spare === 1 ? '' : 's'} still sitting in the cupboard.`
        : 'Every module is out on a line.',
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestSplit(inst)!, label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'qst'
    root.innerHTML = `<div class="qst-pool" id="spare"></div><div class="qst-lines" id="lines"></div>`
    host.appendChild(root)
    const spareEl = root.querySelector('#spare') as HTMLElement
    const linesEl = root.querySelector('#lines') as HTMLElement

    function draw(sol: Solution, ref: Solution | null) {
      const spent = sol.reduce((a, n) => a + n, 0)
      spareEl.textContent = `${POOL - spent} of ${POOL} modules still in the cupboard`
      spareEl.classList.toggle('over', spent > POOL)

      linesEl.innerHTML = ''
      LINES.forEach((name, i) => {
        const mu = rateOf(inst, sol, i)
        const q = waitingOn(inst, sol, i)
        const drowning = !Number.isFinite(q)
        const row = document.createElement('div')
        row.className = `qst-line${drowning ? ' over' : ''}`
        row.innerHTML = `
          <div class="qst-top">
            <b>${name}</b>
            <span>${inst.arrive[i]} in an hour, ${mu} out</span>
            ${ref ? `<em class="qst-want">solver ${ref[i]}</em>` : ''}
          </div>
          <div class="qst-bar"><i style="width:${drowning ? 100 : Math.min(100, (q / 9) * 100)}%"></i></div>
          <div class="qst-foot">
            <span class="qst-q">${drowning ? 'queue runs away' : `${q.toFixed(1)} waiting`}</span>
            <button class="qst-step" data-d="-1">-</button>
            <span class="qst-n">${sol[i]}</span>
            <button class="qst-step" data-d="1">+</button>
            <span class="qst-rate">${inst.step[i]} an hour each</span>
          </div>`
        row.querySelectorAll('.qst-step').forEach((b) =>
          b.addEventListener('click', () => {
            const d = Number((b as HTMLElement).dataset.d)
            const n = sol[i] + d
            if (n < 0 || (d > 0 && spent >= POOL)) return
            const next = [...sol]
            next[i] = n
            api.commit(next)
          }),
        )
        linesEl.appendChild(row)
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

import type { Minigame, Reference, RNG } from '../core/types'

const STAGES = ['Mill', 'Weave', 'Dye', 'Cut', 'Shop']
const N = STAGES.length
/** How many days of cover a buffer has to carry. Folded into one number. */
const COVER = 11

interface Instance {
  /** Working days each stage takes once it has what it needs. */
  work: number[]
  /** What a day of stock costs sitting at that stage, once the value is in it. */
  hold: number[]
  /** Days the shop is allowed to keep a customer waiting. */
  promise: number
}
/** Days each stage promises the next one down. */
type Solution = number[]

/** Days a stage has to cover on its own. What it waits for, plus its own
 *  work, less whatever it makes the next stage wait. */
const coverDays = (inst: Instance, sol: Solution, i: number) =>
  (i === 0 ? 0 : sol[i - 1]) + inst.work[i] - sol[i]

const bufferAt = (inst: Instance, sol: Solution, i: number) =>
  inst.hold[i] * COVER * Math.sqrt(Math.max(0, coverDays(inst, sol, i)))

const billOf = (inst: Instance, sol: Solution) =>
  Math.round(STAGES.reduce((a, _, i) => a + bufferAt(inst, sol, i), 0) * 10) / 10

function broken(inst: Instance, sol: Solution): number[] {
  const out: number[] = []
  STAGES.forEach((_, i) => {
    if (sol[i] < 0 || coverDays(inst, sol, i) < 0) out.push(i)
  })
  return out
}

/** Walk down the chain. All that matters at each stage is what the one above
 *  it promised, so the answer falls out in a couple of hundred steps. */
function bestChain(inst: Instance): Solution {
  const span = inst.work.reduce((a, d) => a + d, 0)
  const cost: number[][] = Array.from({ length: N + 1 }, () => new Array(span + 1).fill(Infinity))
  const pick: number[][] = Array.from({ length: N + 1 }, () => new Array(span + 1).fill(0))
  for (let wait = 0; wait <= span; wait++) cost[N][wait] = 0
  for (let i = N - 1; i >= 0; i--) {
    for (let wait = 0; wait <= span; wait++) {
      const most = wait + inst.work[i]
      for (let quote = 0; quote <= most; quote++) {
        if (i === N - 1 && quote > inst.promise) break
        if (quote > span) break
        const here = inst.hold[i] * COVER * Math.sqrt(most - quote) + cost[i + 1][quote]
        if (here < cost[i][wait]) {
          cost[i][wait] = here
          pick[i][wait] = quote
        }
      }
    }
  }
  const sol = new Array(N).fill(0)
  let wait = 0
  for (let i = 0; i < N; i++) {
    sol[i] = pick[i][wait]
    wait = sol[i]
  }
  return sol
}

/** Everybody promises the next one down same day, so every stage carries a
 *  full buffer of its own. Safe, tidy, and the dearest thing you can do. */
const allZero = (): Solution => new Array(N).fill(0)

export const safetystock: Minigame<Instance, Solution> = {
  id: 'safetystock',
  title: 'Where the Buffer Goes',
  problem: 'Safety Stock Placement',
  family: 'inventory',
  blurb: 'Five stages from raw cloth to the shop floor, and every one of them can promise the next a delivery time. Promise nothing and you carry a buffer yourself. Promise days you do not have and the stage below carries it instead, on cloth that has already had all the value put into it.',
  howTo: 'Set how many days each stage makes the next one wait. A stage covers what it waits for plus its own work, less what it passes on, and a buffer costs more the further down the chain it sits.',
  objective: 'min',
  unit: 'holding',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      const hold: number[] = []
      let v = 1 + rng.next() * 1.5
      for (let i = 0; i < N; i++) {
        hold.push(Math.round(v * 10) / 10)
        v *= 1.5 + rng.next() * 1.1
      }
      const inst: Instance = {
        work: STAGES.map(() => 2 + rng.int(7)),
        hold,
        promise: rng.int(4),
      }
      const best = billOf(inst, bestChain(inst))
      const flat = billOf(inst, allZero())
      if (flat <= 0) continue
      // Only a chain where everybody promising same day is a poor answer.
      if (best / flat < 0.78 || tries > 200) return inst
    }
  },

  initial(): Solution {
    return allZero()
  },

  evaluate(inst, sol) {
    if (sol[N - 1] > inst.promise) {
      return {
        value: 0,
        feasible: false,
        note: `The shop is promising ${sol[N - 1]} days and only ${inst.promise} were agreed.`,
      }
    }
    const bad = broken(inst, sol)
    if (bad.length) {
      return {
        value: 0,
        feasible: false,
        note: `${STAGES[bad[0]]} is promising sooner than it can possibly manage.`,
      }
    }
    const holders = STAGES.filter((_, i) => coverDays(inst, sol, i) > 0).length
    return {
      value: billOf(inst, sol),
      feasible: true,
      note: `${holders} of ${N} stages carrying a buffer.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestChain(inst), label: 'chain DP', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'sfs'
    host.appendChild(root)

    function draw(sol: Solution, ref: Solution | null) {
      const bad = new Set(broken(inst, sol))
      const costs = STAGES.map((_, i) => bufferAt(inst, sol, i))
      const worst = Math.max(...costs, 1)
      root.innerHTML = ''
      STAGES.forEach((name, i) => {
        const days = coverDays(inst, sol, i)
        const over = bad.has(i) || (i === N - 1 && sol[i] > inst.promise)
        const card = document.createElement('div')
        card.className = `sfs-stage${over ? ' over' : ''}${days <= 0 ? ' bare' : ''}`
        card.innerHTML = `
          <div class="sfs-top"><b>${name}</b><span>${inst.work[i]} days of work, ${inst.hold[i]} a day to hold</span></div>
          <div class="sfs-bar"><i style="height:${Math.max(3, (costs[i] / worst) * 100)}%"></i></div>
          <div class="sfs-foot">
            <span class="sfs-cover">${over ? 'cannot be done' : days > 0 ? `covers ${days} days` : 'no buffer'}</span>
            <span class="sfs-cost">${Math.round(costs[i] * 10) / 10}</span>
          </div>
          <div class="sfs-set">
            <button class="sfs-step" data-d="-1">-</button>
            <span class="sfs-n">${sol[i]}</span>
            <button class="sfs-step" data-d="1">+</button>
            <span class="sfs-lab">days promised${i === N - 1 ? `, ${inst.promise} agreed` : ''}</span>
          </div>
          ${ref ? `<em class="sfs-want">solver ${ref[i]}</em>` : ''}`
        card.querySelectorAll('.sfs-step').forEach((b) =>
          b.addEventListener('click', () => {
            const next = [...sol]
            next[i] += Number((b as HTMLElement).dataset.d)
            if (next[i] < 0) return
            api.commit(next)
          }),
        )
        root.appendChild(card)
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

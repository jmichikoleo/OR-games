import type { Minigame, Reference, RNG } from '../core/types'

const SLOTS = 8
const SHIFTS = 5
const SHIFT_LEN = 4
const TARGET_WAIT = 0.2

interface Instance {
  /** Calls arriving in each half hour. */
  calls: number[]
  /** Average minutes on a call. */
  handling: number
  /** Agents each half hour has to have on to hit the service target. */
  need: number[]
}
/** Agents you rostered onto each shift. */
type Solution = number[]

const covers = (shift: number, slot: number) => slot >= shift && slot < shift + SHIFT_LEN

/** Erlang C, through the Erlang B recursion so it stays well behaved. */
function waitChance(agents: number, load: number): number {
  if (agents <= load) return 1
  let b = 1
  for (let n = 1; n <= agents; n++) b = (load * b) / (n + load * b)
  return (agents * b) / (agents - load * (1 - b))
}

function agentsNeeded(load: number): number {
  for (let c = 1; c <= 60; c++) if (waitChance(c, load) <= TARGET_WAIT) return c
  return 60
}

const onDuty = (sol: Solution) =>
  Array.from({ length: SLOTS }, (_, t) =>
    sol.reduce((a, n, sh) => a + (covers(sh, t) ? n : 0), 0),
  )

const rostered = (sol: Solution) => sol.reduce((a, b) => a + b, 0)

/** Depth first over the five shifts, pruned on the running total. */
function leanestRoster(inst: Instance): Solution {
  const cap = Math.max(...inst.need)
  const pick = new Array(SHIFTS).fill(0)
  let best = new Array(SHIFTS).fill(cap)
  let bestTotal = cap * SHIFTS

  const walk = (sh: number, used: number) => {
    if (used >= bestTotal) return
    if (sh === SHIFTS) {
      const duty = onDuty(pick)
      if (inst.need.every((n, t) => duty[t] >= n)) {
        bestTotal = used
        best = [...pick]
      }
      return
    }
    // Once this shift is set, every slot it is the last to touch must be covered.
    for (let n = 0; n <= cap; n++) {
      pick[sh] = n
      const duty = onDuty(pick)
      let ok = true
      for (let t = 0; t <= sh; t++) {
        const lastShift = Math.min(SHIFTS - 1, t)
        if (sh >= lastShift && duty[t] < inst.need[t]) {
          ok = false
          break
        }
      }
      if (ok) walk(sh + 1, used + n)
    }
    pick[sh] = 0
  }
  walk(0, 0)
  return best
}

export const erlang: Minigame<Instance, Solution> = {
  id: 'erlang',
  title: 'On the Phones',
  problem: 'Erlang Call-Centre Staffing',
  family: 'stochastic',
  blurb: 'Calls come in waves across the day and the maths says how many people each half hour needs. Trouble is you hire whole shifts, not half hours.',
  howTo: 'Put agents on a shift and they cover all four of its half hours. Any half hour short of what it needs turns red. Nobody minds being overstaffed except your budget.',
  objective: 'min',
  unit: 'agents',

  generate(rng: RNG): Instance {
    const handling = 4 + rng.int(3)
    const calls = Array.from({ length: SLOTS }, () => 18 + rng.int(38))
    return {
      calls,
      handling,
      need: calls.map((c) => agentsNeeded((c * handling) / 30)),
    }
  },

  initial(): Solution {
    return new Array(SHIFTS).fill(0)
  },

  evaluate(inst, sol) {
    const duty = onDuty(sol)
    const short = inst.need.filter((n, t) => duty[t] < n).length
    if (short > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${short} half hour${short === 1 ? '' : 's'} short of what the queue needs.`,
      }
    }
    const spare = duty.reduce((a, d, t) => a + (d - inst.need[t]), 0)
    return {
      value: rostered(sol),
      feasible: true,
      note: `${rostered(sol)} agents rostered, with ${spare} half hour slots of slack.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: leanestRoster(inst), label: 'pruned search', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'erl'
    host.appendChild(root)

    function draw(sol: Solution, ref: Solution | null) {
      const duty = onDuty(sol)
      const peak = Math.max(...inst.need, ...duty, 1)

      const slots = Array.from({ length: SLOTS }, (_, t) => {
        const short = duty[t] < inst.need[t]
        const hour = 9 + Math.floor(t / 2)
        const half = t % 2 ? '30' : '00'
        return `<div class="erl-slot${short ? ' short' : ''}">
            <span class="erl-time">${hour}.${half}</span>
            <div class="erl-bars">
              <i class="erl-have" style="height:${(duty[t] / peak) * 100}%"></i>
              <i class="erl-need" style="bottom:${(inst.need[t] / peak) * 100}%"></i>
            </div>
            <span class="erl-count">${duty[t]}<em>of ${inst.need[t]}</em></span>
            <span class="erl-calls">${inst.calls[t]} calls</span>
          </div>`
      }).join('')

      const shifts = Array.from({ length: SHIFTS }, (_, sh) => {
        const from = 9 + Math.floor(sh / 2)
        const fromHalf = sh % 2 ? '30' : '00'
        const to = 9 + Math.floor((sh + SHIFT_LEN) / 2)
        const toHalf = (sh + SHIFT_LEN) % 2 ? '30' : '00'
        return `<div class="erl-shift">
            <span class="erl-span">${from}.${fromHalf} to ${to}.${toHalf}</span>
            <div class="erl-step">
              <button data-sh="${sh}" data-d="-1">&minus;</button>
              <b>${sol[sh]}${ref ? `<em>${ref[sh]}</em>` : ''}</b>
              <button data-sh="${sh}" data-d="1">+</button>
            </div>
          </div>`
      }).join('')

      root.innerHTML = `
        <div class="erl-day">${slots}</div>
        <p class="erl-note">Each call runs about ${inst.handling} minutes.</p>
        <div class="erl-shifts">${shifts}</div>`

      root.querySelectorAll<HTMLElement>('.erl-step button').forEach((el) => {
        el.addEventListener('click', () => {
          const sh = Number(el.dataset.sh)
          const d = Number(el.dataset.d)
          const next = [...sol]
          next[sh] = Math.max(0, Math.min(40, next[sh] + d))
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

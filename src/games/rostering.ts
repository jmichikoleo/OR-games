import type { Minigame, Reference, RNG } from '../core/types'

const CREW = ['Ade', 'Bex', 'Cal', 'Dee', 'Eli', 'Fay']
const HANDS = CREW.length
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEK = DAYS.length
/** Days off run in a pair, so there are only seven rotas plus staying home. */
const ROTAS = WEEK + 1

interface Instance {
  /** What each one costs for a day on. */
  rate: number[]
  /** Hands the floor needs each day. */
  need: number[]
}
/**
 * For each of the crew, 0 means not on the rota at all and 1 to 7 means their
 * two days off start on that day.
 */
type Solution = number[]

const working = (rota: number, day: number) => {
  if (rota === 0) return false
  const off = rota - 1
  return day !== off && day !== (off + 1) % WEEK
}

function onFloor(sol: Solution): number[] {
  return DAYS.map((_, d) => sol.filter((rota) => working(rota, d)).length)
}

const wageBill = (inst: Instance, sol: Solution) =>
  sol.reduce((a, rota, i) => a + (rota === 0 ? 0 : inst.rate[i] * (WEEK - 2)), 0)

const shortOn = (inst: Instance, sol: Solution) => {
  const floor = onFloor(sol)
  return DAYS.map((_, d) => Math.max(0, inst.need[d] - floor[d]))
}

/** Every rota for every one of the six, 262,144 of them, with the branch
 *  dropped as soon as the wages alone beat the best week found. */
function bestRota(inst: Instance): Solution | null {
  const sol = new Array(HANDS).fill(0)
  let best: Solution | null = null
  let bestVal = Infinity
  const walk = (i: number, bill: number) => {
    if (bill >= bestVal) return
    if (i === HANDS) {
      if (shortOn(inst, sol).some((n) => n > 0)) return
      bestVal = bill
      best = [...sol]
      return
    }
    for (let rota = 0; rota < ROTAS; rota++) {
      sol[i] = rota
      walk(i + 1, bill + (rota === 0 ? 0 : inst.rate[i] * (WEEK - 2)))
      sol[i] = 0
    }
  }
  walk(0, 0)
  return best
}

export const rostering: Minigame<Instance, Solution> = {
  id: 'rostering',
  title: 'Who Works When',
  problem: 'Crew Rostering',
  family: 'scheduling',
  blurb: 'Six on the books and a floor that needs covering seven days. Anybody on the rota takes two days off in a row and gets paid for the other five, so the question is who you put on at all and when you let them go.',
  howTo: 'Click a day to start that one off, and their two days off move there. Click their days off again and they come off the rota altogether, which is how you stop paying them.',
  objective: 'min',
  unit: 'wages',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      const inst: Instance = {
        rate: CREW.map(() => 80 + rng.int(90)),
        need: DAYS.map((_, d) => (d >= 5 ? 3 + rng.int(3) : 2 + rng.int(3))),
      }
      const best = bestRota(inst)
      if (!best) continue
      const all = CREW.map(() => 6)
      // Everybody on with the weekend off has to be a week that does not work.
      if (shortOn(inst, all).some((n) => n > 0) || tries > 200) {
        if (best.filter((r) => r > 0).length < HANDS || tries > 200) return inst
      }
    }
  },

  initial(): Solution {
    // Everybody on, everybody off at the weekend, which is nobody on Saturday.
    return CREW.map(() => 6)
  },

  evaluate(inst, sol) {
    const short = shortOn(inst, sol)
    const gaps = short.filter((n) => n > 0)
    if (gaps.length) {
      const worst = short.indexOf(Math.max(...short))
      return {
        value: 0,
        feasible: false,
        note: `${gaps.length} day${gaps.length === 1 ? ' is' : 's are'} short, and ${DAYS[worst]} wants ${short[worst]} more pair${short[worst] === 1 ? '' : 's'} of hands.`,
      }
    }
    const on = sol.filter((r) => r > 0).length
    const floor = onFloor(sol)
    const spare = floor.reduce((a, n, d) => a + n - inst.need[d], 0)
    return {
      value: wageBill(inst, sol),
      feasible: true,
      note: `${on} of ${HANDS} on the rota with ${spare} spare shift${spare === 1 ? '' : 's'} across the week.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestRota(inst)!, label: 'branch and bound', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'rst'
    host.appendChild(root)

    function draw(sol: Solution, ref: Solution | null) {
      const floor = onFloor(sol)
      root.innerHTML = `<div class="rst-row rst-head"><span class="rst-who"></span>${DAYS.map(
        (d) => `<span class="rst-cell rst-label">${d}</span>`,
      ).join('')}<span class="rst-pay">a week</span></div>`

      CREW.forEach((name, i) => {
        const row = document.createElement('div')
        row.className = `rst-row${sol[i] === 0 ? ' home' : ''}`
        const cells = DAYS.map((_, d) => {
          const on = working(sol[i], d)
          const want = ref ? working(ref[i], d) : null
          return `<button class="rst-cell${on ? ' on' : ''}${want !== null && want !== on ? ' moved' : ''}" data-d="${d}"></button>`
        }).join('')
        row.innerHTML = `<span class="rst-who">${name}<em>${inst.rate[i]} a day</em></span>${cells}<span class="rst-pay">${
          sol[i] === 0 ? 'off the books' : inst.rate[i] * (WEEK - 2)
        }</span>`
        row.querySelectorAll('.rst-cell').forEach((b) =>
          b.addEventListener('click', () => {
            const d = Number((b as HTMLElement).dataset.d)
            const next = [...sol]
            // Clicking a day they are already off takes them off the books.
            next[i] = sol[i] !== 0 && !working(sol[i], d) ? 0 : d + 1
            api.commit(next)
          }),
        )
        root.appendChild(row)
      })

      const tally = document.createElement('div')
      tally.className = 'rst-row rst-tally'
      tally.innerHTML = `<span class="rst-who">on the floor</span>${DAYS.map((_, d) => {
        const short = floor[d] < inst.need[d]
        return `<span class="rst-cell rst-count${short ? ' short' : ''}">${floor[d]}<em>of ${inst.need[d]}</em></span>`
      }).join('')}<span class="rst-pay"></span>`
      root.appendChild(tally)
    }

    return {
      draw,
      destroy() {
        root.remove()
      },
    }
  },
}

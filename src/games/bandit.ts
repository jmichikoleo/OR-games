import type { Minigame, Reference, RNG } from '../core/types'

const ARMS = 6
const PULLS = 40

interface Instance {
  /** rewards[arm][n] is what the n-th pull of that arm pays. Fixed by the seed,
   *  so the instance is reproducible and the hindsight best is exact. */
  rewards: number[][]
}
/** The arms you pulled, in order. */
type Solution = number[]

const armTotal = (inst: Instance, arm: number) =>
  inst.rewards[arm].reduce((a, b) => a + b, 0)

/** Rewards actually collected, in pull order. */
function collected(inst: Instance, sol: Solution): number[] {
  const seen = new Array(ARMS).fill(0)
  return sol.map((k) => inst.rewards[k][seen[k]++])
}

export const bandit: Minigame<Instance, Solution> = {
  id: 'bandit',
  title: 'Six Levers',
  problem: 'Multi-Armed Bandit',
  family: 'stochastic',
  blurb: 'Six machines, forty pulls, and no idea which one pays best. Every pull you spend finding out is a pull you do not spend earning.',
  howTo: 'Click a lever to pull it. You see only what you have actually tried. The bars are your own history on that machine.',
  objective: 'max',
  unit: 'reward',

  generate(rng: RNG): Instance {
    const means = Array.from({ length: ARMS }, () => 22 + rng.int(58))
    return {
      rewards: means.map((m) =>
        Array.from({ length: PULLS }, () =>
          Math.max(0, Math.min(100, Math.round(m + (rng.next() * 2 - 1) * 20))),
        ),
      ),
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const left = PULLS - sol.length
    if (left > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${left} pull${left === 1 ? '' : 's'} left. Spend them all.`,
      }
    }
    return {
      value: collected(inst, sol).reduce((a, b) => a + b, 0),
      feasible: true,
      note: 'All forty pulls spent.',
    }
  },

  solve(inst): Reference<Solution> {
    let best = 0
    for (let k = 1; k < ARMS; k++) if (armTotal(inst, k) > armTotal(inst, best)) best = k
    // The standard bandit benchmark: the best single arm, played from pull one.
    // Not a true upper bound — a clairvoyant could cherry-pick across arms —
    // so a lucky run can score above 100.
    return {
      solution: new Array(PULLS).fill(best),
      label: 'best arm in hindsight',
      exact: false,
    }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'mab'
    root.innerHTML = `
      <div class="mab-gauge"><div class="mab-fill" id="fill"></div></div>
      <p class="mab-read" id="read"></p>
      <div class="mab-arms" id="arms"></div>`
    host.appendChild(root)

    const fill = root.querySelector('#fill') as HTMLElement
    const read = root.querySelector('#read') as HTMLElement
    const arms = root.querySelector('#arms') as HTMLElement

    function draw(sol: Solution, ref: Solution | null) {
      const got = collected(inst, sol)
      const perArm: number[][] = Array.from({ length: ARMS }, () => [])
      sol.forEach((k, i) => perArm[k].push(got[i]))

      const spent = sol.length
      fill.style.width = `${(spent / PULLS) * 100}%`
      read.textContent = `${spent} / ${PULLS} pulls · ${got.reduce((a, b) => a + b, 0)} collected`

      const bestArm = ref ? ref[0] : -1

      arms.innerHTML = ''
      for (let k = 0; k < ARMS; k++) {
        const hist = perArm[k]
        const avg = hist.length ? Math.round(hist.reduce((a, b) => a + b, 0) / hist.length) : null
        const el = document.createElement('button')
        el.className = `mab-arm${spent >= PULLS ? ' done' : ''}${k === bestArm ? ' opt' : ''}`
        const bars = hist
          .map((r) => `<i style="height:${Math.max(6, r)}%"></i>`)
          .join('')
        el.innerHTML = `
          <span class="mab-name">Lever ${k + 1}<em>${hist.length} pull${hist.length === 1 ? '' : 's'}</em></span>
          <span class="mab-avg">${avg === null ? '--' : avg}</span>
          <span class="mab-spark">${bars}</span>
          ${ref ? `<span class="mab-true">hindsight ${armTotal(inst, k)}</span>` : ''}`
        el.addEventListener('click', () => {
          if (sol.length >= PULLS) return
          api.commit([...sol, k])
        })
        arms.appendChild(el)
      }
    }

    return {
      draw,
      destroy() {
        root.remove()
      },
    }
  },
}

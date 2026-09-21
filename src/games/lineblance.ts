import type { Minigame, Reference, RNG } from '../core/types'

const TASKS = 10
const STATIONS = 6
const LETTERS = 'ABCDEFGHIJ'

interface Instance {
  time: number[]
  /** needs[t] lists the tasks that have to be done by the same station or earlier. */
  needs: number[][]
  cycle: number
}
/** Which station each task sits at, counting from zero. */
type Solution = number[]

const loadOf = (inst: Instance, sol: Solution) => {
  const l = new Array(STATIONS).fill(0)
  sol.forEach((st, t) => (l[st] += inst.time[t]))
  return l
}

const outOfOrder = (inst: Instance, sol: Solution) =>
  inst.needs.flatMap((ps, t) => ps.filter((p) => sol[p] > sol[t]).map((p) => [p, t]))

const stationsUsed = (inst: Instance, sol: Solution) =>
  loadOf(inst, sol).filter((l) => l > 0).length

/**
 * DP over which tasks are already done. From any finished set, a station can
 * take any group of tasks whose own prerequisites are already behind it and
 * that fits the cycle time. Exact at ten tasks.
 */
function fewestStations(inst: Instance): Solution {
  const full = (1 << TASKS) - 1
  const need = inst.needs.map((ps) => ps.reduce((m, p) => m | (1 << p), 0))
  const dp = new Int32Array(full + 1).fill(99)
  const via = new Int32Array(full + 1).fill(0)
  dp[0] = 0

  for (let mask = 0; mask <= full; mask++) {
    if (dp[mask] === 99) continue
    let ready = 0
    for (let t = 0; t < TASKS; t++) {
      if (!((mask >> t) & 1) && (need[t] & mask) === need[t]) ready |= 1 << t
    }
    if (ready === 0) continue
    // Walk every subset of what is ready right now.
    for (let sub = ready; sub > 0; sub = (sub - 1) & ready) {
      let load = 0
      for (let t = 0; t < TASKS; t++) if ((sub >> t) & 1) load += inst.time[t]
      if (load > inst.cycle) continue
      const next = mask | sub
      if (dp[mask] + 1 < dp[next]) {
        dp[next] = dp[mask] + 1
        via[next] = sub
      }
    }
  }

  const out = new Array(TASKS).fill(0)
  let mask = full
  const groups: number[][] = []
  while (mask > 0) {
    const sub = via[mask]
    const group: number[] = []
    for (let t = 0; t < TASKS; t++) if ((sub >> t) & 1) group.push(t)
    groups.unshift(group)
    mask ^= sub
  }
  groups.forEach((group, st) => group.forEach((t) => (out[t] = st)))
  return out
}

export const lineblance: Minigame<Instance, Solution> = {
  id: 'lineblance',
  title: 'Balance the Line',
  problem: 'Assembly Line Balancing',
  family: 'assignment',
  blurb: 'Ten jobs on a moving line. Each station gets the same fixed time before the belt moves on, and some jobs cannot start until others are finished. Use as few stations as you can.',
  howTo: 'Click the right half of a task to push it one station down the line and the left half to pull it back. A station over its time turns red, and so does a task that has jumped ahead of something it depends on.',
  objective: 'min',
  unit: 'stations',

  generate(rng: RNG): Instance {
    for (;;) {
      const time = Array.from({ length: TASKS }, () => 3 + rng.int(12))
      const needs = Array.from({ length: TASKS }, (_, t) => {
        const ps: number[] = []
        for (let p = 0; p < t; p++) if (rng.next() < 0.22) ps.push(p)
        return ps
      })
      const total = time.reduce((a, b) => a + b, 0)
      const cycle = Math.max(Math.max(...time), Math.round((total / 4) * 1.12))
      const inst = { time, needs, cycle }
      const best = fewestStations(inst)
      const used = stationsUsed(inst, best)
      // Keep boards that need a real amount of shuffling but still fit.
      if (used >= 3 && used <= STATIONS - 1) return inst
    }
  },

  initial(inst): Solution {
    // First fit down the line in task order, which always works and rarely wins.
    const out = new Array(TASKS).fill(0)
    const load = new Array(STATIONS).fill(0)
    for (let t = 0; t < TASKS; t++) {
      let st = inst.needs[t].reduce((m, p) => Math.max(m, out[p]), 0)
      while (st < STATIONS - 1 && load[st] + inst.time[t] > inst.cycle) st++
      out[t] = st
      load[st] += inst.time[t]
    }
    return out
  },

  evaluate(inst, sol) {
    const load = loadOf(inst, sol)
    const over = load.filter((l) => l > inst.cycle).length
    if (over > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${over} station${over === 1 ? ' runs' : 's run'} past the cycle time.`,
      }
    }
    const bad = outOfOrder(inst, sol)
    if (bad.length > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${bad.length} task${bad.length === 1 ? ' starts' : 's start'} before something they depend on.`,
      }
    }
    return {
      value: stationsUsed(inst, sol),
      feasible: true,
      note: `The line runs on ${stationsUsed(inst, sol)} stations.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: fewestStations(inst), label: 'subset DP', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'alb'
    host.appendChild(root)

    function draw(sol: Solution, ref: Solution | null) {
      const load = loadOf(inst, sol)
      const bad = new Set(outOfOrder(inst, sol).map(([, t]) => t))

      const cols = Array.from({ length: STATIONS }, (_, st) => {
        const here = sol.map((s, t) => (s === st ? t : -1)).filter((t) => t >= 0)
        const cards = here
          .map((t) => {
            const deps = inst.needs[t].map((p) => LETTERS[p]).join(' ')
            return `<button class="alb-task${bad.has(t) ? ' bad' : ''}" data-t="${t}">
                <span class="alb-name">${LETTERS[t]}<b>${inst.time[t]}</b></span>
                <span class="alb-dep">${deps ? `after ${deps}` : 'no wait'}</span>
                ${ref ? `<span class="alb-best">best S${ref[t] + 1}</span>` : ''}
              </button>`
          })
          .join('')
        const pct = Math.min(100, (load[st] / inst.cycle) * 100)
        return `<div class="alb-station${load[st] > inst.cycle ? ' over' : ''}${load[st] === 0 ? ' empty' : ''}">
            <div class="alb-head"><span>S${st + 1}</span><b>${load[st]} of ${inst.cycle}</b></div>
            <div class="alb-gauge"><i style="width:${pct}%"></i></div>
            <div class="alb-cards">${cards}</div>
          </div>`
      }).join('')

      root.innerHTML = `<div class="alb-line">${cols}</div>`

      root.querySelectorAll<HTMLElement>('.alb-task').forEach((el) => {
        el.addEventListener('click', (ev) => {
          const t = Number(el.dataset.t)
          // Right half sends it down the line, left half pulls it back.
          const forward = (ev as MouseEvent).offsetX >= el.clientWidth / 2
          const next = [...sol]
          next[t] = Math.max(0, Math.min(STATIONS - 1, next[t] + (forward ? 1 : -1)))
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

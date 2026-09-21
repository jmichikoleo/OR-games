import type { Minigame, Reference, RNG } from '../core/types'

const NAMES = ['Survey', 'Dig', 'Fence', 'Pour', 'Drains', 'Shed', 'Frame', 'Paths', 'Roof']
const PREDS: number[][] = [[], [0], [0], [1], [1], [2], [3, 4], [2, 4], [6]]
const TASKS = NAMES.length
const CREW = 5

interface Instance {
  days: number[]
  hands: number[]
}
/** The order you send the jobs out in. Partial while you are still building. */
type Solution = number[]

interface Placed {
  task: number
  start: number
  end: number
}

const horizonOf = (inst: Instance) => inst.days.reduce((a, d) => a + d, 0) + 1

/**
 * Send the jobs out in the given order. Each one waits for the jobs it needs
 * and then for a moment when enough of the crew is free. Every schedule worth
 * having comes out of some order, which is why the order is the whole game.
 */
function layout(inst: Instance, seq: Solution): Placed[] {
  const horizon = horizonOf(inst)
  const used = new Array(horizon + 1).fill(0)
  const finish = new Array(TASKS).fill(-1)
  const out: Placed[] = []
  for (const task of seq) {
    if (PREDS[task].some((p) => finish[p] < 0)) continue
    const ready = PREDS[task].reduce((a, p) => Math.max(a, finish[p]), 0)
    const d = inst.days[task]
    const h = inst.hands[task]
    let t = ready
    for (;;) {
      let ok = true
      for (let k = t; k < t + d; k++) {
        if (used[k] + h > CREW) {
          ok = false
          t = k + 1
          break
        }
      }
      if (ok) break
    }
    for (let k = t; k < t + d; k++) used[k] += h
    finish[task] = t + d
    out.push({ task, start: t, end: t + d })
  }
  return out
}

const spanOf = (placed: Placed[]) => placed.reduce((a, p) => Math.max(a, p.end), 0)

/** Longest run of work from each job to the end, crew set aside. */
function tails(inst: Instance): number[] {
  const tail = new Array(TASKS).fill(0)
  for (let i = TASKS - 1; i >= 0; i--) {
    let after = 0
    for (let j = 0; j < TASKS; j++) {
      if (PREDS[j].includes(i)) after = Math.max(after, tail[j])
    }
    tail[i] = inst.days[i] + after
  }
  return tail
}

/** Depth first over the orders the jobs could go out in, cut off by the
 *  longest run of work still ahead of whatever is left. */
function bestOrder(inst: Instance): Solution {
  const horizon = horizonOf(inst)
  const tail = tails(inst)
  const used = new Array(horizon + 1).fill(0)
  const finish = new Array(TASKS).fill(-1)
  const seq: number[] = []
  let best: Solution = []
  let bestSpan = Infinity

  const walk = (span: number) => {
    let lb = span
    for (let i = 0; i < TASKS; i++) {
      if (finish[i] >= 0) continue
      const ready = PREDS[i].reduce((a, p) => Math.max(a, Math.max(finish[p], 0)), 0)
      lb = Math.max(lb, ready + tail[i])
    }
    if (lb >= bestSpan) return
    if (seq.length === TASKS) {
      bestSpan = span
      best = [...seq]
      return
    }
    for (let task = 0; task < TASKS; task++) {
      if (finish[task] >= 0) continue
      if (PREDS[task].some((p) => finish[p] < 0)) continue
      const ready = PREDS[task].reduce((a, p) => Math.max(a, finish[p]), 0)
      const d = inst.days[task]
      const h = inst.hands[task]
      let t = ready
      for (;;) {
        let ok = true
        for (let k = t; k < t + d; k++) {
          if (used[k] + h > CREW) {
            ok = false
            t = k + 1
            break
          }
        }
        if (ok) break
      }
      for (let k = t; k < t + d; k++) used[k] += h
      finish[task] = t + d
      seq.push(task)
      walk(Math.max(span, t + d))
      seq.pop()
      finish[task] = -1
      for (let k = t; k < t + d; k++) used[k] -= h
    }
  }
  walk(0)
  return best
}

export const rcpsp: Minigame<Instance, Solution> = {
  id: 'rcpsp',
  title: 'One Crew',
  problem: 'Resource-Constrained Project Scheduling',
  family: 'scheduling',
  blurb: 'A build with nine jobs, some of which have to wait on others, and five pairs of hands for the lot. Two jobs that could run side by side often cannot, because between them they want more crew than you have.',
  howTo: 'Click a job to send it out next. It waits for whatever it needs and then for enough of the crew to come free. A job greyed out is still waiting on something before it.',
  objective: 'min',
  unit: 'days',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      const inst: Instance = {
        days: NAMES.map(() => 2 + rng.int(5)),
        hands: NAMES.map(() => 1 + rng.int(4)),
      }
      const best = spanOf(layout(inst, bestOrder(inst)))
      const chain = Math.max(...tails(inst).filter((_, i) => PREDS[i].length === 0))
      // A build the crew limit never bites on is just a critical path.
      if (best > chain || tries > 400) return inst
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    if (sol.length < TASKS) {
      const left = TASKS - sol.length
      return {
        value: 0,
        feasible: false,
        note: `${left} job${left === 1 ? '' : 's'} still to send out.`,
      }
    }
    const placed = layout(inst, sol)
    const span = spanOf(placed)
    const work = placed.reduce((a, p) => a + (p.end - p.start) * inst.hands[p.task], 0)
    const spare = span * CREW - work
    return {
      value: span,
      feasible: true,
      note: `Done in ${span} days with ${spare} crew days spare.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestOrder(inst), label: 'branch and bound', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'rcp'
    root.innerHTML = `
      <div class="rcp-pool" id="pool"></div>
      <div class="rcp-chart" id="chart"></div>
      <div class="rcp-chart rcp-ghost" id="ghost" hidden>
        <div class="rcp-ghost-tag">what the solver did</div>
      </div>`
    host.appendChild(root)
    const pool = root.querySelector('#pool') as HTMLElement
    const chart = root.querySelector('#chart') as HTMLElement
    const ghost = root.querySelector('#ghost') as HTMLElement

    const tail = tails(inst)
    const chain = Math.max(...tail.filter((_, i) => PREDS[i].length === 0))
    const floorSpan = Math.round(chain * 1.45)

    function chartInto(into: HTMLElement, seq: Solution, faded: boolean) {
      const placed = layout(inst, seq)
      const span = Math.max(floorSpan, spanOf(placed))
      into.querySelectorAll('.rcp-row').forEach((e) => e.remove())
      NAMES.forEach((name, i) => {
        const p = placed.find((q) => q.task === i)
        const row = document.createElement('div')
        row.className = 'rcp-row'
        row.innerHTML = `<span class="rcp-name">${name}</span><div class="rcp-track"></div>`
        if (p) {
          const bar = document.createElement('i')
          bar.style.left = `${(p.start / span) * 100}%`
          bar.style.width = `${((p.end - p.start) / span) * 100}%`
          bar.style.opacity = faded ? '0.45' : '1'
          bar.textContent = `${inst.hands[i]}`
          row.querySelector('.rcp-track')!.appendChild(bar)
        }
        into.appendChild(row)
      })

      const used = new Array(span).fill(0)
      placed.forEach((p) => {
        for (let k = p.start; k < p.end; k++) used[k] += inst.hands[p.task]
      })
      const strip = document.createElement('div')
      strip.className = 'rcp-row rcp-crew'
      strip.innerHTML = `<span class="rcp-name">crew</span><div class="rcp-track"></div>`
      const track = strip.querySelector('.rcp-track') as HTMLElement
      used.forEach((n, k) => {
        const col = document.createElement('i')
        col.style.left = `${(k / span) * 100}%`
        col.style.width = `${(1 / span) * 100}%`
        col.style.height = `${(n / CREW) * 100}%`
        col.style.opacity = faded ? '0.45' : '1'
        track.appendChild(col)
      })
      into.appendChild(strip)
    }

    function draw(sol: Solution, ref: Solution | null) {
      pool.innerHTML = ''
      NAMES.forEach((name, i) => {
        const at = sol.indexOf(i)
        const ready = PREDS[i].every((p) => sol.includes(p))
        const chip = document.createElement('button')
        chip.className = `rcp-job${at >= 0 ? ' on' : ''}${!ready && at < 0 ? ' locked' : ''}`
        const needs = PREDS[i].map((p) => NAMES[p]).join(', ')
        chip.innerHTML = `<b>${name}</b><span>${inst.days[i]} days, ${inst.hands[i]} crew</span>
          <span class="rcp-needs">${needs ? `after ${needs}` : 'can start now'}</span>
          ${at >= 0 ? `<em>${at + 1}</em>` : ''}`
        chip.addEventListener('click', () => {
          if (at >= 0) {
            // Pulling one out drops everything that was waiting on it.
            const cut = sol.slice(0, at)
            api.commit(cut.filter((x) => PREDS[x].every((p) => cut.includes(p))))
            return
          }
          if (ready) api.commit([...sol, i])
        })
        pool.appendChild(chip)
      })
      chartInto(chart, sol, false)
      ghost.hidden = !ref
      if (ref) chartInto(ghost, ref, true)
    }

    return {
      draw,
      destroy() {
        root.remove()
      },
    }
  },
}

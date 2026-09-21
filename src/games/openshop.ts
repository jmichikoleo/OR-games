import type { Minigame, Reference, RNG } from '../core/types'

const JOBS = 3
const MACHINES = 3
const OPS = JOBS * MACHINES
const JOB_NAMES = ['Job A', 'Job B', 'Job C']
const MACHINE_NAMES = ['Lathe', 'Press', 'Paint']
const JOB_COLORS = ['#ff4d9d', '#5b8cff', '#52e68a']

const jobOf = (op: number) => Math.floor(op / MACHINES)
const machineOf = (op: number) => op % MACHINES

interface Instance {
  /** How long job j sits on machine m. */
  dur: number[][]
}
/** The order you feed the operations in. Partial while you are still building. */
type Solution = number[]

interface Placed {
  op: number
  start: number
  end: number
}

/**
 * Feed the operations in the given order. Each one starts the moment its
 * machine has cleared everything fed in before it and its job is off whatever
 * else it was on. That is the whole model, and every sensible schedule is
 * reachable by some order.
 */
function layout(inst: Instance, seq: Solution): Placed[] {
  const machineFree = new Array(MACHINES).fill(0)
  const jobFree = new Array(JOBS).fill(0)
  return seq.map((op) => {
    const j = jobOf(op)
    const m = machineOf(op)
    const start = Math.max(machineFree[m], jobFree[j])
    const end = start + inst.dur[j][m]
    machineFree[m] = end
    jobFree[j] = end
    return { op, start, end }
  })
}

const spanOf = (placed: Placed[]) => placed.reduce((a, p) => Math.max(a, p.end), 0)

/** Depth first over the orders, cut off by the work each machine and each job
 *  still has left to do. Small enough that the answer is the true best. */
function bestOrder(inst: Instance): Solution {
  const machineLeft = Array.from({ length: MACHINES }, (_, m) =>
    inst.dur.reduce((a, row) => a + row[m], 0),
  )
  const jobLeft = inst.dur.map((row) => row.reduce((a, d) => a + d, 0))
  const machineFree = new Array(MACHINES).fill(0)
  const jobFree = new Array(JOBS).fill(0)
  const done = new Array(OPS).fill(false)
  const seq: number[] = []
  let best: Solution = []
  let bestSpan = Infinity

  const bound = (span: number) => {
    let lb = span
    for (let m = 0; m < MACHINES; m++) lb = Math.max(lb, machineFree[m] + machineLeft[m])
    for (let j = 0; j < JOBS; j++) lb = Math.max(lb, jobFree[j] + jobLeft[j])
    return lb
  }

  const walk = (span: number) => {
    if (bound(span) >= bestSpan) return
    if (seq.length === OPS) {
      bestSpan = span
      best = [...seq]
      return
    }
    for (let op = 0; op < OPS; op++) {
      if (done[op]) continue
      const j = jobOf(op)
      const m = machineOf(op)
      const d = inst.dur[j][m]
      const start = Math.max(machineFree[m], jobFree[j])
      const pm = machineFree[m]
      const pj = jobFree[j]
      machineFree[m] = jobFree[j] = start + d
      machineLeft[m] -= d
      jobLeft[j] -= d
      done[op] = true
      seq.push(op)
      walk(Math.max(span, start + d))
      seq.pop()
      done[op] = false
      machineLeft[m] += d
      jobLeft[j] += d
      machineFree[m] = pm
      jobFree[j] = pj
    }
  }
  walk(0)
  return best
}

export const openshop: Minigame<Instance, Solution> = {
  id: 'openshop',
  title: 'Any Order',
  problem: 'Open Shop Scheduling',
  family: 'scheduling',
  blurb: 'Three jobs, three machines, and every job needs a turn on every machine. Nothing says which machine first. The freedom is the whole difficulty, because a machine left waiting is time you never get back.',
  howTo: 'Click an operation to send it to the shop next. It starts as soon as its machine is free and its job is not busy elsewhere. Click a placed one to pull it back out.',
  objective: 'min',
  unit: 'min',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      const dur = Array.from({ length: JOBS }, () =>
        Array.from({ length: MACHINES }, () => 3 + rng.int(12)),
      )
      const inst = { dur }
      const best = spanOf(layout(inst, bestOrder(inst)))
      const lb = Math.max(
        ...Array.from({ length: MACHINES }, (_, m) => dur.reduce((a, r) => a + r[m], 0)),
        ...dur.map((r) => r.reduce((a, d) => a + d, 0)),
      )
      // A day where the machine loads alone give the answer is no puzzle.
      if (best > lb || tries > 400) return inst
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    if (sol.length < OPS) {
      const left = OPS - sol.length
      return {
        value: 0,
        feasible: false,
        note: `${left} operation${left === 1 ? '' : 's'} still waiting to go in.`,
      }
    }
    const placed = layout(inst, sol)
    const span = spanOf(placed)
    const busy = placed.reduce((a, p) => a + (p.end - p.start), 0)
    const idle = span * MACHINES - busy
    return {
      value: span,
      feasible: true,
      note: `Shop clear in ${span} minutes with ${idle} machine minutes standing idle.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestOrder(inst), label: 'branch and bound', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'osh'
    root.innerHTML = `
      <div class="osh-pool" id="pool"></div>
      <div class="osh-chart" id="chart"></div>
      <div class="osh-chart osh-ghost" id="ghost" hidden>
        <div class="osh-ghost-tag">what the solver did</div>
      </div>`
    host.appendChild(root)
    const pool = root.querySelector('#pool') as HTMLElement
    const chart = root.querySelector('#chart') as HTMLElement
    const ghost = root.querySelector('#ghost') as HTMLElement

    const machineLoad = Array.from({ length: MACHINES }, (_, m) =>
      inst.dur.reduce((a, r) => a + r[m], 0),
    )
    // A steady scale so the bars do not jump around while the board fills.
    const scale = Math.round(Math.max(...machineLoad, ...inst.dur.map((r) => r.reduce((a, d) => a + d, 0))) * 1.55)

    function gantt(into: HTMLElement, seq: Solution, faded: boolean) {
      const placed = layout(inst, seq)
      const span = Math.max(scale, spanOf(placed))
      const rows = Array.from({ length: MACHINES }, () => [] as Placed[])
      placed.forEach((p) => rows[machineOf(p.op)].push(p))
      into.querySelectorAll('.osh-row').forEach((e) => e.remove())
      rows.forEach((row, m) => {
        const line = document.createElement('div')
        line.className = 'osh-row'
        line.innerHTML = `<span class="osh-name">${MACHINE_NAMES[m]}</span><div class="osh-track"></div>`
        const track = line.querySelector('.osh-track') as HTMLElement
        row.forEach((p) => {
          const bar = document.createElement('i')
          bar.style.left = `${(p.start / span) * 100}%`
          bar.style.width = `${((p.end - p.start) / span) * 100}%`
          bar.style.background = JOB_COLORS[jobOf(p.op)]
          bar.style.opacity = faded ? '0.4' : '1'
          bar.textContent = JOB_NAMES[jobOf(p.op)].slice(-1)
          track.appendChild(bar)
        })
        into.appendChild(line)
      })
    }

    function draw(sol: Solution, ref: Solution | null) {
      pool.innerHTML = ''
      inst.dur.forEach((row, j) => {
        const line = document.createElement('div')
        line.className = 'osh-joblane'
        line.innerHTML = `<span class="osh-name" style="color:${JOB_COLORS[j]}">${JOB_NAMES[j]}</span>`
        row.forEach((d, m) => {
          const op = j * MACHINES + m
          const at = sol.indexOf(op)
          const chip = document.createElement('button')
          chip.className = `osh-op${at >= 0 ? ' on' : ''}`
          chip.style.setProperty('--job', JOB_COLORS[j])
          chip.innerHTML = `<b>${MACHINE_NAMES[m]}</b><span>${d} min</span>${
            at >= 0 ? `<em>${at + 1}</em>` : ''
          }`
          chip.addEventListener('click', () => {
            api.commit(at >= 0 ? sol.filter((x) => x !== op) : [...sol, op])
          })
          line.appendChild(chip)
        })
        pool.appendChild(line)
      })
      gantt(chart, sol, false)
      ghost.hidden = !ref
      if (ref) gantt(ghost, ref, true)
    }

    return {
      draw,
      destroy() {
        root.remove()
      },
    }
  },
}

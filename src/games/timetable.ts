import type { Minigame, Reference, RNG } from '../core/types'

const PAPERS = ['Maths', 'Physics', 'Chemistry', 'Biology', 'History', 'French', 'Art', 'Music']
const N = PAPERS.length
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const SLOTS = DAYS.length
/** What it costs a student to sit two papers this many days apart. */
const NEAR = [0, 8, 4, 2, 1]

interface Instance {
  /** Students sitting both papers. */
  both: number[][]
}
/** The day each paper is sat. */
type Solution = number[]

function clashes(inst: Instance, sol: Solution): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (inst.both[i][j] > 0 && sol[i] === sol[j]) out.push([i, j])
    }
  }
  return out
}

function grumbling(inst: Instance, sol: Solution): number {
  let total = 0
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const n = inst.both[i][j]
      if (!n) continue
      const gap = Math.abs(sol[i] - sol[j])
      if (gap >= 1 && gap < NEAR.length) total += n * NEAR[gap]
    }
  }
  return total
}

/** Hand the papers out one at a time, dropping any branch that has already
 *  cost more than the best week found so far. */
function bestWeek(inst: Instance): Solution | null {
  const sol = new Array(N).fill(-1)
  let best: Solution | null = null
  let bestVal = Infinity
  const walk = (i: number, cost: number) => {
    if (cost >= bestVal) return
    if (i === N) {
      bestVal = cost
      best = [...sol]
      return
    }
    for (let d = 0; d < SLOTS; d++) {
      let add = 0
      let ok = true
      for (let k = 0; k < i; k++) {
        const n = inst.both[i][k]
        if (!n) continue
        const gap = Math.abs(d - sol[k])
        if (gap === 0) {
          ok = false
          break
        }
        if (gap < NEAR.length) add += n * NEAR[gap]
      }
      if (!ok) continue
      sol[i] = d
      walk(i + 1, cost + add)
      sol[i] = -1
    }
  }
  walk(0, 0)
  return best
}

/** The timetable somebody draws in five minutes. First day that does not
 *  clash, paper by paper, and never a thought for who sits what back to back. */
function firstFit(inst: Instance): Solution | null {
  const sol = new Array(N).fill(-1)
  for (let i = 0; i < N; i++) {
    let put = -1
    for (let d = 0; d < SLOTS && put < 0; d++) {
      let ok = true
      for (let k = 0; k < i; k++) {
        if (inst.both[i][k] > 0 && sol[k] === d) ok = false
      }
      if (ok) put = d
    }
    if (put < 0) return null
    sol[i] = put
  }
  return sol
}

export const timetable: Minigame<Instance, Solution> = {
  id: 'timetable',
  title: 'Exam Week',
  problem: 'Exam Timetabling',
  family: 'scheduling',
  blurb: 'Eight papers across five days. Two papers sharing a single student cannot sit on the same day at all, and the nearer together they do sit, the more of that student is spent revising in a corridor.',
  howTo: 'Click the right half of a paper to push it later in the week and the left half to pull it earlier. Two papers on one day with students in common is a clash and does not count as a week at all.',
  objective: 'min',
  unit: 'grumbles',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      const both = Array.from({ length: N }, () => new Array(N).fill(0))
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          if (rng.next() < 0.45) {
            const n = 4 + rng.int(28)
            both[i][j] = both[j][i] = n
          }
        }
      }
      const inst = { both }
      const best = bestWeek(inst)
      const plain = firstFit(inst)
      if (!best || !plain) continue
      // Only a week where the five minute timetable is a poor one.
      if (grumbling(inst, best) / grumbling(inst, plain) < 0.82 || tries > 200) return inst
    }
  },

  initial(inst): Solution {
    return firstFit(inst) ?? new Array(N).fill(0)
  },

  evaluate(inst, sol) {
    const bad = clashes(inst, sol)
    if (bad.length) {
      const [i, j] = bad[0]
      return {
        value: 0,
        feasible: false,
        note: bad.length === 1
          ? `${PAPERS[i]} and ${PAPERS[j]} are on the same day and share students.`
          : `${bad.length} pairs of papers clash, starting with ${PAPERS[i]} and ${PAPERS[j]}.`,
      }
    }
    const tight = []
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (inst.both[i][j] > 0 && Math.abs(sol[i] - sol[j]) === 1) tight.push(1)
      }
    }
    return {
      value: grumbling(inst, sol),
      feasible: true,
      note: `${tight.length} pair${tight.length === 1 ? '' : 's'} of papers land on back to back days.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestWeek(inst)!, label: 'branch and bound', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'ttb'
    host.appendChild(root)

    function draw(sol: Solution, ref: Solution | null) {
      const bad = new Set(clashes(inst, sol).flat())
      root.innerHTML = ''
      DAYS.forEach((day, d) => {
        const col = document.createElement('div')
        col.className = 'ttb-day'
        col.innerHTML = `<span class="ttb-head">${day}</span>`
        PAPERS.forEach((name, i) => {
          if (sol[i] !== d) return
          // Only the neighbours that actually cost something get listed.
          const near = PAPERS.map((other, j) => {
            if (j === i || !inst.both[i][j]) return null
            const gap = Math.abs(sol[i] - sol[j])
            if (gap < 1 || gap >= NEAR.length || !NEAR[gap]) return null
            return { other, cost: inst.both[i][j] * NEAR[gap], gap }
          }).filter(Boolean) as { other: string; cost: number; gap: number }[]
          near.sort((a, b) => b.cost - a.cost)
          const chip = document.createElement('div')
          chip.className = `ttb-paper${bad.has(i) ? ' clash' : ''}${ref && ref[i] !== d ? ' moved' : ''}`
          chip.innerHTML = `
            <b>${name}</b>
            ${near.length ? `<span class="ttb-near">${near[0].other} is ${near[0].gap === 1 ? 'next door' : `${near[0].gap} days off`}, ${near[0].cost}</span>` : '<span class="ttb-near clear">nothing close</span>'}
            ${ref ? `<em class="ttb-want">solver ${DAYS[ref[i]].slice(0, 3)}</em>` : ''}
            <i class="ttb-left"></i><i class="ttb-right"></i>`
          chip.addEventListener('click', (ev) => {
            const box = chip.getBoundingClientRect()
            const forward = ev.clientX - box.left > box.width / 2
            const next = [...sol]
            next[i] = Math.max(0, Math.min(SLOTS - 1, next[i] + (forward ? 1 : -1)))
            if (next[i] !== sol[i]) api.commit(next)
          })
          col.appendChild(chip)
        })
        root.appendChild(col)
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

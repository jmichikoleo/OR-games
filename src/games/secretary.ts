import type { Minigame, Reference, RNG } from '../core/types'

const ROUNDS = 6
const CANDS = 12

interface Instance {
  /** Each round is a shuffle of the qualities 1..CANDS, in arrival order. */
  rounds: number[][]
}
/** Index of the candidate you hired in each round, or -1 before you decide. */
type Solution = number[]

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th']

/** Rank of arrival i among everyone seen so far — 1 means best yet. */
function rankSoFar(round: number[], i: number): number {
  let better = 0
  for (let k = 0; k <= i; k++) if (round[k] > round[i]) better++
  return better + 1
}

/** Pass the first k, then take the next record; forced onto the last arrival. */
function playCutoff(round: number[], k: number): number {
  for (let i = k; i < round.length; i++) {
    if (rankSoFar(round, i) === 1) return i
  }
  return round.length - 1
}

export function bestCutoff(inst: Instance): { k: number; stops: number[]; score: number } {
  let best = { k: 0, stops: [] as number[], score: -1 }
  for (let k = 0; k < CANDS; k++) {
    const stops = inst.rounds.map((r) => playCutoff(r, k))
    const score = inst.rounds.reduce((a, r, i) => a + r[stops[i]], 0)
    if (score > best.score) best = { k, stops, score }
  }
  return best
}

export const secretary: Minigame<Instance, Solution> = {
  id: 'secretary',
  title: 'Hire or Pass',
  problem: 'Secretary Problem',
  family: 'stochastic',
  blurb: 'Twelve candidates walk in one at a time. You never learn their score, only how they rank against the ones before. Say no and they are gone for good.',
  howTo: 'Pass to see the next candidate or hire the one in front of you. Six rounds. A hire is worth its true quality and the best candidate is worth 12.',
  objective: 'max',
  unit: 'pts',

  generate(rng: RNG): Instance {
    return {
      rounds: Array.from({ length: ROUNDS }, () => {
        const order = Array.from({ length: CANDS }, (_, i) => i + 1)
        for (let i = order.length - 1; i > 0; i--) {
          const j = rng.int(i + 1)
          ;[order[i], order[j]] = [order[j], order[i]]
        }
        return order
      }),
    }
  },

  initial(): Solution {
    return new Array(ROUNDS).fill(-1)
  },

  evaluate(inst, sol) {
    const left = sol.filter((x) => x < 0).length
    if (left > 0) {
      return { value: 0, feasible: false, note: `${left} round${left === 1 ? '' : 's'} still to play.` }
    }
    const best = sol.filter((idx, r) => inst.rounds[r][idx] === CANDS).length
    return {
      value: sol.reduce((a, idx, r) => a + inst.rounds[r][idx], 0),
      feasible: true,
      note: `You landed the very best candidate in ${best} of ${ROUNDS} rounds.`,
    }
  },

  solve(inst): Reference<Solution> {
    // The best "pass k, then take any record" rule on these exact six shuffles.
    // Not a true ceiling — a clairvoyant would take the best every time — so a
    // sharp run can beat it.
    return { solution: bestCutoff(inst).stops, label: 'best cutoff in hindsight', exact: false }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'sec'
    host.appendChild(root)

    let cursor = 0
    let lastRound = -1

    function render(sol: Solution, ref: Solution | null) {
      const round = sol.findIndex((x) => x < 0)
      if (round !== lastRound) {
        lastRound = round
        cursor = 0
      }
      const done = round < 0
      const cut = ref ? bestCutoff(inst) : null

      const badges = sol
        .map((idx, r) => {
          if (idx < 0) return `<span class="sec-badge pending">--</span>`
          const v = inst.rounds[r][idx]
          return `<span class="sec-badge${v === CANDS ? ' top' : ''}">${v}</span>`
        })
        .join('')

      if (done) {
        const rows = inst.rounds
          .map((r, i) => {
            const v = r[sol[i]]
            const refV = cut ? r[cut.stops[i]] : null
            return `<div class="sec-row">
              <span>Round ${i + 1}</span>
              <b class="${v === CANDS ? 'top' : ''}">${v}</b>
              ${refV !== null ? `<em>cutoff got ${refV}</em>` : ''}
            </div>`
          })
          .join('')
        root.innerHTML = `
          <div class="sec-top"><span class="sec-round">all six rounds played</span><div class="sec-badges">${badges}</div></div>
          <div class="sec-results">${rows}</div>
          ${cut ? `<p class="sec-hint">Best rule in hindsight was to pass the first ${cut.k} and then take the next candidate who beats everyone so far.</p>` : ''}`
        return
      }

      const seq = inst.rounds[round]
      const chips = Array.from({ length: CANDS }, (_, i) => {
        if (i > cursor) return `<span class="sec-chip future"></span>`
        const rk = rankSoFar(seq, i)
        const cls = i === cursor ? ' now' : rk === 1 ? ' record' : ''
        return `<span class="sec-chip${cls}">${rk}</span>`
      }).join('')

      const rk = rankSoFar(seq, cursor)
      const last = cursor === CANDS - 1

      root.innerHTML = `
        <div class="sec-top"><span class="sec-round">Round ${round + 1} of ${ROUNDS}</span><div class="sec-badges">${badges}</div></div>
        <div class="sec-strip">${chips}</div>
        <div class="sec-current">
          <b class="${rk === 1 ? 'record' : ''}">${rk === 1 ? 'best so far' : `${ORDINAL[rk]} best so far`}</b>
          <span>candidate ${cursor + 1} of ${CANDS}${last ? '. Last one, you have to take them' : ''}</span>
        </div>
        <div class="sec-actions">
          <button id="pass" class="sec-btn"${last ? ' disabled' : ''}>pass</button>
          <button id="hire" class="sec-btn hire">hire</button>
        </div>
        ${cut ? `<p class="sec-hint">Best rule in hindsight passes the first ${cut.k}.</p>` : ''}`

      const pass = root.querySelector('#pass') as HTMLButtonElement
      const hire = root.querySelector('#hire') as HTMLButtonElement
      pass.addEventListener('click', () => {
        if (cursor < CANDS - 1) {
          cursor++
          render(sol, ref)
        }
      })
      hire.addEventListener('click', () => {
        const next = [...sol]
        next[round] = cursor
        api.commit(next)
      })
    }

    return {
      draw: render,
      destroy() {
        root.remove()
      },
    }
  },
}

import type { Minigame, Reference, RNG } from '../core/types'

const N = 5
const PEOPLE = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli']
const FIRMS = ['Atlas', 'Beam', 'Cove', 'Dune', 'Echo']

interface Instance {
  /** pRank[p][f] is where person p places firm f, 1 being their first choice. */
  pRank: number[][]
  fRank: number[][]
}
/** solution[person] = firm, or -1 while they are unmatched. */
type Solution = number[]

const partnersOf = (sol: Solution) => {
  const held = new Array(N).fill(-1)
  sol.forEach((f, p) => {
    if (f >= 0) held[f] = p
  })
  return held
}

/**
 * Pairs who would walk out together: each prefers the other to who they have.
 * One of these anywhere and the matching falls apart.
 */
function blockingPairs(inst: Instance, sol: Solution): [number, number][] {
  const held = partnersOf(sol)
  const out: [number, number][] = []
  for (let p = 0; p < N; p++) {
    for (let f = 0; f < N; f++) {
      if (sol[p] === f) continue
      const pNow = sol[p]
      const fNow = held[f]
      const pWants = pNow < 0 || inst.pRank[p][f] < inst.pRank[p][pNow]
      const fWants = fNow < 0 || inst.fRank[f][p] < inst.fRank[f][fNow]
      if (pWants && fWants) out.push([p, f])
    }
  }
  return out
}

const totalRank = (inst: Instance, sol: Solution) =>
  sol.reduce((a, f, p) => a + inst.pRank[p][f] + inst.fRank[f][p], 0)

const PERMS: number[][] = (() => {
  const out: number[][] = []
  const walk = (left: number[], acc: number[]) => {
    if (!left.length) return void out.push(acc)
    left.forEach((x, i) => walk([...left.slice(0, i), ...left.slice(i + 1)], [...acc, x]))
  }
  walk([0, 1, 2, 3, 4], [])
  return out
})()

export const stablematch: Minigame<Instance, Solution> = {
  id: 'stablematch',
  title: 'The Match',
  problem: 'Stable Matching',
  family: 'assignment',
  blurb: 'Pair five people with five firms. Nobody can be left in a pair where both of them would rather have each other. Among the arrangements that hold, find the fairest.',
  howTo: 'Each cell is a mutual opinion. The big number is what the person thinks of the firm and the small one is what the firm thinks of them. 1 is best. Red cells are pairs who would run off together.',
  objective: 'min',
  unit: 'regret',

  generate(rng: RNG): Instance {
    const shuffled = () => {
      const a = Array.from({ length: N }, (_, i) => i)
      for (let i = a.length - 1; i > 0; i--) {
        const k = rng.int(i + 1)
        ;[a[i], a[k]] = [a[k], a[i]]
      }
      return a
    }
    const toRanks = (order: number[]) => {
      const r = new Array(N).fill(0)
      order.forEach((who, place) => (r[who] = place + 1))
      return r
    }
    return {
      pRank: Array.from({ length: N }, () => toRanks(shuffled())),
      fRank: Array.from({ length: N }, () => toRanks(shuffled())),
    }
  },

  initial(): Solution {
    return new Array(N).fill(-1)
  },

  evaluate(inst, sol) {
    const open = sol.filter((f) => f < 0).length
    if (open > 0) {
      return { value: 0, feasible: false, note: `${open} ${open === 1 ? 'person is' : 'people are'} still unplaced.` }
    }
    const bad = blockingPairs(inst, sol)
    if (bad.length > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${bad.length} pair${bad.length === 1 ? '' : 's'} would abandon this and pair up instead.`,
      }
    }
    return {
      value: totalRank(inst, sol),
      feasible: true,
      note: 'Stable. Nobody can find a better deal that the other side would accept.',
    }
  },

  solve(inst): Reference<Solution> {
    // All 120 pairings, keep the stable ones, take the kindest overall.
    let best: Solution = PERMS[0]
    let bestScore = Infinity
    for (const perm of PERMS) {
      if (blockingPairs(inst, perm).length) continue
      const score = totalRank(inst, perm)
      if (score < bestScore) {
        bestScore = score
        best = perm
      }
    }
    return { solution: best, label: 'fairest stable match', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'stm'
    host.appendChild(root)

    function draw(sol: Solution, ref: Solution | null) {
      // Before everyone is placed, every spare pair technically blocks, which
      // paints the whole board red and says nothing. Only flag once it's full.
      const complete = sol.every((f) => f >= 0)
      const bad = new Set(
        (complete ? blockingPairs(inst, sol) : []).map(([p, f]) => `${p}-${f}`),
      )
      const head = FIRMS.map((f) => `<th>${f}</th>`).join('')
      const rows = PEOPLE.map((name, p) => {
        const cells = FIRMS.map((_, f) => {
          const on = sol[p] === f
          const opt = !!ref && ref[p] === f
          const block = bad.has(`${p}-${f}`)
          return `<td class="cell${on ? ' on' : ''}${opt ? ' opt' : ''}${block ? ' block' : ''}" data-p="${p}" data-f="${f}">
            <b>${inst.pRank[p][f]}</b><i>${inst.fRank[f][p]}</i>
          </td>`
        }).join('')
        return `<tr><th class="who">${name}</th>${cells}</tr>`
      }).join('')

      root.innerHTML = `
        <table><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>
        <p class="stm-key"><span><b>4</b> what the person thinks</span><span><i>2</i> what the firm thinks</span><span class="k-block">red = would run off together</span></p>`

      root.querySelectorAll<HTMLElement>('.cell').forEach((el) => {
        el.addEventListener('click', () => {
          const p = Number(el.dataset.p)
          const f = Number(el.dataset.f)
          const next = [...sol]
          for (let i = 0; i < N; i++) if (next[i] === f) next[i] = -1
          next[p] = sol[p] === f ? -1 : f
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

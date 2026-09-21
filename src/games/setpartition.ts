import type { Minigame, Reference, RNG } from '../core/types'

const LEGS = 14
const ROSTERS = 12

interface Instance {
  /** Bitmask of the flights each roster covers, plus what it costs to run. */
  covers: number[]
  cost: number[]
}
/** Rosters you put on the board. */
type Solution = number[]

const popcount = (x: number) => {
  let c = 0
  while (x) {
    x &= x - 1
    c++
  }
  return c
}

function counts(inst: Instance, sol: Solution): number[] {
  const n = new Array(LEGS).fill(0)
  sol.forEach((i) => {
    for (let k = 0; k < LEGS; k++) if ((inst.covers[i] >> k) & 1) n[k]++
  })
  return n
}

/** 2^12 combinations, keeping only the ones that hit every flight once. */
function cheapestBoard(inst: Instance): Solution {
  const full = (1 << LEGS) - 1
  let best: Solution = []
  let bestCost = Infinity
  for (let mask = 1; mask < 1 << ROSTERS; mask++) {
    let used = 0
    let cost = 0
    let ok = true
    for (let i = 0; i < ROSTERS; i++) {
      if (!((mask >> i) & 1)) continue
      if (used & inst.covers[i]) {
        ok = false
        break
      }
      used |= inst.covers[i]
      cost += inst.cost[i]
    }
    if (ok && used === full && cost < bestCost) {
      bestCost = cost
      best = Array.from({ length: ROSTERS }, (_, i) => i).filter((i) => (mask >> i) & 1)
    }
  }
  return best
}

export const setpartition: Minigame<Instance, Solution> = {
  id: 'setpartition',
  title: 'One Each',
  problem: 'Set Partitioning',
  family: 'covering',
  blurb: 'Fourteen flights and a pile of possible crew rosters. Every flight needs exactly one crew on it, no more and no fewer.',
  howTo: 'Click a roster to put it on the board or take it off. A flight with nobody on it stays dim and a flight with two crews turns red.',
  objective: 'min',
  unit: 'cost',

  generate(rng: RNG): Instance {
    const masks: number[] = []
    // Two full carve-ups of the flight list, so a clean answer always exists,
    // then a handful of tempting rosters that do not fit with anything.
    for (let round = 0; round < 2; round++) {
      const order = Array.from({ length: LEGS }, (_, i) => i)
      for (let i = order.length - 1; i > 0; i--) {
        const k = rng.int(i + 1)
        ;[order[i], order[k]] = [order[k], order[i]]
      }
      let at = 0
      while (at < LEGS) {
        const size = Math.min(LEGS - at, 2 + rng.int(3))
        let m = 0
        for (let k = 0; k < size; k++) m |= 1 << order[at + k]
        at += size
        if (!masks.includes(m)) masks.push(m)
      }
    }
    while (masks.length < ROSTERS) {
      const size = 2 + rng.int(4)
      let m = 0
      while (popcount(m) < size) m |= 1 << rng.int(LEGS)
      if (!masks.includes(m)) masks.push(m)
    }
    const covers = masks.slice(0, ROSTERS)
    return {
      covers,
      cost: covers.map((m) => Math.round(popcount(m) * (9 + rng.next() * 7)) + rng.int(12)),
    }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    const n = counts(inst, sol)
    const empty = n.filter((x) => x === 0).length
    const doubled = n.filter((x) => x > 1).length
    if (doubled > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${doubled} flight${doubled === 1 ? ' has' : 's have'} more than one crew on board.`,
      }
    }
    if (empty > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${empty} flight${empty === 1 ? ' has' : 's have'} nobody flying ${empty === 1 ? 'it' : 'them'}.`,
      }
    }
    return {
      value: sol.reduce((a, i) => a + inst.cost[i], 0),
      feasible: true,
      note: `All 14 flights covered by ${sol.length} rosters, one crew each.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: cheapestBoard(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'sp'
    root.innerHTML = `
      <div class="sp-top"><h3>flights</h3><div class="sp-legs" id="legs"></div></div>
      <div class="sp-list" id="list"></div>`
    host.appendChild(root)

    const legs = root.querySelector('#legs') as HTMLElement
    const list = root.querySelector('#list') as HTMLElement

    function draw(sol: Solution, ref: Solution | null) {
      const n = counts(inst, sol)

      legs.innerHTML = ''
      for (let k = 0; k < LEGS; k++) {
        const chip = document.createElement('span')
        chip.className = `sp-leg${n[k] === 1 ? ' on' : ''}${n[k] > 1 ? ' over' : ''}`
        chip.textContent = String(k + 1)
        legs.appendChild(chip)
      }

      list.innerHTML = ''
      inst.covers.forEach((m, i) => {
        const on = sol.includes(i)
        const opt = !!ref && ref.includes(i)
        const el = document.createElement('button')
        el.className = `sp-roster${on ? ' on' : ''}${opt ? ' opt' : ''}`
        const bits = Array.from({ length: LEGS }, (_, k) => {
          const inSet = (m >> k) & 1
          const over = inSet && on && n[k] > 1
          return `<i class="${inSet ? (over ? 'in over' : 'in') : ''}"></i>`
        }).join('')
        el.innerHTML = `
          <span class="sp-head"><b>${inst.cost[i]}</b><em>${popcount(m)} flights</em></span>
          <span class="sp-bits">${bits}</span>`
        el.addEventListener('click', () => {
          api.commit(on ? sol.filter((x) => x !== i) : [...sol, i])
        })
        list.appendChild(el)
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

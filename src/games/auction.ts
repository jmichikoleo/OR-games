import type { Minigame, Reference, RNG } from '../core/types'

const LOTS = 8
const BIDS = 12
const LETTERS = 'ABCDEFGH'

interface Bid {
  /** Bitmask of the lots this bidder wants, all or nothing. */
  wants: number
  price: number
}
interface Instance {
  bids: Bid[]
}
/** Bids you banged the hammer on. */
type Solution = number[]

const popcount = (x: number) => {
  let c = 0
  while (x) {
    x &= x - 1
    c++
  }
  return c
}

/** Pairs of accepted bids that want the same lot, so both cannot stand. */
function clashes(inst: Instance, sol: Solution): Set<number> {
  const bad = new Set<number>()
  for (let i = 0; i < sol.length; i++) {
    for (let j = i + 1; j < sol.length; j++) {
      if (inst.bids[sol[i]].wants & inst.bids[sol[j]].wants) {
        bad.add(sol[i])
        bad.add(sol[j])
      }
    }
  }
  return bad
}

/** 2^12 combinations of bids, every one of them checked. */
function bestSale(inst: Instance): Solution {
  let best: Solution = []
  let bestPrice = 0
  for (let mask = 1; mask < 1 << BIDS; mask++) {
    let used = 0
    let price = 0
    let ok = true
    for (let i = 0; i < BIDS; i++) {
      if (!((mask >> i) & 1)) continue
      if (used & inst.bids[i].wants) {
        ok = false
        break
      }
      used |= inst.bids[i].wants
      price += inst.bids[i].price
    }
    if (ok && price > bestPrice) {
      bestPrice = price
      best = Array.from({ length: BIDS }, (_, i) => i).filter((i) => (mask >> i) & 1)
    }
  }
  return best
}

export const auction: Minigame<Instance, Solution> = {
  id: 'auction',
  title: 'Going Once',
  problem: 'Combinatorial Auction',
  family: 'markets',
  blurb: 'Eight lots and twelve bidders, each one wanting a particular bundle and refusing to split it. Accept the set of bids that brings in the most money.',
  howTo: 'Click a bid to accept or reject it. No lot can go to two bidders, so any two accepted bids that want the same lot both turn red.',
  objective: 'max',
  unit: 'revenue',

  generate(rng: RNG): Instance {
    const worth = Array.from({ length: LOTS }, () => 10 + rng.int(31))
    const bids: Bid[] = []
    while (bids.length < BIDS) {
      const size = 2 + rng.int(3)
      let wants = 0
      while (popcount(wants) < size) wants |= 1 << rng.int(LOTS)
      if (bids.some((b) => b.wants === wants)) continue
      let base = 0
      for (let i = 0; i < LOTS; i++) if ((wants >> i) & 1) base += worth[i]
      bids.push({ wants, price: Math.round(base * (0.8 + rng.next() * 0.6)) })
    }
    return { bids }
  },

  initial(): Solution {
    return []
  },

  evaluate(inst, sol) {
    if (sol.length === 0) {
      return { value: 0, feasible: false, note: 'Nothing sold yet.' }
    }
    const bad = clashes(inst, sol)
    if (bad.size > 0) {
      return {
        value: 0,
        feasible: false,
        note: `${bad.size} accepted bids are fighting over the same lots.`,
      }
    }
    let sold = 0
    sol.forEach((i) => (sold |= inst.bids[i].wants))
    const left = LOTS - popcount(sold)
    return {
      value: sol.reduce((a, i) => a + inst.bids[i].price, 0),
      feasible: true,
      note: left === 0
        ? `Every lot sold across ${sol.length} bids.`
        : `${sol.length} bids accepted and ${left} lots go unsold.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestSale(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'auc'
    root.innerHTML = `
      <div class="auc-top">
        <h3>lots</h3>
        <div class="auc-lots" id="lots"></div>
      </div>
      <div class="auc-bids" id="bids"></div>`
    host.appendChild(root)

    const lots = root.querySelector('#lots') as HTMLElement
    const list = root.querySelector('#bids') as HTMLElement

    function draw(sol: Solution, ref: Solution | null) {
      let sold = 0
      sol.forEach((i) => (sold |= inst.bids[i].wants))
      const bad = clashes(inst, sol)

      lots.innerHTML = ''
      for (let i = 0; i < LOTS; i++) {
        const chip = document.createElement('span')
        chip.className = `auc-lot${(sold >> i) & 1 ? ' on' : ''}`
        chip.textContent = LETTERS[i]
        lots.appendChild(chip)
      }

      list.innerHTML = ''
      inst.bids.forEach((b, i) => {
        const on = sol.includes(i)
        const opt = !!ref && ref.includes(i)
        const el = document.createElement('button')
        el.className = `auc-bid${on ? ' on' : ''}${bad.has(i) ? ' clash' : ''}${opt ? ' opt' : ''}`
        const cells = Array.from({ length: LOTS }, (_, k) =>
          `<i class="${(b.wants >> k) & 1 ? 'in' : ''}">${LETTERS[k]}</i>`,
        ).join('')
        el.innerHTML = `<span class="auc-price">${b.price}</span><span class="auc-bits">${cells}</span>`
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

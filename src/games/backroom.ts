import type { Minigame, Reference, RNG } from '../core/types'

const SHOPS = ['Northgate', 'Riverside', 'Oldtown']
const N = SHOPS.length
const HUES = ['#ff4d9d', '#5b8cff', '#52e68a']

interface Instance {
  /** Lowest and highest the day's demand can come out at each shop. */
  low: number[]
  high: number[]
  /** Units you have to place before you know any of it. */
  stock: number
  /** Cost of running one out of the back room, and of failing a customer. */
  fetch: number
  miss: number
}
/** Units left at each shop, and the rest kept in the back room. */
interface Solution {
  shop: number[]
  back: number
}

const spread = (inst: Instance, i: number) => inst.high[i] - inst.low[i] + 1

/**
 * Walk every day the three shops could have between them. Stock left at a
 * shop only ever helps that shop, which is the whole reason the back room
 * is worth anything.
 */
function expected(inst: Instance, sol: Solution): number {
  let total = 0
  let ways = 0
  const walk = (i: number, short: number) => {
    if (i === N) {
      const covered = Math.min(sol.back, short)
      total += covered * inst.fetch + (short - covered) * inst.miss
      ways++
      return
    }
    for (let d = inst.low[i]; d <= inst.high[i]; d++) {
      walk(i + 1, short + Math.max(0, d - sol.shop[i]))
    }
  }
  walk(0, 0)
  return Math.round((total / ways) * 10) / 10
}

/** Chance a shop cannot serve everybody out of what is on its own shelves. */
const runsOutOdds = (inst: Instance, sol: Solution, i: number) => {
  let bad = 0
  for (let d = inst.low[i]; d <= inst.high[i]; d++) if (d > sol.shop[i]) bad++
  return Math.round((bad / spread(inst, i)) * 100)
}

/** Every way of splitting the stock four ways. */
function bestSplit(inst: Instance): Solution {
  let best: Solution = { shop: [0, 0, 0], back: inst.stock }
  let bestVal = Infinity
  for (let a = 0; a <= inst.stock; a++) {
    for (let b = 0; a + b <= inst.stock; b++) {
      for (let c = 0; a + b + c <= inst.stock; c++) {
        const sol = { shop: [a, b, c], back: inst.stock - a - b - c }
        const v = expected(inst, sol)
        if (v < bestVal) {
          bestVal = v
          best = sol
        }
      }
    }
  }
  return best
}

/** Send it all out to the shops, split by how busy they usually are, and
 *  keep nothing back. The thing everybody does first. */
function allOut(inst: Instance): Solution {
  const mean = inst.low.map((lo, i) => (lo + inst.high[i]) / 2)
  const sum = mean.reduce((a, m) => a + m, 0)
  const shop = mean.map((m) => Math.round((m / sum) * inst.stock))
  let over = shop.reduce((a, n) => a + n, 0) - inst.stock
  for (let i = 0; over !== 0 && i < N; i++) {
    const step = over > 0 ? -1 : 1
    shop[i] += step
    over += step
  }
  return { shop, back: inst.stock - shop.reduce((a, n) => a + n, 0) }
}

export const backroom: Minigame<Instance, Solution> = {
  id: 'backroom',
  title: 'The Back Room',
  problem: 'Multi-Echelon Inventory',
  family: 'inventory',
  blurb: 'Three shops and a back room, and you place every unit before anybody walks in. A unit sat in the wrong shop is no use to the shop across town, but a unit in the back room can go wherever the day turns out to need it, for the price of sending it.',
  howTo: 'Move stock between the three shops and the back room. A shop serves from its own shelves first. Anything it cannot serve comes out of the back room at a cost, and whatever the back room cannot cover is a customer lost.',
  objective: 'min',
  unit: 'a day',

  generate(rng: RNG): Instance {
    for (let tries = 0; ; tries++) {
      const low = SHOPS.map(() => 1 + rng.int(6))
      const high = low.map((lo) => lo + 5 + rng.int(4))
      const mean = low.reduce((a, lo, i) => a + (lo + high[i]) / 2, 0)
      const inst: Instance = {
        low,
        high,
        stock: Math.round(mean * (0.82 + rng.next() * 0.16)),
        fetch: 2 + rng.int(4),
        miss: 14 + rng.int(14),
      }
      const best = expected(inst, bestSplit(inst))
      const naive = expected(inst, allOut(inst))
      if (naive <= 0) continue
      // Only a day where sending the lot out to the shops costs you.
      if (best / naive < 0.8 || tries > 120) return inst
    }
  },

  initial(inst): Solution {
    return allOut(inst)
  },

  evaluate(inst, sol) {
    const placed = sol.shop.reduce((a, n) => a + n, 0) + sol.back
    if (placed !== inst.stock) {
      const off = placed - inst.stock
      return {
        value: 0,
        feasible: false,
        note: off > 0 ? `${off} units more than you have.` : `${-off} units still unplaced.`,
      }
    }
    const risky = SHOPS.filter((_, i) => runsOutOdds(inst, sol, i) >= 50).length
    return {
      value: expected(inst, sol),
      feasible: true,
      note: `${sol.back} held back. ${risky} shop${risky === 1 ? ' is' : 's are'} more likely than not to come up short on ${risky === 1 ? 'its' : 'their'} own.`,
    }
  },

  solve(inst): Reference<Solution> {
    return { solution: bestSplit(inst), label: 'exhaustive', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'bkr'
    host.appendChild(root)

    function draw(sol: Solution, ref: Solution | null) {
      const placed = sol.shop.reduce((a, n) => a + n, 0) + sol.back
      root.innerHTML = ''

      SHOPS.forEach((name, i) => {
        const odds = runsOutOdds(inst, sol, i)
        const row = document.createElement('div')
        row.className = `bkr-row${odds >= 50 ? ' risky' : ''}`
        row.style.setProperty('--who', HUES[i])
        row.innerHTML = `
          <b>${name}</b>
          <span class="bkr-sub">takes ${inst.low[i]} to ${inst.high[i]} on the day</span>
          <span class="bkr-odds">${odds} percent short</span>
          ${ref ? `<em class="bkr-want">solver ${ref.shop[i]}</em>` : ''}
          <button class="bkr-step" data-d="-1">-</button>
          <span class="bkr-n">${sol.shop[i]}</span>
          <button class="bkr-step" data-d="1">+</button>`
        row.querySelectorAll('.bkr-step').forEach((b) =>
          b.addEventListener('click', () => {
            const d = Number((b as HTMLElement).dataset.d)
            const shop = [...sol.shop]
            if (shop[i] + d < 0 || sol.back - d < 0) return
            shop[i] += d
            api.commit({ shop, back: sol.back - d })
          }),
        )
        root.appendChild(row)
      })

      const back = document.createElement('div')
      back.className = 'bkr-row bkr-back'
      back.innerHTML = `
        <b>Back room</b>
        <span class="bkr-sub">${inst.fetch} to run one out, ${inst.miss} if nobody can</span>
        <span class="bkr-odds"></span>
        ${ref ? `<em class="bkr-want">solver ${ref.back}</em>` : ''}
        <span class="bkr-hold">${sol.back}</span>`
      root.appendChild(back)

      const tally = document.createElement('div')
      tally.className = `bkr-tally${placed !== inst.stock ? ' over' : ''}`
      tally.textContent = `${placed} of ${inst.stock} units placed`
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

import type { Minigame, Reference, RNG } from '../core/types'

const TITLES = ['Daily Ledger', 'The Tribune', 'Weekly Post', 'City Gazette']

interface Product {
  name: string
  cost: number
  price: number
  salvage: number
  /** Demand values lo..hi and their probabilities, same length. */
  lo: number
  hi: number
  prob: number[]
}
interface Instance {
  products: Product[]
  capacity: number
}
/** Units ordered of each title. */
type Solution = number[]

/**
 * Expected profit of ordering q: you sell min(q, demand) at full price, dump
 * the rest at salvage, and pay for every copy either way.
 */
function expectedProfit(p: Product, q: number): number {
  let e = 0
  for (let i = 0; i < p.prob.length; i++) {
    const d = p.lo + i
    e += p.prob[i] * (p.price * Math.min(q, d) + p.salvage * Math.max(0, q - d))
  }
  return e - p.cost * q
}

const profitTable = (p: Product) =>
  Array.from({ length: p.hi + 1 }, (_, q) => expectedProfit(p, q))

/** Best q ignoring the shelf — the classic critical-fractile answer. */
const unconstrainedBest = (p: Product) => {
  const t = profitTable(p)
  return t.indexOf(Math.max(...t))
}

export const newsvendor: Minigame<Instance, Solution> = {
  id: 'newsvendor',
  title: 'Morning Papers',
  problem: 'Newsvendor',
  family: 'inventory',
  blurb: 'Order tomorrow’s papers today. Unsold copies go for scrap, empty shelves lose the sale, and you only have so much shelf space.',
  howTo: 'Use − and + to set how many of each title to order. Lit bars are the demand you would cover. Your order cannot exceed the shelf.',
  objective: 'max',
  unit: 'profit',

  generate(rng: RNG): Instance {
    const products: Product[] = TITLES.map((name) => {
      const cost = 2 + rng.int(4)
      const price = cost + 2 + rng.int(6)
      const salvage = rng.int(cost)
      const lo = 4 + rng.int(6)
      const hi = lo + 8 + rng.int(8)
      // Tent-shaped demand: middling days are likeliest.
      const raw = Array.from({ length: hi - lo + 1 }, (_, i) =>
        1 + Math.min(i, hi - lo - i),
      )
      const total = raw.reduce((a, b) => a + b, 0)
      return { name, cost, price, salvage, lo, hi, prob: raw.map((w) => w / total) }
    })

    const free = products.reduce((a, p) => a + unconstrainedBest(p), 0)
    return { products, capacity: Math.round(free * 0.7) }
  },

  initial(inst): Solution {
    return inst.products.map(() => 0)
  },

  evaluate(inst, sol) {
    const used = sol.reduce((a, b) => a + b, 0)
    if (used > inst.capacity) {
      return {
        value: 0,
        feasible: false,
        note: `Shelf overflows by ${used - inst.capacity} copies.`,
      }
    }
    return {
      value: sol.reduce((a, q, i) => a + expectedProfit(inst.products[i], q), 0),
      feasible: true,
      note: `${used} of ${inst.capacity} copies on the shelf.`,
    }
  },

  solve(inst): Reference<Solution> {
    // DP over remaining shelf space, one title at a time.
    const cap = inst.capacity
    const tables = inst.products.map(profitTable)
    let dp = new Float64Array(cap + 1)
    const choice: number[][] = []

    inst.products.forEach((p, k) => {
      const next = new Float64Array(cap + 1).fill(-Infinity)
      const pick = new Array(cap + 1).fill(0)
      for (let c = 0; c <= cap; c++) {
        for (let q = 0; q <= Math.min(p.hi, c); q++) {
          const cand = tables[k][q] + dp[c - q]
          if (cand > next[c]) {
            next[c] = cand
            pick[c] = q
          }
        }
      }
      dp = next
      choice.push(pick)
    })

    const order = new Array(inst.products.length).fill(0)
    let left = cap
    for (let k = inst.products.length - 1; k >= 0; k--) {
      const q = choice[k][left]
      order[k] = q
      left -= q
    }
    return { solution: order, label: 'shelf-space DP', exact: true }
  },

  mount(host, inst, api) {
    const root = document.createElement('div')
    root.className = 'nv'
    root.innerHTML = `
      <div class="nv-gauge"><div class="nv-fill" id="fill"></div></div>
      <p class="nv-read" id="read"></p>
      <div class="nv-grid" id="grid"></div>`
    host.appendChild(root)

    const fill = root.querySelector('#fill') as HTMLElement
    const read = root.querySelector('#read') as HTMLElement
    const grid = root.querySelector('#grid') as HTMLElement

    function draw(sol: Solution, ref: Solution | null) {
      const used = sol.reduce((a, b) => a + b, 0)
      const over = used > inst.capacity
      fill.style.width = `${Math.min(100, (used / inst.capacity) * 100)}%`
      fill.classList.toggle('over', over)
      read.textContent = `${used} / ${inst.capacity} copies`
      read.classList.toggle('over', over)

      grid.innerHTML = ''
      inst.products.forEach((p, k) => {
        const q = sol[k]
        const peak = Math.max(...p.prob)
        const bars = p.prob
          .map((pr, i) => {
            const d = p.lo + i
            const covered = d <= q
            return `<i class="${covered ? 'cov' : ''}" style="height:${Math.max(8, (pr / peak) * 100)}%"></i>`
          })
          .join('')
        const card = document.createElement('div')
        card.className = 'nv-card'
        card.innerHTML = `
          <div class="nv-head">
            <b>${p.name}</b>
            <span>sell ${p.price} · cost ${p.cost} · scrap ${p.salvage}</span>
          </div>
          <div class="nv-hist">${bars}</div>
          <div class="nv-axis"><span>${p.lo}</span><span>demand</span><span>${p.hi}</span></div>
          <div class="nv-step">
            <button data-k="${k}" data-d="-1">&minus;</button>
            <b>${q}${ref ? `<em>${ref[k]}</em>` : ''}</b>
            <button data-k="${k}" data-d="1">+</button>
          </div>`
        grid.appendChild(card)
      })

      grid.querySelectorAll<HTMLElement>('.nv-step button').forEach((btn) => {
        btn.addEventListener('click', () => {
          const k = Number(btn.dataset.k)
          const d = Number(btn.dataset.d)
          const next = [...sol]
          next[k] = Math.max(0, Math.min(inst.products[k].hi, next[k] + d))
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

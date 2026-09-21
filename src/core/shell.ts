import type { Evaluation, GameView, Minigame, Reference } from './types'
import { familyById } from './registry'
import { makeRng, randomSeed } from './rng'
import { bestFor, record } from './profile'

/**
 * Score is the optimality gap, and it is the same number in every game:
 * how close your objective got to the reference solver's. Beating a
 * heuristic reference is allowed and scores above 100.
 */
function scoreOf(objective: 'min' | 'max', yours: number, target: number): number {
  if (!isFinite(yours) || !isFinite(target) || yours < 0 || target < 0) return 0
  // Zero is a legitimate objective value (a schedule with no tardiness, an
  // empty route), so it can't be treated as "no solution yet".
  const ratio =
    objective === 'min'
      ? yours === 0
        ? target === 0
          ? 1
          : 2
        : target / yours
      : target === 0
        ? yours === 0
          ? 1
          : 2
        : yours / target
  // Floor, not round: being one unit short of optimal must not print 100.0%.
  // Snap only on a genuine tie, allowing for float noise.
  if (Math.abs(ratio - 1) < 1e-9) return 100
  return Math.floor(ratio * 1000) / 10
}

const fmt = (n: number): string =>
  n >= 1000 ? Math.round(n).toLocaleString() : (Math.round(n * 10) / 10).toString()

export function mountGame(root: HTMLElement, game: Minigame<any, any>, seed = randomSeed()) {
  const family = familyById(game.family)
  const accent = family?.accent ?? '#f59e0b'

  root.innerHTML = `
    <div class="game" style="--accent:${accent}">
      <header class="game-head">
        <a class="back" href="#/">&larr; arcade</a>
        <div class="head-text">
          <h1>${game.title}</h1>
          <p class="problem"><span class="dot"></span>${game.problem}</p>
          <p class="blurb">${game.blurb}</p>
        </div>
      </header>
      <div class="stage">
        <section class="board-wrap">
          <div class="board" id="board"></div>
          <p class="howto">${game.howTo}</p>
        </section>
        <aside class="hud">
          <div class="stat stat-score">
            <span class="k">score</span>
            <strong id="score">--</strong>
          </div>
          <div class="stat">
            <span class="k">yours</span>
            <strong id="yours">--</strong>
          </div>
          <div class="stat">
            <span class="k" id="target-k">target</span>
            <strong id="target">--</strong>
          </div>
          <p class="note" id="note"></p>
          <div class="hud-actions">
            <button id="reveal" class="btn">reveal solver</button>
            <button id="reset" class="btn ghost">reset</button>
            <button id="newgame" class="btn ghost">new instance</button>
          </div>
          <p class="meta">
            <span>best <b id="best">--</b></span>
            <span>seed <b id="seed">${seed.toString(36)}</b></span>
          </p>
        </aside>
      </div>
    </div>`

  const $ = <T extends HTMLElement>(id: string) => root.querySelector(`#${id}`) as T
  const boardEl = $('board')
  const scoreEl = $('score')
  const yoursEl = $('yours')
  const targetEl = $('target')
  const targetK = $('target-k')
  const noteEl = $('note')
  const bestEl = $('best')
  const revealBtn = $<HTMLButtonElement>('reveal')

  let instance = game.generate(makeRng(seed))
  let solution = game.initial(instance)
  let reference: Reference<any> = game.solve(instance)
  let revealed = false
  let view: GameView<any> | null = null

  const refEval: () => Evaluation = () => game.evaluate(instance, reference.solution)

  function paint() {
    const ev: Evaluation = game.evaluate(instance, solution)
    const target = refEval().value

    yoursEl.textContent = ev.feasible ? `${fmt(ev.value)} ${game.unit}` : '--'
    targetEl.textContent = `${fmt(target)} ${game.unit}`
    targetK.textContent = reference.exact ? 'optimal' : reference.label
    noteEl.textContent = ev.note

    if (ev.feasible) {
      const s = scoreOf(game.objective, ev.value, target)
      scoreEl.textContent = `${s.toFixed(1)}%`
      scoreEl.classList.toggle('beat', s > 100)
      const fresh = record(game.id, s)
      const best = Math.max(s, bestFor(game.id))
      bestEl.textContent = `${best.toFixed(1)}%`
      bestEl.classList.toggle('fresh', fresh)
    } else {
      scoreEl.textContent = '--'
      scoreEl.classList.remove('beat')
      const best = bestFor(game.id)
      bestEl.textContent = best ? `${best.toFixed(1)}%` : '--'
      bestEl.classList.remove('fresh')
    }

    view?.draw(solution, revealed ? reference.solution : null)
  }

  function build() {
    view?.destroy()
    boardEl.innerHTML = ''
    view = game.mount(boardEl, instance, {
      commit(next) {
        solution = next
        paint()
      },
      current: () => solution,
    })
    paint()
  }

  revealBtn.addEventListener('click', () => {
    revealed = !revealed
    revealBtn.textContent = revealed ? 'hide solver' : 'reveal solver'
    revealBtn.classList.toggle('on', revealed)
    paint()
  })

  $('reset').addEventListener('click', () => {
    solution = game.initial(instance)
    paint()
  })

  $('newgame').addEventListener('click', () => {
    const next = randomSeed()
    instance = game.generate(makeRng(next))
    solution = game.initial(instance)
    reference = game.solve(instance)
    revealed = false
    revealBtn.textContent = 'reveal solver'
    revealBtn.classList.remove('on')
    $('seed').textContent = next.toString(36)
    build()
  })

  build()

  return () => view?.destroy()
}

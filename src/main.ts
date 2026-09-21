import './style.css'
import { FAMILIES, GAMES, gameById, gameForProblem, totalProblems } from './core/registry'
import { mountGame } from './core/shell'
import { seedFromString } from './core/rng'
import { activePlayer, bests, hasSeenTutorial } from './core/profile'
import { askForPlayer, openTutorial, renderTopbar } from './core/ui'

const root = document.querySelector<HTMLElement>('#app')!
let content = document.createElement('main')
let unmount: (() => void) | null = null

function chrome() {
  root.innerHTML = ''
  root.appendChild(renderTopbar(() => route()))
  content = document.createElement('main')
  root.appendChild(content)
}

function homeHTML(): string {
  const scores = bests()
  const played = GAMES.filter((g) => (scores[g.id] ?? 0) > 0)
  const perfect = played.filter((g) => scores[g.id] >= 100).length

  const families = FAMILIES.map((f) => {
    const built = f.problems.filter((p) => gameForProblem(p)).length
    const items = f.problems
      .map((p) => {
        const g = gameForProblem(p)
        if (!g) return `<li><span class="pname">${p}</span><span class="soon">soon</span></li>`
        const best = scores[g.id] ?? 0
        return `<li class="on"><a href="#/g/${g.id}">
            <span class="pname">${p}</span>
            <span class="row-right">
              ${best ? `<b class="best-chip${best >= 100 ? ' max' : ''}">${best.toFixed(0)}%</b>` : ''}
              <span class="gname">${g.title}</span>
            </span>
          </a></li>`
      })
      .join('')
    return `<section class="fam" style="--accent:${f.accent}">
      <header><h2>${f.name}</h2><span class="count">${built}/${f.problems.length}</span></header>
      <ul>${items}</ul>
    </section>`
  }).join('')

  const who = activePlayer()
  return `<div class="home">
    <header class="hero">
      <h1>OR-Game</h1>
      <p class="tag">An arcade of hard problems. One minigame for every problem in Operations Research.</p>
      <p class="rule">You solve it by hand. Then a real solver has a go at the same board. Your score is how close you got.</p>
      <div class="stats">
        <span><b>${GAMES.length}</b> playable</span>
        <span><b>${totalProblems()}</b> problems</span>
        <span><b>${FAMILIES.length}</b> families</span>
      </div>
      ${
        who
          ? `<div class="mine">
              <span class="mine-who">${who.name}</span>
              <span><b>${played.length}</b> played</span>
              <span><b>${perfect}</b> solved perfectly</span>
              ${played.length ? `<a class="mine-link" href="#/scores">see all your scores</a>` : ''}
            </div>`
          : ''
      }
    </header>
    <div class="fams">${families}</div>
    <footer class="foot">Every problem above is a slot for a game. The built ones are lit.</footer>
  </div>`
}

function scoresHTML(): string {
  const scores = bests()
  const rows = GAMES.map((g) => ({ g, best: scores[g.id] ?? 0 }))
    .sort((a, b) => b.best - a.best)
    .map(
      ({ g, best }) => `<a class="score-row" href="#/g/${g.id}">
        <span class="score-name">${g.title}<em>${g.problem}</em></span>
        <span class="score-bar"><i style="width:${Math.min(100, best)}%"></i></span>
        <b class="${best >= 100 ? 'max' : ''}">${best ? `${best.toFixed(1)}%` : 'not played'}</b>
      </a>`,
    )
    .join('')
  const who = activePlayer()
  return `<div class="scores">
    <a class="back" href="#/">&larr; arcade</a>
    <h1>${who ? who.name : 'Your'} scores</h1>
    <p class="rule">Your best run on every game so far. Beating a score replaces it.</p>
    <div class="score-list">${rows}</div>
  </div>`
}

function route() {
  unmount?.()
  unmount = null
  chrome()

  const path = location.hash.replace(/^#\/?/, '')
  const parts = path.split('/').filter(Boolean)

  if (parts[0] === 'g' && parts[1]) {
    const game = gameById(parts[1])
    if (game) {
      const seed = parts[2] ? seedFromString(parts[2]) : undefined
      unmount = mountGame(content, game, seed)
      window.scrollTo(0, 0)
      return
    }
  }
  if (parts[0] === 'scores') {
    content.innerHTML = scoresHTML()
    return
  }
  content.innerHTML = homeHTML()
}

function boot() {
  if (!activePlayer()) {
    askForPlayer(() => {
      route()
      if (!hasSeenTutorial()) openTutorial(() => route())
    })
    chrome()
    content.innerHTML = homeHTML()
    return
  }
  route()
  if (!hasSeenTutorial()) openTutorial(() => route())
}

window.addEventListener('hashchange', route)
boot()

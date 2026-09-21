import {
  type Player,
  activePlayer,
  addPlayer,
  listPlayers,
  markTutorialSeen,
  removePlayer,
  setActive,
} from './profile'

type Done = () => void

function overlay(className: string): { box: HTMLElement; close: Done } {
  const back = document.createElement('div')
  back.className = `sheet ${className}`
  const box = document.createElement('div')
  box.className = 'sheet-box'
  back.appendChild(box)
  document.body.appendChild(back)
  requestAnimationFrame(() => back.classList.add('in'))
  return {
    box,
    close() {
      back.classList.remove('in')
      setTimeout(() => back.remove(), 160)
    },
  }
}

/** Asked once, on a brand new browser. There is no way past it without a name. */
export function askForPlayer(onDone: (p: Player) => void): void {
  const { box, close } = overlay('sheet-player')
  const others = listPlayers()
  box.innerHTML = `
    <h2>Who is playing</h2>
    <p class="sheet-sub">Scores are kept per player and stay in this browser.</p>
    <form class="sheet-form">
      <input id="pname" maxlength="24" autocomplete="off" placeholder="Your name" />
      <button type="submit" class="btn solid">Start playing</button>
    </form>
    ${
      others.length
        ? `<div class="sheet-list"><span class="sheet-label">or carry on as</span>${others
            .map(
              (p) =>
                `<button class="sheet-who" data-id="${p.id}">${p.name}<i data-drop="${p.id}">forget</i></button>`,
            )
            .join('')}</div>`
        : ''
    }`

  const input = box.querySelector('#pname') as HTMLInputElement
  const form = box.querySelector('form') as HTMLFormElement
  input.focus()

  form.addEventListener('submit', (ev) => {
    ev.preventDefault()
    const name = input.value.trim()
    if (!name) {
      input.classList.add('bad')
      input.focus()
      return
    }
    const p = addPlayer(name)
    close()
    onDone(p)
  })

  box.querySelectorAll<HTMLElement>('.sheet-who').forEach((el) => {
    el.addEventListener('click', (ev) => {
      const drop = (ev.target as HTMLElement).dataset.drop
      if (drop) {
        ev.stopPropagation()
        removePlayer(drop)
        close()
        askForPlayer(onDone)
        return
      }
      setActive(el.dataset.id!)
      close()
      onDone(activePlayer()!)
    })
  })
}

const STEPS = [
  {
    title: 'Every problem gets a game',
    body: 'The front page lists all 73 problems that Operations Research is built on, grouped into ten families. The lit ones are playable. The rest are slots waiting for a game.',
  },
  {
    title: 'You solve it by hand',
    body: 'Each game deals you a real instance and lets you click your way to an answer. Routes, schedules, layouts, packings. No maths required, just judgement.',
  },
  {
    title: 'Then a real solver has a go',
    body: 'The same board is handed to a proper algorithm. Your score is how close you got to what it found. Most of the time that number is a true optimum, not a guess.',
  },
  {
    title: 'Reveal solver shows the answer',
    body: 'Stuck or curious, hit reveal solver and the board draws what the algorithm actually did. New instance deals a fresh board whenever you want one.',
  },
]

export function openTutorial(onClose?: Done): void {
  const { box, close } = overlay('sheet-tour')
  let step = 0

  const paint = () => {
    const s = STEPS[step]
    box.innerHTML = `
      <span class="tour-count">${step + 1} of ${STEPS.length}</span>
      <h2>${s.title}</h2>
      <p class="tour-body">${s.body}</p>
      <div class="tour-dots">${STEPS.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
      <div class="tour-actions">
        <button class="btn ghost" id="skip">${step === 0 ? 'Skip' : 'Back'}</button>
        <button class="btn solid" id="next">${step === STEPS.length - 1 ? 'Got it' : 'Next'}</button>
      </div>`

    ;(box.querySelector('#next') as HTMLElement).addEventListener('click', () => {
      if (step === STEPS.length - 1) {
        markTutorialSeen()
        close()
        onClose?.()
      } else {
        step++
        paint()
      }
    })
    ;(box.querySelector('#skip') as HTMLElement).addEventListener('click', () => {
      if (step === 0) {
        markTutorialSeen()
        close()
        onClose?.()
      } else {
        step--
        paint()
      }
    })
  }
  paint()
}

/** The strip along the top of every page. */
export function renderTopbar(onChange: Done): HTMLElement {
  const bar = document.createElement('header')
  bar.className = 'topbar'
  const p = activePlayer()
  bar.innerHTML = `
    <a class="brand" href="#/">OR-Game</a>
    <div class="topbar-right">
      <button class="chip" id="howto">How to play</button>
      <button class="chip who" id="switch">${p ? p.name : 'Sign in'}</button>
    </div>`

  bar.querySelector('#howto')!.addEventListener('click', () => openTutorial())
  bar.querySelector('#switch')!.addEventListener('click', () => askForPlayer(() => onChange()))
  return bar
}

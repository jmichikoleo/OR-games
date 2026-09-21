/**
 * Local player profiles. Everything lives in this browser, there is no server
 * and nothing leaves the machine. Storage can throw or come back empty in a
 * private window, so every read and write is guarded and the site still works
 * with none of it available.
 */

export interface Player {
  id: string
  name: string
  created: number
}

const PLAYERS = 'orgame:players'
const ACTIVE = 'orgame:active'
const bestKey = (id: string) => `orgame:best:${id}`
const tourKey = (id: string) => `orgame:tutorial:${id}`

/** The site used to be called mochis. Carry anything saved under the old name
 *  across once, so nobody loses their scores to a rename. */
function carryOver(): void {
  try {
    if (localStorage.getItem(PLAYERS)) return
    const old = localStorage.getItem('mochis:players')
    if (!old) return
    localStorage.setItem(PLAYERS, old)
    const active = localStorage.getItem('mochis:active')
    if (active) localStorage.setItem(ACTIVE, active)
    for (const p of JSON.parse(old) as { id: string }[]) {
      const best = localStorage.getItem(`mochis:best:${p.id}`)
      if (best) localStorage.setItem(bestKey(p.id), best)
      const tour = localStorage.getItem(`mochis:tutorial:${p.id}`)
      if (tour) localStorage.setItem(tourKey(p.id), tour)
    }
  } catch {
    /* nothing to carry over */
  }
}
carryOver()

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private window or blocked storage, carry on without saving */
  }
}

export function listPlayers(): Player[] {
  return read<Player[]>(PLAYERS, [])
}

export function activePlayer(): Player | null {
  const id = read<string | null>(ACTIVE, null)
  if (!id) return null
  return listPlayers().find((p) => p.id === id) ?? null
}

export function addPlayer(name: string): Player {
  const player: Player = {
    id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: name.trim().slice(0, 24) || 'Player',
    created: Date.now(),
  }
  write(PLAYERS, [...listPlayers(), player])
  write(ACTIVE, player.id)
  return player
}

export function setActive(id: string): void {
  if (listPlayers().some((p) => p.id === id)) write(ACTIVE, id)
}

export function removePlayer(id: string): void {
  const left = listPlayers().filter((p) => p.id !== id)
  write(PLAYERS, left)
  try {
    localStorage.removeItem(bestKey(id))
    localStorage.removeItem(tourKey(id))
  } catch {
    /* nothing to clean up */
  }
  if (activePlayer()?.id === id) write(ACTIVE, left[0]?.id ?? null)
}

export function bests(): Record<string, number> {
  const p = activePlayer()
  return p ? read<Record<string, number>>(bestKey(p.id), {}) : {}
}

export function bestFor(gameId: string): number {
  return bests()[gameId] ?? 0
}

/** Stores the score when it beats the player's record. Says whether it did. */
export function record(gameId: string, score: number): boolean {
  const p = activePlayer()
  if (!p) return false
  const all = bests()
  if (score <= (all[gameId] ?? 0)) return false
  all[gameId] = score
  write(bestKey(p.id), all)
  return true
}

export function hasSeenTutorial(): boolean {
  const p = activePlayer()
  return p ? read<boolean>(tourKey(p.id), false) : false
}

export function markTutorialSeen(): void {
  const p = activePlayer()
  if (p) write(tourKey(p.id), true)
}

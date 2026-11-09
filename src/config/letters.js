/**
 * Letter set configuration — single source of truth.
 * Update this array to change available letters, add new ones,
 * or add a "reject / not a letter" class.
 */
export const LETTERS = ['A', 'C', 'E', 'L', 'M', 'O', 'S', 'T', 'V', 'Z']

/**
 * Returns a random letter from the set, optionally excluding one
 * (to avoid repeating the same letter twice in a row).
 */
export function randomLetter(exclude = null) {
  const pool = exclude ? LETTERS.filter(l => l !== exclude) : LETTERS
  return pool[Math.floor(Math.random() * pool.length)]
}

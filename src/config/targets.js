/**
 * Practice targets — single source of truth for the frontend.
 * The ids MUST match ml/airscribe_ml/classes.py (the model's classes).
 *
 * outline: polylines in the user's view, x right / y down, inside [-1, 1].
 * Used for the target icon, the "ideal shape" in replays and the collect page.
 */

function circle(n = 48) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * 2 * Math.PI
    return [Math.cos(a), Math.sin(a)]
  })
}

function wave(periods = 2, amp = 0.35, n = 64) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = -1 + (2 * i) / n
    return [x, -amp * Math.sin(Math.PI * periods * (x + 1))]
  })
}

// Catmull-Rom through control points (same control points as the Python template)
function smooth(ctrl, perSeg = 10) {
  const p = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]]
  const out = []
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]]
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t
      out.push([0, 1].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)))
    }
  }
  out.push(p[p.length - 2])
  return out
}

const S_CTRL = [[0.65, -0.75], [0.2, -1.0], [-0.45, -0.9], [-0.6, -0.5], [-0.2, -0.1],
  [0.4, 0.15], [0.65, 0.55], [0.35, 0.95], [-0.25, 1.0], [-0.65, 0.75]]

export const TARGETS = [
  { id: 'hline', name: 'Horizontal line', short: 'H-line', level: 1, outline: [[[-1, 0], [1, 0]]],
    hint: 'Move your finger straight across, left to right or right to left.' },
  { id: 'vline', name: 'Vertical line', short: 'V-line', level: 1, outline: [[[0, -1], [0, 1]]],
    hint: 'Move your finger straight down (or up).' },
  { id: 'circle', name: 'Circle', short: 'Circle', level: 1, outline: [circle()],
    hint: 'Draw one full circle, starting anywhere.' },
  { id: 'square', name: 'Square', short: 'Square', level: 1,
    outline: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
    hint: 'Four straight sides, pausing briefly at each corner is fine.' },
  { id: 'triangle', name: 'Triangle', short: 'Triangle', level: 1,
    outline: [[[0, -1], [1, 0.8], [-1, 0.8], [0, -1]]],
    hint: 'Three straight sides, point at the top.' },
  { id: 'wave', name: 'Wave', short: 'Wave', level: 1, outline: [wave()],
    hint: 'Two or three smooth bumps, moving sideways.' },
  { id: 'L', name: 'Letter L', short: 'L', level: 2, outline: [[[-0.55, -1], [-0.55, 1], [0.55, 1]]],
    hint: 'Down, then across to the right.' },
  { id: 'T', name: 'Letter T', short: 'T', level: 2, outline: [[[-0.8, -1], [0.8, -1]], [[0, -1], [0, 1]]],
    hint: 'Draw the top bar and the stem without stopping in between.' },
  { id: 'S', name: 'Letter S', short: 'S', level: 2, outline: [smooth(S_CTRL)],
    hint: 'One smooth movement from the top.' },
  { id: 'A', name: 'Letter A', short: 'A', level: 2,
    outline: [[[-0.8, 1], [0, -1], [0.8, 1]], [[-0.4, 0.2], [0.4, 0.2]]],
    hint: 'Up, down, then the cross bar, all in one go.' },
]

/** Model output only: shown when nothing was recognised. Also recorded on the collect page. */
export const OTHER = { id: 'other', name: 'Not recognised', short: 'Other', level: 0, outline: [],
  hint: 'Scribble anything that is NOT one of the shapes or letters (zigzags, spirals, random paths).' }

export const LEVELS = [
  { level: 1, name: 'Level 1 · Shapes' },
  { level: 2, name: 'Level 2 · Letters' },
]

export const TARGET_IDS = TARGETS.map(t => t.id)
/** Kept for older imports: the list of target ids. */
export const LETTERS = TARGET_IDS

const BY_ID = Object.fromEntries([...TARGETS, OTHER].map(t => [t.id, t]))

export function getTarget(id) {
  return BY_ID[id] || { id, name: String(id), short: String(id), level: 0, outline: [] }
}
export const targetName = id => getTarget(id).name
export const targetShort = id => getTarget(id).short

/** Random target, optionally from one level, never the same as `exclude`. */
export function randomTarget(exclude = null, level = 'all') {
  const pool = TARGETS.filter(t => (level === 'all' || t.level === level) && t.id !== exclude)
  return pool[Math.floor(Math.random() * pool.length)].id
}
export const randomLetter = randomTarget

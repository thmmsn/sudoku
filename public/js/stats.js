// Statistics computed from a profile's game history. Pure functions, no DOM.
//
// A game record looks like the server stores it:
//   { status: 'solved' | 'abandoned', difficulty, seconds, mistakes, hints,
//     startedAt, finishedAt, puzzle, puzzleId, source }
//
// Definitions
//   played     = solved + abandoned
//   winRate    = solved / played                    (null when nothing played)
//   best       = fastest solve                      (null when nothing solved)
//   bestClean  = fastest solve without hints        (null when none)
//   average    = mean solve time, solved games only
//   median     = middle solve time, solved games only
//   streak     = consecutive local calendar days with at least one solve,
//                counted back from today (or from yesterday, so an unbroken
//                streak does not read 0 before today's first solve)

import { DIFFICULTIES } from './engine.js';

export const LEVELS = [...DIFFICULTIES, 'unknown'];

export function median(nums) {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

const mean = (nums) => (nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : null);

/** Local calendar day "YYYY-MM-DD" for a Date. */
export function dayKey(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Monday 00:00 local time of the week containing `date`. */
export function weekStart(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  return addDays(d, -dow);
}

function group(games) {
  const solved = games.filter((g) => g.status === 'solved');
  const abandoned = games.filter((g) => g.status === 'abandoned');
  const times = solved.map((g) => g.seconds);
  const clean = solved.filter((g) => !g.hints).map((g) => g.seconds);
  const played = solved.length + abandoned.length;
  return {
    played,
    solved: solved.length,
    abandoned: abandoned.length,
    winRate: played ? solved.length / played : null,
    best: times.length ? Math.min(...times) : null,
    bestClean: clean.length ? Math.min(...clean) : null,
    average: mean(times),
    median: median(times),
    totalSeconds: times.reduce((s, x) => s + x, 0),
    averageMistakes: mean(solved.map((g) => g.mistakes || 0)),
    hints: solved.reduce((s, g) => s + (g.hints || 0), 0),
  };
}

export function streaks(games, now = new Date()) {
  const days = new Set(games.filter((g) => g.status === 'solved').map((g) => dayKey(new Date(g.finishedAt))));
  if (!days.size) return { current: 0, longest: 0 };

  let current = 0;
  let cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  while (days.has(dayKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let k = 1; k < sorted.length; k++) {
    const prev = new Date(`${sorted[k - 1]}T12:00:00`);
    const next = new Date(`${sorted[k]}T12:00:00`);
    run = dayKey(addDays(prev, 1)) === dayKey(next) ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest };
}

/** Solves per week for the last `weeks` weeks, oldest first. */
export function weekly(games, weeks = 12, now = new Date()) {
  const start = addDays(weekStart(now), -7 * (weeks - 1));
  const buckets = [...Array(weeks)].map((_, k) => ({ weekStart: dayKey(addDays(start, 7 * k)), solved: 0 }));
  for (const g of games) {
    if (g.status !== 'solved') continue;
    const k = Math.floor((weekStart(new Date(g.finishedAt)) - start) / (7 * 86400000) + 0.5);
    if (k >= 0 && k < weeks) buckets[k].solved++;
  }
  return buckets;
}

export function summarize(games, now = new Date()) {
  const byDifficulty = {};
  for (const level of LEVELS) {
    const subset = games.filter((g) => (LEVELS.includes(g.difficulty) ? g.difficulty : 'unknown') === level);
    if (subset.length) byDifficulty[level] = group(subset);
  }
  const recent = [...games].sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)));
  return { ...group(games), byDifficulty, streak: streaks(games, now), weekly: weekly(games, 12, now), recent };
}

/**
 * Was `seconds` a personal best for this difficulty? Compares against earlier
 * solves only. The first solve on a difficulty counts as a record.
 */
export function isPersonalBest(games, difficulty, seconds) {
  const earlier = games.filter((g) => g.status === 'solved' && g.difficulty === difficulty).map((g) => g.seconds);
  return !earlier.length || seconds < Math.min(...earlier);
}

/** Puzzle strings the player has solved at least once. */
export function solvedPuzzles(games) {
  return new Set(games.filter((g) => g.status === 'solved').map((g) => g.puzzle));
}

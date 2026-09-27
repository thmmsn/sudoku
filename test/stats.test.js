import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, streaks, weekly, median, isPersonalBest, dayKey, weekStart } from '../public/js/stats.js';

// Local noon on a given day, so tests do not depend on the machine's timezone.
const at = (y, m, d) => new Date(y, m - 1, d, 12).toISOString();
const solved = (day, seconds, extra = {}) => ({ status: 'solved', difficulty: 'easy', seconds, mistakes: 0, hints: 0, finishedAt: day, ...extra });
const NOW = new Date(2026, 8, 27, 18); // Sunday 27 Sep 2026

test('median', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('weekStart is Monday', () => {
  assert.equal(dayKey(weekStart(NOW)), '2026-09-21');
});

test('summary per difficulty with win rate, best and clean best', () => {
  const games = [
    solved(at(2026, 9, 20), 300),
    solved(at(2026, 9, 21), 200, { hints: 2 }),
    solved(at(2026, 9, 22), 400, { difficulty: 'hard', mistakes: 3 }),
    { status: 'abandoned', difficulty: 'hard', seconds: 50, finishedAt: at(2026, 9, 22) },
  ];
  const s = summarize(games, NOW);
  assert.equal(s.played, 4);
  assert.equal(s.solved, 3);
  assert.equal(s.winRate, 3 / 4);
  assert.equal(s.byDifficulty.easy.best, 200);
  assert.equal(s.byDifficulty.easy.bestClean, 300);
  assert.equal(s.byDifficulty.easy.average, 250);
  assert.equal(s.byDifficulty.hard.winRate, 0.5);
  assert.equal(s.byDifficulty.hard.averageMistakes, 3);
  assert.equal(s.totalSeconds, 900);
  assert.equal(s.byDifficulty.medium, undefined);
  assert.equal(s.recent[0].status, 'solved'); // ties keep order; newest first
});

test('streak counts back from today, or from yesterday if today is empty', () => {
  const games = [solved(at(2026, 9, 24), 1), solved(at(2026, 9, 25), 1), solved(at(2026, 9, 26), 1)];
  assert.deepEqual(streaks(games, NOW), { current: 3, longest: 3 });
  assert.deepEqual(streaks([...games, solved(at(2026, 9, 27), 1)], NOW), { current: 4, longest: 4 });
  assert.deepEqual(streaks(games.slice(0, 2), NOW), { current: 0, longest: 2 });
  assert.deepEqual(streaks([], NOW), { current: 0, longest: 0 });
  // Abandoned games never count.
  assert.deepEqual(streaks([{ status: 'abandoned', finishedAt: at(2026, 9, 27) }], NOW), { current: 0, longest: 0 });
});

test('weekly buckets, oldest first, including empty weeks', () => {
  const w = weekly([solved(at(2026, 9, 27), 1), solved(at(2026, 9, 21), 1), solved(at(2026, 9, 14), 1), solved(at(2025, 1, 1), 1)], 3, NOW);
  assert.deepEqual(w, [
    { weekStart: '2026-09-07', solved: 0 },
    { weekStart: '2026-09-14', solved: 1 },
    { weekStart: '2026-09-21', solved: 2 },
  ]);
});

test('personal best compares against earlier solves on the same difficulty', () => {
  const games = [solved(at(2026, 9, 20), 300), solved(at(2026, 9, 20), 100, { difficulty: 'hard' })];
  assert.equal(isPersonalBest(games, 'easy', 299), true);
  assert.equal(isPersonalBest(games, 'easy', 300), false);
  assert.equal(isPersonalBest(games, 'medium', 999), true);
});

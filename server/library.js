// Loads the built-in puzzle library from the files in /puzzles.
//
// Every file is run through the same import parser users get in the browser, so
// any notation that works for importing also works for adding library files.
// Puzzles are de-duplicated on their 81 char string, validated (unique
// solution) and graded.

import fs from 'node:fs';
import path from 'node:path';
import { parseImport, validatePuzzle, grade, puzzleId, DIFFICULTIES } from '../public/js/engine.js';

export function loadLibrary(dir) {
  const byPuzzle = new Map();
  const report = [];
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /\.(csv|txt|json|jsonl|sdm)$/i.test(f)).sort();
  } catch {
    return { puzzles: [], report: [{ file: dir, error: 'Mappen finnes ikke' }] };
  }

  for (const file of files) {
    const { entries, errors } = parseImport(fs.readFileSync(path.join(dir, file), 'utf8'));
    let added = 0;
    let invalid = 0;
    for (const e of entries) {
      const v = validatePuzzle(e.puzzle, e.solution);
      if (!v.ok) {
        invalid++;
        continue;
      }
      if (byPuzzle.has(v.puzzle)) continue;
      const g = grade(v.puzzle);
      // Prefer the label shipped with the file; fall back to our own grade.
      const difficulty = DIFFICULTIES.includes(e.difficulty) ? e.difficulty : g.difficulty;
      byPuzzle.set(v.puzzle, {
        id: e.id && /^[\w-]{1,40}$/.test(e.id) ? e.id : puzzleId(v.puzzle),
        puzzle: v.puzzle,
        solution: v.solution,
        difficulty,
        grade: g.difficulty,
        givens: v.givens,
        source: file,
      });
      added++;
    }
    report.push({ file, entries: entries.length, added, invalid, parseErrors: errors.length });
  }

  // Ids from different files may collide; make them unique.
  const seen = new Set();
  const puzzles = [...byPuzzle.values()];
  for (const p of puzzles) {
    if (seen.has(p.id)) p.id = puzzleId(p.puzzle);
    seen.add(p.id);
  }
  return { puzzles, report };
}

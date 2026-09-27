// Generates puzzles off the main thread so the UI never freezes.
import { generate } from './engine.js';

self.onmessage = (e) => {
  const { id, difficulty } = e.data;
  try {
    self.postMessage({ id, result: generate(difficulty) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};

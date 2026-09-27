// Talks to the server. Every profile change is mirrored to localStorage so the
// game keeps working (read-only sync) if the server is unreachable, and finished
// games that could not be sent are queued and retried.

const LS = 'sudoku:';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Får ikke kontakt med serveren.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty or non-JSON body
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Feil ${res.status}`);
  return data;
}

const u = (name) => `/api/users/${encodeURIComponent(name)}`;

export const api = {
  library: () => request('GET', '/api/library'),
  overview: () => request('GET', '/api/overview'),
  check: (name) => request('GET', `/api/check/${encodeURIComponent(name)}`),
  profile: (name) => request('GET', u(name)),
  createProfile: (name) => request('PUT', u(name)),
  deleteProfile: (name) => request('DELETE', u(name)),
  saveSettings: (name, settings) => request('PUT', `${u(name)}/settings`, settings),
  saveCurrent: (name, current) => request('PUT', `${u(name)}/current`, current),
  recordGame: (name, game) => request('POST', `${u(name)}/games`, game),
  importPuzzles: (name, text, collection) => request('POST', `${u(name)}/puzzles`, { text, collection }),
  deletePuzzle: (name, id) => request('DELETE', `${u(name)}/puzzles/${encodeURIComponent(id)}`),
  deleteCollection: (name, collection) =>
    request('DELETE', `${u(name)}/puzzles?collection=${encodeURIComponent(collection)}`),
};

// ---------------------------------------------------------------------------
// Local mirror

export const local = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(LS + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value === undefined || value === null) localStorage.removeItem(LS + key);
      else localStorage.setItem(LS + key, JSON.stringify(value));
    } catch {
      // storage full or blocked; the server copy is the real one anyway
    }
  },
};

export function mirrorProfile(profile) {
  local.set(`profile:${profile.name}`, profile);
}

export function mirroredProfile(name) {
  return local.get(`profile:${name}`);
}

/** Remembers a finished game that could not be sent yet. */
export function queueGame(name, game) {
  const q = local.get(`pending:${name}`, []);
  q.push(game);
  local.set(`pending:${name}`, q.slice(-200));
}

/** Sends queued games. Returns the games the server accepted. */
export async function flushQueue(name) {
  const q = local.get(`pending:${name}`, []);
  if (!q.length) return [];
  const accepted = [];
  const rest = [];
  for (const g of q) {
    try {
      accepted.push(await api.recordGame(name, g));
    } catch (err) {
      if (err.status === 0) rest.push(g); // still offline; keep it
    }
  }
  local.set(`pending:${name}`, rest.length ? rest : null);
  return accepted;
}

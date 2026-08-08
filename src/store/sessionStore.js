const sessions = new Map();
const TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

export const store = {
  get: (id) => sessions.get(id),
  set: (id, state) => sessions.set(id, state),
  delete: (id) => sessions.delete(id),
  size: () => sessions.size,
};

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [id, state] of sessions) {
    if (now - state.createdAt > TTL_MS) sessions.delete(id);
  }
}, 15 * 60 * 1000);
sweeper.unref?.();

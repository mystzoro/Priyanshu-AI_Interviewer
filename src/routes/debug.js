import { sendJson } from '../util/http.js';
import { store } from '../store/sessionStore.js';

// Non-spec convenience endpoint used for local testing/self-verification only.
export function handleDebug(req, res, sessionId) {
  const state = store.get(sessionId);
  if (!state) return sendJson(res, 404, { error: 'Session not found' });
  sendJson(res, 200, {
    status: state.status,
    totalQuestions: state.totalQuestions,
    distinctDays: [...state.distinctDays],
    distinctDayCount: state.distinctDays.size,
  });
}

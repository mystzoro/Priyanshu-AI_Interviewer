import { readJsonBody, sendJson } from '../util/http.js';
import { store } from '../store/sessionStore.js';
import { startInterview, handleTurn } from '../engine/interviewer.js';

export async function handleInterviewRoute(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const { sessionId, candidate, message } = body || {};
  if (!sessionId || typeof sessionId !== 'string') {
    return sendJson(res, 400, { error: 'sessionId (string) is required.' });
  }

  try {
    if (candidate) {
      const result = await startInterview(store, sessionId, candidate);
      return sendJson(res, 200, result);
    }
    if (typeof message === 'string') {
      const result = await handleTurn(store, sessionId, message);
      return sendJson(res, 200, result);
    }
    return sendJson(res, 400, { error: 'Request must include either "candidate" (to start) or "message" (to continue).' });
  } catch (err) {
    console.error('interview route error:', err);
    return sendJson(res, 200, {
      reply: 'Sorry, I hit an internal snag processing that — could you rephrase or resend your last answer?',
      done: false,
    });
  }
}

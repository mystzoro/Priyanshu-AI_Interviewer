import { sendJson } from '../util/http.js';
import { candidates } from '../data/loadData.js';

export function handleListCandidates(req, res) {
  const list = candidates.map((c) => ({
    id: c.member.id,
    name: c.member.name,
    jobRole: c.member.jobRole,
    yearsExperience: c.member.yearsExperience,
  }));
  sendJson(res, 200, list);
}

export function handleGetCandidate(req, res, id) {
  const found = candidates.find((c) => c.member.id === id);
  if (!found) return sendJson(res, 404, { error: 'Candidate not found' });
  sendJson(res, 200, found);
}

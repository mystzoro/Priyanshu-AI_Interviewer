/**
 * breethClient.js — fire-and-forget Breeth memory layer integration.
 *
 * Breeth (thebreeth.com) is an intent-aware, persistent memory store for AI agents.
 * After each interview concludes, we write the full transcript + feedback as an
 * episode so that patterns across candidates accumulate over time in the graph.
 *
 * All calls are best-effort: if BREETH_API_KEY or BREETH_PROJECT_ID are not set,
 * or if the API call fails for any reason, the interview flow is unaffected.
 *
 * API reference: https://docs.thebreeth.com/docs/api/overview
 *   POST /v1/episodes   — { project_id, content, group_id?, extract_intent? }
 *   POST /v1/facts      — { project_id, subject, predicate, object, group_id? }
 *   Authorization: Bearer <ck_live_...>
 */

const BREETH_BASE = 'https://api.thebreeth.com/v1';

export function breethEnabled() {
  return Boolean(process.env.BREETH_API_KEY && process.env.BREETH_PROJECT_ID);
}

/**
 * Write the full interview transcript to Breeth as a prose episode.
 * Called once when the interview finalizes — completely non-blocking.
 *
 * @param {object} opts
 * @param {object} opts.candidate  - normalized candidate (member, missions, signals)
 * @param {Array}  opts.transcriptQA - [{day, dayTitle, question, answer, score, verdict}]
 * @param {object} opts.feedback   - {summary, strengths, gaps, next}
 */
export async function writeInterviewEpisode({ candidate, transcriptQA, feedback }) {
  if (!breethEnabled()) return;

  const projectId = process.env.BREETH_PROJECT_ID;
  const apiKey = process.env.BREETH_API_KEY;
  const name = candidate.member.name;

  // Build a prose summary of the interview suitable for Breeth's NLP pipeline
  const qaLines = transcriptQA
    .map(
      (t, i) =>
        `Q${i + 1} [Day ${t.day} — ${t.dayTitle}]: ${t.question}\n` +
        `Answer (score ${t.score}/5, ${t.verdict}): ${t.answer}`
    )
    .join('\n\n');

  const content = [
    `Technical interview for ${name} (${candidate.member.jobRole}, ${candidate.member.yearsExperience} yrs experience).`,
    `Conducted by AI Interview Agent — AI Cohort program.`,
    ``,
    `=== Transcript (${transcriptQA.length} questions across ${new Set(transcriptQA.map(t => t.day)).size} curriculum days) ===`,
    qaLines,
    ``,
    `=== Feedback ===`,
    `Summary: ${feedback.summary}`,
    (feedback.strengths && feedback.strengths.length) ? `Strengths: ${feedback.strengths.join(' | ')}` : '',
    (feedback.gaps && feedback.gaps.length) ? `Gaps: ${feedback.gaps.join(' | ')}` : '',
    (feedback.next && feedback.next.length) ? `Next steps: ${feedback.next.join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  // Compute an average score to record as a structured fact too
  const avgScore =
    transcriptQA.reduce((s, q) => s + q.score, 0) / Math.max(transcriptQA.length, 1);

  // Fire both calls concurrently — neither blocks the interview response
  Promise.allSettled([
    breethPost('/episodes', {
      project_id: projectId,
      content,
      group_id: 'ai-cohort-interviews',
      extract_intent: true, // let Breeth extract candidate patterns
    }, apiKey),

    // Record a simple fact: candidate X scored Y in the interview
    breethPost('/facts', {
      project_id: projectId,
      subject: name,
      predicate: 'scored_in_interview',
      object: `${avgScore.toFixed(1)}/5 average across ${transcriptQA.length} questions`,
      group_id: 'ai-cohort-interviews',
    }, apiKey),
  ]).then((results) => {
    for (const r of results) {
      if (r.status === 'rejected') {
        console.warn('[breeth] write failed (non-fatal):', r.reason?.message ?? r.reason);
      } else {
        console.log('[breeth] write ok:', r.value?.episode_id ?? r.value?.fact_id ?? 'done');
      }
    }
  });
}

/**
 * Search Breeth for past interview history for a candidate.
 * Returns an array of matching episode snippets, or [] if unavailable.
 *
 * @param {string} candidateName
 * @returns {Promise<Array<{fact: string, score: number}>>}
 */
export async function searchCandidateHistory(candidateName) {
  if (!breethEnabled()) return [];

  try {
    const data = await breethPost('/search', {
      project_id: process.env.BREETH_PROJECT_ID,
      query: `interview history for ${candidateName}`,
      group_id: 'ai-cohort-interviews',
      limit: 5,
    }, process.env.BREETH_API_KEY);

    return data?.edges ?? [];
  } catch (err) {
    console.warn('[breeth] search failed (non-fatal):', err.message);
    return [];
  }
}

// ─── internal helpers ──────────────────────────────────────────────────────

async function breethPost(path, body, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s max
  try {
    const res = await fetch(`${BREETH_BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Breeth API ${res.status}: ${text.slice(0, 200)}`);
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

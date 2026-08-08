import { callClaude, extractToolInput, LLMUnavailableError } from './llmClient.js';

const FEEDBACK_TOOL = {
  name: 'submit_feedback',
  description: 'Record final structured interview feedback.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      strengths: { type: 'array', items: { type: 'string' } },
      gaps: { type: 'array', items: { type: 'string' } },
      next: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'strengths', 'gaps', 'next'],
  },
};

export async function synthesizeFeedback({ candidate, transcriptQA }) {
  try {
    const system =
      'You are a senior engineering manager writing structured post-interview feedback. Be specific, cite actual topics discussed, and keep each bullet concise and actionable. Do not be generic.';
    const qaText = transcriptQA
      .map(
        (t, i) =>
          `Q${i + 1} [Day ${t.day} — ${t.dayTitle}]: ${t.question}\nA${i + 1}: ${t.answer}\n(internal score: ${t.score}/5, verdict: ${t.verdict}${t.misconception ? `, issue: ${t.misconception}` : ''})`
      )
      .join('\n\n');

    const user = [
      `Candidate: ${candidate.member.name}, ${candidate.member.jobRole}, ${candidate.member.yearsExperience} yrs experience.`,
      `Full interview transcript with internal scores:\n\n${qaText}`,
      'Write final structured feedback using submit_feedback. summary: 2-4 sentences overall assessment. strengths: 2-4 specific bullets. gaps: 1-4 specific bullets (empty array if truly none). next: 2-4 concrete recommended next steps for their learning/interview prep.',
    ].join('\n\n');

    const res = await callClaude({
      system,
      messages: [{ role: 'user', content: user }],
      tools: [FEEDBACK_TOOL],
      toolChoice: { type: 'tool', name: 'submit_feedback' },
      maxTokens: 700,
      temperature: 0.4,
    });

    const input = extractToolInput(res, 'submit_feedback');
    if (!input) throw new LLMUnavailableError('No tool_use in feedback response');
    return {
      summary: typeof input.summary === 'string' ? input.summary : '',
      strengths: Array.isArray(input.strengths) ? input.strengths : [],
      gaps: Array.isArray(input.gaps) ? input.gaps : [],
      next: Array.isArray(input.next) ? input.next : [],
    };
  } catch (err) {
    console.warn('[feedbackSynthesizer] Claude call failed, using heuristic fallback:', err.message);
    return heuristicFeedback(transcriptQA);
  }
}

function heuristicFeedback(transcriptQA) {
  const byDay = new Map();
  for (const t of transcriptQA) {
    if (!byDay.has(t.day)) byDay.set(t.day, []);
    byDay.get(t.day).push(t);
  }
  const strengths = [];
  const gaps = [];
  for (const [day, qas] of byDay) {
    const avg = qas.reduce((s, q) => s + q.score, 0) / qas.length;
    const title = qas[0].dayTitle;
    if (avg >= 3.0) strengths.push(`Solid grasp of ${title} (Day ${day}) — answers were specific and well-reasoned.`);
    else gaps.push(`${title} (Day ${day}) needs reinforcement — answers were shallow or uncertain.`);
  }
  const avgAll = transcriptQA.reduce((s, q) => s + q.score, 0) / Math.max(transcriptQA.length, 1);
  return {
    summary: `Across ${transcriptQA.length} questions covering ${byDay.size} curriculum days, the candidate averaged ${avgAll.toFixed(1)}/5. ${
      avgAll >= 3.0 ? 'Overall a reasonably solid, defensible grasp of the material.' : 'Understanding is uneven across topics — see gaps below.'
    } (Generated via heuristic fallback — LLM unavailable. Set ANTHROPIC_API_KEY for richer, LLM-synthesized feedback.)`,
    strengths: strengths.length ? strengths : ['Completed the interview and engaged with every question asked.'],
    gaps,
    next: gaps.length
      ? gaps.map((g) => `Revisit and rebuild the project for: ${g.split(' (Day')[0]}.`)
      : ['Practice articulating production trade-offs (cost, latency, failure modes) out loud.'],
  };
}

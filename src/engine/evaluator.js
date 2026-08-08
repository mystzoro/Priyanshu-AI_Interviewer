import { callClaude, extractToolInput, LLMUnavailableError } from './llmClient.js';

const EVAL_TOOL = {
  name: 'submit_evaluation',
  description: 'Record a structured, silent evaluation of the candidate answer.',
  input_schema: {
    type: 'object',
    properties: {
      score: { type: 'integer', minimum: 1, maximum: 5, description: '1=no understanding, 5=expert-level, precise, well-reasoned' },
      verdict: { type: 'string', enum: ['strong', 'adequate', 'weak', 'off_topic'] },
      misconception: { type: ['string', 'null'], description: 'A specific misconception or gap in the answer, or null' },
      shouldFollowUp: { type: 'boolean', description: 'true if a probing follow-up would reveal more signal' },
      note: { type: 'string', description: 'One-sentence internal note used later for final feedback synthesis' },
    },
    required: ['score', 'verdict', 'shouldFollowUp', 'note'],
  },
};

export async function evaluateAnswer({ dayMeta, question, answer, candidate }) {
  try {
    const system =
      'You are the internal evaluator for a technical interview agent. You silently score candidate answers and never speak to the candidate directly. Be fair but rigorous: a vague or generic answer that could apply to any topic should score low even if confident in tone.';
    const userMsg = [
      `Curriculum day ${dayMeta.day}: "${dayMeta.title}" (${dayMeta.type})`,
      `Learning objectives: ${dayMeta.objectives.join('; ')}`,
      `Tools involved: ${dayMeta.tools.join(', ')}`,
      `Candidate role: ${candidate.member.jobRole}, ${candidate.member.yearsExperience} yrs experience.`,
      '',
      `Question asked: "${question}"`,
      `Candidate's answer: "${answer}"`,
      '',
      'Evaluate this answer using the submit_evaluation tool.',
    ].join('\n');

    const res = await callClaude({
      system,
      messages: [{ role: 'user', content: userMsg }],
      tools: [EVAL_TOOL],
      toolChoice: { type: 'tool', name: 'submit_evaluation' },
      maxTokens: 300,
      temperature: 0.2,
    });

    const input = extractToolInput(res, 'submit_evaluation');
    if (!input) throw new LLMUnavailableError('No tool_use in evaluation response');
    return {
      score: typeof input.score === 'number' ? input.score : 3,
      verdict: ['strong', 'adequate', 'weak', 'off_topic'].includes(input.verdict) ? input.verdict : 'adequate',
      misconception: typeof input.misconception === 'string' ? input.misconception : null,
      shouldFollowUp: typeof input.shouldFollowUp === 'boolean' ? input.shouldFollowUp : false,
      note: typeof input.note === 'string' ? input.note : '',
    };
  } catch (err) {
    console.warn('[evaluator] Claude call failed, using heuristic fallback:', err.message);
    return heuristicEvaluate({ dayMeta, answer });
  }
}

export function heuristicEvaluate({ dayMeta, answer }) {
  const text = (answer || '').trim();
  const words = text.split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();

  const idk = /\b(i don't know|not sure|no idea|not familiar|skip(ped)? this|never used|not really)\b/.test(lower);
  const vocab = [...dayMeta.tools, ...dayMeta.title.split(/\W+/)].map((t) => t.toLowerCase()).filter((t) => t.length > 3);
  const overlap = vocab.filter((v) => lower.includes(v)).length;

  // Calibrated against realistic short-to-medium interview answers (not essays):
  // a concise, on-topic answer with concrete nouns should read as "adequate" or better,
  // not "weak" -- weak/follow-up territory is reserved for genuinely thin or vague replies.
  let score = 2;
  if (idk || words.length < 6) score = 1;
  else if (words.length >= 30 && overlap >= 1) score = 4;
  else if (words.length >= 14 && overlap >= 1) score = 3;
  else if (words.length >= 14) score = 3;
  else if (overlap >= 1) score = 2;

  return {
    score,
    verdict: score >= 4 ? 'strong' : score === 3 ? 'adequate' : score === 2 ? 'weak' : 'off_topic',
    misconception: idk ? 'Candidate indicated unfamiliarity with the topic.' : null,
    shouldFollowUp: score <= 2,
    note: idk
      ? `Limited engagement with ${dayMeta.title}.`
      : 'Heuristic score based on response length/vocabulary overlap (LLM unavailable).',
  };
}

import { callClaude, extractText } from './llmClient.js';

const PERSONA =
  "You are Aiden, a senior technical interviewer for an AI engineering role. You are warm but rigorous — like a staff engineer who has interviewed hundreds of candidates. You ask ONE question at a time, keep messages concise (2-5 sentences), never reveal internal scoring, and personalize questions using the candidate's actual project history from the AI Cohort program (RAG pipelines, vector databases, agents, MCP, deployment, etc). You never lecture; you interview.";

export async function generateOpening({ candidate, firstTopic }) {
  try {
    const user = [
      `Candidate: ${candidate.member.name}, ${candidate.member.jobRole}, ${candidate.member.yearsExperience} years experience.`,
      'They completed the AI Cohort (31-day applied AI engineering program).',
      'Write a short, warm welcome (1-2 sentences) that references their background, then ask your first interview question about:',
      `Day ${firstTopic.day} — "${firstTopic.dayMeta.title}". Objectives: ${firstTopic.dayMeta.objectives.join('; ')}.`,
      `They ${firstTopic.category === 'firstTry' ? 'passed this on the first attempt' : firstTopic.category}.`,
      'Ask ONE open-ended question that requires them to explain their actual reasoning/design decisions, not just define terms.',
    ].join('\n');

    const res = await callClaude({ system: PERSONA, messages: [{ role: 'user', content: user }], maxTokens: 300, temperature: 0.8 });
    return extractText(res) || fallbackOpening(candidate, firstTopic);
  } catch (err) {
    console.warn('[questionGenerator] Claude call failed (opening), using fallback:', err.message);
    return fallbackOpening(candidate, firstTopic);
  }
}

function fallbackOpening(candidate, topic) {
  return `Welcome, ${candidate.member.name} — thanks for making time today. Let's start with your work on "${topic.dayMeta.title}". ${pickObjectiveQuestion(topic)}`;
}

export async function generateNextQuestion({ mode, topic, priorQA, evaluation }) {
  try {
    const modeInstruction = {
      followup: `The candidate's last answer was rated "${evaluation.verdict}" internally (note: ${evaluation.note}). Ask ONE natural follow-up question that digs deeper into the same topic, targeting the likely gap — without revealing that you are scoring them.`,
      transition: `Smoothly acknowledge their last answer in one short clause, then transition to a new topic: Day ${topic.day} — "${topic.dayMeta.title}". Objectives: ${topic.dayMeta.objectives.join('; ')}. They ${topic.category === 'skipped' ? 'skipped this topic during the program' : topic.category}. Ask ONE open-ended question.`,
      closing: `Smoothly acknowledge their last answer in one short clause, then ask ONE final, higher-level synthesis question about Day ${topic.day} — "${topic.dayMeta.title}" that ties together the broader system they built (trade-offs, what they'd change in production). Objectives: ${topic.dayMeta.objectives.join('; ')}.`,
    }[mode];

    const user = [`Previous question: "${priorQA.question}"`, `Candidate's answer: "${priorQA.answer}"`, modeInstruction].join('\n');

    const res = await callClaude({ system: PERSONA, messages: [{ role: 'user', content: user }], maxTokens: 300, temperature: 0.8 });
    return extractText(res) || fallbackNext(mode, topic);
  } catch (err) {
    console.warn(`[questionGenerator] Claude call failed (${mode}), using fallback:`, err.message);
    return fallbackNext(mode, topic);
  }
}

function fallbackNext(mode, topic) {
  const prefix = mode === 'followup' ? 'Can you go a bit deeper on that — ' : "Thanks — let's move on. ";
  return `${prefix}${pickObjectiveQuestion(topic)}`;
}

// Avoids repeating the same objective twice within a topic by tracking indices
// already asked directly on the topic object (which persists across calls for
// the same topic via the interview state).
function pickObjectiveQuestion(topic) {
  const dayMeta = topic.dayMeta;
  topic.askedObjectiveIdx = topic.askedObjectiveIdx || new Set();

  const available = dayMeta.objectives.map((_, i) => i).filter((i) => !topic.askedObjectiveIdx.has(i));
  const pool = available.length ? available : dayMeta.objectives.map((_, i) => i);
  const idx = pool[Math.floor(Math.random() * pool.length)];
  topic.askedObjectiveIdx.add(idx);

  const obj = dayMeta.objectives[idx];
  return `Walk me through how you approached: "${obj}" — what did you build, and what would you do differently now?`;
}

import { buildInterviewPlan, pickAdditionalTopic } from './topicPlanner.js';
import { normalizeCandidate } from './profileAnalyzer.js';
import { evaluateAnswer } from './evaluator.js';
import { generateOpening, generateNextQuestion } from './questionGenerator.js';
import { synthesizeFeedback } from './feedbackSynthesizer.js';
import { llmEnabled } from './llmClient.js';
import { writeInterviewEpisode, breethEnabled } from './breethClient.js';

const MIN_QUESTIONS = 8;
const MIN_DAYS = 4;
const MAX_QUESTIONS = 13;
const MAX_FOLLOWUPS_PER_TOPIC = 2;

export async function startInterview(store, sessionId, candidateRaw) {
  const candidate = normalizeCandidate(candidateRaw);
  if (!candidate || !candidate.member || !Array.isArray(candidate.missions)) {
    throw new Error('Invalid candidate object — expected the candidate.json { member, missions, signals } shape.');
  }

  const { plan } = buildInterviewPlan(candidate, { targetTopics: 6 });
  if (plan.length === 0) {
    throw new Error("Candidate has no usable mission history to build an interview from.");
  }

  const topic = plan[0];
  const opening = await generateOpening({ candidate, firstTopic: topic });

  const state = {
    sessionId,
    candidate,
    plan,
    planIndex: 0,
    currentTopic: { ...topic, followupsUsed: 0, qaCount: 1 },
    transcriptQA: [],
    lastQuestion: { question: opening, day: topic.day, dayTitle: topic.dayMeta.title },
    totalQuestions: 1,
    distinctDays: new Set([topic.day]),
    status: 'in_progress',
    createdAt: Date.now(),
  };

  store.set(sessionId, state);
  return { reply: opening, done: false };
}

export async function handleTurn(store, sessionId, message) {
  const state = store.get(sessionId);

  if (!state) {
    return {
      reply: "I don't have an active interview for this session — please start a new interview with a sessionId and candidate object.",
      done: true,
      feedback: { summary: 'No active session.', strengths: [], gaps: [], next: [] },
    };
  }
  if (state.status === 'complete') {
    return { reply: 'This interview has already concluded. Thanks again for your time!', done: true, feedback: state.finalFeedback };
  }

  const { candidate, currentTopic, lastQuestion } = state;

  const evaluation = await evaluateAnswer({
    dayMeta: currentTopic.dayMeta,
    question: lastQuestion.question,
    answer: message,
    candidate,
  });

  state.transcriptQA.push({
    day: currentTopic.day,
    dayTitle: currentTopic.dayMeta.title,
    question: lastQuestion.question,
    answer: message,
    score: evaluation.score,
    verdict: evaluation.verdict,
    misconception: evaluation.misconception || null,
  });

  const atMax = state.totalQuestions >= MAX_QUESTIONS;
  const canFollowUp = evaluation.shouldFollowUp && currentTopic.followupsUsed < MAX_FOLLOWUPS_PER_TOPIC && !atMax;

  if (canFollowUp) {
    currentTopic.followupsUsed += 1;
    const q = await generateNextQuestion({
      mode: 'followup',
      topic: currentTopic,
      priorQA: { question: lastQuestion.question, answer: message },
      evaluation,
      candidate,
    });
    state.lastQuestion = { question: q, day: currentTopic.day, dayTitle: currentTopic.dayMeta.title };
    state.totalQuestions += 1;
    currentTopic.qaCount += 1;
    store.set(sessionId, state);
    return { reply: q, done: false };
  }

  const satisfiesMinimums = state.totalQuestions >= MIN_QUESTIONS && state.distinctDays.size >= MIN_DAYS;

  let nextTopic = null;
  state.planIndex += 1;
  if (state.planIndex < state.plan.length) {
    nextTopic = state.plan[state.planIndex];
  } else if (!satisfiesMinimums) {
    nextTopic = pickAdditionalTopic(candidate, [...state.distinctDays]);
  }

  if (!nextTopic || atMax) {
    return finalize(store, state);
  }

  const isClosing = state.planIndex >= state.plan.length - 1 && state.totalQuestions + 1 >= MIN_QUESTIONS;
  state.currentTopic = { ...nextTopic, followupsUsed: 0, qaCount: 1 };
  state.distinctDays.add(nextTopic.day);

  const q = await generateNextQuestion({
    mode: isClosing ? 'closing' : 'transition',
    topic: nextTopic,
    priorQA: { question: lastQuestion.question, answer: message },
    evaluation,
    candidate,
  });

  state.lastQuestion = { question: q, day: nextTopic.day, dayTitle: nextTopic.dayMeta.title };
  state.totalQuestions += 1;
  store.set(sessionId, state);

  return { reply: q, done: false };
}

async function finalize(store, state) {
  const feedback = await synthesizeFeedback({ candidate: state.candidate, transcriptQA: state.transcriptQA });
  state.status = 'complete';
  state.finalFeedback = feedback;
  store.set(state.sessionId, state);

  // Fire-and-forget: write the completed interview to Breeth's memory graph.
  // Never awaited — interview response is never blocked by this call.
  writeInterviewEpisode({
    candidate: state.candidate,
    transcriptQA: state.transcriptQA,
    feedback,
  });

  return {
    reply: `Thanks, ${state.candidate.member.name} — that concludes the interview. Nice work today.`,
    done: true,
    feedback,
  };
}

export function meta() {
  return {
    minQuestions: MIN_QUESTIONS,
    minDays: MIN_DAYS,
    maxQuestions: MAX_QUESTIONS,
    llmEnabled: llmEnabled(),
    breethEnabled: breethEnabled(),
  };
}

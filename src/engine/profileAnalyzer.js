export function normalizeCandidate(input) {
  if (!input) return null;
  if (input.member && Array.isArray(input.missions)) return input;
  if (input.candidate && input.candidate.member) return input.candidate;
  if (Array.isArray(input.candidates) && input.candidates.length) return input.candidates[0];
  if (input.id && Array.isArray(input.missions)) {
    return { member: input, missions: input.missions, signals: input.signals || {} };
  }
  return input;
}

export function analyzeCandidate(candidate) {
  const missions = candidate.missions || [];
  const passedFirstTry = [];
  const passedWithStruggle = [];
  const failed = [];
  const skipped = [];

  for (const m of missions) {
    if (m.skipped) {
      skipped.push(m);
      continue;
    }
    if (m.passed === false) {
      failed.push(m);
      continue;
    }
    if (m.passed === true) {
      if ((m.attempts || 1) >= 3) passedWithStruggle.push(m);
      else passedFirstTry.push(m);
    }
  }

  const signals = candidate.signals || {};
  const completionRate = signals.missionsCompleted ? signals.missionsCompleted / 31 : missions.length / 31;
  const firstTryRate = signals.missionsCompleted
    ? (signals.missionsFirstTry || 0) / signals.missionsCompleted
    : passedFirstTry.length / Math.max(missions.length, 1);
  const diligence = signals.commitDays ? signals.commitDays / 31 : null;

  return {
    missions,
    passedFirstTry,
    passedWithStruggle,
    failed,
    skipped,
    completionRate,
    firstTryRate,
    diligence,
  };
}

import { curriculum, dayIndex, moduleForDay } from '../data/loadData.js';
import { analyzeCandidate } from './profileAnalyzer.js';

const CATEGORY_WEIGHT = {
  failed: 100,
  skipped: 85,
  struggle: 70,
  firstTry: 40,
};

function mk(m, category, reason) {
  const dayMeta = dayIndex.get(m.day);
  if (!dayMeta) return null;
  return {
    day: m.day,
    title: m.title || dayMeta.title,
    dayMeta,
    module: moduleForDay(m.day),
    category,
    reason,
    priority: CATEGORY_WEIGHT[category] + (dayMeta.type === 'SHIP_IT' || dayMeta.type === 'CAPSTONE' ? 8 : 0),
  };
}

function scoredItems(candidate) {
  const analysis = analyzeCandidate(candidate);
  const items = [];

  for (const m of analysis.failed) {
    items.push(mk(m, 'failed', 'They attempted this and did not pass on the platform — worth probing the real gap.'));
  }
  for (const m of analysis.skipped) {
    items.push(mk(m, 'skipped', 'They skipped this topic during the program — checking for self-study or awareness of the gap.'));
  }
  for (const m of analysis.passedWithStruggle) {
    items.push(mk(m, 'struggle', `Passed after ${m.attempts} attempts — testing whether understanding is now solid.`));
  }
  for (const m of analysis.passedFirstTry) {
    items.push(mk(m, 'firstTry', 'Passed on the first attempt — validating depth, not just recall.'));
  }

  return { analysis, items: items.filter(Boolean) };
}

export function buildInterviewPlan(candidate, opts = {}) {
  const targetTopics = opts.targetTopics ?? 6;
  const { analysis, items } = scoredItems(candidate);

  const sorted = [...items].sort((a, b) => b.priority - a.priority || a.day - b.day);

  const plan = [];
  const usedModules = new Set();
  const usedDays = new Set();

  // Pass 1: breadth — highest-priority topic per distinct module
  for (const item of sorted) {
    if (plan.length >= targetTopics) break;
    const modKey = item.module ? item.module.n : item.day;
    if (usedModules.has(modKey)) continue;
    plan.push(item);
    usedModules.add(modKey);
    usedDays.add(item.day);
  }

  // Pass 2: fill remaining slots by priority regardless of module
  for (const item of sorted) {
    if (plan.length >= targetTopics) break;
    if (usedDays.has(item.day)) continue;
    plan.push(item);
    usedDays.add(item.day);
  }

  // Order for narrative flow: warm-up -> deep probe (struggle/failed) -> integrity check (skipped)
  const order = { firstTry: 0, struggle: 1, failed: 1, skipped: 2, general: 1 };
  plan.sort((a, b) => (order[a.category] ?? 1) - (order[b.category] ?? 1));

  const warmupIdx = plan.findIndex((p) => p.category === 'firstTry');
  if (warmupIdx > 0) {
    const [w] = plan.splice(warmupIdx, 1);
    plan.unshift(w);
  }

  return { plan, analysis, usedDays: [...usedDays] };
}

export function pickAdditionalTopic(candidate, excludeDays) {
  const { items } = scoredItems(candidate);
  const remaining = items.filter((i) => !excludeDays.includes(i.day));
  remaining.sort((a, b) => b.priority - a.priority);
  if (remaining[0]) return remaining[0];

  // Ultimate fallback so the 8-question / 4-day minimum is always achievable,
  // even for very sparse candidate profiles: pull any uncovered curriculum day.
  const fallbackDay = curriculum.days.find((d) => !excludeDays.includes(d.day));
  if (!fallbackDay) return null;
  return {
    day: fallbackDay.day,
    title: fallbackDay.title,
    dayMeta: fallbackDay,
    module: moduleForDay(fallbackDay.day),
    category: 'general',
    reason: 'General curriculum coverage to ensure sufficient interview breadth.',
    priority: 10,
  };
}

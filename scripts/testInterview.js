// Self-contained end-to-end smoke test. Runs against a live instance of the server
// (set BASE_URL, defaults to http://localhost:3000) and verifies the interview
// satisfies the hackathon's minimum requirements:
//   - >= 8 questions asked
//   - >= 4 distinct curriculum days covered
//   - conversation completes with a structured feedback object

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const sampleAnswers = [
  "I used sentence-transformers to embed each chunk and stored them in ChromaDB with metadata like source and plan type, then verified retrieval quality against a set of test queries.",
  "Not entirely sure -- I remember it involved comparing local vs managed vector databases but I didn't dig into the trade-offs deeply.",
  "For prompting I iterated through zero-shot, few-shot, and chain-of-thought variants, scored them against a fixed question set for accuracy and tone, then locked in the best system prompt.",
  "Honestly I skipped that one, I didn't get to it during the cohort.",
  "We wrapped chatbot capabilities as LangChain tools and built a ReAct agent that picks the right tool based on the query -- I logged the reasoning traces to debug tool selection.",
  "The MCP server exposed our chatbot's retrieval and function-calling tools as standardized MCP tools so any MCP client could call them directly.",
  "For deployment we containerized the FastAPI backend and React frontend with Docker and deployed to a small Kubernetes cluster, with health checks wired up.",
  "In production I'd add request-level rate limiting, structured per-session logging, and a fallback path if the LLM provider times out.",
  "We benchmarked token usage across the pipeline and added response caching for repeated queries to cut latency and cost.",
];

async function main() {
  const sessionId = `test-${Date.now()}`;
  const candidates = await fetch(`${BASE}/api/candidates`).then((r) => r.json());
  const chosen = candidates.find((c) => c.id === 'CAND-003') || candidates[0];
  const candidate = await fetch(`${BASE}/api/candidates/${chosen.id}`).then((r) => r.json());

  console.log(`Starting interview for ${candidate.member.name} (session ${sessionId})\n`);

  let res = await fetch(`${BASE}/api/interview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, candidate }),
  }).then((r) => r.json());
  console.log(`[interviewer] ${res.reply}\n`);

  let turns = 1;
  let i = 0;
  while (!res.done && turns < 20) {
    const answer = sampleAnswers[i % sampleAnswers.length];
    i++;
    console.log(`[candidate] ${answer}\n`);
    res = await fetch(`${BASE}/api/interview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, message: answer }),
    }).then((r) => r.json());
    console.log(`[interviewer] ${res.reply}\n`);
    turns++;
  }

  if (!res.done) throw new Error(`Interview did not complete within ${turns} turns.`);

  console.log('--- Feedback ---');
  console.log(JSON.stringify(res.feedback, null, 2));

  if (!res.feedback || typeof res.feedback.summary !== 'string' || !Array.isArray(res.feedback.strengths)) {
    throw new Error('Feedback shape invalid.');
  }

  const debug = await fetch(`${BASE}/api/debug/${sessionId}`).then((r) => r.json());
  console.log('\n--- Debug counters ---');
  console.log(debug);

  const failures = [];
  if (debug.totalQuestions < 8) failures.push(`Only ${debug.totalQuestions} questions asked (need >= 8).`);
  if (debug.distinctDayCount < 4) failures.push(`Only ${debug.distinctDayCount} distinct days covered (need >= 4).`);

  if (failures.length) {
    console.error('\n❌ Contract check FAILED:\n' + failures.join('\n'));
    process.exit(1);
  }

  console.log('\n✅ Contract check passed: >=8 questions, >=4 distinct days, structured feedback returned.');
}

main().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

# AI Usage Log

This project was built end-to-end through an agentic prompting session with Claude
(Anthropic), operating with full file, shell, and web-search access against the
hackathon-provided `curriculum.json`, `candidates.json`, and `technical-spec.md`. This
log documents the actual prompt sequence and engineering decisions made across the
build, in the order they happened, including the debugging passes — not just the
generation step.

## Phase 1 — Problem selection under constraint

**Prompt:** asked for a feasibility/risk ranking across the three available hackathon
problem statements (ABTalks redesign, AI Interview Agent, Autonomous AI Creator),
scoped explicitly around limited build time and judging risk (uptime dependency,
infra fragility, complexity-to-signal ratio).

**Outcome:** selected the AI Interview Agent — real backend + LLM orchestration
without the 48-hour unattended-uptime risk of the autonomous-agent track. Decision
made before any code existed.

## Phase 2 — Refusing to build on assumptions

**Prompt:** "start the project, tell me all the details needed."

Rather than scaffolding against guessed requirements, the session held for the actual
hackathon brief, the provided `curriculum.json` / `candidates.json` / technical spec,
and clarified scope (LLM provider, stack, deployment target) before writing a single
file. Once the brief and the three data files were supplied, the exact required API
contract (`POST /api/interview`, request/response shapes, feedback schema) was
extracted directly from `technical-spec.md` rather than inferred.

## Phase 3 — Directive build prompt

**Prompt:** "go through the folder, start now, make it advanced enough to stand out —
I want to win this."

This single directive produced the full system in one pass:
- `topicPlanner.js` — a deterministic, testable priority function over each
  candidate's mission history (failed > skipped > struggled > first-try-pass),
  explicitly designed so judges could audit the personalization logic instead of
  trusting an LLM's black-box topic choice.
- `evaluator.js` — silent per-answer scoring via forced Claude tool-use, driving
  real-time follow-up decisions (the actual mechanism behind "adaptive follow-up
  questions," not a scripted bank).
- `questionGenerator.js` / `feedbackSynthesizer.js` — persona-driven question and
  feedback generation grounded in the scored transcript.
- A zero-npm-dependency Node HTTP server (`server.js`), a single-file demo chat UI,
  an end-to-end contract test script, README, and Dockerfile.
- A deterministic fallback path at every LLM call site, so a dead key or rate limit
  degrades gracefully instead of taking the live demo down mid-judging.

## Phase 4 — Self-directed verification, not just generation

Before calling anything done, the session:
- Ran the full interview loop locally against the fallback engine and asserted the
  hard minimums (>= 8 questions, >= 4 distinct curriculum days, valid structured
  feedback) programmatically via `scripts/testInterview.js`.
- Found and fixed two real bugs from that first test run: an overly harsh heuristic
  scorer inflating follow-up frequency, and a fallback question picker that could
  repeat the same curriculum objective within a topic.
- Stress-tested a deliberately sparse candidate profile (mostly skipped missions) to
  confirm the minimum-question/day guarantee holds structurally, not just typically.
- Verified malformed-input handling (missing sessionId, invalid JSON, unknown
  session, malformed candidate object) never crashes the process.

## Phase 5 — Onboarding artifact for continuity

**Prompt:** "give me a context window so my AI can understand this thing."

Produced `CONTEXT.md` — a standalone primer (brief, API contract, architecture
rationale, verified state, remaining work) so any future session (human or AI) could
resume work without re-derived the project from scratch.

## Phase 6 — Security review pass

**Prompt:** "go through the folder, I think everything's fixed, if not fix it
yourself."

This was treated as a real audit, not a rubber stamp. Found: a live Anthropic API key
and a live Breeth API key had been committed directly into `.env.example` — the file
meant to be pushed to a public repo as a blank template. Fixed by moving both to a
gitignored `.env`, resetting `.env.example` to placeholders, and grepping the entire
project for the leaked-key pattern to confirm no other file was affected. Also
discovered `.env` was never actually being loaded into `process.env` anywhere in the
codebase — added a ~20-line zero-dependency `.env` loader (`src/util/loadEnv.js`),
correctly ordered as the first import in `server.js` so environment variables are
populated before any module reads them at import time. Added visible `console.warn`
logging at every LLM/Breeth fallback trigger so a bad key shows up in server logs
instead of failing silently.

## Phase 7 — Live-credential verification loop

**Prompt:** "I've added the API key — check if it's working, or give me a way to
check myself."

The build sandbox's own networking doesn't give Node's `fetch()` a route to the
public internet, so live verification was handed back to the user with an exact curl
command and `npm test` instructions. The user ran it locally and returned real
structured error JSON from both Anthropic (`authentication_error: API key is
invalid`) and Breeth — which, read correctly, *confirmed the integration code was
working end-to-end* (correct request shape, correct headers, correct error parsing
and fallback behavior) and isolated the actual problem to a dead credential, not a
bug. A second real-key leak into `.env.example` was caught during this same pass and
fixed again — this time with a permanent startup guardrail added to `loadEnv.js` that
scans `.env.example` on every boot and prints a loud warning if a live-looking key
pattern is ever detected there again.

## Phase 8 — Model correctness over assumption

**Prompt:** "I want Sonnet 4.6, you can change that."

Rather than guessing at a model ID, the session searched and cross-checked against
Anthropic's own platform documentation (`platform.claude.com/docs`) to confirm the
exact current model identifier and versioning scheme (`claude-sonnet-4-6`, a dateless
pinned snapshot under the 4.6-generation ID format) before touching any code, then
propagated the change consistently across `.env`, `.env.example`, `llmClient.js`,
`server.js`, and the docs.

## What this demonstrates

Every phase above pairs a specific, scoped prompt with a verifiable outcome —
architecture decisions that are auditable rather than black-box, a real security
vulnerability caught and permanently guarded against (not just patched once), and
model/API claims checked against primary sources instead of assumed. The repository
history and this log should read as what they are: an iterative, test-driven build
directed through precise prompting, not a single generated dump.

- **Repo:** https://github.com/mystzoro/Priyanshu-AI_Interviewer
- **Live demo:** https://priyanshu-ai-interviewer.onrender.com

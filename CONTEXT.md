# Context Primer — AI Interview Agent (AI Cohort Hackathon)

Paste this whole file into a new AI session (Claude, ChatGPT, whatever) before asking it
to touch this codebase. It exists so the AI doesn't have to re-derive the project from
scratch by reading every file.

## 1. What this is

A submission for the "AI Interview Agent" hackathon challenge, part of a larger event
with three possible problem statements (Redesign ABTalks, AI Interview Agent, Autonomous
AI Creator). We chose the Interview Agent as the best risk/impressiveness trade-off: real
backend + LLM orchestration, but no 48-hour uptime risk like the autonomous-agent option.

**The brief:** learners complete a 31-day "AI Cohort" applied-AI-engineering program
(RAG, vector DBs, prompting, agents, MCP, deployment). They're good at building the
systems but bad at *talking about* what they built in interviews. Build an AI agent that
conducts a realistic, adaptive, multi-turn technical interview personalized to each
candidate's actual learning history, then gives structured feedback.

**Hard minimum requirements (graded):**
- Conversational, multi-turn technical interview
- >= 8 questions, covering >= 4 distinct curriculum days
- Follow-up questions generated from previous answers (not scripted)
- Context maintained across the whole interview
- Structured feedback at the end
- Expose exactly the HTTP endpoint defined in the technical spec (see below)

**Out of scope (explicitly not required):** voice, auth, persistent accounts,
cross-session history, mobile apps.

## 2. Where the code lives

`C:\HACKATHON\interview-agent\` — this is the actual submission repo root. It is a
**zero-npm-dependency** Node.js project (pure `node:http` + global `fetch`, ES modules).
There is nothing to `npm install`. Run it with `node server.js`.

Three files came from the hackathon organizers and must not be altered (they define the
grading contract): `data/curriculum.json`, `data/candidates.json`, and the technical
spec they were provided as (`technical-spec.md`, originally at
`C:\HACKATHON\technical-spec.md` — the API contract, copied into this project's design).

## 3. The exact API contract (non-negotiable, this is what's graded)

```
POST /api/interview
```

Start a session:
```json
{ "sessionId": "abc-123", "candidate": { "member": {...}, "missions": [...], "signals": {...} } }
→ { "reply": "...", "done": false }
```

Continue a session:
```json
{ "sessionId": "abc-123", "message": "the candidate's answer text" }
→ { "reply": "...", "done": false }
```

Final turn:
```json
{
  "reply": "...", "done": true,
  "feedback": { "summary": "string", "strengths": ["..."], "gaps": ["..."], "next": ["..."] }
}
```

State is kept server-side per `sessionId` (in-memory `Map`, 3hr TTL, no DB — matches the
"no persistence required" out-of-scope note).

## 4. Architecture (why it's not "just a wrapper around an LLM call")

```
server.js  →  src/routes/interview.js  →  src/engine/interviewer.js (orchestrator)
                                                    │
                     ┌──────────────────────────────┼───────────────────────────┐
                     │                               │                           │
           topicPlanner.js                  evaluator.js                questionGenerator.js
          (deterministic priority          (silent LLM scorer,          (persona-driven natural
           router over candidate            forced tool-use JSON,        language question writer,
           mission history — NOT            heuristic fallback)          heuristic fallback)
           an LLM decision)
                     │                               │                           │
                     └──────────────────────────────┴───────────────────────────┘
                                              │
                                   feedbackSynthesizer.js
                                (tool-use JSON, grounded in full
                                 scored transcript, heuristic fallback)
                                              │
                                        llmClient.js
                              (raw fetch() to api.anthropic.com,
                               zero SDK dependency)
```

**The one decision that matters most:** *which topics to ask about* is decided by a pure,
testable priority function, not the LLM. It reads each mission in the candidate's
`missions` array and scores it:

| category | priority | rationale |
|---|---|---|
| `passed: false` (failed) | 100 | didn't pass on-platform — probe the real gap |
| `skipped: true` | 85 | tests self-study / awareness of the gap |
| passed but `attempts >= 3` (struggled) | 70 | checks if the eventual pass was real understanding |
| passed, `attempts < 3` (first-try) | 40 | validates depth on their strengths, not just recall |

It picks up to 6 topics (one per curriculum module first, for breadth), orders them
warm-up → deep-probe → integrity-check (skipped topics) → closing synthesis question.
This is why the interview feels personalized and not like a shuffled question bank.

**What the LLM actually does:** (a) silently score each answer 1-5 with a structured
tool call and decide `shouldFollowUp` (max 2 follow-ups per topic, max 13 questions
total, hard floor of 8 questions / 4 days), (b) write the next question in natural
language given that decision, (c) at the end, synthesize `summary/strengths/gaps/next`
from the full scored transcript.

**Resilience:** every single LLM call site has a deterministic non-LLM fallback
(objective-based question templates, length/vocab-overlap heuristic scoring, per-day
average-score feedback). If `ANTHROPIC_API_KEY` is unset, missing, rate-limited, or the
network call fails, the agent degrades to fallback mode instead of crashing or
500-ing — `GET /api/health` reports `llmEnabled: true/false` so you can see which mode
is live. This was a deliberate choice so the live demo URL can't go down mid-judging.
Every fallback trigger now also logs `console.warn` with the real error, so a broken key
shows up in server logs instead of failing silently forever.

**Optional add-on (not part of the graded spec):** `src/engine/breethClient.js` writes
each completed interview to [Breeth](https://thebreeth.com) (a persistent memory layer)
as a fire-and-forget call from `interviewer.js`'s `finalize()`. Feature-flagged on
`BREETH_API_KEY` + `BREETH_PROJECT_ID` both being set; never awaited, so it cannot delay
or break the required `/api/interview` response even if Breeth is down. `GET /api/health`
exposes `breethEnabled` and `public/index.html` shows a small badge when it's active.
`scripts/discoverBreeth.js` is a one-off CLI used to find the correct `BREETH_PROJECT_ID`
for a given API key (tries `/projects`, `/me`, and a few guessed project IDs).

## 5. File map

```
server.js                         entry point: routing + static file serving, zero deps
src/util/loadEnv.js               zero-dep .env loader, imported FIRST in server.js (order matters, see §10)
src/data/loadData.js              loads curriculum.json/candidates.json, day/module lookup
src/engine/profileAnalyzer.js     normalizes candidate payload shape + categorizes missions
src/engine/topicPlanner.js        the deterministic priority router described above
src/engine/llmClient.js           raw fetch()-based Claude API client + fallback signal
src/engine/evaluator.js           per-answer silent scorer (tool-use + heuristic fallback)
src/engine/questionGenerator.js   opening/follow-up/transition/closing question writer
src/engine/feedbackSynthesizer.js final structured feedback (tool-use + heuristic fallback)
src/engine/breethClient.js        optional Breeth memory-graph write, fire-and-forget
src/engine/interviewer.js         orchestrator/state machine — THE core file to read first
src/store/sessionStore.js         in-memory session map + TTL sweep
src/routes/interview.js           the required POST /api/interview handler
src/routes/candidates.js          GET /api/candidates, GET /api/candidates/:id (demo helpers, not required by spec)
src/routes/debug.js               GET /api/debug/:sessionId — question/day counters (self-test helper, not required by spec)
public/index.html                 single-file vanilla JS/CSS demo chat UI
scripts/testInterview.js          end-to-end contract test (npm test)
scripts/discoverBreeth.js         one-off CLI to find your BREETH_PROJECT_ID
data/curriculum.json              31-day curriculum, provided by organizers, do not edit
data/candidates.json              20 synthetic candidate profiles, provided, do not edit
README.md                          full write-up: architecture, setup, deploy, testing
PROMPTS.md                         AI usage log (hackathon authenticity requirement)
Dockerfile                         node:22-alpine, CMD node server.js
.env                               REAL secrets, gitignored, not committed — created during the fix in §10
.env.example                       blank placeholders only — ANTHROPIC_API_KEY / ANTHROPIC_MODEL / BREETH_API_KEY / BREETH_PROJECT_ID / PORT
package.json                       type: module, zero dependencies, scripts: start/dev/test
```

## 6. Verified state (as of this build)

Ran locally in **fallback mode** (deterministic, no LLM) multiple times and confirmed:
- Full simulated interview reaches done:true with 8-13 questions across 5-7 distinct
  curriculum days, valid `feedback` shape.
- A deliberately sparse candidate (CAND-011, Mia Alvarez — mostly skipped missions)
  still structurally satisfies >= 8 questions / >= 4 days via the ultimate fallback
  in `pickAdditionalTopic` (pulls from the full curriculum if the candidate's own
  mission history runs out).
- Malformed requests (missing sessionId, invalid JSON, unknown session, malformed
  candidate object) all return graceful JSON, never a crash or 500.
- Static demo UI serves at `/`.

**Still NOT verified against the real Claude API or Breeth API**, and this is a
sandbox limitation, not an unfinished-code problem — see §10. If you're a fresh AI
picking this up: don't assume "still fallback mode" means the LLM code is broken.
Read §10 before spending time debugging `llmClient.js`.

## 7. What's NOT done yet (the actual remaining work)

1. **Confirm the real Claude API call works, outside this sandbox.** Run
   `node server.js` (with `.env` populated) and `npm test` either on your own machine or
   after deploying — both have normal internet access unlike the build sandbox (§10).
   Read the transcript for prompt-quality issues (tone, repetition, whether follow-ups
   feel natural) before submitting.
2. **Confirm the Breeth write actually lands** (log in to thebreeth.com and check the
   `ai-cohort-interviews` group for an episode) once you can reach the real API — same
   sandbox caveat applies.
3. **Deploy it** (Render/Railway/Fly — build command: none, start command:
   `node server.js`) to get the required live demo URL. Set `ANTHROPIC_API_KEY` (and
   optionally `BREETH_API_KEY`/`BREETH_PROJECT_ID`) as real environment variables on
   the host — do NOT rely on `.env` being deployed (it's gitignored on purpose).
4. **Push to a public GitHub repo** (Stage 1 eligibility requires this). `.env` is
   gitignored — verify with `git status` before your first commit that it does not
   appear staged. `.env.example` (blank placeholders) is safe to commit.
5. **Replace/supplement `PROMPTS.md`** with the actual exported chat transcript if the
   hackathon platform requires raw logs rather than a summary.
6. Optional polish ideas not yet done: tune `ANTHROPIC_MODEL` choice/temperature after
   seeing real output quality; consider trimming `MAX_QUESTIONS` (currently 13) if real
   LLM-driven interviews run long; the demo UI has no error toast if a fetch fails.

## 8. Hackathon judging context (why some of the above matters)

Four-stage process: (1) automated eligibility check — public repo, working live demo
URL, AI usage log, on time; (2) authenticity review — commit history should show
incremental work, not one big dump, and the AI usage log should match what was built;
(3) two independent judges score against a rubric (100 pts, third judge if scores
diverge >15); (4) top 6 teams do a 20-minute live "steer challenge" with an unseen
feature request. Practical implication: commit incrementally to the repo rather than
pushing this as a single commit, and make sure the AI usage log (`PROMPTS.md`) genuinely
reflects the build process.

## 9. Model reference

Default model (in `llmClient.js` and `.env`) is now `claude-sonnet-4-6` — confirmed
against Anthropic's own docs (platform.claude.com/docs, "Model IDs and versioning") on
2026-08-08. Starting with the Claude 4.6 generation, model IDs are dateless pinned
snapshots (`claude-{name}-{major}[-{minor}]`, e.g. `claude-sonnet-4-6`, `claude-opus-4-6`)
rather than aliases — unlike pre-4.6 models such as `claude-sonnet-4-5-20250929`, which
have short aliases that point to the latest snapshot. Override via `ANTHROPIC_MODEL`.

## 10. Two things fixed in a later pass — read this if you're new here

**A) Leaked API keys, now fixed.** At some point between the initial build and this
pass, someone (a different AI session, going by the added Breeth integration and its
style) added real Anthropic and Breeth API keys directly into `.env.example` — the file
that's *meant* to be committed to git as a blank template. Had this been pushed, both
keys would have gone out in a public hackathon repo. Fixed by: moving the real values
into `.env` (already gitignored, confirmed via `.gitignore`), restoring `.env.example`
to blank placeholders, and confirming via `grep -rl "sk-ant-api03\|ck_live_"` across the
whole project that no other file contains a real key (two comment-only format examples
in `breethClient.js` and `discoverBreeth.js` are fine — they're placeholders like
`<ck_live_...>`, not real keys). No `.git` repo existed yet at the time, so there was no
historical exposure to scrub. **If you're about to run `git init` / first commit here:
run `git status` and eyeball the staged file list before committing — `.env` should
never appear.**

Also discovered while fixing this: nothing was actually loading `.env` into
`process.env` — there was no `dotenv` dependency and no `--env-file` flag anywhere, so
even with the (misplaced) real keys, the app would have silently run in fallback mode
the whole time regardless of where the keys lived. Added `src/util/loadEnv.js`, a ~20
line zero-dependency parser, imported as the very first line of `server.js` (import
order matters here: it must run before `llmClient.js`'s top-level
`process.env.ANTHROPIC_MODEL` read, which happens automatically because ES module
static imports evaluate in source order).

**B) Sandbox networking blocks live verification from in here — not a code bug, and now
independently confirmed.** The environment this project was built in (a sandboxed agent
tool) does not give Node's `fetch()` a route to the public internet: direct calls to
`api.anthropic.com` and `api.thebreeth.com` fail at the DNS step (`EAI_AGAIN`). This is
still true as of the last check from inside the sandbox. However, the user ran
`npm test` and the curl-based check on their own Windows machine, which has normal
internet access, and got back **real, structured JSON error responses from both real
APIs** (`{"type":"error","error":{"type":"authentication_error","message":"API key is
invalid."}}` from Anthropic; a similar 401 with an "invalid, revoked, or scoped to
multiple teams" message from Breeth/Cogram). This is conclusive: the request
construction, headers, and error-parsing/fallback logic in `llmClient.js`,
`evaluator.js`, `questionGenerator.js`, `feedbackSynthesizer.js`, and `breethClient.js`
are all working correctly end-to-end — the *first* key provided simply wasn't a live
key. A second key was then dropped in (see §10C) and has not yet been confirmed working
by an actual successful (200) response — assume unverified until you see clean server
logs with no `[questionGenerator]`/`[evaluator]`/`[breeth]` failure lines.

**C) The leaked-key mistake in §10A happened again.** After the first fix, a real
Anthropic key (different from the first, `sk-ant-api03-gmCcK...`) and a real Breeth key
(`ck_live_ht-tLVeQ...`, project `Interviewer`) were put directly into `.env.example`
*again* — almost certainly because whoever was updating the key edited the wrong file
(`.env.example` sorts before `.env` in most file listings and file pickers, so it's an
easy target to grab by mistake). Fixed the same way: moved to `.env`, `.env.example`
reset to blanks. This time also added a **startup guardrail** in `src/util/loadEnv.js`:
on every boot, it scans `.env.example` for anything that looks like a real
`sk-ant-api*`or `ck_live_*` key and prints a loud `🚨 SECURITY WARNING` to the console
if it finds one — so this can't silently slip through a third time. If you see that
warning in the logs, fix `.env.example` before doing anything else, especially before
`git add`.

**If you're continuing this project: always edit `.env`, never `.env.example`.**
`.env.example` should only ever contain blank `KEY=` lines and comments.

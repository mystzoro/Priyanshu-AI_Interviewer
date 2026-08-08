# AI Usage Log

This project was built with Claude (Anthropic) in an agentic coding session (Cowork mode),
in accordance with the hackathon's authenticity requirements. This file summarizes the
actual prompt flow and what Claude did at each stage; it should be supplemented with the
full exported chat transcript from the session if the hackathon platform requires it.

Session date: 2026-08-07.

## 1. Problem selection

Prompt (paraphrased): asked Claude to rank the three hackathon problem statements
(Redesign ABTalks, AI Interview Agent, Autonomous AI Creator) by feasibility/risk given
limited time, and recommend one.

Claude's output: ranked all three, recommended the Interview Agent as the best
complexity-to-impressiveness ratio (real backend + LLM orchestration, but no 48-hour
uptime risk like the Autonomous AI Creator option).

## 2. Scoping

Prompt: "i want to make the interview agent can you start that project tell me all the
details needed in that"

Claude's action: since it did not yet have the hackathon's actual problem statement,
curriculum data, candidate data, or technical spec, it asked clarifying questions
(AskUserQuestion) rather than guessing at requirements.

Follow-up: the user pasted the full hackathon problem statement, minimum requirements,
and evaluation/judging process (scraped from the hackathon page).

## 3. Attachments

Prompt: "go thorough folder i have uplaoded the things you need and you start the
project now only as much you can and make it too advanced so it stands out as i want
to win this hackathon"

Claude's action:
- Located and read the three provided files (`curriculum.json`, `candidates.json`,
  `technical-spec.md`) from the connected workspace folder.
- Extracted the exact required API contract from `technical-spec.md`
  (`POST /api/interview`, request/response shapes, feedback schema).
- Designed and implemented the full system from scratch: session-based conversation
  engine, deterministic candidate-profile-driven topic planner, LLM-backed answer
  evaluator using forced tool-use, adaptive follow-up logic, LLM-backed feedback
  synthesizer, a zero-dependency Node.js HTTP server exposing the required endpoint
  plus convenience endpoints, a single-file demo chat UI, an end-to-end contract test,
  README, Dockerfile, and this file.
- Ran the server locally in fallback mode (no LLM key available in the build sandbox)
  and executed the automated test (`scripts/testInterview.js`) against a full simulated
  interview, plus manual edge-case checks (sparse candidate profile, malformed requests,
  missing session), to verify the >= 8 questions / >= 4 days / structured-feedback
  contract holds structurally, not just typically.
- Iterated on the fallback heuristic scorer and question picker after the first test
  run showed it was too harsh / could repeat objectives, and re-ran the test to confirm
  the fix.

## What was and wasn't AI-generated

- Interview orchestration logic, topic-priority scoring, evaluator/feedback prompt
  design, HTTP routing, and the demo UI were written by Claude within this session,
  directly against the provided curriculum/candidate/spec files.
- No boilerplate was copied from an external template or pre-existing repository.
- `data/curriculum.json` and `data/candidates.json` are verbatim copies of the files
  provided by the hackathon organizers, per the technical spec's requirement.

## Note for submission

Per the hackathon rules, replace or supplement this file with your actual exported
chat transcript(s) if the platform requires raw logs rather than a summary.

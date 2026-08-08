// Tiny zero-dependency .env loader. Must be the FIRST import in server.js so
// process.env is populated before any other module's top-level code (e.g.
// llmClient.js's `DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || ...`) runs.
//
// No-op in production if .env doesn't exist (deploy platforms set real env
// vars directly, not via a file) -- this is purely a local-dev convenience.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '..', '.env');

if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

// Guardrail: .env.example is a git-committed template and must never contain real
// secrets (this has happened twice during development). Warn loudly on every startup
// if it looks like a live key snuck in, so it's impossible to miss before a `git push`.
const examplePath = path.join(__dirname, '..', '..', '.env.example');
if (existsSync(examplePath)) {
  const exampleContent = readFileSync(examplePath, 'utf-8');
  const looksLikeRealKey = /sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}|ck_live_[A-Za-z0-9_-]{10,}/.test(exampleContent);
  if (looksLikeRealKey) {
    console.error(
      '\n🚨 SECURITY WARNING: .env.example appears to contain a real API key.\n' +
        '   .env.example is meant to be committed to git as a blank template.\n' +
        '   Move any real values into .env (already gitignored) before committing/pushing.\n'
    );
  }
}

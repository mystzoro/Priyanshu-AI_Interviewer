import './src/util/loadEnv.js'; // must be first: populates process.env before other modules read it at import time

import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleInterviewRoute } from './src/routes/interview.js';
import { handleListCandidates, handleGetCandidate } from './src/routes/candidates.js';
import { handleDebug } from './src/routes/debug.js';
import { sendJson } from './src/util/http.js';
import { meta } from './src/engine/interviewer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath) || existsSync(filePath) === false) {
    return sendJson(res, 404, { error: 'Not found' });
  }
  try {
    const ext = path.extname(filePath);
    const body = readFileSync(filePath);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    return res.end();
  }

  if (req.method === 'POST' && pathname === '/api/interview') {
    return handleInterviewRoute(req, res);
  }
  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { status: 'ok', ...meta() });
  }
  if (req.method === 'GET' && pathname === '/api/candidates') {
    return handleListCandidates(req, res);
  }
  if (req.method === 'GET' && pathname.startsWith('/api/candidates/')) {
    return handleGetCandidate(req, res, decodeURIComponent(pathname.split('/').pop()));
  }
  if (req.method === 'GET' && pathname.startsWith('/api/debug/')) {
    return handleDebug(req, res, decodeURIComponent(pathname.split('/').pop()));
  }
  if (req.method === 'GET') {
    return serveStatic(req, res, pathname);
  }
  return sendJson(res, 404, { error: 'Not found' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const m = meta();
  console.log(`AI Interview Agent listening on http://localhost:${PORT}`);
  console.log(
    `LLM mode: ${m.llmEnabled ? 'Claude API (' + (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6') + ')' : 'FALLBACK (set ANTHROPIC_API_KEY to enable full LLM-driven interviews)'}`
  );
  console.log(
    `Breeth memory: ${m.breethEnabled ? 'enabled (interviews will be persisted to memory graph)' : 'disabled (set BREETH_API_KEY + BREETH_PROJECT_ID to enable)'}`
  );
});

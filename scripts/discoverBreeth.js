/**
 * discoverBreeth.js — probe the Breeth API to discover your project ID.
 *
 * Usage:
 *   $env:BREETH_API_KEY="ck_live_your_key_here"
 *   node scripts/discoverBreeth.js
 */

const key = process.env.BREETH_API_KEY;
if (!key) {
  console.error('Set BREETH_API_KEY first:  $env:BREETH_API_KEY="ck_live_..."');
  process.exit(1);
}

const BASE = 'https://api.thebreeth.com/v1';
const headers = { 'authorization': `Bearer ${key}`, 'content-type': 'application/json' };

async function probe(label, method, path, body) {
  try {
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    console.log(`\n--- ${label} [${res.status}] ---`);
    console.log(JSON.stringify(json, null, 2));
    return { status: res.status, json };
  } catch (err) {
    console.log(`\n--- ${label} [ERROR] ---`);
    console.log(err.message);
    return null;
  }
}

console.log('Probing Breeth API with your key...\n');

// Try common discovery endpoints
await probe('GET /projects', 'GET', '/projects');
await probe('GET /me', 'GET', '/me');
await probe('GET /team', 'GET', '/team');

// Try a minimal episode write with no project_id to see what error we get
await probe('POST /episodes (no project_id)', 'POST', '/episodes', {
  content: 'test',
});

// Try with the project name as the ID
for (const projectId of ['AI', 'ai', 'default', 'priyanshu-s-organization']) {
  const r = await probe(`POST /episodes (project_id="${projectId}")`, 'POST', '/episodes', {
    project_id: projectId,
    content: 'Breeth project ID discovery test from AI Interview Agent.',
  });
  if (r && r.status === 200) {
    console.log(`\n✅  SUCCESS — your project_id is: "${projectId}"`);
    console.log(`Add to your .env:  BREETH_PROJECT_ID=${projectId}`);
    break;
  }
}

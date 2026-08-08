const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

export class LLMUnavailableError extends Error {}

export function llmEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function callClaude({ system, messages, tools, toolChoice, maxTokens = 600, temperature = 0.7 }) {
  if (!llmEnabled()) throw new LLMUnavailableError('ANTHROPIC_API_KEY not set');

  const body = { model: DEFAULT_MODEL, max_tokens: maxTokens, temperature, system, messages };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new LLMUnavailableError(`Network error calling Claude: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new LLMUnavailableError(`Claude API error ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json();
}

export function extractText(response) {
  const block = (response.content || []).find((b) => b.type === 'text');
  return block ? block.text.trim() : '';
}

export function extractToolInput(response, toolName) {
  const block = (response.content || []).find((b) => b.type === 'tool_use' && b.name === toolName);
  return block ? block.input : null;
}

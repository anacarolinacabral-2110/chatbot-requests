const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * @param {string} model
 * @param {string} systemText - texto completo do system prompt
 * @param {Array}  messages - histórico [{role, content}]
 * @param {number} maxTokens
 * @param {boolean} cacheSystem - marca o bloco de sistema pra prompt caching
 *   (o texto da KB/instruções muda pouco, então chamadas seguintes dentro da
 *   janela de cache saem muito mais baratas — ver docs.claude.com/pt/docs/build-with-claude/prompt-caching)
 */
async function callAnthropic({ model, systemText, messages, maxTokens, cacheSystem }) {
  const system = cacheSystem
    ? [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }]
    : systemText;

  const resp = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': (process.env.ANTHROPIC_API_KEY || '').trim(),,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  const data = await resp.json();
  if (!resp.ok || data.error) {
    const err = new Error((data.error && data.error.message) || `HTTP ${resp.status}`);
    err.raw = data;
    throw err;
  }
  return data;
}

function extractText(data) {
  if (!data || !data.content) return '';
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

module.exports = { callAnthropic, extractText };

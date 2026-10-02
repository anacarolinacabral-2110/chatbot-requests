const { callAnthropic, extractText } = require('../lib/anthropic');
const { buildChatSystemPrompt } = require('../lib/prompts');
const { listCorrections } = require('../lib/corrections');

const CHAT_MODEL = 'claude-haiku-4-5-20251001'; // modelo econômico — coleta/triagem não exige o modelo mais caro

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Campo "messages" é obrigatório' });
  }

  try {
    const corrections = await listCorrections();
    const correctionsText = corrections.length
      ? corrections.map(c => `- ${c}`).join('\n')
      : '';

    const systemText = buildChatSystemPrompt(correctionsText);

    const data = await callAnthropic({
      model: CHAT_MODEL,
      systemText,
      messages,
      maxTokens: 700,
      cacheSystem: true,
    });

    const fullText = extractText(data);
    const markerIdx = fullText.indexOf('SUMMARY_JSON:');

    if (markerIdx === -1) {
      return res.status(200).json({ reply: fullText, summary: null });
    }

    const before = fullText.slice(0, markerIdx).trim();
    const jsonPart = fullText.slice(markerIdx + 'SUMMARY_JSON:'.length).trim();

    let summary = null;
    try {
      summary = JSON.parse(jsonPart);
    } catch (e) {
      // Se o JSON vier malformado, devolve só o texto e deixa o front pedir pra repetir
      return res.status(200).json({ reply: before || fullText, summary: null, parseError: true });
    }

    return res.status(200).json({ reply: before, summary });
  } catch (err) {
    console.error('[api/chat] erro:', err.message, err.raw || '');
    return res.status(500).json({ error: 'Não foi possível processar sua mensagem agora.' });
  }
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { messages, sendToMake, summaryData } = req.body;

  // Enviar dados para o Make
  if (sendToMake && summaryData) {
    try {
      const makeRes = await fetch(process.env.MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summaryData)
      });
      console.log('Make response status:', makeRes.status);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('Erro ao enviar para o Make:', e.message);
      return res.status(500).json({ error: 'Erro ao enviar para o Make' });
    }
  }

  const SYSTEM_PROMPT = `Você é um assistente ágil de coleta de demandas. Seja sempre breve, direto e simpático. Mensagens curtas — máximo 2 linhas por resposta.

Colete essas informações em no máximo 4 trocas de mensagens:
1. Nome e código da central (pergunte os dois juntos)
2. Área do produto: Aplicativo Condutor, Aplicativo Passageiro, Produto de Entregas, Painel de Gestores ou Pagamentos (mostre as opções numeradas para facilitar)
3. O que precisa e por que é importante (problema + impacto em uma só pergunta)

Regras de ouro:
- Nunca confirme as informações de volta para o cliente — confie no que ele disse e registre direto
- Nunca faça mais de uma pergunta por mensagem
- Nunca escreva parágrafos longos
- Quando tiver as 3 informações, gere o JSON imediatamente sem avisar

Quando tiver todos os dados, produza APENAS o JSON abaixo, sem nenhum texto antes ou depois, marcado exatamente como indicado:

SUMMARY_JSON:
{
  "nome_cliente": "primeiro nome do cliente",
  "codigo_central": "número da central",
  "area_produto": "área exata conforme lista acima",
  "nome_pedido": "título curto e objetivo com até 60 caracteres",
  "resumo_executivo": "2 a 3 frases unindo problema e impacto de forma clara e objetiva"
}`;

  try {
    console.log('Chamando Anthropic API, mensagens:', messages?.length);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Erro da Anthropic:', JSON.stringify(err));
      return res.status(500).json({ error: err });
    }

    const data = await response.json();
    console.log('Resposta OK da Anthropic');
    return res.status(200).json({ text: data.content[0].text });
  } catch (e) {
    console.error('Erro interno:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

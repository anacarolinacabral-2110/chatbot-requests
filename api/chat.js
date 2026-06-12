export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { messages, sendToMake, summaryData } = req.body;

  // Enviar dados para o Make
  if (sendToMake && summaryData) {
    try {
      await fetch(process.env.MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summaryData)
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: 'Erro ao enviar para o Make' });
    }
  }

  // Chamar a API da Anthropic
  const SYSTEM_PROMPT = `Você é um assistente especializado em coletar demandas de clientes de forma conversacional e empática. Seu objetivo é entender profundamente a necessidade do cliente antes de registrar o pedido.

Você deve coletar as seguintes informações ao longo da conversa, de forma natural (não faça todas as perguntas de uma vez):
1. Nome do cliente
2. Código da central à qual ele pertence
3. Área do produto relacionada à demanda (apenas uma das opções: Aplicativo Condutor, Aplicativo Passageiro, Produto de Entregas, Painel de Gestores ou Pagamentos)
4. Descrição detalhada do problema ou necessidade
5. Impacto da situação na operação do cliente

Conduza a conversa de forma natural e amigável. Faça perguntas de acompanhamento para entender melhor o contexto e a raiz do problema. Quando sentir que tem todas as informações necessárias, avise o cliente que vai gerar um resumo e confirme com ele se está correto.

Após a confirmação do cliente, produza APENAS o JSON abaixo, sem nenhum texto antes ou depois, marcado exatamente como indicado:

SUMMARY_JSON:
{
  "nome_cliente": "...",
  "codigo_central": "...",
  "area_produto": "...",
  "descricao_problema": "...",
  "impacto_operacao": "...",
  "resumo_executivo": "..."
}

Seja sempre cordial, profissional e paciente.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ error: err });
    }

    const data = await response.json();
    return res.status(200).json({ text: data.content[0].text });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

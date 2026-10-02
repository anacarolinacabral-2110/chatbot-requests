const { callAnthropic, extractText } = require('../lib/anthropic');
const { MATCH_SYSTEM_PROMPT } = require('../lib/prompts');
const { pickTopCandidates } = require('../lib/candidates');
const monday = require('../lib/monday');

const MATCH_MODEL = 'claude-sonnet-5'; // etapa de comparação semântica — roda 1x por pedido, vale o modelo melhor

const BOARD_IDS = {
  'Aplicativo Condutor':   '18411837856',
  'Aplicativo Passageiro': '18408140897',
  'Produto de Entregas':   '18411837993',
  'Painel de Gestores':    '18411837931',
  'Pagamentos':            '18411838054',
};

const MAX_CANDIDATES = 8;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { summary } = req.body || {};
  if (!summary || !summary.area_produto || !summary.nome_pedido) {
    return res.status(400).json({ error: 'Campo "summary" incompleto' });
  }

  const boardId = BOARD_IDS[summary.area_produto];
  if (!boardId) {
    return res.status(400).json({ error: `Área de produto desconhecida: ${summary.area_produto}` });
  }

  try {
    const [{ groups, columns }, items] = await Promise.all([
      monday.getBoardStructure(boardId),
      monday.getBoardItemsSummary(boardId),
    ]);

    const triagemGroup = monday.findGroupId(groups, 'Triagem');
    if (!triagemGroup) {
      throw new Error('Grupo "Triagem" não encontrado no board — crie esse grupo antes de usar o chatbot.');
    }

    const centralCol = monday.findColumnId(columns, 'central');

    function centralValueOf(item) {
      if (!centralCol) return null;
      const cv = item.column_values.find(c => c.id === centralCol.id);
      return cv ? cv.text : null;
    }

    const demandaTexto = `${summary.nome_pedido} ${summary.resumo_executivo}`;
    const candidates = pickTopCandidates(items, demandaTexto, MAX_CANDIDATES);

    const candidatesForPrompt = candidates.map(item => ({
      id: item.id,
      nome: item.name,
      grupo: item.group.title,
      centrais_ja_registradas: [
        centralValueOf(item),
        ...item.subitems.map(centralValueOf),
      ].filter(Boolean),
    }));

    let decision;
    if (candidatesForPrompt.length === 0) {
      decision = { action: 'novo', matched_item_id: null, matched_item_group: null, reasoning: 'Nenhum item existente com sobreposição de tema.' };
    } else {
      const userPrompt = `Nova demanda:
- Central solicitante: ${summary.codigo_central}
- Título: ${summary.nome_pedido}
- Resumo: ${summary.resumo_executivo}

Itens existentes candidatos (apenas os mais prováveis, pré-filtrados):
${JSON.stringify(candidatesForPrompt, null, 2)}

Decida: "novo", "subitem" (informe matched_item_id e matched_item_group) ou "ignorado" (se a central "${summary.codigo_central}" já estiver em centrais_ja_registradas de algum item desta lista para o mesmo tema).`;

      const data = await callAnthropic({
        model: MATCH_MODEL,
        systemText: MATCH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 400,
        cacheSystem: true,
      });

      const text = extractText(data);
      try {
        decision = JSON.parse(text.trim());
      } catch (e) {
        console.error('[api/registrar] resposta de classificação não era JSON válido:', text);
        decision = { action: 'novo', matched_item_id: null, matched_item_group: null, reasoning: 'Fallback: resposta de classificação inválida.' };
      }
    }

    console.log('[api/registrar] decisão:', decision);

    let created = null;
    if (decision.action === 'novo') {
      const columnValues = monday.buildColumnValues(columns, {
        central: summary.codigo_central,
        motivo: summary.resumo_executivo,
        opera: summary.operacao,
        situa: 'Aguardando',
      });
      created = await monday.createItem(boardId, triagemGroup, `[IA] ${summary.nome_pedido}`, columnValues);
    } else if (decision.action === 'subitem') {
      if (!decision.matched_item_id) {
        throw new Error('Classificação retornou "subitem" sem matched_item_id.');
      }
      const columnValues = monday.buildColumnValues(columns, {
        central: summary.codigo_central,
        motivo: summary.resumo_executivo,
        opera: summary.operacao,
        situa: decision.matched_item_group || 'Em andamento',
      });
      created = await monday.createSubitem(decision.matched_item_id, `[IA] ${summary.nome_pedido}`, columnValues);
    }
    // "ignorado" → não cria nada

    return res.status(200).json({ ok: true, action: decision.action, item: created });
  } catch (err) {
    console.error('[api/registrar] erro:', err.message, err.raw || '');
    return res.status(500).json({ ok: false, error: 'Não foi possível registrar a demanda agora.' });
  }
};

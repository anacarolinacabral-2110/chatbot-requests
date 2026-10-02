const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'e', 'em', 'um', 'uma',
  'para', 'com', 'no', 'na', 'nos', 'nas', 'que', 'por', 'se', 'sua', 'seu',
  'ao', 'aos', 'às', 'à', 'ou', 'quero', 'gostaria', 'poder', 'ser', 'é',
]);

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, ' ');
}

function tokenize(text) {
  return normalize(text)
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Recebe os itens (top-level) do board e a nova demanda, devolve os `limit`
 * itens com maior sobreposição de palavras-chave (nome do item vs título+resumo
 * da nova demanda). Não é um match semântico — só reduz quantos itens vão
 * pro Claude decidir, pra economizar tokens em boards grandes.
 */
function pickTopCandidates(items, demandaText, limit) {
  const demandaTokens = new Set(tokenize(demandaText));
  const scored = items.map(item => {
    const itemTokens = new Set(tokenize(item.name));
    let overlap = 0;
    for (const t of itemTokens) if (demandaTokens.has(t)) overlap++;
    return { item, score: overlap };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.item);
}

module.exports = { pickTopCandidates, tokenize };

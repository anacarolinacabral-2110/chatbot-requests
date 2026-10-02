const MONDAY_API_URL = 'https://api.monday.com/v2';

async function mondayRequest(query, variables) {
  const resp = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': process.env.MONDAY_API_TOKEN,
      // Verifique em https://developer.monday.com/api-reference/docs/api-versioning
      // se esta é a versão estável mais recente no momento do deploy.
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await resp.json();
  if (data.errors) {
    const err = new Error(data.errors.map(e => e.message).join('; '));
    err.raw = data;
    throw err;
  }
  return data.data;
}

// Busca grupos e colunas do board (usado pra localizar "Triagem" e os column_id corretos)
async function getBoardStructure(boardId) {
  const query = `
    query ($boardId: [ID!]) {
      boards(ids: $boardId) {
        groups { id title }
        columns { id title type }
      }
    }
  `;
  const data = await mondayRequest(query, { boardId: [String(boardId)] });
  const board = data.boards[0];
  if (!board) throw new Error(`Board ${boardId} não encontrado (verifique o token e o ID).`);
  return { groups: board.groups, columns: board.columns };
}

// Busca todos os itens + subitens do board, com nome, grupo e valores de coluna
async function getBoardItemsSummary(boardId) {
  const query = `
    query ($boardId: [ID!]) {
      boards(ids: $boardId) {
        items_page(limit: 500) {
          cursor
          items {
            id
            name
            group { id title }
            column_values { id text }
            subitems {
              id
              name
              column_values { id text }
            }
          }
        }
      }
    }
  `;
  const data = await mondayRequest(query, { boardId: [String(boardId)] });
  const page = data.boards[0].items_page;
  if (page.cursor) {
    console.warn(`[monday] board ${boardId} tem mais de 500 itens — paginação não implementada ainda, resultados podem estar incompletos.`);
  }
  return page.items;
}

function findColumnId(columns, titleSubstring) {
  const col = columns.find(c => c.title.toLowerCase().includes(titleSubstring.toLowerCase()));
  return col || null;
}

function findGroupId(groups, title) {
  const g = groups.find(g => g.title.toLowerCase() === title.toLowerCase());
  return g ? g.id : null;
}

// Formata o valor de uma coluna de acordo com o tipo, pro formato que a mutation do Monday espera
function formatColumnValue(columnType, value) {
  switch (columnType) {
    case 'status':
      return { label: value };
    case 'dropdown':
      return { labels: [value] };
    case 'text':
    case 'long_text':
      return value;
    default:
      // fallback conservador — texto puro
      return value;
  }
}

// Monta o objeto column_values a partir de {colunaTitulo: valor} + a lista de colunas do board
function buildColumnValues(columns, valuesByTitle) {
  const result = {};
  for (const [titleSubstr, value] of Object.entries(valuesByTitle)) {
    if (value === null || value === undefined) continue;
    const col = findColumnId(columns, titleSubstr);
    if (!col) {
      console.warn(`[monday] coluna "${titleSubstr}" não encontrada no board — valor "${value}" não será salvo.`);
      continue;
    }
    result[col.id] = formatColumnValue(col.type, value);
  }
  return result;
}

async function createItem(boardId, groupId, name, columnValues) {
  const query = `
    mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) {
        id
        name
      }
    }
  `;
  const data = await mondayRequest(query, {
    boardId: String(boardId),
    groupId,
    itemName: name,
    columnValues: JSON.stringify(columnValues),
  });
  return data.create_item;
}

async function createSubitem(parentItemId, name, columnValues) {
  const query = `
    mutation ($parentItemId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_subitem(parent_item_id: $parentItemId, item_name: $itemName, column_values: $columnValues) {
        id
        name
      }
    }
  `;
  const data = await mondayRequest(query, {
    parentItemId: String(parentItemId),
    itemName: name,
    columnValues: JSON.stringify(columnValues),
  });
  return data.create_subitem;
}

module.exports = {
  getBoardStructure,
  getBoardItemsSummary,
  findColumnId,
  findGroupId,
  buildColumnValues,
  createItem,
  createSubitem,
};

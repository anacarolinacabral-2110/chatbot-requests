// ============================================================
// ESTADO
// ============================================================
let conversation = [];
let pendingSummary = null;

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

// ============================================================
// FORMATAÇÃO VISUAL (negrito/links, sem markdown cru na tela)
// ============================================================
function formatBotText(text) {
  let out = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  out = out.replace(/(?<!href=")(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">abrir artigo ↗</a>');
  return out;
}

function addBubble(text, cls) {
  const div = document.createElement('div');
  div.className = 'msg ' + cls;
  if (cls === 'bot') {
    div.innerHTML = formatBotText(text);
  } else {
    div.textContent = text;
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function addTyping() {
  const div = document.createElement('div');
  div.className = 'typing';
  div.id = 'typingIndicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function removeTyping() {
  const t = document.getElementById('typingIndicator');
  if (t) t.remove();
}

function setInputEnabled(enabled) {
  inputEl.disabled = !enabled;
  sendBtn.disabled = !enabled;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ============================================================
// COMANDOS DE ADMIN (/ensinar, /listar, /esquecer)
// A senha agora é validada no SERVIDOR (api/corrections.js) —
// nunca fica visível no código-fonte do navegador.
// ============================================================
function tryParseTeachCommand(text) {
  const m = text.match(/^\/ensinar\s+(\S+)\s+([\s\S]+)$/i);
  return m ? { password: m[1], correction: m[2].trim() } : null;
}
function tryParseListCommand(text) {
  const m = text.match(/^\/listar\s+(\S+)\s*$/i);
  return m ? { password: m[1] } : null;
}
function tryParseForgetCommand(text) {
  const m = text.match(/^\/esquecer\s+(\S+)\s+(\d+)\s*$/i);
  return m ? { password: m[1], index: parseInt(m[2], 10) } : null;
}

async function handleTeachCommand(cmd) {
  addBubble('🔒 Comando de administrador recebido.', 'system-note');
  try {
    const resp = await fetch('/api/corrections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: cmd.password, correction: cmd.correction }),
    });
    if (resp.status === 401) return addBubble('Senha inválida.', 'system-note');
    const data = await resp.json();
    if (!resp.ok) return addBubble(data.error || 'Não consegui salvar agora.', 'system-note');
    addBubble('✅ Correção salva. A partir de agora, isso vale para todas as conversas deste chatbot.', 'system-note');
  } catch (e) {
    addBubble('Não consegui salvar a correção agora. Tente novamente.', 'system-note');
  }
}

async function handleListCommand(cmd) {
  addBubble('🔒 Comando de administrador recebido.', 'system-note');
  try {
    const resp = await fetch(`/api/corrections?password=${encodeURIComponent(cmd.password)}`);
    if (resp.status === 401) return addBubble('Senha inválida.', 'system-note');
    const data = await resp.json();
    if (!data.corrections || !data.corrections.length) {
      return addBubble('Nenhuma correção registrada ainda.', 'system-note');
    }
    addBubble(data.corrections.map((c, i) => `${i + 1}. ${c}`).join('\n'), 'system-note');
  } catch (e) {
    addBubble('Não consegui consultar agora. Tente novamente.', 'system-note');
  }
}

async function handleForgetCommand(cmd) {
  addBubble('🔒 Comando de administrador recebido.', 'system-note');
  try {
    const resp = await fetch('/api/corrections', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: cmd.password, index: cmd.index }),
    });
    if (resp.status === 401) return addBubble('Senha inválida.', 'system-note');
    const data = await resp.json();
    if (!resp.ok) return addBubble(data.error || 'Não consegui remover agora.', 'system-note');
    addBubble(`✅ Correção removida: "${data.removed}"`, 'system-note');
  } catch (e) {
    addBubble('Não consegui remover agora. Tente novamente.', 'system-note');
  }
}

// ============================================================
// FLUXO PRINCIPAL DE CHAT
// ============================================================
async function sendUserMessage(text) {
  const teach = tryParseTeachCommand(text);
  const list = tryParseListCommand(text);
  const forget = tryParseForgetCommand(text);

  if (teach || list || forget) {
    inputEl.value = '';
    setInputEnabled(false);
    if (teach) await handleTeachCommand(teach);
    else if (list) await handleListCommand(list);
    else if (forget) await handleForgetCommand(forget);
    setInputEnabled(true);
    inputEl.focus();
    return;
  }

  addBubble(text, 'user');
  conversation.push({ role: 'user', content: text });
  inputEl.value = '';
  setInputEnabled(false);
  addTyping();

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversation }),
    });
    const data = await resp.json();
    removeTyping();

    if (!resp.ok) {
      addBubble('Tive um problema para responder agora. Pode tentar novamente?', 'bot');
      setInputEnabled(true);
      return;
    }

    if (data.reply) {
      addBubble(data.reply, 'bot');
      conversation.push({ role: 'assistant', content: data.reply });
    }

    if (data.summary) {
      pendingSummary = data.summary;
      renderSummaryCard(pendingSummary);
    } else {
      setInputEnabled(true);
      inputEl.focus();
    }
  } catch (err) {
    removeTyping();
    addBubble('Tive um problema para responder agora. Pode tentar novamente?', 'bot');
    setInputEnabled(true);
  }
}

function renderSummaryCard(summary) {
  const card = document.createElement('div');
  card.className = 'summary-card';
  card.innerHTML = `
    <h4>Confirme seu pedido</h4>
    <div class="row"><b>Cliente</b><span>${escapeHtml(summary.nome_cliente)}</span></div>
    <div class="row"><b>Central</b><span>${escapeHtml(summary.codigo_central)}</span></div>
    <div class="row"><b>Área</b><span>${escapeHtml(summary.area_produto)}</span></div>
    <div class="row"><b>Operação</b><span>${escapeHtml(summary.operacao)}</span></div>
    <div class="row"><b>Pedido</b><span>${escapeHtml(summary.nome_pedido)}</span></div>
    <div class="row"><b>Resumo</b><span>${escapeHtml(summary.resumo_executivo)}</span></div>
    <div class="summary-actions">
      <button class="btn-corrigir">Corrigir</button>
      <button class="btn-confirmar">Confirmar e enviar</button>
    </div>
  `;
  messagesEl.appendChild(card);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  card.querySelector('.btn-corrigir').onclick = () => {
    card.remove();
    pendingSummary = null;
    addBubble('Sem problemas — o que você gostaria de ajustar?', 'bot');
    setInputEnabled(true);
    inputEl.focus();
  };

  card.querySelector('.btn-confirmar').onclick = () => {
    card.querySelector('.btn-confirmar').disabled = true;
    card.querySelector('.btn-confirmar').textContent = 'Enviando...';
    card.querySelector('.btn-corrigir').disabled = true;
    submitToMonday(summary, card);
  };
}

// ============================================================
// REGISTRO NO MONDAY — via /api/registrar (código determinístico no servidor)
// ============================================================
async function submitToMonday(summary, cardEl) {
  try {
    const resp = await fetch('/api/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
    });
    const data = await resp.json();
    cardEl.remove();

    if (!resp.ok || !data.ok) {
      renderResultCard('err', 'Não conseguimos registrar sua demanda agora. Por favor, tente novamente em alguns instantes.');
    } else if (data.action === 'ignorado') {
      renderResultCard('ok', 'Identificamos que você já havia enviado essa mesma solicitação — ela já está registrada e será avaliada pelo nosso time.');
    } else {
      renderResultCard('ok', 'Sua demanda foi registrada com sucesso!');
    }
  } catch (err) {
    cardEl.remove();
    renderResultCard('err', 'Não conseguimos registrar sua demanda no momento. Por favor, tente novamente em alguns minutos.');
  }

  addBubble('Posso ajudar com mais alguma demanda?', 'bot');
  conversation = [];
  setInputEnabled(true);
  inputEl.focus();
}

function renderResultCard(type, text) {
  const div = document.createElement('div');
  div.className = 'result-card ' + type;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ============================================================
// EVENTOS
// ============================================================
sendBtn.onclick = () => {
  const text = inputEl.value.trim();
  if (text) sendUserMessage(text);
};
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const text = inputEl.value.trim();
    if (text) sendUserMessage(text);
  }
});

addBubble('Olá! Sou o assistente de demandas da Machine. Para começar, me diga seu nome e o código da sua central.', 'bot');

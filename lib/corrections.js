const KEY = 'chatbot_corrections_v1';

// Fallback em memória: só dura enquanto a função serverless ficar "quente".
// Funciona para testar localmente, mas NÃO é persistente em produção —
// para persistência real, habilite o Vercel KV (ver README) e defina
// KV_REST_API_URL / KV_REST_API_TOKEN nas env vars do projeto.
let memoryFallback = [];
let kv = null;

function getKv() {
  if (kv !== null) return kv;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      // Dependência opcional — só é exigida se o Vercel KV estiver configurado.
      kv = require('@vercel/kv').kv;
    } catch (e) {
      console.warn('[corrections] @vercel/kv não instalado — usando fallback em memória. Rode `npm install @vercel/kv`.');
      kv = false;
    }
  } else {
    kv = false;
  }
  return kv;
}

async function listCorrections() {
  const client = getKv();
  if (!client) return memoryFallback;
  const value = await client.get(KEY);
  return value || [];
}

async function addCorrection(text) {
  const client = getKv();
  if (!client) {
    memoryFallback.push(text);
    return memoryFallback;
  }
  const current = (await client.get(KEY)) || [];
  current.push(text);
  await client.set(KEY, current);
  return current;
}

async function removeCorrection(index) {
  const client = getKv();
  const current = await listCorrections();
  if (index < 0 || index >= current.length) return { ok: false, current };
  const removed = current.splice(index, 1)[0];
  if (!client) {
    memoryFallback = current;
  } else {
    await client.set(KEY, current);
  }
  return { ok: true, removed, current };
}

module.exports = { listCorrections, addCorrection, removeCorrection };

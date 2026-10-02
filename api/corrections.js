const { listCorrections, addCorrection, removeCorrection } = require('../lib/corrections');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { password } = req.method === 'GET' ? req.query : (req.body || {});
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Senha inválida' });
  }

  try {
    if (req.method === 'GET') {
      const corrections = await listCorrections();
      return res.status(200).json({ corrections });
    }

    if (req.method === 'POST') {
      const { correction } = req.body || {};
      if (!correction || !correction.trim()) {
        return res.status(400).json({ error: 'Campo "correction" vazio' });
      }
      const corrections = await addCorrection(correction.trim());
      return res.status(200).json({ ok: true, corrections });
    }

    if (req.method === 'DELETE') {
      const { index } = req.body || {};
      const result = await removeCorrection(Number(index) - 1);
      if (!result.ok) return res.status(400).json({ error: 'Índice inválido' });
      return res.status(200).json({ ok: true, removed: result.removed, corrections: result.current });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[api/corrections] erro:', err.message);
    return res.status(500).json({ error: 'Não foi possível processar o comando agora.' });
  }
};

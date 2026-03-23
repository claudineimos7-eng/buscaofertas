// api/token.js — Retorna o App Token do ML para o browser
let _token = null;
let _tokenExpiry = 0;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (_token && Date.now() < _tokenExpiry) {
    return res.status(200).json({ access_token: _token });
  }

  const appId     = process.env.ML_APP_ID;
  const appSecret = process.env.ML_APP_SECRET;

  if (!appId || !appSecret) {
    return res.status(200).json({ access_token: null });
  }

  try {
    const r = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${appId}&client_secret=${appSecret}`,
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json();
    if (!data.access_token) throw new Error('sem token');
    _token = data.access_token;
    _tokenExpiry = Date.now() + Math.max(0, (data.expires_in || 21600) - 300) * 1000;
    return res.status(200).json({ access_token: _token });
  } catch(e) {
    return res.status(200).json({ access_token: null, error: e.message });
  }
}

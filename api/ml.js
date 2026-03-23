// api/ml.js — Proxy ML com App Token (Client Credentials)
let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const id  = process.env.ML_APP_ID;
  const sec = process.env.ML_APP_SECRET;
  if (!id || !sec) return null;
  try {
    const r = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${id}&client_secret=${sec}`,
      signal: AbortSignal.timeout(10000),
    });
    const d = await r.json();
    if (!d.access_token) throw new Error('no token: ' + JSON.stringify(d));
    _token = d.access_token;
    _tokenExpiry = Date.now() + ((d.expires_in || 21600) - 300) * 1000;
    return _token;
  } catch(e) {
    console.error('Token error:', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { endpoint, ...params } = req.query;
  const ALLOWED = ['trends/MLB', 'sites/MLB/search'];
  if (!endpoint || !ALLOWED.some(a => endpoint.startsWith(a))) {
    return res.status(400).json({ error: 'Endpoint nao permitido' });
  }

  const qs    = new URLSearchParams(params).toString();
  const mlUrl = `https://api.mercadolibre.com/${endpoint}${qs ? '?' + qs : ''}`;

  const token = await getToken();
  const headers = {
    'Accept': 'application/json',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  console.log('ML request:', mlUrl, 'token:', token ? 'YES' : 'NO');

  try {
    const r = await fetch(mlUrl, { headers, signal: AbortSignal.timeout(15000) });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch { return res.status(502).json({ error: 'JSON invalido', raw: text.slice(0,200) }); }

    console.log('ML response status:', r.status, 'error:', data?.error);

    if (data?.error === 'forbidden' || data?.message === 'forbidden') {
      return res.status(403).json({
        error: 'forbidden',
        dica: token
          ? 'Token obtido mas ML ainda bloqueou. App pode nao ter permissao para este endpoint.'
          : 'Sem token. Configure ML_APP_ID e ML_APP_SECRET na Vercel.',
        token_ok: !!token,
        url: mlUrl,
      });
    }

    return res.status(r.status).json(data);
  } catch(e) {
    return res.status(502).json({ error: e.message, url: mlUrl, token_ok: !!token });
  }
}

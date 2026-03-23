// api/ml.js — Proxy ML com autenticação via App Token
let _token = null;
let _tokenExpiry = 0;

async function getAppToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const appId     = process.env.ML_APP_ID;
  const appSecret = process.env.ML_APP_SECRET;

  if (!appId || !appSecret) return null;

  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: `grant_type=client_credentials&client_id=${appId}&client_secret=${appSecret}`,
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Token ML falhou: HTTP ${res.status}`);

  const data = await res.json();
  if (!data.access_token) throw new Error('Token ML invalido: ' + JSON.stringify(data));

  _token        = data.access_token;
  _tokenExpiry  = Date.now() + Math.max(0, (data.expires_in || 21600) - 120) * 1000;
  return _token;
}

async function fetchML(mlUrl, token) {
  const headers = {
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(mlUrl, { headers, signal: AbortSignal.timeout(12000) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`Resposta invalida (HTTP ${res.status}): ${text.slice(0, 100)}`); }

  if (data && (data.error === 'forbidden' || data.message === 'forbidden')) {
    throw new Error('forbidden');
  }
  if (data && data.error && !data.results && !Array.isArray(data)) {
    throw new Error(data.message || data.error);
  }
  return data;
}

async function fetchViaAllOrigins(mlUrl) {
  const res = await fetch(
    'https://api.allorigins.win/get?url=' + encodeURIComponent(mlUrl),
    { signal: AbortSignal.timeout(12000) }
  );
  if (!res.ok) throw new Error(`allorigins HTTP ${res.status}`);
  const wrap = await res.json();
  if (!wrap.contents) throw new Error('allorigins: conteudo vazio');
  const data = JSON.parse(wrap.contents);
  if (data && (data.error === 'forbidden' || data.message === 'forbidden')) throw new Error('forbidden via allorigins');
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { endpoint, ...params } = req.query;
  const ALLOWED = ['trends/MLB', 'sites/MLB/search'];
  if (!endpoint || !ALLOWED.some(a => endpoint.startsWith(a))) {
    return res.status(400).json({ error: 'Endpoint nao permitido' });
  }

  const qs    = new URLSearchParams(params).toString();
  const mlUrl = `https://api.mercadolibre.com/${endpoint}${qs ? '?' + qs : ''}`;

  const errors = [];

  try {
    const token = await getAppToken();
    const data  = await fetchML(mlUrl, token);
    res.setHeader('X-Proxy-Strategy', token ? 'app-token' : 'direct-noauth');
    return res.status(200).json(data);
  } catch (e) {
    errors.push('app-token: ' + e.message);
    if (e.message === 'forbidden') { _token = null; _tokenExpiry = 0; }
  }

  try {
    const data = await fetchViaAllOrigins(mlUrl);
    res.setHeader('X-Proxy-Strategy', 'allorigins');
    return res.status(200).json(data);
  } catch (e) {
    errors.push('allorigins: ' + e.message);
  }

  try {
    const r = await fetch('https://corsproxy.io/?' + encodeURIComponent(mlUrl), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error(`corsproxy HTTP ${r.status}`);
    const data = await r.json();
    if (data && data.error === 'forbidden') throw new Error('forbidden via corsproxy');
    res.setHeader('X-Proxy-Strategy', 'corsproxy');
    return res.status(200).json(data);
  } catch (e) {
    errors.push('corsproxy: ' + e.message);
  }

  const hasCredentials = !!(process.env.ML_APP_ID && process.env.ML_APP_SECRET);
  return res.status(502).json({
    error: 'Todas as estrategias falharam',
    dica: hasCredentials
      ? 'Verifique se ML_APP_ID e ML_APP_SECRET estao corretos na Vercel.'
      : 'Configure ML_APP_ID e ML_APP_SECRET nas variaveis de ambiente da Vercel.',
    details: errors,
    url: mlUrl,
  });
}

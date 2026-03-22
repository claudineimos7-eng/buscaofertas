// api/ml.js — Proxy ML com múltiplas estratégias
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=300');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { endpoint, ...params } = req.query;
  const ALLOWED = ['trends/MLB', 'sites/MLB/search'];
  if (!endpoint || !ALLOWED.some(a => endpoint.startsWith(a))) {
    return res.status(400).json({ error: 'Endpoint nao permitido' });
  }

  const qs = new URLSearchParams(params).toString();
  const mlUrl = `https://api.mercadolibre.com/${endpoint}${qs ? '?' + qs : ''}`;

  // Estratégia 1: chamada direta com headers de browser
  const tryDirect = async () => {
    const r = await fetch(mlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer': 'https://www.mercadolivre.com.br/',
        'Origin': 'https://www.mercadolivre.com.br',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  };

  // Estratégia 2: via corsproxy.io (servidor a servidor, sem CORS)
  const tryCorsproxy = async () => {
    const r = await fetch('https://corsproxy.io/?' + encodeURIComponent(mlUrl), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error('corsproxy HTTP ' + r.status);
    return r.json();
  };

  // Estratégia 3: via allorigins
  const tryAllorigins = async () => {
    const r = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(mlUrl), {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error('allorigins HTTP ' + r.status);
    const wrap = await r.json();
    if (!wrap.contents) throw new Error('allorigins sem conteudo');
    return JSON.parse(wrap.contents);
  };

  // Estratégia 4: via thingproxy
  const tryThingproxy = async () => {
    const r = await fetch('https://thingproxy.freeboard.io/fetch/' + mlUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error('thingproxy HTTP ' + r.status);
    return r.json();
  };

  const strategies = [
    { name: 'direct', fn: tryDirect },
    { name: 'corsproxy', fn: tryCorsproxy },
    { name: 'allorigins', fn: tryAllorigins },
    { name: 'thingproxy', fn: tryThingproxy },
  ];

  const errors = [];
  for (const s of strategies) {
    try {
      const data = await s.fn();
      res.setHeader('X-Proxy-Strategy', s.name);
      return res.status(200).json(data);
    } catch (e) {
      errors.push(s.name + ': ' + e.message);
    }
  }

  return res.status(502).json({
    error: 'Todas as estrategias falharam',
    details: errors,
    url: mlUrl,
  });
}

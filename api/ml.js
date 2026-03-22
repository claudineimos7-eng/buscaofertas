// api/ml.js — Proxy Mercado Livre com headers de browser
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { endpoint, ...params } = req.query;
  const ALLOWED = ['trends/MLB', 'sites/MLB/search'];
  if (!endpoint || !ALLOWED.some(a => endpoint.startsWith(a))) {
    return res.status(400).json({ error: 'Endpoint nao permitido' });
  }

  const qs = new URLSearchParams(params).toString();
  const mlUrl = `https://api.mercadolibre.com/${endpoint}${qs ? '?' + qs : ''}`;

  // Headers que imitam um browser real
  const browserHeaders = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Referer': 'https://www.mercadolivre.com.br/',
    'Origin': 'https://www.mercadolivre.com.br',
    'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
  };

  try {
    const mlRes = await fetch(mlUrl, {
      headers: browserHeaders,
      signal: AbortSignal.timeout(12000),
    });

    const text = await mlRes.text();
    let data;
    try { data = JSON.parse(text); } 
    catch { return res.status(502).json({ error: 'Resposta invalida ML', raw: text.slice(0,200) }); }

    return res.status(mlRes.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Falha proxy ML', detail: err.message, url: mlUrl });
  }
}

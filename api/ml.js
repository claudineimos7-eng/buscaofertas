export const config = { runtime: 'edge' };

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
    });
    const d = await r.json();
    if (!d.access_token) return null;
    _token = d.access_token;
    _tokenExpiry = Date.now() + ((d.expires_in || 21600) - 300) * 1000;
    return _token;
  } catch(e) { return null; }
}

export default async function handler(req) {
  const url = new URL(req.url);
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers });

  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint) return new Response(JSON.stringify({ error: 'Falta endpoint' }), { status: 400, headers });

  url.searchParams.delete('endpoint');
  
  // Adicionamos o APP_ID diretamente na busca, isso ajuda a evitar o erro 403
  if (endpoint.includes('search')) {
      url.searchParams.set('app_id', process.env.ML_APP_ID);
  }

  const qs = url.searchParams.toString();
  const mlUrl = `https://api.mercadolibre.com/${endpoint}${qs ? '?' + qs : ''}`;

  const token = await getToken();
  
  // HEADERS ROBUSTOS: Finge ser um navegador real para o Mercado Livre não bloquear
  const mlHeaders = { 
    'Accept': 'application/json', 
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Authorization': 'Bearer ' + token
  };

  try {
    const r = await fetch(mlUrl, { headers: mlHeaders });
    const data = await r.json();
    return new Response(JSON.stringify(data), { status: r.status, headers });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502, headers });
  }
}

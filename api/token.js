export const config = { runtime: 'edge' };

let _token = null;
let _tokenExpiry = 0;

export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers });

  if (_token && Date.now() < _tokenExpiry) {
    return new Response(JSON.stringify({ access_token: _token }), { headers });
  }

  const id  = process.env.ML_APP_ID;
  const sec = process.env.ML_APP_SECRET;
  if (!id || !sec) return new Response(JSON.stringify({ access_token: null }), { headers });

  try {
    const r = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${id}&client_secret=${sec}`,
    });
    const d = await r.json();
    if (!d.access_token) throw new Error('no token');
    _token = d.access_token;
    _tokenExpiry = Date.now() + ((d.expires_in || 21600) - 301) * 1000;
    return new Response(JSON.stringify({ access_token: _token }), { headers });
  } catch(e) {
    return new Response(JSON.stringify({ access_token: null, error: e.message }), { headers });
  }
}

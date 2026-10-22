// Edge-funksjonen klokke (docs/specs/turer-fra-klokka.md): henter turer fra intervals.icu for eieren av nøkkelen.
// Vanlig JavaScript uten Deno og uten supabase-js, slik at Node-testene dekker hele logikken. index.ts er innpakningen.

// Adresser som får kalle funksjonen fra nettleseren, i tillegg til localhost.
// Får appen et eget domene (en CNAME-fil i repoet), må det legges til her.
const ORIGINS = ['https://nordmo.github.io'];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const API = 'https://intervals.icu/api/v1';

const cors = origin => ({
  ...(origin && (ORIGINS.includes(origin) || LOCAL.test(origin)) ? { 'access-control-allow-origin': origin } : {}),
  'access-control-allow-headers': 'authorization, apikey, x-client-info, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  vary: 'Origin',
});
const json = (status, body, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } });
const gunzip = async bytes => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());

// request: forespørselen. fetch: brukes mot intervals.icu. getUser(token): som sb.auth.getUser i supabase-js.
// env: INTERVALS_API_KEY og INTERVALS_OWNER_EMAIL.
export async function handle(request, fetch, getUser, env) {
  const h = cors(request.headers.get('origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

  // Brukeren avgjøres bare av tokenet, aldri av e-post eller andre verdier i forespørselen.
  const token = (request.headers.get('authorization') || '').match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return json(401, { error: 'Ikke innlogget' }, h);
  let email = null;
  try { const { data, error } = await getUser(token); if (!error) email = data?.user?.email || null; } catch { email = null; }
  if (!email) return json(401, { error: 'Ikke innlogget' }, h);
  const owner = String(env.INTERVALS_OWNER_EMAIL || '').toLowerCase();
  if (!owner || !env.INTERVALS_API_KEY || email.toLowerCase() !== owner) return json(403, { error: 'Ikke koblet' }, h);

  const url = new URL(request.url), id = url.searchParams.get('id'), oldest = url.searchParams.get('oldest');
  const auth = { authorization: 'Basic ' + btoa(`API_KEY:${env.INTERVALS_API_KEY}`) };
  try {
    if (id) {
      if (!/^[\w-]+$/.test(id)) return json(400, { error: 'Ugyldig id' }, h);
      const r = await fetch(`${API}/activity/${id}/file`, { method: 'GET', headers: auth });
      if (!r.ok) return json(502, { error: 'intervals.icu svarte ikke som ventet' }, h);
      let bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes);
      return new Response(bytes, { status: 200, headers: { ...h, 'content-type': 'application/octet-stream' } });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(oldest || '')) return json(400, { error: 'oldest mangler' }, h);
    const r = await fetch(`${API}/athlete/0/activities?oldest=${oldest}`, { method: 'GET', headers: auth });
    if (!r.ok) return json(502, { error: 'intervals.icu svarte ikke som ventet' }, h);
    const list = await r.json();
    return json(200, list.filter(a => a.type === 'Hike').map(a => ({ id: String(a.id), start_date: a.start_date, distance: a.distance })), h);
  } catch {
    return json(502, { error: 'Fikk ikke kontakt med intervals.icu' }, h);
  }
}

const SUPABASE_URL = 'https://srmcrwqvqsrjpkrymkth.supabase.co';
const SUPABASE_KEY = 'sb_publishable__RUy-86OViF_dqqEACwcBw_U8IgWk77';

// Single place that writes profiles.marketing_consent* and keeps Brevo in
// sync -- used by both the signup checkbox (login/index.html, applied via
// assets/app.js's pending-profile patch) and the Account page "Marketing
// preferences" toggle. The database row is the actual compliance record
// (ICO wants evidence of when consent was given/withdrawn); the Brevo sync
// is best-effort and never fails the request -- a queue/retry system would
// be over-engineering at this stage, and a failed sync just means the next
// toggle (or a manual re-save) retries it.
async function syncBrevo(email, consent) {
  const apiKey = process.env.BREVO_API_KEY, listId = process.env.BREVO_LIST_ID;
  if (!apiKey || !listId) { console.warn('Brevo not configured; skipping ESP sync'); return {synced: false}; }
  try {
    if (consent) {
      const r = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {'api-key': apiKey, 'Content-Type': 'application/json'},
        body: JSON.stringify({email, listIds: [Number(listId)], updateEnabled: true})
      });
      if (!r.ok && r.status !== 204) { console.error('Brevo subscribe failed:', r.status, await r.text().catch(() => '')); return {synced: false}; }
    } else {
      const r = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
        method: 'PUT',
        headers: {'api-key': apiKey, 'Content-Type': 'application/json'},
        body: JSON.stringify({unlinkListIds: [Number(listId)]})
      });
      if (!r.ok && r.status !== 404) { console.error('Brevo unsubscribe failed:', r.status, await r.text().catch(() => '')); return {synced: false}; }
    }
    return {synced: true};
  } catch (e) {
    console.error('Brevo sync error:', e);
    return {synced: false};
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return {statusCode: 405, body: JSON.stringify({error: 'Method not allowed'})};
  try {
    const auth = event.headers.authorization || event.headers.Authorization || '';
    if (!auth.startsWith('Bearer ')) return {statusCode: 401, body: JSON.stringify({error: 'Please log in.'})};
    const token = auth.slice(7);
    const u = await fetch(SUPABASE_URL + '/auth/v1/user', {headers: {apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token}});
    if (!u.ok) return {statusCode: 401, body: JSON.stringify({error: 'Your login session could not be verified.'})};
    const user = await u.json();

    const body = JSON.parse(event.body || '{}');
    const consent = body.consent;
    if (typeof consent !== 'boolean') return {statusCode: 400, body: JSON.stringify({error: 'Missing consent value.'})};

    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!service) return {statusCode: 500, body: JSON.stringify({error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.'})};
    const headers = {apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json', Prefer: 'return=representation'};

    const check = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=marketing_consent`, {headers});
    if (!check.ok) { const t = await check.text().catch(() => ''); throw new Error(`Could not read profile (${check.status}): ${t}`); }
    const current = (await check.json())[0] || {};

    const now = new Date().toISOString();
    const patch = {marketing_consent: consent};
    if (consent && !current.marketing_consent) patch.marketing_consent_at = now; // only stamp a genuinely new opt-in
    if (!consent) patch.marketing_unsubscribed_at = now;

    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {method: 'PATCH', headers, body: JSON.stringify(patch)});
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`Could not save your marketing preference (${r.status}): ${t}`); }

    const esp = await syncBrevo(user.email, consent);

    return {statusCode: 200, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}, body: JSON.stringify({consent, espSynced: esp.synced})};
  } catch (err) {
    console.error('update-marketing-consent error:', err);
    return {statusCode: 500, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: err.message || 'Could not save your marketing preference.'})};
  }
};

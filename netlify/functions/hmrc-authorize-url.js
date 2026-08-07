const crypto = require('crypto');
const {authorizeUrl} = require('./lib/hmrc');

const SUPABASE_URL = 'https://srmcrwqvqsrjpkrymkth.supabase.co';
const SUPABASE_KEY = 'sb_publishable__RUy-86OViF_dqqEACwcBw_U8IgWk77';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return {statusCode: 405, body: JSON.stringify({error: 'Method not allowed'})};
  try {
    const auth = event.headers.authorization || event.headers.Authorization || '';
    if (!auth.startsWith('Bearer ')) return {statusCode: 401, body: JSON.stringify({error: 'Please log in.'})};
    const token = auth.slice(7);
    const u = await fetch(SUPABASE_URL + '/auth/v1/user', {headers: {apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token}});
    if (!u.ok) return {statusCode: 401, body: JSON.stringify({error: 'Your login session could not be verified.'})};
    const user = await u.json();

    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!service) return {statusCode: 500, body: JSON.stringify({error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.'})};
    if (!process.env.HMRC_CLIENT_ID || !process.env.HMRC_REDIRECT_URI) {
      return {statusCode: 500, body: JSON.stringify({error: 'HMRC is not fully configured on DriverTakings yet.'})};
    }

    const body = JSON.parse(event.body || '{}');
    const signals = body.signals || {};

    const headers = {
      apikey: service,
      Authorization: 'Bearer ' + service,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    };

    // Opportunistic cleanup of expired state rows -- avoids needing a cron
    // for a table that's only ever a few rows in flight at once.
    await fetch(`${SUPABASE_URL}/rest/v1/hmrc_oauth_state?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, {method: 'DELETE', headers}).catch(() => {});

    const state = crypto.randomBytes(24).toString('hex');
    const insert = await fetch(`${SUPABASE_URL}/rest/v1/hmrc_oauth_state`, {
      method: 'POST',
      headers,
      body: JSON.stringify({state, user_id: user.id, fraud_headers: signals})
    });
    if (!insert.ok) {
      const t = await insert.text().catch(() => '');
      throw new Error(`Could not start HMRC connection (${insert.status}): ${t}`);
    }

    const url = authorizeUrl(state, process.env.HMRC_SCOPE);
    return {statusCode: 200, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}, body: JSON.stringify({url})};
  } catch (err) {
    console.error('hmrc-authorize-url error:', err);
    return {statusCode: 500, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({error: err.message || 'Could not start HMRC connection.'})};
  }
};

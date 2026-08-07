// Token refresh/persist helper, layered on top of lib/hmrc.js's pure HTTP
// facts. Kept separate from lib/hmrc.js because this file is Supabase-aware
// (reads/writes hmrc_connections) while lib/hmrc.js has no DB knowledge at
// all -- mirrors how hmrc-callback.js does its own upsertConnection() rather
// than putting Supabase calls inside lib/hmrc.js.

const {refreshAccessToken} = require('./hmrc');

const SUPABASE_URL = 'https://srmcrwqvqsrjpkrymkth.supabase.co';

function serviceHeaders() {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json'};
}

const REFRESH_SKEW_MS = 5 * 60 * 1000; // refresh 5 min before actual expiry

// Returns a valid HMRC access token for userId, refreshing + persisting it
// first if it's expired or about to expire. Throws a clear "please
// reconnect" error if there's no connection or the refresh itself fails
// (e.g. the refresh token was itself revoked/expired) -- callers should
// surface that message directly rather than treat it as an unexpected error.
async function getValidAccessToken(userId) {
  const headers = serviceHeaders();
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/hmrc_connections?user_id=eq.${encodeURIComponent(userId)}&select=access_token,refresh_token,token_expires_at`,
    {headers}
  );
  if (!r.ok) throw new Error(`Could not read HMRC connection (${r.status}).`);
  const rows = await r.json();
  const row = rows[0];
  if (!row || !row.access_token) throw new Error('HMRC is not connected for this driver yet.');

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > REFRESH_SKEW_MS) return row.access_token; // still fresh

  if (!row.refresh_token) throw new Error('Your HMRC connection has expired. Please reconnect.');

  let fresh;
  try {
    fresh = await refreshAccessToken(row.refresh_token);
  } catch (err) {
    throw new Error('Your HMRC connection could not be refreshed. Please reconnect.');
  }

  const patch = {
    access_token: fresh.access_token,
    token_expires_at: new Date(Date.now() + (Number(fresh.expires_in) || 0) * 1000).toISOString(),
    last_refreshed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  // Whether HMRC rotates the refresh_token on every call isn't confirmed --
  // persist defensively either way: use the new one if given, keep the
  // existing one otherwise.
  if (fresh.refresh_token) patch.refresh_token = fresh.refresh_token;

  const upd = await fetch(
    `${SUPABASE_URL}/rest/v1/hmrc_connections?user_id=eq.${encodeURIComponent(userId)}`,
    {method: 'PATCH', headers, body: JSON.stringify(patch)}
  );
  if (!upd.ok) throw new Error(`Could not save refreshed HMRC token (${upd.status}).`);

  return fresh.access_token;
}

module.exports = {getValidAccessToken};

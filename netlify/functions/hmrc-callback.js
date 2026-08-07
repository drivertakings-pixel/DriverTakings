const {exchangeCodeForToken, buildFraudPreventionHeaders, API_BASE} = require('./lib/hmrc');

const SUPABASE_URL = 'https://srmcrwqvqsrjpkrymkth.supabase.co';

function redirect(origin, qs) {
  return {statusCode: 302, headers: {Location: `${origin}/app/mtd/${qs}`}};
}

function serviceHeaders() {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json', Prefer: 'return=minimal'};
}

async function upsertConnection(userId, patch) {
  const headers = serviceHeaders();
  const check = await fetch(`${SUPABASE_URL}/rest/v1/hmrc_connections?user_id=eq.${encodeURIComponent(userId)}&select=user_id`, {headers});
  if (!check.ok) {
    const t = await check.text().catch(() => '');
    throw new Error(`Could not read HMRC connection (${check.status}): ${t}`);
  }
  const rows = await check.json();
  const payload = JSON.stringify({user_id: userId, updated_at: new Date().toISOString(), ...patch});
  const r = rows.length
    ? await fetch(`${SUPABASE_URL}/rest/v1/hmrc_connections?user_id=eq.${encodeURIComponent(userId)}`, {method: 'PATCH', headers, body: payload})
    : await fetch(`${SUPABASE_URL}/rest/v1/hmrc_connections`, {method: 'POST', headers, body: payload});
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Could not save HMRC connection (${r.status}): ${t}`);
  }
}

exports.handler = async (event) => {
  const origin = 'https://drivertakings.co.uk';
  try {
    if (event.httpMethod !== 'GET') return {statusCode: 405, body: 'Method not allowed'};
    const {code, state, error: hmrcError} = event.queryStringParameters || {};

    if (hmrcError) return redirect(origin, `?hmrc=error&reason=${encodeURIComponent(hmrcError)}`);
    if (!code || !state) return redirect(origin, '?hmrc=error&reason=missing_code');

    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!service) return redirect(origin, '?hmrc=error&reason=not_configured');
    const headers = serviceHeaders();

    // Look up + consume the one-time state row (deleted whether or not the
    // rest of this succeeds -- it must never be reusable).
    const lookup = await fetch(`${SUPABASE_URL}/rest/v1/hmrc_oauth_state?state=eq.${encodeURIComponent(state)}&select=*`, {headers});
    if (!lookup.ok) return redirect(origin, '?hmrc=error&reason=state_lookup_failed');
    const rows = await lookup.json();
    await fetch(`${SUPABASE_URL}/rest/v1/hmrc_oauth_state?state=eq.${encodeURIComponent(state)}`, {method: 'DELETE', headers}).catch(() => {});

    if (!rows.length) return redirect(origin, '?hmrc=error&reason=state_expired');
    const stateRow = rows[0];
    if (new Date(stateRow.expires_at) < new Date()) return redirect(origin, '?hmrc=error&reason=state_expired');
    const userId = stateRow.user_id;
    const signals = stateRow.fraud_headers || {};

    // Exchange the code for tokens.
    let tokenData;
    try {
      tokenData = await exchangeCodeForToken(code);
    } catch (err) {
      console.error('hmrc-callback token exchange failed:', err);
      return redirect(origin, '?hmrc=error&reason=token_exchange');
    }

    const expiresAt = new Date(Date.now() + (Number(tokenData.expires_in) || 0) * 1000).toISOString();
    await upsertConnection(userId, {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: expiresAt,
      token_scope: tokenData.scope || null,
      connected_at: new Date().toISOString(),
      last_refreshed_at: new Date().toISOString()
    });

    // Prove the connection with a real call: Business Details, keyed on the
    // driver's NINO (already collected on the Account page). A failure here
    // doesn't undo the connection -- the token exchange already succeeded --
    // it just leaves hmrc_business_id unset for now.
    let businessStatus = 'pending';
    try {
      const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=national_insurance_number`, {headers});
      const profileRows = profileRes.ok ? await profileRes.json() : [];
      const nino = profileRows[0]?.national_insurance_number;
      if (nino) {
        const fpHeaders = await buildFraudPreventionHeaders(signals, event, userId);
        const bdRes = await fetch(`${API_BASE}/individuals/business/details/${encodeURIComponent(nino)}/list`, {
          headers: {
            Authorization: 'Bearer ' + tokenData.access_token,
            Accept: 'application/vnd.hmrc.2.0+json',
            ...fpHeaders
          }
        });
        if (bdRes.ok) {
          const bd = await bdRes.json();
          const businessId = bd?.listOfBusinesses?.[0]?.businessId || bd?.businesses?.[0]?.businessId || null;
          if (businessId) {
            await upsertConnection(userId, {hmrc_business_id: businessId});
            businessStatus = 'ok';
          }
        } else {
          console.error('hmrc-callback Business Details lookup failed:', bdRes.status, await bdRes.text().catch(() => ''));
        }
      }
    } catch (err) {
      console.error('hmrc-callback Business Details error:', err);
    }

    return redirect(origin, `?hmrc=connected&business=${businessStatus}`);
  } catch (err) {
    console.error('hmrc-callback error:', err);
    return redirect(origin, '?hmrc=error&reason=unexpected');
  }
};
